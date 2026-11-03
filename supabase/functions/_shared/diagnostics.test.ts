/**
 * Diagnostics regression tests.
 *
 * The production outage surfaced only as `action_rejected / start_session / internal`.
 * `describeError` must make the next 5xx diagnosable from the log while never carrying
 * database/provider text, patient content or tokens.
 */

import { describeError } from "./diagnostics.ts";
import { AppError, toErrorCode } from "./errors.ts";
import { assert, assertEqual } from "./testing.ts";

const PATIENT_MARKER = "SYNTHETIC_PATIENT_STATEMENT";

/** Shape supabase-js returns for a PostgREST failure, as seen in production. */
function postgrestError(code: string, message: string): unknown {
  return { code, message, details: null, hint: null };
}

Deno.test("diagnostics: permission denied is classified from the SQLSTATE only", () => {
  const error = new AppError("internal", {
    cause: postgrestError("42501", `permission denied for table sessions ${PATIENT_MARKER}`),
  });
  const described = describeError(error);
  assertEqual(described.sqlstate, "42501", "sqlstate");
  assertEqual(described.failure, "db_permission_denied", "failure category");
  assertEqual(described.error_name, "AppError", "error class");
  assert(!JSON.stringify(described).includes(PATIENT_MARKER), "no message text survives");
  assert(!JSON.stringify(described).includes("permission denied"), "no message text survives");
});

Deno.test("diagnostics: a raw PostgREST error object is understood", () => {
  const described = describeError(postgrestError("42501", "permission denied for table sessions"));
  assertEqual(described.sqlstate, "42501", "sqlstate");
  assertEqual(described.failure, "db_permission_denied", "failure category");
});

Deno.test("diagnostics: the failure categories cover the realistic SQLSTATEs", () => {
  const cases: Array<[string, string]> = [
    ["23505", "db_unique_violation"],
    ["23503", "db_foreign_key_violation"],
    ["23514", "db_check_violation"],
    ["23502", "db_not_null_violation"],
    ["42501", "db_permission_denied"],
    ["42P01", "db_undefined_table"],
    ["42703", "db_undefined_column"],
    ["22P02", "db_invalid_text"],
    ["08006", "db_connection"],
  ];
  for (const [code, failure] of cases) {
    assertEqual(describeError(postgrestError(code, "detail")).failure, failure as never, code);
  }
});

Deno.test("diagnostics: an unknown or missing code never leaks and never guesses", () => {
  assertEqual(describeError(postgrestError("PGRST116", "no rows")).sqlstate, null, "non-SQLSTATE code dropped");
  assertEqual(describeError(new Error("provider said: boom")).sqlstate, null, "plain Error has no sqlstate");
  assertEqual(describeError("string failure").failure, "unexpected", "primitive tolerated");
  assertEqual(describeError(undefined).failure, "unexpected", "undefined tolerated");
});

Deno.test("diagnostics: a broken client is reported as a transport fault", () => {
  // What an undefined admin client produces: a TypeError inside the caller.
  const described = describeError(new TypeError("Cannot read properties of undefined (reading 'from')"));
  assertEqual(described.failure, "transport", "transport category");
  assertEqual(described.error_name, "TypeError", "error class");
});

Deno.test("diagnostics: cause chains are walked, cycles are bounded", () => {
  const inner = postgrestError("23505", "duplicate key value violates unique constraint");
  const wrapped = new Error("wrapper", { cause: inner });
  assertEqual(describeError(wrapped).sqlstate, "23505", "nested cause found");

  const cycle: Record<string, unknown> = { name: "Loop" };
  cycle.cause = cycle;
  assertEqual(describeError(cycle).sqlstate, null, "cycle survives without hanging");
});

Deno.test("diagnostics: the safe client code is unchanged by adding a cause", () => {
  assertEqual(toErrorCode(new AppError("internal", { cause: postgrestError("42501", "denied") })), "internal", "code");
  assertEqual(toErrorCode(postgrestError("42501", "denied")), "internal", "raw error is generic");
});
