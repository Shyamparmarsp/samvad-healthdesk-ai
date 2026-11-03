/**
 * Which channel speaks one assistant question.
 *
 * AGENTS.md D-06: the greeting and the four fixed questions come from committed files in
 * `public/audio/` and must never be synthesised. Adaptive questions (the six core adaptive
 * fields and the v2 bank ids) are the only ones allowed to reach Gnani Timbre through the
 * `speak` Edge Function.
 *
 * Anything else (the emergency clarification, or an unknown id) is spoken by neither: the
 * caller shows the question text and an honest "audio unavailable" note instead of
 * pretending, and never plays the placeholder silence files.
 */

import { cachedPromptSources, promptIdForQuestion } from './prompt-audio';

export type SpeechPlan =
  | { kind: 'cached'; sources: string[] }
  | { kind: 'tts'; questionId: string }
  | { kind: 'text_only'; reason: 'no_cached_prompt' };

/** Core ids whose text is synthesised on demand (phase "adaptive" in the backend bank). */
const ADAPTIVE_CORE_IDS = new Set([
  'duration',
  'severity',
  'conditions',
  'medications',
  'allergies',
  'other_symptoms',
]);

/** v2 bank ids, e.g. GM-001 … CARD-030. */
const BANK_ID = /^[A-Z]{2,4}-\d{3}$/;

export function planAssistantSpeech(
  questionId: string | null | undefined,
  language: 'en' | 'hi',
): SpeechPlan {
  if (!questionId) return { kind: 'text_only', reason: 'no_cached_prompt' };

  const promptId = promptIdForQuestion(questionId);
  if (promptId) return { kind: 'cached', sources: cachedPromptSources(language, promptId) };

  if (ADAPTIVE_CORE_IDS.has(questionId) || BANK_ID.test(questionId)) {
    return { kind: 'tts', questionId };
  }

  return { kind: 'text_only', reason: 'no_cached_prompt' };
}
