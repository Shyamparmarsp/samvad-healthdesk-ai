/**
 * Model-assisted selection of at most one already-approved question.
 *
 * The model only ever returns an id from the candidate list. It cannot write question
 * text: the caller reads the approved English/Hindi from the bank. Anything unexpected
 * yields null so the scripted flow continues.
 */

import { requestStructured, type GroqOptions } from "../groq.ts";
import type { BankQuestion } from "./question-bank.ts";

export const MAX_ADAPTIVE_QUESTIONS = 3;

/**
 * Removes questions the session has already covered.
 *
 * `retrieveCandidates` only excludes exact ids that were already asked. That is not enough
 * to stop the conversation from feeling repetitive: the v2 bank contains several questions
 * per topic, so a patient who declined one "duration" question could be asked another one
 * immediately, and a question whose report field is already answered could still be chosen
 * on tag overlap alone.
 *
 * Two deterministic filters are applied here:
 *   1. the target report field must not already be handled (provided/declined/unknown/…),
 *   2. the topic must not already have been covered in this session.
 *
 * No question text is invented, no field is written and the approved ranking is preserved.
 */
export function eligibleCandidates(
  candidates: readonly BankQuestion[],
  input: { handledFields?: readonly string[]; askedTopics?: readonly string[] } = {},
): BankQuestion[] {
  const handled = new Set(input.handledFields ?? []);
  const topics = new Set((input.askedTopics ?? []).filter((topic) => topic.length > 0));
  return candidates.filter((candidate) => !handled.has(candidate.field) && !topics.has(candidate.topic));
}

export async function selectAdaptiveQuestion(
  options: GroqOptions,
  candidates: readonly BankQuestion[],
  concern: string,
): Promise<{ id: string; source: "model" | "fallback" } | null> {
  if (candidates.length === 0) return null;

  // Deterministic fallback when the model is unavailable.
  const fallback = { id: candidates[0].id, source: "fallback" as const };
  if (!options.apiKey) return fallback;

  const ids = candidates.map((question) => question.id);
  const schema = {
    type: "object",
    properties: { question_id: { type: "string", enum: ids } },
    required: ["question_id"],
    additionalProperties: false,
  };

  const result = await requestStructured<{ question_id: string }>(options, {
    schemaName: "adaptive_question",
    schema: schema as unknown as Record<string, unknown>,
    system: "Choose the single most useful next question id from the allowed list. Return JSON only.",
    user: `Concern: ${concern.slice(0, 300)}`,
    validate: (parsed) => {
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
      const value = parsed as Record<string, unknown>;
      if (Object.keys(value).length !== 1) return null;
      const id = value.question_id;
      if (typeof id !== "string" || !ids.includes(id)) return null; // outside the candidate set
      return { question_id: id };
    },
  });

  if (!result.ok) return fallback;
  return { id: result.value.question_id, source: "model" };
}
