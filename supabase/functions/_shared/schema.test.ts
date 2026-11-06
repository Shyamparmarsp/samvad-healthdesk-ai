/**
 * Structural checks over the SQL that cannot be verified without a database.
 *
 * These assert the security-relevant shape of the migrations: every table has RLS,
 * nothing is SECURITY DEFINER, browser roles get no write grants, the usage tables and
 * the reservation function are service-role only.
 *
 * Run with: deno test --allow-read
 */

import { assert, assertEqual } from "./testing.ts";

const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url);
const SUPABASE_DIR = new URL("../../", import.meta.url);

function listMigrations(): string[] {
  return [...Deno.readDirSync(MIGRATIONS_DIR)]
    .filter((entry) => entry.isFile && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
}

function readMigration(name: string): string {
  return Deno.readTextFileSync(new URL(name, MIGRATIONS_DIR));
}

function allSql(): string {
  return listMigrations().map((name) => readMigration(name)).join("\n");
}

Deno.test("schema: migration files exist and are ordered", () => {
  const files = listMigrations();
  assert(files.length >= 5, `expected at least five migrations, found ${files.length}`);
  for (let i = 1; i < files.length; i++) {
    assert(files[i - 1] < files[i], "migrations are lexicographically ordered");
  }
});

Deno.test("schema: every table enables row level security", () => {
  const sql = allSql();
  const tables = [...sql.matchAll(/create table public\.([a-z_]+)/g)].map((match) => match[1]);
  assert(tables.length >= 10, `expected at least ten tables, found ${tables.length}`);
  for (const table of tables) {
    assert(
      sql.includes(`alter table public.${table} enable row level security`),
      `RLS missing for ${table}`,
    );
  }
});

Deno.test("schema: SECURITY DEFINER is confined to the reviewed RPCs", () => {
  const definers = listMigrations().filter((name) => readMigration(name).toLowerCase().includes("security definer"));
  const reviewed = [
    "20261102120000_mark_report_reviewed.sql",
    "20261102130000_availability_and_booking.sql",
    // Added in M4-S16-B for a read the browser has no table grant for. It applies the
    // same controls below and is documented in docs/integration-contract.md.
    "20261102160000_doctor_appointment_reads.sql",
    // v1.3 partial reports: re-creates the two reviewed RPCs with the added non-emergency
    // `partial` status. Same definer controls, no new grant, no broadened read.
    "20261104083818_partial_reports_v13.sql",
    // Permanent report deletion: the browser has no DELETE grant on reports, so the
    // assigned-doctor check and the report-exclusive cleanup run inside one reviewed
    // definer function with the same empty search_path and grant restrictions.
    "20261106090000_delete_doctor_report.sql",
  ];
  assertEqual(definers.length, reviewed.length, "only reviewed migrations may declare SECURITY DEFINER");
  assertEqual(
    definers.sort().join(","),
    [...reviewed].sort().join(","),
    "the reviewed functions only",
  );

  for (const file of definers) {
    const sql = readMigration(file).toLowerCase();
    assert(sql.includes("set search_path = ''"), `${file}: empty search_path`);
    assert(sql.includes("auth.uid()"), `${file}: caller identity validated inline`);
    assert(sql.includes("revoke all on function"), `${file}: execute revoked`);
    assert(sql.includes("to authenticated"), `${file}: authenticated only`);
    assert(!sql.includes("grant update"), `${file}: no table write grant added`);
  }
});

Deno.test("schema: booking RPCs keep browser table access closed", () => {
  const sql = readMigration("20261102130000_availability_and_booking.sql").toLowerCase();
  assert(!/grant\s+(insert|update|delete|all)[^;]*to\s+(anon|authenticated)/.test(sql), "no browser write grant");
  assert(!sql.includes("grant select on public.appointments"), "no appointment table read");
  assert(sql.includes("security definer"), "availability documents its definer need");
});

Deno.test("schema: browser roles never receive write privileges", () => {
  const sql = allSql().toLowerCase();
  for (const role of ["anon", "authenticated"]) {
    assert(!new RegExp(`grant\\s+(insert|update|delete|all)[^;]*to[^;]*${role}`).test(sql), `write grant to ${role}`);
  }
});

Deno.test("schema: server-owned tables expose no browser grants", () => {
  const sql = allSql().toLowerCase();
  for (const table of ["sessions", "consent_records", "appointments", "daily_usage_limits", "daily_usage_counters"]) {
    assert(!new RegExp(`grant\\s+select[^;]*on public\\.${table}\\s+to\\s+(anon|authenticated)`).test(sql), `select granted on ${table}`);
    assert(sql.includes(`revoke all on public.${table}`), `${table} grants revoked`);
  }
});

Deno.test("schema: the elevated server client holds its table privileges", () => {
  // Regression guard for the 4 November 2026 production outage: the hosted project grants
  // the API roles only TRUNCATE/REFERENCES/TRIGGER/MAINTAIN by default, so `service_role`
  // needs explicit DML on every server-owned table the Edge Functions write.
  const file = "20261103205132_service_role_server_table_privileges.sql";
  const sql = readMigration(file).toLowerCase();
  // Comments explain the incident; only executable lines are scanned.
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  const required = [
    "grant select, insert, update on public.sessions to service_role",
    "grant select, insert on public.consent_records to service_role",
    "grant select, insert on public.messages to service_role",
    "grant select, insert, update on public.reports to service_role",
    "grant select on public.departments to service_role",
    "grant select on public.doctors to service_role",
  ];
  for (const statement of required) {
    assert(sql.includes(statement), `missing: ${statement}`);
  }

  // The hotfix must not re-open browser access, change a policy or disable RLS.
  assert(!/grant\s+[^;]*\s+to\s+(anon|authenticated|public)\b/.test(statements), "no browser grant");
  assert(!statements.includes("disable row level security"), "RLS stays on");
  assert(!statements.includes("create policy"), "no new policy");
  assert(!statements.includes("drop policy"), "no dropped policy");
  // appointments stays closed: booking goes through the reviewed elevated-rights RPC.
  assert(!/grant\s+[^;]*on public\.appointments/.test(statements), "appointments stays closed");
});

Deno.test("schema: usage counters are service-role only", () => {
  const sql = allSql().toLowerCase();
  assert(sql.includes("grant select on public.daily_usage_limits to service_role"), "limits readable by service_role");
  assert(sql.includes("grant select, insert, update on public.daily_usage_counters to service_role"), "counters writable by service_role");
  assert(sql.includes("revoke all on function public.reserve_daily_usage(text) from public, anon, authenticated"), "execute revoked");
  assert(sql.includes("grant execute on function public.reserve_daily_usage(text) to service_role"), "execute granted to service_role");
  assert(sql.includes("security invoker"), "reservation function is invoker");
  assert(sql.includes("set search_path = ''"), "empty search_path");
  assert(sql.includes("at time zone 'asia/kolkata'"), "IST date derived in SQL");
});

Deno.test("schema: reservation function rejects unknown counters", () => {
  const sql = readMigration("20261101120400_usage_tables.sql");
  assert(sql.includes("p_counter not in ('sessions', 'groq', 'prisma', 'timbre')"), "counter allowlist");
  assert(sql.includes("raise exception 'unknown usage counter'"), "raises on unknown counter");
  assert(!sql.includes("p_date"), "no caller-supplied date parameter");
});

Deno.test("schema: report status enum has exactly three documented values", () => {
  const sql = readMigration("20261101120000_enums_and_helpers.sql");
  const block = sql.slice(sql.indexOf("create type public.report_status"), sql.indexOf("create type public.consent_decision"));
  for (const value of ["draft", "submitted", "urgent_partial"]) {
    assert(block.includes(`'${value}'`), `missing report status ${value}`);
  }
  assertEqual((block.match(/'[a-z_]+'/g) ?? []).length, 3, "exactly three report statuses");
});

Deno.test("schema: session status is a separate enum", () => {
  const sql = allSql().toLowerCase();
  assert(sql.includes("create type public.session_status as enum"), "session enum exists");
  assert(!sql.includes("info_status"), "no InfoStatus database enum");
  assert(!sql.includes("infostatus"), "no InfoStatus database enum (alt spelling)");
});

Deno.test("schema: sessions carries the twelve transient audio columns", () => {
  const sql = readMigration("20261101120200_intake_tables.sql");
  const columns = [
    "pending_transcript_text",
    "pending_transcript_language",
    "pending_transcript_question_id",
    "pending_transcript_expected_turn",
    "pending_transcript_created_at",
    "pending_transcript_expires_at",
    "audio_claim_id",
    "audio_claim_question_id",
    "audio_claim_expected_turn",
    "audio_claim_state",
    "audio_claim_created_at",
    "audio_claim_expires_at",
  ];
  for (const column of columns) {
    assert(new RegExp(`\\n\\s+${column}\\s`).test(sql), `missing column ${column}`);
  }
});

Deno.test("schema: sessions enforces claim and pending coherence", () => {
  const sql = readMigration("20261101120200_intake_tables.sql");
  assert(sql.includes("sessions_pending_coherent"), "pending coherence check");
  assert(sql.includes("sessions_claim_coherent"), "claim coherence check");
  assert(sql.includes("in (0, 6)"), "all-or-nothing groups");
  assert(sql.includes("audio_claim_state is null or audio_claim_state in ('claimed', 'dispatched')"), "claim state allowlist");
  assert(sql.includes("answer_turn_count between 0 and 15"), "15-turn bound");
  assert(sql.includes("needs_human_review boolean not null default false"), "session review flag");
  assert(sql.includes("clarification_answer text null"), "clarification evidence column");
  assert(sql.includes("sessions_clarification_pair"), "clarification evidence pair check");
});

Deno.test("schema: messages has the patient-turn unique index", () => {
  const sql = readMigration("20261101120200_intake_tables.sql");
  assert(sql.includes("create unique index messages_patient_turn_unique"), "index exists");
  assert(sql.includes("where role = 'patient'"), "partial on patient rows");
  assert(sql.includes("constraint messages_turn_shape"), "turn shape check");
});

Deno.test("schema: reports matches the approved contract", () => {
  const sql = readMigration("20261101120200_intake_tables.sql");
  assert(sql.includes("session_id uuid not null unique references public.sessions"), "one report per session");
  assert(sql.includes("reviewed_by uuid null references auth.users (id)"), "RD-17 auth uid reference");
  assert(sql.includes("report jsonb not null"), "JSONB document column");
  assert(sql.includes("reports_status_submitted_at"), "submitted_at consistency");
  assert(sql.includes("reports_review_pair"), "review pair consistency");
  assert(sql.includes("reports_urgent_never_submitted"), "urgent never submitted");
});

Deno.test("schema: doctor policies encode assignment and the emergency exception", () => {
  const sql = readMigration("20261101120200_intake_tables.sql");
  assert(sql.includes("reports_doctor_read"), "reports policy");
  assert(sql.includes("status in ('submitted', 'urgent_partial')"), "drafts excluded");
  assert(sql.includes("dp.doctor_id = reports.doctor_id"), "assignment match");
  assert(sql.includes("department_key = 'emergency'"), "emergency cross-visibility");
  assert(sql.includes("d.department_key in ('general_medicine', 'emergency')"), "documented doctor scope");
  assert(sql.includes("messages_doctor_read"), "messages policy");
});

Deno.test("schema: appointments enforces one confirmed slot and one per report", () => {
  const sql = readMigration("20261101120300_appointments.sql");
  assert(sql.includes("appointments_doctor_slot_confirmed"), "slot uniqueness");
  assert(sql.includes("appointments_report_confirmed"), "report uniqueness");
  assert(sql.includes("where status = 'confirmed'"), "partial indexes");
});

Deno.test("schema: seed data is fictional, complete and never touches auth", () => {
  const seed = Deno.readTextFileSync(new URL("seed.sql", SUPABASE_DIR)).toLowerCase();
  for (const department of ["general_medicine", "orthopedics", "emergency", "general_surgery", "dermatology", "cardiology"]) {
    assert(seed.includes(`'${department}'`), `department ${department}`);
  }
  for (const doctor of ["dr. aditi rao", "dr. kabir mehta", "dr. neha verma", "dr. ishaan patel", "dr. sara khan", "dr. arjun nair"]) {
    assert(seed.includes(doctor), `doctor ${doctor}`);
  }
  assert(!seed.includes("auth.users"), "seed never touches auth.users");
  assert(!seed.includes("password"), "no credentials in seed");
  assert(seed.includes("doctor_schedules"), "schedules seeded");
});

Deno.test("schema: doctor profile mapping script is placeholder-safe", () => {
  const script = Deno.readTextFileSync(new URL("seed-doctor-profiles.sql", SUPABASE_DIR)).toLowerCase();
  assert(!script.includes("insert into auth.users"), "never inserts users");
  assert(!/(^|\s)password\s*(=|:)/m.test(script), "no password assignment");
  assert(script.includes("replace both placeholder auth uids"), "guards against running with placeholders");
  assert(script.includes("on conflict (user_id) do update"), "idempotent mapping");
});
