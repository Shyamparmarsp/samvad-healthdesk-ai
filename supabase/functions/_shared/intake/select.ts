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
