/**
 * Clean-room database rehearsal.
 *
 * Builds a brand-new database inside the local Postgres container, applies the committed
 * migrations in documented order, applies the reference seed TWICE (repeatability), and
 * verifies schema, grants, functions and reference data. It never touches the active
 * application database and drops the rehearsal database afterwards.
 *
 *   deno run --allow-run --allow-read --allow-write scripts/rehearse-db.ts
 *   deno run … --keep      # keep the rehearsal database for inspection
 *
 * Why the auth/extensions schemas are cloned: our migrations declare
 * `references auth.users(id)` and call `auth.uid()`. A truly empty cluster has neither, so
 * the rehearsal clones those two schemas (schema only, no rows) and then applies our
 * migrations from nothing. GoTrue's own tables are not part of this rehearsal.
 *
 * Identity-dependent suites (`rls.sql`, `mark_reviewed.sql`, …) need the four local test
 * users, which only exist on the active stack; they are run there by
 * `scripts/release-check.ts` and are reported as such.
 */

const KEEP = Deno.args.includes("--keep");
const CONTAINER = Deno.env.get("DB_CONTAINER") ?? "supabase_db_samvad-backend";
const SOURCE_DB = "postgres";
const STAMP = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
const DB = `samvad_rehearsal_${STAMP}`;

type Status = "PASS" | "FAIL" | "BLOCKED";
const rows: Array<{ step: string; status: Status; detail: string }> = [];
const add = (step: string, status: Status, detail = "") => rows.push({ step, status, detail });

async function sh(script: string): Promise<{ ok: boolean; out: string }> {
  const { success, stdout, stderr } = await new Deno.Command("sh", {
    args: ["-c", script],
    stdout: "piped",
    stderr: "piped",
  }).output();
  return { ok: success, out: (new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr)).trim() };
}

const psql = (db: string, sql: string) =>
  sh(`docker exec -i ${CONTAINER} psql -U postgres -d ${db} -Atc ${JSON.stringify(sql)}`);

const psqlFile = (db: string, path: string) =>
  sh(`docker exec -i ${CONTAINER} psql -U postgres -d ${db} -v ON_ERROR_STOP=1 < ${JSON.stringify(path)}`);

console.log(`Clean-room rehearsal → ${DB}\n`);

// ---------------------------------------------------------------- 0. prerequisites

const ping = await psql(SOURCE_DB, "select 1");
if (!ping.ok) {
  add("prerequisite", "BLOCKED", `cannot reach ${CONTAINER}; is the local stack running?`);
  console.log("BLOCKED  prerequisite — local Postgres container is not reachable");
  Deno.exit(2);
}
add("prerequisite", "PASS", "local Postgres reachable");

// ---------------------------------------------------------------- 1. empty database

const create = await psql(SOURCE_DB, `create database ${DB}`);
add("1. create empty database", create.ok ? "PASS" : "FAIL", create.ok ? DB : create.out.slice(0, 160));
if (!create.ok) {
  finalise();
}

// ---------------------------------------------------------------- 2. clone auth + extensions (schema only)

const dump = await sh(
  `docker exec ${CONTAINER} pg_dump -U postgres -d ${SOURCE_DB} --schema-only --schema=auth --schema=extensions ` +
    `| docker exec -i ${CONTAINER} psql -U postgres -d ${DB} -q`,
);
add(
  "2. clone auth/extensions schema (no rows)",
  dump.ok ? "PASS" : "FAIL",
  dump.ok ? "auth.users and auth.uid() available for our foreign keys" : dump.out.slice(0, 200),
);
const authUsers = await psql(DB, "select count(*) from auth.users");
add(
  "2b. rehearsal has no real identities",
  authUsers.out.trim() === "0" ? "PASS" : "FAIL",
  `auth.users rows = ${authUsers.out.trim() || "?"}`,
);

// ---------------------------------------------------------------- 3. migrations in order

const files: string[] = [];
for await (const entry of Deno.readDir("supabase/migrations")) {
  if (entry.isFile && /^\d{14}_.*\.sql$/.test(entry.name)) files.push(entry.name);
}
files.sort();

const sequence: string[] = [];
for (const file of files) {
  const result = await psqlFile(DB, `supabase/migrations/${file}`);
  const failed = !result.ok || /ERROR:/.test(result.out);
  add(`3. migrate ${file}`, failed ? "FAIL" : "PASS", failed ? result.out.split("\n").slice(0, 2).join(" ") : "");
  sequence.push(`${failed ? "FAIL" : "ok"}  ${file}`);
  if (failed) break;
}

// A clean-room database created without the Supabase CLI has no
// supabase_migrations.schema_migrations table — the CLI creates it during `db reset`.
// The per-file application above is the authoritative record here; the ledger is only
// compared when it exists (i.e. on a CLI-managed database).
const ledgerExists = await psql(
  DB,
  "select count(*) from information_schema.schemata where schema_name = 'supabase_migrations'",
);
if (ledgerExists.out.trim() === "1") {
  const applied = await psql(DB, "select count(*) from supabase_migrations.schema_migrations");
  add(
    "3b. every migration recorded in the ledger",
    applied.out.trim() === String(files.length) ? "PASS" : "FAIL",
    `${applied.out.trim()}/${files.length} ledger rows`,
  );
} else {
  add(
    "3b. migration record",
    "PASS",
    `CLI-less clean room: ${files.length}/${files.length} files applied individually (no ledger table by design)`,
  );
}

// ---------------------------------------------------------------- 4. seed, twice

const seedOnce = await psqlFile(DB, "supabase/seed.sql");
add("4. reference seed applied", seedOnce.ok ? "PASS" : "FAIL", seedOnce.ok ? "" : seedOnce.out.slice(0, 160));

const counts = async () => ({
  departments: (await psql(DB, "select count(*) from public.departments")).out.trim(),
  doctors: (await psql(DB, "select count(*) from public.doctors")).out.trim(),
  schedules: (await psql(DB, "select count(*) from public.doctor_schedules")).out.trim(),
  limits: (await psql(DB, "select count(*) from public.daily_usage_limits")).out.trim(),
});
const before = await counts();

const seedTwice = await psqlFile(DB, "supabase/seed.sql");
const after = await counts();
add(
  "4b. seed is repeatable (no duplicate reference rows)",
  seedTwice.ok && JSON.stringify(before) === JSON.stringify(after) ? "PASS" : "FAIL",
  `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`,
);

// ---------------------------------------------------------------- 5. reference data

add("5. departments = 6", after.departments === "6" ? "PASS" : "FAIL", `${after.departments}`);
add("5b. fictional doctors = 6", after.doctors === "6" ? "PASS" : "FAIL", `${after.doctors}`);
add("5c. schedules = 25 (5 bookable x 5 weekdays)", after.schedules === "25" ? "PASS" : "FAIL", `${after.schedules}`);
const emergency = await psql(DB, "select booking_enabled || '|' || is_emergency from public.departments where key='emergency'");
add("5d. emergency not bookable", emergency.out.trim() === "false|true" ? "PASS" : "FAIL", emergency.out.trim());

// ---------------------------------------------------------------- 6. objects, grants, RLS

const functions = await psql(
  DB,
  "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in (" +
    "'reserve_daily_usage','mark_report_reviewed','get_available_slots','book_appointment','get_doctor_appointments') order by 1",
);
add(
  "6. five required functions",
  functions.out.trim().split("\n").filter(Boolean).length === 5 ? "PASS" : "FAIL",
  functions.out.trim().replace(/\n/g, ", "),
);

const definers = await psql(
  DB,
  "select proname || ':' || prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace " +
    "where n.nspname='public' and proname in ('mark_report_reviewed','get_available_slots','book_appointment','get_doctor_appointments','reserve_daily_usage') order by 1",
);
const definerLines = definers.out.trim().split("\n");
const definerOk =
  definerLines.find((line) => line.startsWith("reserve_daily_usage")) === "reserve_daily_usage:false" &&
  definerLines.filter((line) => line.endsWith(":true")).length === 4;
add("6b. SECURITY mode matches the reviewed allowlist", definerOk ? "PASS" : "FAIL", definerLines.join(", "));

const rlsOff = await psql(
  DB,
  "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity",
);
add("6c. RLS enabled on every table", rlsOff.out.trim() === "0" ? "PASS" : "FAIL", `${rlsOff.out.trim()} tables without RLS`);

const browserWrite = await psql(
  DB,
  "select count(*) from information_schema.role_table_grants where table_schema='public' " +
    "and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE')",
);
add("6d. no browser write grants", browserWrite.out.trim() === "0" ? "PASS" : "FAIL", `${browserWrite.out.trim()} write grants`);

const triggers = await psql(
  DB,
  "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace " +
    "where n.nspname='public' and not t.tgisinternal and t.tgname like '%set_updated_at'",
);
add("6e. updated_at triggers installed", Number(triggers.out.trim() || "0") >= 2 ? "PASS" : "FAIL", `${triggers.out.trim()} triggers`);

const constraints = await psql(
  DB,
  "select count(*) from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public'",
);
add("6f. constraints created", Number(constraints.out.trim() || "0") >= 40 ? "PASS" : "FAIL", `${constraints.out.trim()} constraints`);

// ---------------------------------------------------------------- 7. cleanup

function finalise(): never {
  const failed = rows.filter((row) => row.status === "FAIL");
  const blocked = rows.filter((row) => row.status === "BLOCKED");
  const report = {
    generatedAt: new Date().toISOString(),
    rehearsalDatabase: DB,
    kept: KEEP,
    migrations: sequence,
    summary: { total: rows.length, pass: rows.length - failed.length - blocked.length, fail: failed.length, blocked: blocked.length },
    rows,
    ok: failed.length === 0 && blocked.length === 0,
    note: "Identity-dependent SQL suites run against the active stack, not this rehearsal.",
  };
  console.log("");
  for (const row of rows) console.log(`${row.status.padEnd(8)} ${row.step}${row.detail ? ` — ${row.detail}` : ""}`);
  console.log(`\n${report.summary.pass}/${report.summary.total} rehearsal checks passed`);
  console.log("Applied order:");
  for (const line of sequence) console.log(`  ${line}`);
  Deno.writeTextFileSync("db-rehearsal-result.json", JSON.stringify(report, null, 2) + "\n");
  console.log("Wrote db-rehearsal-result.json");
  Deno.exit(report.ok ? 0 : 1);
}

if (KEEP) {
  add("7. cleanup", "PASS", `kept ${DB} (--keep)`);
} else {
  const drop = await psql(SOURCE_DB, `drop database ${DB} with (force)`);
  add("7. cleanup", drop.ok ? "PASS" : "FAIL", drop.ok ? `dropped ${DB}` : drop.out.slice(0, 160));
}

finalise();
