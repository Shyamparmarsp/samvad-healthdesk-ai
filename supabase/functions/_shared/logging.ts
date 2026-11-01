/**
 * Safe logging.
 *
 * Health text, transcripts, audio, tokens and provider bodies must never reach logs
 * (AGENTS.md, docs/failure-modes.md). Callers pass an allowlisted event name and only
 * scalar, non-sensitive metadata.
 */

export type LogEvent =
  | "request_received"
  | "action_completed"
  | "action_rejected"
  | "provider_attempt"
  | "provider_failure"
  | "usage_reserved"
  | "usage_capped"
  | "emergency_triggered"
  | "claim_acquired"
  | "claim_released";

export type LogFields = Record<string, string | number | boolean | null>;

/** Keys that may never appear in a log line, even if a caller passes them. */
const FORBIDDEN_KEY_PATTERN =
  /(text|transcript|audio|message|answer|content|name|concern|symptom|medic|allerg|token|key|secret|authorization|password|cookie)/i;

/**
 * Returns a safe copy of the fields: forbidden keys are removed, strings are truncated,
 * and no value is ever serialised as JSON.
 */
export function sanitizeFields(fields: LogFields): LogFields {
  const safe: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) continue;
    if (typeof value === "string") {
      safe[key] = value.slice(0, 64);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      safe[key] = value;
    }
  }
  return safe;
}

export interface Logger {
  info(event: LogEvent, fields?: LogFields): void;
  error(event: LogEvent, fields?: LogFields): void;
}

/** Default logger used by the Edge Functions. Metadata only. */
export const consoleLogger: Logger = {
  info(event, fields = {}) {
    console.log(JSON.stringify({ level: "info", event, ...sanitizeFields(fields) }));
  },
  error(event, fields = {}) {
    console.error(JSON.stringify({ level: "error", event, ...sanitizeFields(fields) }));
  },
};
