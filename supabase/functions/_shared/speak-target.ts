/**
 * `speak` request target resolution.
 *
 * Extracted from the handler so the exact accept/reject rules can be tested without a
 * running Edge Function. Three targets exist and never more than one per request:
 *
 *   - a session's current question (cached prompt ids are refused later, in the handler)
 *   - one allowlisted system message id
 *   - one validated doctor-assistant summary fact set
 *
 * Free text is not a target in any branch, which is what keeps `speak` from becoming an
 * arbitrary text-to-speech proxy.
 */

import { isUuid } from "./auth.ts";
import { isSystemMessageId, type SystemMessageId } from "./messages.ts";
import { isQuestionId } from "./questions.ts";
import { getQuestion as getBankQuestion } from "./intake/question-bank.ts";
import { parseSummaryFacts, parseSummaryLanguage, type SummaryFacts, type SummaryLanguage } from "./doctor-summary.ts";

export type SpeakTarget =
  | { kind: "question"; sessionId: string; questionId: string }
  | { kind: "message"; sessionId: string; messageId: SystemMessageId }
  | { kind: "summary"; facts: SummaryFacts; language: SummaryLanguage };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the single target, or null when the body must be rejected with 400. */
export function resolveSpeakTarget(body: unknown): SpeakTarget | null {
  if (!isRecord(body)) return null;

  const hasMessage = body.message_id !== undefined;
  const hasQuestion = body.question_id !== undefined;
  const hasSummary = body.summary_facts !== undefined;
  if ([hasMessage, hasQuestion, hasSummary].filter(Boolean).length !== 1) return null;

  if (hasSummary) {
    const facts = parseSummaryFacts(body.summary_facts);
    if (!facts) return null;
    // Only the two supported languages are accepted; anything else is treated as Hindi.
    return { kind: "summary", facts, language: parseSummaryLanguage(body.summary_language) };
  }

  // Both remaining targets are session-scoped: the session proves ownership and carries
  // the language. A doctor summary needs neither.
  if (!isUuid(body.session_id)) return null;
  const sessionId = body.session_id;

  if (hasMessage) {
    if (!isSystemMessageId(body.message_id)) return null;
    return { kind: "message", sessionId, messageId: body.message_id };
  }

  // Core ids and adaptive bank ids (GM-001 … CARD-030) are both valid.
  const questionId = body.question_id;
  if (typeof questionId !== "string") return null;
  if (!isQuestionId(questionId) && !getBankQuestion(questionId)) return null;
  return { kind: "question", sessionId, questionId };
}
