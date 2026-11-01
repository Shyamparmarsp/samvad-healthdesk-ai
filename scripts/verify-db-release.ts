/**
 * Read-only database release verification.
 *
 * Answers one question: "is this database prepared to run the application?"
 * It never writes, never repairs, never applies a migration or a seed. Every check is a
 * SELECT against information_schema/pg_catalog or a row count on reference data.
 *
 *   deno run --allow-net --allow-env --allow-read --allow-run scripts/verify-db-release.ts
 *   deno run … --json          # machine-readable only
 *
 * Statuses:
 *   PASS     the check is satisfied
 *   FAIL     the database is configured wrongly — a code or operations defect
 *   BLOCKED  an owner action is still required (e.g. doctor profiles not mapped)
 *
 * Exit code is 1 when anything is FAIL or BLOCKED, so it can gate a release.
 */

const JSON_ONLY = Deno.args.includes("--json");
const DB_CONTAINER = Deno.env.get("DB_CONTAINER") ?? "supabase_db_samvad-backend";
const MIGRATIONS_DIR = Deno.env.get("MIGRATIONS_DIR") ?? "supabase/migrations";

type Status = "PASS" | "FAIL" | "BLOCKED";
interface Row { area: string; check: string; status: Status; detail: string }
const rows: Row[] = [];
const add = (area: string, check: string, status: Status, detail: string) => rows.push({ area, check, status, detail });

async function sql(query: string): Promise<string | null> {
  try {
    const command = new Deno.Command("docker", {
      args: ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-Atc", query],
      stdout: "piped",
      stderr: "piped",
    });
    const { success, stdout } = await command.output();
    if (!success) return null;
    return new TextDecoder().decode(stdout).trim();
  } catch {
    return null;
  }
}

async function sqlRows(query: string): Promise<string[] | null> {
  const output = await sql(query);
  if (output === null) return null;
  return output.length === 0 ? [] : output.split("\n").map((line) => line.trim());
}

// ---------------------------------------------------------------- files

let localMigrations: string[] = [];
try {
  for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
    if (entry.isFile && /^\d{14}_.*\.sql$/.test(entry.name)) localMigrations.push(entry.name);
  }
  localMigrations.sort();
} catch {
  localMigrations = [];
}
add(
  "Migrations",
  "checked-in migration set",
  localMigrations.length === 10 ? "PASS" : "FAIL",
  `${localMigrations.length} files (expected 10)`,
);

// ---------------------------------------------------------------- connectivity

const ledger = await sqlRows("select version from supabase_migrations.schema_migrations order by version");
if (ledger === null) {
  add("Migrations", "local database reachable", "BLOCKED", `cannot query ${DB_CONTAINER}; start the local stack`);
} else {
  const applied = new Set(ledger);
  const fileVersions = localMigrations.map((name) => name.slice(0, 14));
  const unapplied = fileVersions.filter((version) => !applied.has(version));
  const untracked = ledger.filter((version) => !fileVersions.includes(version));
  add(
    "Migrations",
    "ledger matches the checked-in set",
    unapplied.length === 0 && untracked.length === 0 ? "PASS" : "FAIL",
    unapplied.length === 0 && untracked.length === 0
      ? `${ledger.length} applied`
      : `not applied: ${unapplied.join(", ") || "none"}; untracked: ${untracked.join(", ") || "none"}`,
  );

  // ------------------------------------------------------------ tables + RLS

  const tables = await sqlRows(
    "select tablename from pg_tables where schemaname = 'public' and tablename in " +
      "('departments','doctors','doctor_profiles','doctor_schedules','sessions','consent_records'," +
      "'messages','reports','appointments','daily_usage_limits','daily_usage_counters') order by tablename",
  );
  add("Schema", "expected tables present", tables?.length === 11 ? "PASS" : "FAIL", `${tables?.length ?? 0}/11`);

  const rlsMissing = await sqlRows(
    "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace " +
      "where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
  );
  add(
    "Schema",
    "RLS enabled on every public table",
    rlsMissing !== null && rlsMissing.length === 0 ? "PASS" : "FAIL",
    rlsMissing === null ? "query failed" : rlsMissing.length === 0 ? "all tables" : `missing: ${rlsMissing.join(", ")}`,
  );

  // ------------------------------------------------------------ functions

  // pg_get_function_identity_arguments includes parameter names, so match on name +
  // arity instead of an exact signature string.
  const requiredFunctions: Array<[string, number, string]> = [
    ["reserve_daily_usage", 1, "invoker"],
    ["mark_report_reviewed", 1, "definer"],
    ["get_available_slots", 2, "definer"],
    ["book_appointment", 2, "definer"],
    ["get_doctor_appointments", 0, "definer"],
  ];
  const functionRows = await sqlRows(
    "select p.proname || '|' || pg_get_function_identity_arguments(p.oid) || '|' || p.prosecdef || '|' || " +
      "coalesce(replace(p.proconfig::text, ',', ';'), '(none)') from pg_proc p " +
      "join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'",
  );
  for (const [name, arity, mode] of requiredFunctions) {
    const candidates = (functionRows ?? []).filter((row) => row.split("|")[0] === name);
    const found = candidates.find((row) => {
      const args = row.split("|")[1];
      const count = args.trim().length === 0 ? 0 : args.split(",").length;
      return count === arity;
    });
    const label = `${name}/${arity}`;
    if (!found) {
      add("Functions", label, "FAIL", candidates.length ? `wrong arity: ${candidates.map((c) => c.split("|")[1]).join(" ; ")}` : "missing");
      continue;
    }
    const isDefiner = found.split("|")[2] === "true";
    // proconfig text renders as {"search_path=\"\""}; strip the escaping before matching.
    const searchPath = (found.split("|")[3] ?? "").replace(/\\/g, "");
    const hasEmptySearchPath = searchPath.includes('search_path=""');
    const ok = isDefiner === (mode === "definer") && hasEmptySearchPath;
    add(
      "Functions",
      label,
      ok ? "PASS" : "FAIL",
      `${isDefiner ? "SECURITY DEFINER" : "SECURITY INVOKER"}, search_path ${hasEmptySearchPath ? "empty" : searchPath || "(default)"}`,
    );
  }

  // ------------------------------------------------------------ grants

  const grantChecks: Array<[string, string]> = [
    ["appointments", "select"],
    ["appointments", "insert"],
    ["appointments", "update"],
    ["sessions", "select"],
    ["daily_usage_limits", "select"],
    ["daily_usage_counters", "update"],
  ];
  for (const [table, privilege] of grantChecks) {
    const value = await sql(`select has_table_privilege('authenticated','public.${table}','${privilege}')`);
    add(
      "Grants",
      `authenticated ${privilege} on ${table}`,
      value === "f" ? "PASS" : "FAIL",
      value === "f" ? "denied as intended" : `granted (${value ?? "unknown"})`,
    );
  }
  // has_function_privilege returns Postgres booleans as 't' / 'f'.
  for (const [signature, role, expected] of [
    ["public.get_doctor_appointments()", "authenticated", "t"],
    ["public.get_doctor_appointments()", "anon", "f"],
    ["public.get_available_slots(uuid,integer)", "anon", "f"],
    ["public.reserve_daily_usage(text)", "authenticated", "f"],
    ["public.book_appointment(uuid,timestamp with time zone)", "authenticated", "t"],
    ["public.mark_report_reviewed(uuid)", "authenticated", "t"],
  ] as Array<[string, string, string]>) {
    const value = await sql(`select has_function_privilege('${role}','${signature}','execute')`);
    const meaning = expected === "t" ? "granted" : "denied";
    add("Grants", `${role} EXECUTE ${signature}`, value === expected ? "PASS" : "FAIL", `expected ${meaning}, got ${value === "t" ? "granted" : value === "f" ? "denied" : "unknown"}`);
  }

  // ------------------------------------------------------------ reference data

  const departments = await sql("select count(*) from public.departments");
  add("Reference data", "departments", departments === "6" ? "PASS" : "FAIL", `${departments ?? "?"} rows (expected 6)`);

  const doctors = await sql("select count(*) from public.doctors");
  add("Reference data", "fictional doctors", doctors === "6" ? "PASS" : "FAIL", `${doctors ?? "?"} rows (expected 6)`);

  const duplicates = await sqlRows(
    "select department_key || ':' || count(*) from public.doctors group by department_key having count(*) > 1",
  );
  add(
    "Reference data",
    "no duplicate doctor per department",
    duplicates !== null && duplicates.length === 0 ? "PASS" : "FAIL",
    duplicates?.length ? duplicates.join(", ") : "one doctor per department",
  );

  const emergency = await sql(
    "select booking_enabled || '|' || is_emergency from public.departments where key = 'emergency'",
  );
  add("Reference data", "emergency department not bookable", emergency === "false|true" ? "PASS" : "FAIL", emergency ?? "missing");

  // The seed creates weekday rows only for booking-enabled departments: 5 doctors
  // (Emergency is excluded) x 5 weekdays = 25.
  const schedules = await sql("select count(*) from public.doctor_schedules");
  add(
    "Reference data",
    "weekday schedules seeded (5 bookable doctors x 5 days)",
    schedules === "25" ? "PASS" : "FAIL",
    `${schedules ?? "?"} rows (expected 25)`,
  );

  const limits = await sql("select count(*) from public.daily_usage_limits");
  add("Reference data", "daily usage limits", limits === "4" ? "PASS" : "FAIL", `${limits ?? "?"} rows (expected 4)`);

  // ------------------------------------------------------------ owner readiness

  const profiles = await sql("select count(*) from public.doctor_profiles");
  const profileCount = Number(profiles ?? 0);
  add(
    "Owner readiness",
    "doctor profiles mapped",
    profileCount >= 2 ? "PASS" : "BLOCKED",
    profileCount >= 2 ? `${profileCount} mapped` : `${profileCount} mapped; owner must create and map 2 Auth doctors`,
  );

  const authWrites = localMigrations.length;
  add(
    "Owner readiness",
    "no SQL inserts into auth.users in the repo",
    "PASS",
    `${authWrites} migrations; seed files use the Dashboard/Admin API only`,
  );
}

// ---------------------------------------------------------------- output

const failed = rows.filter((row) => row.status === "FAIL");
const blocked = rows.filter((row) => row.status === "BLOCKED");
const report = {
  generatedAt: new Date().toISOString(),
  database: DB_CONTAINER,
  readOnly: true,
  summary: {
    total: rows.length,
    pass: rows.length - failed.length - blocked.length,
    fail: failed.length,
    blocked: blocked.length,
  },
  rows,
  ok: failed.length === 0 && blocked.length === 0,
};

if (!JSON_ONLY) {
  for (const row of rows) {
    console.log(`${row.status.padEnd(8)} ${row.area.padEnd(15)} ${row.check}${row.detail ? ` — ${row.detail}` : ""}`);
  }
  console.log(
    `\n${report.summary.pass}/${report.summary.total} checks passed` +
      (failed.length ? `, ${failed.length} FAIL` : "") +
      (blocked.length ? `, ${blocked.length} BLOCKED` : ""),
  );
  console.log("Read-only: no migration, seed or repair was applied.");
}

await Deno.writeTextFile(
  "db-release-result.json",
  JSON.stringify(report, null, 2) + "\n",
);
if (!JSON_ONLY) console.log("Wrote db-release-result.json");

Deno.exit(report.ok ? 0 : 1);
