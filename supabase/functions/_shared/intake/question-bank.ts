/**
 * Adaptive intake bank: expansion, validation and metadata retrieval.
 *
 * The bank is static, versioned and review-gated. Retrieval is deterministic and
 * metadata-only — no embeddings, no vector store, no external search.
 */

import { BANK_VERSION, RAW_QUESTIONS, type AnswerType, type RawQuestion } from "./bank-v2.ts";

export type { AnswerType, RawQuestion };

export { BANK_VERSION };
export const ANSWER_TYPES: readonly AnswerType[] = ["free_text", "yes_no", "single_choice"];
export const DEPARTMENT_KEYS = [
  "general_medicine",
  "orthopedics",
  "general_surgery",
  "dermatology",
  "cardiology",
] as const;
export type BankDepartment = (typeof DEPARTMENT_KEYS)[number];

/** Fields that exist in the report document. Anything else is rejected. */
const REPORT_FIELDS = new Set([
  "patient.name", "patient.age", "patient.gender", "primary_concern",
  "clinical_details.duration", "clinical_details.severity", "clinical_details.conditions",
  "clinical_details.medications", "clinical_details.allergies", "clinical_details.other_symptoms",
]);

const PREFIX: Record<string, BankDepartment> = {
  GM: "general_medicine",
  ORTH: "orthopedics",
  SURG: "general_surgery",
  DERM: "dermatology",
  CARD: "cardiology",
};

/** Choice options by topic keyword. Every option carries both languages. */
const OPTION_SETS: Record<string, ReadonlyArray<readonly [string, string, string]>> = {
  severity: [["mild", "Mild", "हल्का"], ["moderate", "Moderate", "मध्यम"], ["severe", "Severe", "तेज़"]],
  pattern: [["constant", "Constant", "लगातार"], ["intermittent", "Comes and goes", "रुक-रुक कर"], ["occasional", "Occasional", "कभी-कभी"]],
  frequency: [["daily", "Daily", "रोज़"], ["weekly", "A few times a week", "सप्ताह में कुछ बार"], ["monthly", "Once in a while", "कभी-कभार"]],
  "cough-type": [["dry", "Dry", "सूखी"], ["wet", "With phlegm", "बलगम के साथ"]],
  diet: [["low", "Mostly plain", "ज़्यादातर सादा"], ["medium", "Mixed", "मिला-जुला"], ["high", "Salty and oily", "नमकीन और तेल वाला"]],
  activity: [["none", "Rarely", "लगभग नहीं"], ["some", "1–2 times a week", "सप्ताह में 1–2 बार"], ["regular", "3 or more times", "3 या ज़्यादा बार"]],
  stairs: [["one", "One flight", "एक मंज़िल"], ["two", "Two flights", "दो मंज़िल"], ["three", "Three or more", "तीन या ज़्यादा"]],
  character: [["pressure", "Pressure", "दबाव"], ["heaviness", "Heaviness", "भारीपन"], ["sharp", "Sharp pain", "तीखा दर्द"], ["burning", "Burning", "जलन"]],
  impact: [["none", "Not at all", "बिल्कुल नहीं"], ["some", "A little", "थोड़ा"], ["a_lot", "A lot", "बहुत ज़्यादा"]],
  flare: [["daily", "Most days", "लगभग रोज़"], ["weekly", "Every week or so", "हर हफ़्ते"], ["rarely", "Now and then", "कभी-कभार"]],
};

export interface BankOption { value: string; en: string; hi: string }
export interface BankQuestion {
  id: string;
  department: BankDepartment;
  topic: string;
  tags: readonly string[];
  en: string;
  hi: string;
  field: string;
  answerType: AnswerType;
  options: readonly BankOption[];
  version: typeof BANK_VERSION;
  review: "draft_owner_review";
}

function optionsFor(topic: string, answerType: AnswerType): BankOption[] {
  if (answerType !== "single_choice") return [];
  for (const [key, options] of Object.entries(OPTION_SETS)) {
    if (topic.includes(key)) return options.map(([value, en, hi]) => ({ value, en, hi }));
  }
  // Every single_choice question must resolve to an option set; validation catches misses.
  return [];
}

function expand(raw: RawQuestion): BankQuestion {
  const [id, topic, en, hi, field, answerType, suppliedOptions] = raw;
  const department = PREFIX[id.split("-")[0]];
  return {
    id,
    department,
    topic,
    tags: topic.split("-"),
    en,
    hi,
    field,
    answerType,
    // Owner-reviewed option wording from the CSV always wins over the topic table.
    options: suppliedOptions && suppliedOptions.length > 0
      ? suppliedOptions.map(([value, optionEn, optionHi]) => ({ value, en: optionEn, hi: optionHi }))
      : optionsFor(topic, answerType),
    version: BANK_VERSION,
    review: "draft_owner_review",
  };
}

export const QUESTIONS: readonly BankQuestion[] = RAW_QUESTIONS.map(expand);
export const QUESTIONS_BY_ID: ReadonlyMap<string, BankQuestion> = new Map(QUESTIONS.map((q) => [q.id, q]));

export function getQuestion(id: string): BankQuestion | null {
  return QUESTIONS_BY_ID.get(id) ?? null;
}

/** Text for the session language. The identity of the question never changes. */
export function questionText(id: string, language: "en" | "hi"): string | null {
  const question = getQuestion(id);
  if (!question) return null;
  return language === "hi" ? question.hi : question.en;
}

export function localizedOptions(id: string, language: "en" | "hi"): string[] {
  const question = getQuestion(id);
  if (!question) return [];
  return question.options.map((option) => (language === "hi" ? option.hi : option.en));
}

/** Structural validation. Returns a list of problems; empty means the bank is valid. */
export function validateBank(questions: readonly BankQuestion[] = QUESTIONS): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const pairs = new Set<string>();

  for (const question of questions) {
    if (!question.id || ids.has(question.id)) problems.push(`duplicate or empty id: ${question.id}`);
    ids.add(question.id);

    if (!PREFIX[question.id.split("-")[0]]) problems.push(`${question.id}: unknown id prefix`);
    if (!DEPARTMENT_KEYS.includes(question.department)) problems.push(`${question.id}: unknown department`);
    if (!/^(GM|ORTH|SURG|DERM|CARD)-\d{3}$/.test(question.id)) problems.push(`${question.id}: id format`);

    if (!question.en.trim()) problems.push(`${question.id}: blank English text`);
    if (!question.hi.trim()) problems.push(`${question.id}: blank Hindi text`);
    if (!/[\u0900-\u097F]/.test(question.hi)) problems.push(`${question.id}: Hindi text is not Devanagari`);

    const pair = `${question.en}\u0000${question.hi}`;
    if (pairs.has(pair)) problems.push(`${question.id}: duplicate translation pair`);
    pairs.add(pair);

    // Option 3: fields outside report v1.2 are accepted as conversation-level answers.
    if (!REPORT_FIELDS.has(question.field) && !/^clinical_details\.[a-z_]+$/.test(question.field)) {
      problems.push(`${question.id}: invalid report field ${question.field}`);
    }
    if (!ANSWER_TYPES.includes(question.answerType)) problems.push(`${question.id}: invalid answer type`);
    if (question.tags.length === 0) problems.push(`${question.id}: no tags`);
    if (question.review !== "draft_owner_review") problems.push(`${question.id}: review status`);

    if (question.answerType === "single_choice") {
      if (question.options.length < 2) problems.push(`${question.id}: choice question needs at least two options`);
      for (const option of question.options) {
        if (!option.value || !option.en || !option.hi) problems.push(`${question.id}: incomplete option`);
        if (option.hi && !/[\u0900-\u097F]/.test(option.hi)) problems.push(`${question.id}: option Hindi not Devanagari`);
      }
    } else if (question.options.length > 0) {
      problems.push(`${question.id}: non-choice question must not carry options`);
    }
  }
  return problems;
}

export interface RetrieveInput {
  department: BankDepartment;
  tags?: readonly string[];
  missingFields?: readonly string[];
  askedIds?: readonly string[];
  limit?: number;
}

/**
 * Deterministic candidate retrieval. Ranks by tag overlap, then by whether the question
 * targets a missing report field, then by id for stability. Never returns an asked id.
 */
export function retrieveCandidates(input: RetrieveInput): BankQuestion[] {
  const asked = new Set(input.askedIds ?? []);
  const missing = new Set(input.missingFields ?? []);
  const wanted = new Set((input.tags ?? []).map((tag) => tag.toLowerCase()));
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 8);

  const scored = QUESTIONS
    .filter((question) => question.department === input.department)
    .filter((question) => !asked.has(question.id))
    .map((question) => {
      const tagScore = question.tags.reduce((sum, tag) => sum + (wanted.has(tag) ? 2 : 0), 0);
      // Conversation-level questions (fields outside report v1.2) score on tags only;
      // a neutral field score would make every question a match and destroy the
      // documented "0 candidates" fallback.
      const fieldScore = missing.has(question.field) ? 1 : 0;
      return { question, score: tagScore + fieldScore };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => (b.score - a.score) || a.question.id.localeCompare(b.question.id));

  return scored.slice(0, limit).map((entry) => entry.question);
}
