/**
 * Metadata-only error diagnostics for server logs.
 *
 * A generic `{"error":"internal"}` response is correct for the patient, but it must not be
 * the only trace of a failure. This module derives a small, closed vocabulary from an
 * unknown thrown value so a production 5xx can be diagnosed from the function log without
 * ever recording patient content.
 *
 * What is recorded: an error class name, a PostgreSQL SQLSTATE (or PostgREST code) and a
 * fixed failure category. What is never recorded: provider/database message text, SQL,
 * stack traces, tokens, request bodies or health answers. A PostgreSQL message can echo a
 * rejected value (for example a cast failure quotes the input), so the message is dropped
 * rather than truncated.
 */

export type FailureKind =
  | "app_error"
  | "db_permission_denied"
  | "db_undefined_table"
  | "db_undefined_column"
  | "db_unique_violation"
  | "db_foreign_key_violation"
  | "db_check_violation"
  | "db_not_null_violation"
  | "db_invalid_text"
  | "db_connection"
  | "transport"
  | "unexpected";

export interface ErrorDiagnostics {
  error_name: string;
  sqlstate: string | null;
  failure: FailureKind;
}

/** SQLSTATE → failure category. Only the codes the backend can realistically hit. */
const SQLSTATE_FAILURES: Record<string, FailureKind> = {
  "42501": "db_permission_denied",
  "42P01": "db_undefined_table",
  "42703": "db_undefined_column",
  "23505": "db_unique_violation",
  "23503": "db_foreign_key_violation",
  "23514": "db_check_violation",
  "23502": "db_not_null_violation",
  "22P02": "db_invalid_text",
  "22007": "db_invalid_text",
  "08000": "db_connection",
  "08003": "db_connection",
  "08006": "db_connection",
  "08001": "db_connection",
  "57P01": "db_connection",
};

const SQLSTATE_RE = /^[0-9A-Z]{5}$/;
const ERROR_NAME_RE = /^[A-Za-z][A-Za-z0-9]{0,39}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads a PostgREST/SQLSTATE code from a thrown value or its `cause` chain. */
function codeFrom(value: unknown, depth = 0): string | null {
  if (depth > 3 || !isRecord(value)) return null;
  const code = (value as { code?: unknown }).code;
  if (typeof code === "string" && SQLSTATE_RE.test(code)) return code;
  const cause = (value as { cause?: unknown }).cause;
  return cause === undefined ? null : codeFrom(cause, depth + 1);
}

function nameFrom(error: unknown): string {
  if (isRecord(error)) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && ERROR_NAME_RE.test(name)) return name;
    const ctor = (error as { constructor?: { name?: unknown } }).constructor;
    const ctorName = isRecord(ctor) ? ctor.name : undefined;
    if (typeof ctorName === "string" && ERROR_NAME_RE.test(ctorName)) return ctorName;
  }
  return typeof error;
}

/**
 * Converts anything thrown into log-safe metadata. Never returns free text from the
 * database, a provider or the request.
 */
export function describeError(error: unknown): ErrorDiagnostics {
  const sqlstate = codeFrom(error);
  let failure: FailureKind;
  if (sqlstate) {
    failure = SQLSTATE_FAILURES[sqlstate] ?? "unexpected";
  } else if (error instanceof Error && error.name === "AppError") {
    failure = "app_error";
  } else {
    const name = nameFrom(error);
    failure = name === "TypeError" || name === "FetchError" ? "transport" : "unexpected";
  }
  return { error_name: nameFrom(error), sqlstate, failure };
}
