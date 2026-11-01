/**
 * Stable error codes surfaced to the client in `ChatTurnResponse.error`.
 *
 * These are values, not prose: the frontend owns all user-facing copy and all
 * translations. A code must never carry patient data.
 */

export const ERROR_CODES = [
  "demo_busy",
  "turn_cap_reached",
  "invalid_request",
  "unauthorized",
  "not_found",
  "invalid_state",
  "invalid_question",
  "invalid_question_state",
  "field_not_editable",
  "invalid_field_status",
  "provider_unavailable",
  "audio_in_progress",
  "transcript_empty",
  "audio_superseded",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

/** Internal failure carrying a safe, non-sensitive code. */
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(code);
    this.name = "AppError";
    this.code = code;
  }
}

/**
 * Converts anything thrown into a safe code. Never returns provider text, SQL text or
 * a stack trace: those belong in server logs with health content stripped.
 */
export function toErrorCode(error: unknown): ErrorCode {
  if (error instanceof AppError) return error.code;
  return "internal";
}
