/**
 * Validate that a generated Supabase dump can be restored into an isolated local database.
 *
 * Default is a read-only dry run: it validates the files and prints the exact plan, without
 * running docker or touching any database. Execution creates a uniquely named scratch
 * database inside the local Supabase container, restores the dump, verifies reference
 * counts and drops only that scratch database.
 *
 *   deno run --allow-read scripts/verify-backup-restore.ts \
 *     --schema backup-schema.sql --data backup-data.sql
 *
 * Recommended dump pair for a reproducible rehearsal:
 *
 *   supabase db dump -f backup-schema.sql                    # full schema, keeps the FKs
 *   supabase db dump --data-only --schema public -f backup-data.sql
 *
 * The data dump is scoped to `public` because Supabase-managed identity rows
 * (`auth.users`, `auth.identities`) are owned by the platform and are restored by the
 * provider, not by this repository's seed. The scratch database therefore gets a minimal
 * `auth.users` stub so the public FKs can be created; pg_dump already sets
 * `session_replication_role = replica`, so those FKs are not enforced while the scoped
 * data is loaded.
 *
 *   deno run --allow-read --allow-run scripts/verify-backup-restore.ts \
 *     --schema backup-schema.sql --data backup-data.sql --execute
 *
 * Never accepts a hosted URL or an existing database name. The active application database
 * is never the restore target.
 */

const EXPECTED_COUNTS: Record<string, number> = {
  departments: 6,
  doctors: 6,
  doctor_schedules: 25,
  daily_usage_limits: 4,
};

export interface DumpCheck {
  ok: boolean;
  markers: number;
  problems: string[];
}

/** Structural validation only; the dump content is never printed. */
export function validateDump(kind: "schema" | "data", text: string): DumpCheck {
  const problems: string[] = [];
  if (text.trim().length === 0) problems.push(`${kind} dump is empty`);
  if (kind === "schema" && !/create\s+table/i.test(text)) problems.push("schema dump has no CREATE TABLE");
  if (kind === "data" && !/insert\s+into|copy\s+[^\s]+\s+from/i.test(text)) problems.push("data dump has no INSERT/COPY");
  if (/(postgres(?:ql)?:\/\/[^\s]+)/i.test(text)) problems.push("dump contains a connection URL");
  const markers = kind === "schema"
    ? (text.match(/create\s+table/gi) ?? []).length
    : (text.match(/insert\s+into/gi) ?? []).length;
  return { ok: problems.length === 0, markers, problems };
}

export function scratchDatabaseName(now = Date.now(), random = crypto.randomUUID()): string {
  const stamp = new Date(now).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `samvad_restore_verify_${stamp}_${random.replace(/-/g, "").slice(0, 8).toLowerCase()}`;
}

export function validateContainerName(name: string): string[] {
  const problems: string[] = [];
  if (!/^supabase_db_[A-Za-z0-9_-]+$/.test(name)) {
    problems.push("container must be a local Supabase container named supabase_db_*");
  }
  if (name.includes("://") || name.includes("/") || name.includes(" ")) {
    problems.push("container must be a docker container name, not a URL or path");
  }
  return problems;
}

/**
 * Baseline objects that the Supabase platform always provides and that a restored dump
 * expects: the `extensions` schema for pgcrypto/uuid-ossp, the `auth` schema with
 * `auth.uid()`, and the three API roles referenced by grants and policies.
 *
 * They are created only inside the disposable scratch database.
 */
export function baselineSql(): string {
  return `
create schema if not exists extensions;
create schema if not exists vault;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create schema if not exists storage;
create schema if not exists graphql;
create schema if not exists graphql_public;
create schema if not exists realtime;
create schema if not exists supabase_migrations;
create schema if not exists cron;
create schema if not exists net;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text
language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit; end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
grant usage on schema extensions to public;
`;
}

export function verificationSql(): string {
  const counts = Object.entries(EXPECTED_COUNTS)
    .map(([table, expected]) => `select '${table}='||count(*)||' expected ${expected}' from public.${table};`)
    .join("\n");
  return `${counts}
select 'sql_functions='||count(*) from pg_proc p
 join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname in
 ('reserve_daily_usage','mark_report_reviewed','get_available_slots','book_appointment','get_doctor_appointments');`;
}

export interface RestoreArgs {
  schema: string;
  data: string;
  container: string;
  execute: boolean;
}

export function parseRestoreArgs(args: readonly string[]): RestoreArgs {
  let schema = "";
  let data = "";
  let container = "supabase_db_samvad-backend";
  let execute = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--schema") schema = args[++index] ?? "";
    else if (arg === "--data") data = args[++index] ?? "";
    else if (arg === "--container") container = args[++index] ?? "";
    else if (arg === "--execute") execute = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!schema || !data) throw new Error("--schema and --data are required");
  const containerProblems = validateContainerName(container);
  if (containerProblems.length > 0) throw new Error(containerProblems.join("; "));
  return { schema, data, container, execute };
}

async function psql(container: string, database: string, sql: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const command = new Deno.Command("docker", {
    args: ["exec", container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    stdout: "piped",
    stderr: "piped",
  });
  const result = await command.output();
  return {
    code: result.code,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

async function psqlFile(container: string, database: string, bytes: Uint8Array): Promise<{ code: number; stderr: string }> {
  const command = new Deno.Command("docker", {
    args: ["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = command.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(bytes);
  await writer.close();
  const result = await child.output();
  return { code: result.code, stderr: new TextDecoder().decode(result.stderr) };
}

async function main(): Promise<void> {
  try {
    const options = parseRestoreArgs(Deno.args);
    const schema = await Deno.readFile(options.schema);
    const data = await Deno.readFile(options.data);
    const schemaText = new TextDecoder().decode(schema);
    const dataText = new TextDecoder().decode(data);
    const schemaCheck = validateDump("schema", schemaText);
    const dataCheck = validateDump("data", dataText);

    console.log("Backup restore verification");
    console.log(`  schema: ${options.schema} (${schema.byteLength} bytes, ${schemaCheck.markers} CREATE TABLE)`);
    console.log(`  data:   ${options.data} (${data.byteLength} bytes, ${dataCheck.markers} INSERT)`);
    console.log(`  container: ${options.container}`);
    console.log(`  target: disposable scratch database only`);

    if (!schemaCheck.ok || !dataCheck.ok) {
      for (const problem of [...schemaCheck.problems, ...dataCheck.problems]) console.error(`FAIL: ${problem}`);
      Deno.exit(1);
    }

    const name = scratchDatabaseName();
    console.log(`  scratch database: ${name}`);
    console.log(`  expected counts: ${Object.entries(EXPECTED_COUNTS).map(([table, count]) => `${table}=${count}`).join(", ")}`);

    if (!options.execute) {
      console.log("\nDRY RUN: no docker command was executed. Add --execute to restore into the scratch database.");
      return;
    }

    const exists = await psql(options.container, "postgres", `select 1 from pg_database where datname='${name}'`);
    if (exists.code !== 0) throw new Error(`cannot inspect the local container: ${exists.stderr.slice(0, 160)}`);
    if (exists.stdout.trim() === "1") throw new Error(`scratch database ${name} already exists; refusing to overwrite`);

    let created = false;
    try {
      const create = await psql(options.container, "postgres", `create database ${name}`);
      if (create.code !== 0) throw new Error(`create database failed: ${create.stderr.slice(0, 160)}`);
      created = true;

      const baseline = await psql(options.container, name, baselineSql());
      if (baseline.code !== 0) throw new Error(`baseline preparation failed: ${baseline.stderr.slice(0, 200)}`);

      const schemaRestore = await psqlFile(options.container, name, schema);
      if (schemaRestore.code !== 0) throw new Error(`schema restore failed: ${schemaRestore.stderr.slice(0, 160)}`);
      const dataRestore = await psqlFile(options.container, name, data);
      if (dataRestore.code !== 0) throw new Error(`data restore failed: ${dataRestore.stderr.slice(0, 160)}`);

      const verify = await psql(options.container, name, verificationSql());
      if (verify.code !== 0) throw new Error(`verification query failed: ${verify.stderr.slice(0, 160)}`);
      console.log("\nRestored reference verification:");
      console.log(verify.stdout.trim());

      const failedCount = Object.entries(EXPECTED_COUNTS).some(([table, expected]) =>
        !new RegExp(`${table}=${expected}(?:\\D|$)`).test(verify.stdout)
      );
      if (failedCount || !/sql_functions=5/.test(verify.stdout)) {
        throw new Error("restored counts or SQL function count did not match");
      }
      console.log("\nPASS: dump restored into the disposable scratch database.");
    } finally {
      if (created) {
        const drop = await psql(options.container, "postgres", `drop database if exists ${name} with (force)`);
        if (drop.code !== 0) console.error(`WARNING: could not drop scratch database ${name}`);
        else console.log(`Dropped scratch database ${name}.`);
      }
    }
  } catch (error) {
    console.error(`FAIL: ${(error as Error).message}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
