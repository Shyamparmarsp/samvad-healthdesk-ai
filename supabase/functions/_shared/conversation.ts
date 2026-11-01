/**
 * Intake conversation state machine.
 *
 * Owns fixed ordering, answer parsing, adaptive selection and completion. The backend
 * decides completion — never a model (AGENTS.md, MILESTONES M3-S1/M3-S3).
 *
 * Turn accounting: only an accepted patient answer increments the counter. Assistant
 * questions, audio transcription and report corrections never do. 15 is the maximum.
 */

import type { FieldValue, InfoStatus, QuestionId } from "./contract.ts";
import { ADAPTIVE_ORDER, FIXED_ORDER, QUESTIONS, optionValueFor } from "./questions.ts";
import {
  type FieldMap,
  MAX_TEXT_LENGTH,
  isComplete,
  normalizeFieldValue,
} from "./report.ts";

export const MAX_ANSWER_TURNS = 15;

const DECLINE_PHRASES = [
  "prefer not to say",
  "rather not say",
  "dont want to say",
  "do not want to say",
  "skip",
  "no answer",
  "पसंद नहीं",
  "नहीं बताना",
  "छोड़ दें",
];

const UNKNOWN_PHRASES = [
  "dont know",
  "do not know",
  "not sure",
  "no idea",
  "पता नहीं",
  "मालूम नहीं",
];

const NONE_PHRASES = ["none", "no", "nothing", "nil", "no none", "कुछ नहीं", "कोई नहीं"];

const LIST_FIELDS = new Set<string>([
  "clinical_details.conditions",
  "clinical_details.medications",
  "clinical_details.allergies",
  "clinical_details.other_symptoms",
]);

function normalizePhrase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc']/g, "")
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ParsedAnswer {
  field: keyof FieldMap;
  status: InfoStatus;
  value: unknown;
}

/**
 * Parses one answer for one question.
 *
 * Returns status "declined" for an explicit refusal, "unknown" for "I don't know",
 * "unclear" when the text cannot be interpreted, and "provided" otherwise.
 */
export function parseAnswer(questionId: QuestionId, raw: string): {
  field: keyof FieldMap;
  status: InfoStatus;
  value: unknown;
} | null {
  const question = QUESTIONS[questionId];
  if (!question.field) return null;
  const field = question.field;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length === 0) return { field, status: "unclear", value: null };

  const phrase = normalizePhrase(text);

  if (DECLINE_PHRASES.some((candidate) => phrase === candidate || phrase.includes(candidate))) {
    return { field, status: "declined", value: null };
  }
  if (UNKNOWN_PHRASES.some((candidate) => phrase === candidate || phrase.includes(candidate))) {
    return { field, status: "unknown", value: null };
  }

  if (question.inputType === "choice") {
    const option = optionValueFor(questionId, text);
    if (option === null) return { field, status: "unclear", value: null };
    // "Prefer not to say" is a handled refusal, stored as status declined with no value
    // (RD-02 invariant plus the owner's RD-06 instruction).
    if (option === "declined") return { field, status: "declined", value: null };
    return { field, status: "provided", value: option };
  }

  if (question.inputType === "number") {
    const numeric = Number(text.replace(/[^\d]/g, ""));
    if (!Number.isInteger(numeric) || text.replace(/[^\d]/g, "").length === 0) {
      return { field, status: "unclear", value: null };
    }
    const normalized = normalizeFieldValue(field, numeric);
    return normalized === null
      ? { field, status: "unclear", value: null }
      : { field, status: "provided", value: normalized };
  }

  if (LIST_FIELDS.has(field)) {
    if (NONE_PHRASES.includes(phrase)) {
      return { field, status: "provided", value: [] };
    }
    const parts = text
      .split(/[,;\n]/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && part.length <= MAX_TEXT_LENGTH);
    if (parts.length === 0) return { field, status: "unclear", value: null };
    return { field, status: "provided", value: parts };
  }

  const normalized = normalizeFieldValue(field, text);
  return normalized === null
    ? { field, status: "unclear", value: null }
    : { field, status: "provided", value: normalized };
}

/** Writes a parsed answer into the field map, preserving the value/status invariant. */
export function applyAnswer(
  fields: FieldMap,
  parsed: { field: keyof FieldMap; status: InfoStatus; value: unknown },
): FieldMap {
  const next: FieldMap = { ...fields };
  next[parsed.field] = {
    status: parsed.status,
    value: parsed.status === "provided" ? parsed.value : null,
  } as FieldValue<unknown>;
  return next;
}

/** First fixed question. Always name. */
export function firstQuestion(): QuestionId {
  return "name";
}

/** Next fixed question, or null when the fixed block is finished. */
export function nextFixedAfter(questionId: QuestionId): QuestionId | null {
  const index = FIXED_ORDER.indexOf(questionId);
  if (index < 0) return null;
  return FIXED_ORDER[index + 1] ?? null;
}

/** First adaptive question whose field is still not_asked, or null. */
export function nextAdaptiveQuestion(fields: FieldMap): QuestionId | null {
  for (const id of ADAPTIVE_ORDER) {
    const field = QUESTIONS[id].field;
    if (field && fields[field].status === "not_asked") return id;
  }
  return null;
}

/**
 * Chooses the next question.
 *
 * `preferred` may come from the model, but only an approved ID in the adaptive set is
 * honoured, and only when its field is still not_asked. Otherwise the deterministic
 * order wins.
 */
export function nextQuestion(
  fields: FieldMap,
  options: { afterFixed?: QuestionId | null; preferred?: QuestionId | null } = {},
): QuestionId | null {
  const { afterFixed = "primary_concern", preferred = null } = options;

  if (afterFixed !== null && FIXED_ORDER.includes(afterFixed)) {
    const nextFixed = nextFixedAfter(afterFixed);
    if (nextFixed) return nextFixed;
  }

  if (preferred && ADAPTIVE_ORDER.includes(preferred)) {
    const field = QUESTIONS[preferred].field;
    if (field && fields[field].status === "not_asked") return preferred;
  }

  return nextAdaptiveQuestion(fields);
}

export interface ProgressInput {
  fields: FieldMap;
  answerTurnCount: number;
  status: string;
}

export interface Progress {
  is_complete: boolean;
  is_cap_reached: boolean;
  can_submit: boolean;
  next_question: QuestionId | null;
}

/**
 * Computes the patient-visible progress flags.
 *
 * At the cap: a satisfied intake may still be reviewed and submitted; an incomplete
 * one is an End-only preview and can never be submitted.
 */
export function progress(input: ProgressInput): Progress {
  const complete = isComplete(input.fields);
  const capReached = input.answerTurnCount >= MAX_ANSWER_TURNS;
  const next = complete ? null : nextQuestion(input.fields);

  return {
    is_complete: complete,
    is_cap_reached: capReached,
    can_submit: complete && input.status !== "emergency",
    next_question: capReached && !complete ? null : next,
  };
}

/** True when the session may accept another answer at all. */
export function canAcceptAnswer(answerTurnCount: number, status: string): boolean {
  if (answerTurnCount >= MAX_ANSWER_TURNS) return false;
  return status === "in_progress" || status === "consented";
}
