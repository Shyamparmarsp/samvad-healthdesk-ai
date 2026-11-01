/**
 * Resume reconciliation for message-first acceptance.
 *
 * The accept path inserts the patient message before advancing the session, so an
 * interruption can leave a stored answer whose turn was never counted. This module
 * decides, from persisted state only, whether `resume_session` must repair that.
 *
 * It never calls a provider: a recovered turn uses the deterministic/scripted question
 * selection, so resuming can never consume a paid reservation.
 */

import type { QuestionId } from "./contract.ts";
import { nextQuestion } from "./conversation.ts";
import { isQuestionId } from "./questions.ts";
import type { FieldMap } from "./report.ts";
import { MAX_ANSWER_TURNS } from "./conversation.ts";

export interface ResumeSessionRow {
  answer_turn_count: number;
  current_question_id: string | null;
  status: string;
  pending_transcript_question_id: string | null;
  pending_transcript_expected_turn: number | null;
  pending_transcript_expires_at: string | null;
}

export interface ResumeMessageRow {
  role: "assistant" | "patient";
  turn_index: number | null;
}

export type ResumeReason =
  | "none"
  | "orphan_message"
  | "terminal_session"
  | "pending_expired";

export interface ResumePlan {
  /** A stored answer exists at turn_count + 1 and must be counted. */
  needsAdvance: boolean;
  orphanTurn: number | null;
  /** Question to set when advancing; null when intake is complete or capped. */
  nextQuestionId: QuestionId | null;
  /** Transient audio state that must be dropped. */
  clearPendingTranscript: boolean;
  reason: ResumeReason;
}

const TERMINAL_STATUSES = new Set(["ended", "declined", "emergency", "submitted"]);

function maxPatientTurn(messages: readonly ResumeMessageRow[]): number | null {
  let max: number | null = null;
  for (const message of messages) {
    if (message.role !== "patient") continue;
    if (typeof message.turn_index !== "number") continue;
    if (max === null || message.turn_index > max) max = message.turn_index;
  }
  return max;
}

/**
 * Plans the reconciliation for one session.
 *
 * `fields` must already include the orphan answer, so the chosen next question reflects
 * what the patient actually said.
 */
export function planResume(
  session: ResumeSessionRow,
  messages: readonly ResumeMessageRow[],
  fields: FieldMap,
  now: Date = new Date(),
): ResumePlan {
  if (TERMINAL_STATUSES.has(session.status)) {
    return {
      needsAdvance: false,
      orphanTurn: null,
      nextQuestionId: null,
      clearPendingTranscript: true,
      reason: "terminal_session",
    };
  }

  const pendingExpired =
    session.pending_transcript_expires_at !== null &&
    new Date(session.pending_transcript_expires_at).getTime() <= now.getTime();

  const highestTurn = maxPatientTurn(messages);
  if (highestTurn !== null && highestTurn === session.answer_turn_count + 1) {
    if (session.answer_turn_count + 1 > MAX_ANSWER_TURNS) {
      return {
        needsAdvance: false,
        orphanTurn: null,
        nextQuestionId: null,
        clearPendingTranscript: true,
        reason: "terminal_session",
      };
    }
    return {
      needsAdvance: true,
      orphanTurn: highestTurn,
      nextQuestionId: nextQuestion(fields),
      clearPendingTranscript: pendingExpired,
      reason: "orphan_message",
    };
  }

  if (pendingExpired) {
    return {
      needsAdvance: false,
      orphanTurn: null,
      nextQuestionId: null,
      clearPendingTranscript: true,
      reason: "pending_expired",
    };
  }

  return {
    needsAdvance: false,
    orphanTurn: null,
    nextQuestionId: null,
    clearPendingTranscript: false,
    reason: "none",
  };
}

/** True when a stored question id is still valid; used to repair a bad pointer. */
export function isCurrentQuestionValid(value: string | null): boolean {
  return value !== null && isQuestionId(value);
}
