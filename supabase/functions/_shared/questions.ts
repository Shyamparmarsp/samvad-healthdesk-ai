/**
 * Approved bilingual question bank.
 *
 * Source of truth: AGENTS.md ("ask fixed backend question IDs in order: name, age,
 * gender, primary concern"; adaptive completion fields) and
 * docs/demo-emergency-rules.md (the fixed Yes/No clarification).
 *
 * IDs are exactly the `QuestionId` union in src/types/api.ts. They are stable and must
 * never be renumbered or reused.
 *
 * Every Hindi string is a draft marked `hiNeedsOwnerReview`. The owner must read them
 * before M3 acceptance (HUMAN_ROADMAP M3-S1).
 */

import type { CorrectableField, QuestionId } from "./contract.ts";

export type InputType = "text" | "number" | "choice" | "yes_no";

export interface QuestionOption {
  /** Value stored in the report / sent back by the client. */
  value: string;
  /** English label, used for on-screen chips and for parsing typed answers. */
  label: string;
}

export interface QuestionDefinition {
  id: QuestionId;
  /** Report field this question fills, or null for system/clarification prompts. */
  field: CorrectableField | null;
  en: string;
  hi: string;
  inputType: InputType;
  options?: readonly QuestionOption[];
  phase: "fixed" | "adaptive" | "clarification" | "system";
  /** True when the question must not be skipped or reordered. */
  scripted: boolean;
  hiNeedsOwnerReview: boolean;
}

const GENDER_OPTIONS: readonly QuestionOption[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "declined", label: "Prefer not to say" },
];

const YES_NO_OPTIONS: readonly QuestionOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export const QUESTIONS: Readonly<Record<QuestionId, QuestionDefinition>> = {
  greeting: {
    id: "greeting",
    field: null,
    en: "Hello, I am the hospital intake assistant. I am not a doctor. I will ask a few questions so the clinic knows why you are visiting.",
    hi: "नमस्ते, मैं अस्पताल की इनटेक सहायक हूँ। मैं डॉक्टर नहीं हूँ। मैं कुछ सवाल पूछूँगी ताकि क्लिनिक को पता चले कि आप क्यों आए हैं।",
    inputType: "text",
    phase: "system",
    scripted: true,
    hiNeedsOwnerReview: true,
  },
  name: {
    id: "name",
    field: "patient.name",
    en: "What is your name?",
    hi: "आपका नाम क्या है?",
    inputType: "text",
    phase: "fixed",
    scripted: true,
    hiNeedsOwnerReview: true,
  },
  age: {
    id: "age",
    field: "patient.age",
    en: "How old are you, in years?",
    hi: "आपकी उम्र कितने साल है?",
    inputType: "number",
    phase: "fixed",
    scripted: true,
    hiNeedsOwnerReview: true,
  },
  gender: {
    id: "gender",
    field: "patient.gender",
    en: "What is your gender?",
    hi: "कृपया अपना लिंग चुनें।",
    inputType: "choice",
    options: GENDER_OPTIONS,
    phase: "fixed",
    scripted: true,
    hiNeedsOwnerReview: true,
  },
  primary_concern: {
    id: "primary_concern",
    field: "primary_concern",
    en: "What is your main concern today?",
    hi: "आज आपकी मुख्य समस्या क्या है?",
    inputType: "text",
    phase: "fixed",
    scripted: true,
    hiNeedsOwnerReview: true,
  },
  duration: {
    id: "duration",
    field: "clinical_details.duration",
    en: "How long have you had this concern?",
    hi: "यह समस्या कितने समय से है?",
    inputType: "text",
    phase: "adaptive",
    scripted: false,
    hiNeedsOwnerReview: true,
  },
  severity: {
    id: "severity",
    field: "clinical_details.severity",
    en: "How severe is it?",
    hi: "यह कितनी गंभीर है?",
    inputType: "text",
    phase: "adaptive",
    scripted: false,
    hiNeedsOwnerReview: true,
  },
  conditions: {
    id: "conditions",
    field: "clinical_details.conditions",
    en: "Do you have any existing medical conditions?",
    hi: "क्या आपको कोई पुरानी बीमारी है?",
    inputType: "text",
    phase: "adaptive",
    scripted: false,
    hiNeedsOwnerReview: true,
  },
  medications: {
    id: "medications",
    field: "clinical_details.medications",
    en: "Are you taking any medicines?",
    hi: "क्या आप कोई दवा ले रहे हैं?",
    inputType: "text",
    phase: "adaptive",
    scripted: false,
    hiNeedsOwnerReview: true,
  },
  allergies: {
    id: "allergies",
    field: "clinical_details.allergies",
    en: "Do you have any allergies?",
    hi: "क्या आपको किसी चीज़ से एलर्जी है?",
    inputType: "text",
    phase: "adaptive",
    scripted: false,
    hiNeedsOwnerReview: true,
  },
  other_symptoms: {
    id: "other_symptoms",
    field: "clinical_details.other_symptoms",
    en: "Is there anything else you would like the clinic to know?",
    hi: "क्या कोई और बात है जो आप क्लिनिक को बताना चाहते हैं?",
    inputType: "text",
    phase: "adaptive",
    scripted: false,
    hiNeedsOwnerReview: true,
  },
  emergency_clarification: {
    id: "emergency_clarification",
    field: null,
    en: "Is this happening to you right now?",
    hi: "क्या यह अभी आपके साथ हो रहा है?",
    inputType: "yes_no",
    options: YES_NO_OPTIONS,
    phase: "clarification",
    scripted: true,
    hiNeedsOwnerReview: true,
  },
};

/** Fixed scripted order. Never reorder, never skip. */
export const FIXED_ORDER: readonly QuestionId[] = [
  "name",
  "age",
  "gender",
  "primary_concern",
];

/** Adaptive order used when the model does not select a specific approved question. */
export const ADAPTIVE_ORDER: readonly QuestionId[] = [
  "duration",
  "severity",
  "conditions",
  "medications",
  "allergies",
  "other_symptoms",
];

export const ALL_QUESTION_IDS: readonly QuestionId[] = Object.keys(QUESTIONS) as QuestionId[];

export function isQuestionId(value: unknown): value is QuestionId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(QUESTIONS, value);
}

export function getQuestion(id: QuestionId): QuestionDefinition {
  return QUESTIONS[id];
}

export function questionForField(field: CorrectableField): QuestionDefinition | null {
  for (const question of Object.values(QUESTIONS)) {
    if (question.field === field) return question;
  }
  return null;
}

/** Fixed prompt text for the session language. */
export function questionText(id: QuestionId, language: "en" | "hi"): string {
  const question = QUESTIONS[id];
  return language === "hi" ? question.hi : question.en;
}

/**
 * Maps a chip label or an English/Hindi word to a stored option value.
 * Used for gender and the emergency clarification; returns null when unmatched.
 */
export function optionValueFor(id: QuestionId, answer: string): string | null {
  const options = QUESTIONS[id].options;
  if (!options) return null;
  const needle = answer.trim().toLowerCase();
  if (needle.length === 0) return null;
  for (const option of options) {
    if (option.value.toLowerCase() === needle) return option.value;
    if (option.label.toLowerCase() === needle) return option.value;
  }
  return null;
}
