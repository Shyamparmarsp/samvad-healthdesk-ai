/**
 * Request validation for the six chat-turn actions.
 *
 * Shape mirrors src/types/api.ts. No additional action is accepted, and no field is
 * accepted "just in case": unknown keys at the top level are rejected so a client
 * cannot smuggle routing, status or flags through the request.
 */

import { CORRECTABLE_FIELDS, type CorrectableField, type QuestionId } from "./contract.ts";
import { isQuestionId } from "./questions.ts";
import { getQuestion as getBankQuestion } from "./intake/question-bank.ts";
import type { ErrorCode } from "./errors.ts";

export const ACTIONS = [
  "start_session",
  "resume_session",
  "record_consent",
  "submit_turn",
  "correct_draft_report",
  "submit_report",
] as const;

export type ActionName = (typeof ACTIONS)[number];

export interface StartSessionRequest {
  action: "start_session";
  language?: "en" | "hi";
}
export interface ResumeSessionRequest {
  action: "resume_session";
  session_id: string;
}
export interface RecordConsentRequest {
  action: "record_consent";
  session_id: string;
  consent: boolean;
  consent_version: string;
  language: "en" | "hi";
}
export interface SubmitTurnRequest {
  action: "submit_turn";
  session_id: string;
  question_id: QuestionId;
  text?: string;
  audio_base64?: string;
  audio_format?: string;
}
export interface CorrectDraftReportRequest {
  action: "correct_draft_report";
  session_id: string;
  report_id: string;
  updates: Partial<Record<CorrectableField, { value: unknown; status: "provided" | "declined" }>>;
}
export interface SubmitReportRequest {
  action: "submit_report";
  session_id: string;
  report_id: string;
}

export type ChatTurnRequest =
  | StartSessionRequest
  | ResumeSessionRequest
  | RecordConsentRequest
  | SubmitTurnRequest
  | CorrectDraftReportRequest
  | SubmitReportRequest;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; code: ErrorCode };

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT = 4000;
/** Roughly 1.5 MB of decoded audio; the browser caps recordings at 30 s. */
const MAX_AUDIO_BASE64 = 2_000_000;
const ACCEPTED_AUDIO_FORMATS = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/ogg",
  "audio/flac",
  "audio/aac",
  "audio/mp4",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLanguage(value: unknown): value is "en" | "hi" {
  return value === "en" || value === "hi";
}

function isSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID_RE.test(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function parseChatTurnRequest(raw: unknown): ParseResult<ChatTurnRequest> {
  if (!isRecord(raw)) return { ok: false, code: "invalid_request" };
  const action = raw.action;
  if (typeof action !== "string" || !(ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, code: "invalid_request" };
  }

  switch (action as ActionName) {
    case "start_session": {
      if (!hasOnlyKeys(raw, ["action", "language"])) return { ok: false, code: "invalid_request" };
      if (raw.language !== undefined && !isLanguage(raw.language)) {
        return { ok: false, code: "invalid_request" };
      }
      return { ok: true, value: { action: "start_session", language: raw.language as "en" | "hi" | undefined } };
    }

    case "resume_session": {
      if (!hasOnlyKeys(raw, ["action", "session_id"])) return { ok: false, code: "invalid_request" };
      if (!isSessionId(raw.session_id)) return { ok: false, code: "invalid_request" };
      return { ok: true, value: { action: "resume_session", session_id: raw.session_id } };
    }

    case "record_consent": {
      if (!hasOnlyKeys(raw, ["action", "session_id", "consent", "consent_version", "language"])) {
        return { ok: false, code: "invalid_request" };
      }
      if (!isSessionId(raw.session_id)) return { ok: false, code: "invalid_request" };
      if (typeof raw.consent !== "boolean") return { ok: false, code: "invalid_request" };
      if (typeof raw.consent_version !== "string" || raw.consent_version.length < 1 || raw.consent_version.length > 40) {
        return { ok: false, code: "invalid_request" };
      }
      if (!isLanguage(raw.language)) return { ok: false, code: "invalid_request" };
      return {
        ok: true,
        value: {
          action: "record_consent",
          session_id: raw.session_id,
          consent: raw.consent,
          consent_version: raw.consent_version,
          language: raw.language,
        },
      };
    }

    case "submit_turn": {
      if (!hasOnlyKeys(raw, ["action", "session_id", "question_id", "text", "audio_base64", "audio_format"])) {
        return { ok: false, code: "invalid_request" };
      }
      if (!isSessionId(raw.session_id)) return { ok: false, code: "invalid_request" };
      if (!isQuestionId(raw.question_id) && !getBankQuestion(raw.question_id as string)) {
        return { ok: false, code: "invalid_request" };
      }

      const hasText = typeof raw.text === "string" && raw.text.trim().length > 0;
      const hasAudio = typeof raw.audio_base64 === "string" && raw.audio_base64.length > 0;
      if (hasText === hasAudio) return { ok: false, code: "invalid_request" };
      if (hasText && (raw.text as string).length > MAX_TEXT) return { ok: false, code: "invalid_request" };

      if (hasAudio) {
        if ((raw.audio_base64 as string).length > MAX_AUDIO_BASE64) {
          return { ok: false, code: "invalid_request" };
        }
        if (typeof raw.audio_format !== "string" || !ACCEPTED_AUDIO_FORMATS.has(raw.audio_format.toLowerCase())) {
          // WebM is deliberately rejected here: Prisma does not accept it.
          return { ok: false, code: "invalid_request" };
        }
      }

      return { ok: true, value: raw as unknown as SubmitTurnRequest };
    }

    case "correct_draft_report": {
      if (!hasOnlyKeys(raw, ["action", "session_id", "report_id", "updates"])) {
        return { ok: false, code: "invalid_request" };
      }
      if (!isSessionId(raw.session_id) || !isSessionId(raw.report_id)) {
        return { ok: false, code: "invalid_request" };
      }
      if (!isRecord(raw.updates) || Object.keys(raw.updates).length === 0) {
        return { ok: false, code: "invalid_request" };
      }
      if (Object.keys(raw.updates).length > CORRECTABLE_FIELDS.length) {
        return { ok: false, code: "invalid_request" };
      }
      for (const entry of Object.values(raw.updates)) {
        if (!isRecord(entry)) return { ok: false, code: "invalid_request" };
      }
      return { ok: true, value: raw as unknown as CorrectDraftReportRequest };
    }

    case "submit_report": {
      if (!hasOnlyKeys(raw, ["action", "session_id", "report_id"])) {
        return { ok: false, code: "invalid_request" };
      }
      if (!isSessionId(raw.session_id) || !isSessionId(raw.report_id)) {
        return { ok: false, code: "invalid_request" };
      }
      return { ok: true, value: { action: "submit_report", session_id: raw.session_id, report_id: raw.report_id } };
    }
  }
}
