/**
 * Offline tests for the demo lifecycle toolkit. No docker, database, network or account
 * mutation is performed.
 */

import {
  buildRetentionSql,
  maskUid,
  parseCutoff,
  validateDoctorAllowlist,
} from "../../scripts/demo-lifecycle.ts";
import {
  parseRestoreArgs,
  scratchDatabaseName,
  validateContainerName,
  validateDump,
  verificationSql,
} from "../../scripts/verify-backup-restore.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`Assertion failed: ${message}`);
}
function assertThrows(run: () => unknown, message: string): void {
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

const NOW = Date.parse("2026-11-02T12:00:00Z");

Deno.test("cutoff: date-only is UTC midnight and full ISO is accepted", () => {
  assertEqual(parseCutoff("2026-12-10", NOW).iso, "2026-12-10T00:00:00.000Z", "date-only");
  assertEqual(parseCutoff("2026-12-10T05:30:00+05:30", NOW).iso, "2026-12-10T00:00:00.000Z", "offset");
});

Deno.test("cutoff: future planning dates are valid; malformed/missing-zone dates are refused", () => {
  assertEqual(parseCutoff("2026-12-10", NOW).iso, "2026-12-10T00:00:00.000Z", "future planning date");
  assertThrows(() => parseCutoff("2026-12-10T00:00:00", NOW), "missing zone");
  assertThrows(() => parseCutoff("not-a-date", NOW), "malformed");
});

const PROFILES = [
  { user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", doctor_id: "doctor-gm" },
  { user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", doctor_id: "doctor-em" },
];
const DOCTORS = [
  { id: "doctor-gm", display_name: "Dr. Aditi Rao", department_key: "general_medicine" },
  { id: "doctor-em", display_name: "Dr. Neha Verma", department_key: "emergency" },
];
const GM = PROFILES[0].user_id;
const EM = PROFILES[1].user_id;

Deno.test("allowlist: exactly the two named profiles pass", () => {
  const result = validateDoctorAllowlist(PROFILES, DOCTORS, GM, EM);
  assertEqual(result.ok, true, result.problems.join("; "));
  assertEqual(result.accounts.length, 2, "two accounts");
  assertEqual(result.accounts[0].displayName, "Dr. Aditi Rao", "GM name");
  assertEqual(result.accounts[1].displayName, "Dr. Neha Verma", "EM name");
});

Deno.test("allowlist: extra profile, wrong department/name and missing UID are refused", () => {
  const extra = validateDoctorAllowlist(
    [...PROFILES, { user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", doctor_id: "doctor-gm" }],
    DOCTORS,
    GM,
    EM,
  );
  assertEqual(extra.ok, false, "extra profile refused");

  const wrongDept = validateDoctorAllowlist(
    PROFILES,
    [{ ...DOCTORS[0], department_key: "emergency" }, DOCTORS[1]],
    GM,
    EM,
  );
  assertEqual(wrongDept.ok, false, "wrong department refused");

  const wrongName = validateDoctorAllowlist(
    PROFILES,
    [{ ...DOCTORS[0], display_name: "Someone Else" }, DOCTORS[1]],
    GM,
    EM,
  );
  assertEqual(wrongName.ok, false, "wrong name refused");

  const missing = validateDoctorAllowlist(PROFILES, DOCTORS, GM, "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  assertEqual(missing.ok, false, "unmapped UID refused");
});

Deno.test("allowlist: duplicate and empty UIDs are refused", () => {
  assertEqual(validateDoctorAllowlist(PROFILES, DOCTORS, GM, GM).ok, false, "same UID");
  assertEqual(validateDoctorAllowlist(PROFILES, DOCTORS, "", "").ok, false, "empty UIDs");
});

Deno.test("UID masking never prints the full value", () => {
  const masked = maskUid(GM);
  assert(!masked.includes(GM), "full UID hidden");
  assert(masked.includes("…"), "mask marker");
});

Deno.test("retention SQL: cutoff, dependency order and preserved tables", () => {
  const cutoff = parseCutoff("2026-12-10", NOW);
  const sql = buildRetentionSql(cutoff);
  assert(sql.includes("'2026-12-10T00:00:00.000Z'::timestamptz"), "cutoff literal");
  assert(sql.includes("delete from public.appointments"), "appointments first");
  assert(sql.indexOf("delete from public.appointments") < sql.indexOf("delete from public.reports"), "dependency order");
  assert(sql.includes("delete from public.sessions"), "sessions last in domain order");
  assert(!/delete\s+from\s+public\.(doctors|doctor_profiles|departments|daily_usage)/i.test(sql), "reference tables preserved");
  assert(!/delete\s+from\s+auth\.users/i.test(sql), "auth users not auto-deleted");
  assert(sql.includes("-- commit;"), "commit kept for owner review");
});

Deno.test("restore: dump structural validation rejects empty/missing markers", () => {
  assertEqual(validateDump("schema", "create table public.x (id int);").ok, true, "schema marker");
  assertEqual(validateDump("data", "insert into public.x (id) values (1);").ok, true, "data marker");
  assertEqual(validateDump("schema", "").ok, false, "empty schema");
  assertEqual(validateDump("schema", "select 1;").ok, false, "schema without create table");
  assertEqual(validateDump("data", "select 1;").ok, false, "data without insert/copy");
});

Deno.test("restore: scratch database names are unique and never the active DB", () => {
  const a = scratchDatabaseName(NOW, "11111111-1111-4111-8111-111111111111");
  const b = scratchDatabaseName(NOW, "22222222-2222-4222-8222-222222222222");
  assert(a.startsWith("samvad_restore_verify_"), "prefix");
  assert(a !== b, "unique suffix");
  assert(a !== "postgres" && a !== "supabase_db_samvad-backend", "never active DB");
  assert(/^[a-z0-9_]+$/.test(a), "safe identifier");
});

Deno.test("restore: container guard accepts local Supabase containers only", () => {
  assertEqual(validateContainerName("supabase_db_samvad-backend").length, 0, "local");
  assert(validateContainerName("postgres").length > 0, "plain postgres rejected");
  assert(validateContainerName("https://example.com").length > 0, "URL rejected");
  assert(validateContainerName("supabase_db_x;drop").length > 0, "spaces/semicolons rejected");
});

Deno.test("restore: args default to dry-run and validate the container", () => {
  const options = parseRestoreArgs(["--schema", "s.sql", "--data", "d.sql"]);
  assertEqual(options.execute, false, "dry-run default");
  assertEqual(options.container, "supabase_db_samvad-backend", "default container");
  assertEqual(parseRestoreArgs(["--schema", "s.sql", "--data", "d.sql", "--execute"]).execute, true, "execute opt-in");
  assertThrows(() => parseRestoreArgs(["--data", "d.sql"]), "schema required");
  assertThrows(() => parseRestoreArgs(["--schema", "s.sql", "--data", "d.sql", "--container", "postgres"]), "unsafe container");
});

Deno.test("restore: verification SQL checks current reference counts and functions", () => {
  const sql = verificationSql();
  for (const table of ["departments", "doctors", "doctor_schedules", "daily_usage_limits"]) {
    assert(sql.includes(`public.${table}`), `${table} check`);
  }
  for (const fn of ["reserve_daily_usage", "mark_report_reviewed", "get_available_slots", "book_appointment", "get_doctor_appointments"]) {
    assert(sql.includes(fn), `${fn} check`);
  }
});
