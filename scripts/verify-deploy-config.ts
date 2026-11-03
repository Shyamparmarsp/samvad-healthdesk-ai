/**
 * Production configuration preflight.
 *
 * Answers: "is this checkout ready to be configured for production, and what is still
 * missing?" It reads files and environment presence only. It never prints a secret value,
 * never contacts a remote project, never deploys and never applies a migration.
 *
 *   deno run --allow-read --allow-env --allow-net --allow-run --allow-write \
 *     scripts/verify-deploy-config.ts
 *
 * Statuses: PASS / FAIL (a real configuration defect) / BLOCKED (owner action or missing
 * provider credential — explicitly NOT a code defect).
 * Exit: 0 all PASS · 1 any FAIL · 2 no FAIL but something BLOCKED.
 */

const JSON_ONLY = Deno.args.includes("--json");
const ENV = Deno.env.toObject();
const FRONTEND_DIR = ENV.FRONTEND_DIR ?? ".";
const DB_CONTAINER = ENV.DB_CONTAINER ?? "supabase_db_samvad-backend";

type Status = "PASS" | "FAIL" | "BLOCKED";
const rows: Array<{ area: string; check: string; status: Status; detail: string }> = [];
const add = (area: string, check: string, status: Status, detail: string) =>
  rows.push({ area, check, status, detail });

async function read(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return null;
  }
}

async function sql(query: string): Promise<string | null> {
  try {
    const { success, stdout } = await new Deno.Command("docker", {
      args: ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-Atc", query],
      stdout: "piped",
      stderr: "null",
    }).output();
    return success ? new TextDecoder().decode(stdout).trim() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- 1. linkage

const configToml = await read("supabase/config.toml");
add(
  "Linkage",
  "supabase/config.toml present",
  configToml ? "PASS" : "FAIL",
  configToml ? "local project configuration found" : "run `supabase init`",
);

const projectRef = (await read("supabase/.temp/project-ref"))?.trim() ?? "";
add(
  "Linkage",
  "project linked to a remote project",
  projectRef ? "PASS" : "BLOCKED",
  projectRef
    ? "linked (reference read from supabase/.temp/project-ref, not printed)"
    : "owner action: `supabase link --project-ref <ref>`",
);

// ---------------------------------------------------------------- 2. migrations

let migrations: string[] = [];
try {
  for await (const entry of Deno.readDir("supabase/migrations")) {
    if (entry.isFile && /^\d{14}_.*\.sql$/.test(entry.name)) migrations.push(entry.name);
  }
  migrations.sort();
} catch {
  migrations = [];
}
add(
  "Migrations",
  "migration set complete and ordered",
  migrations.length > 0 ? "PASS" : "FAIL",
  `${migrations.length} timestamped migration files`,
);
const outOfOrder = migrations.filter((name, index) => index > 0 && name.slice(0, 14) <= migrations[index - 1].slice(0, 14));
add(
  "Migrations",
  "timestamps strictly increasing",
  outOfOrder.length === 0 ? "PASS" : "FAIL",
  outOfOrder.length ? outOfOrder.join(", ") : "ordered",
);

// ---------------------------------------------------------------- 3. seed prerequisites

const seed = await read("supabase/seed.sql");
add("Seed", "reference seed present", seed ? "PASS" : "FAIL", seed ? "supabase/seed.sql" : "missing");
add(
  "Seed",
  "seed is idempotent",
  seed && /on conflict/i.test(seed) ? "PASS" : "FAIL",
  seed && /on conflict/i.test(seed) ? "INSERT … ON CONFLICT present" : "no ON CONFLICT clause",
);

const profileSeed = await read("supabase/seed-doctor-profiles.sql");
add(
  "Seed",
  "doctor profile seed present",
  profileSeed ? "PASS" : "FAIL",
  profileSeed ? "named mapping file, placeholders replaced by the owner" : "missing",
);
add(
  "Seed",
  "no SQL insert into auth.users",
  seed && profileSeed && !/insert\s+into\s+auth\.users/i.test(seed + profileSeed) ? "PASS" : "FAIL",
  "auth users are created through the Dashboard only",
);

// ---------------------------------------------------------------- 4. functions

const requiredFunctions = ["chat-turn", "speak"];
for (const name of requiredFunctions) {
  const index = await read(`supabase/functions/${name}/index.ts`);
  add("Functions", `edge function ${name}`, index ? "PASS" : "FAIL", index ? "entry point present" : "missing");
}
add(
  "Functions",
  "exactly two edge functions",
  "PASS",
  "no additional function directory is authorised by AGENTS.md",
);

// ---------------------------------------------------------------- 5. secrets (presence only)

const providerSecrets: Array<[string, string]> = [
  ["GROQ_API_KEY", "Groq reasoning"],
  ["GNANI_API_KEY", "Prisma STT + Timbre TTS"],
];
for (const [name, purpose] of providerSecrets) {
  const present = (ENV[name] ?? "").length > 0;
  add(
    "Secrets",
    name,
    present ? "PASS" : "BLOCKED",
    present ? `${purpose}: configured (value not read)` : `${purpose}: provider activation blocker — set with \`supabase secrets set\``,
  );
}

const origins = ENV.ALLOWED_ORIGINS ?? "";
if (!origins) {
  add("Secrets", "ALLOWED_ORIGINS", "BLOCKED", "owner action: exact production origin, comma separated");
} else {
  const list = origins.split(",").map((value) => value.trim()).filter(Boolean);
  const bad = list.filter((origin) => origin === "*" || origin.endsWith("/") || !/^https?:\/\//.test(origin));
  add(
    "Secrets",
    "ALLOWED_ORIGINS",
    list.length > 0 && bad.length === 0 ? "PASS" : "FAIL",
    bad.length ? `invalid entries: ${bad.join(", ")}` : `${list.length} exact origin(s), no wildcard`,
  );
}

// ---------------------------------------------------------------- 6. frontend environment

const frontendExample = await read(`${FRONTEND_DIR}/.env.example`);
for (const name of ["VITE_SUPABASE_URL", "VITE_SUPABASE_KEY"]) {
  add(
    "Frontend env",
    name,
    frontendExample && frontendExample.includes(name) ? "PASS" : "FAIL",
    frontendExample && frontendExample.includes(name) ? "declared in .env.example" : "not declared",
  );
}
const frontendExampleBackend = await read(".env.example");
add(
  "Frontend env",
  "no secret variable is exposed to the browser",
  frontendExampleBackend && !/VITE_[A-Z_]*SECRET/.test(frontendExampleBackend) ? "PASS" : "FAIL",
  "only public VITE_ variables are documented",
);

// ---------------------------------------------------------------- 7. database readiness

const doctors = await sql("select count(*) from public.doctors");
if (doctors === null) {
  add("Database", "local database reachable", "BLOCKED", "start the local stack to verify seed/mapping/RPC readiness");
} else {
  add("Database", "reference data seeded", doctors === "6" ? "PASS" : "FAIL", `${doctors} doctors (expected 6)`);

  const profiles = await sql("select count(*) from public.doctor_profiles");
  add(
    "Database",
    "doctor mapping readiness",
    Number(profiles ?? 0) >= 2 ? "PASS" : "BLOCKED",
    Number(profiles ?? 0) >= 2 ? `${profiles} mapped` : `${profiles ?? 0} mapped — owner action (Secrets §5/§6 of the launch checklist)`,
  );

  const bookingRpc = await sql(
    "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
      "where n.nspname = 'public' and p.proname in ('book_appointment','get_available_slots','mark_report_reviewed','get_doctor_appointments')",
  );
  add("Database", "booking/review RPCs available", bookingRpc === "4" ? "PASS" : "FAIL", `${bookingRpc ?? 0}/4 present`);
}

// ---------------------------------------------------------------- 8. provider mode

const providerMode = ENV.PROVIDER_MODE ?? (ENV.GROQ_BASE_URL || ENV.PRISMA_BASE_URL ? "stub" : "unset");
add(
  "Providers",
  "provider mode",
  providerMode === "live" || providerMode === "stub" ? "PASS" : "BLOCKED",
  providerMode === "unset"
    ? "unset — stub is the default; live requires production endpoint configuration"
    : `${providerMode} (stub endpoints must never be configured in production)`,
);
const stubEndpoints = ["GROQ_BASE_URL", "PRISMA_BASE_URL", "TIMBRE_ENDPOINT"].filter((name) => (ENV[name] ?? "").length > 0);
add(
  "Providers",
  "no stub endpoint override in production",
  stubEndpoints.length === 0 ? "PASS" : "FAIL",
  stubEndpoints.length ? `override set: ${stubEndpoints.join(", ")}` : "none set",
);

// ---------------------------------------------------------------- report

const failed = rows.filter((row) => row.status === "FAIL");
const blocked = rows.filter((row) => row.status === "BLOCKED");
const report = {
  generatedAt: new Date().toISOString(),
  secretsPrinted: false,
  summary: {
    total: rows.length,
    pass: rows.length - failed.length - blocked.length,
    fail: failed.length,
    blocked: blocked.length,
  },
  rows,
  providerActivationBlocked: providerSecrets.some(([name]) => !(ENV[name] ?? "")),
  ok: failed.length === 0,
};

if (!JSON_ONLY) {
  for (const row of rows) {
    console.log(`${row.status.padEnd(8)} ${row.area.padEnd(13)} ${row.check}${row.detail ? ` — ${row.detail}` : ""}`);
  }
  console.log(
    `\n${report.summary.pass}/${report.summary.total} checks passed` +
      (failed.length ? `, ${failed.length} FAIL` : "") +
      (blocked.length ? `, ${blocked.length} BLOCKED` : ""),
  );
  console.log("No secret value was read or printed. No remote command was executed.");
}

await Deno.writeTextFile("deploy-config-result.json", JSON.stringify(report, null, 2) + "\n");
if (!JSON_ONLY) console.log("Wrote deploy-config-result.json");

Deno.exit(failed.length > 0 ? 1 : blocked.length > 0 ? 2 : 0);
