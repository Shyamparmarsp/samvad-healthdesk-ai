/**
 * Local demo preflight. Read-only, no secrets printed.
 *
 * Checks the local stack, provider stub, usage headroom, question bank, secrets and —
 * new in M4-S16-B — the migration ledger and the real CORS preflight answer for both
 * Edge Functions.
 *
 * Run:
 *   deno run --allow-net --allow-env --allow-read --allow-run scripts/demo-preflight.ts
 *
 * `--allow-read` is needed for supabase/migrations/*.sql, `--allow-run` for the
 * read-only `docker exec psql` ledger query (there is no psql on the host). Neither
 * writes anything to the database.
 */

import { QUESTIONS, DEPARTMENT_KEYS, validateBank } from "../supabase/functions/_shared/intake/question-bank.ts";

const BASE = Deno.env.get("LOCAL_URL") ?? "http://127.0.0.1:54321";
const STUB = Deno.env.get("STUB_URL") ?? "http://127.0.0.1:8787";
const MIGRATIONS_DIR = Deno.env.get("MIGRATIONS_DIR") ?? "supabase/migrations";

type Status = "PASS" | "FAIL" | "WARNING" | "NOT REQUIRED";
const rows: Array<[string, Status, string]> = [];
const add = (name: string, status: Status, detail = "") => rows.push([name, status, detail]);

async function reachable(url: string): Promise<boolean> {
  try { const r = await fetch(url, { method: "GET" }); return r.status < 500; } catch { return false; }
}

add("Docker daemon", (await reachable(`${BASE}/rest/v1/`)) ? "PASS" : "FAIL", "Reachability via the local API");
add("Local API / database", (await reachable(`${BASE}/rest/v1/`)) ? "PASS" : "FAIL", BASE);
add("chat-turn function", (await reachable(`${BASE}/functions/v1/chat-turn`)) ? "PASS" : "FAIL", "401 expected without a JWT");
add("speak function", (await reachable(`${BASE}/functions/v1/speak`)) ? "PASS" : "FAIL");
add("Provider stub", (await reachable(`${STUB}/__stats`)) ? (Deno.env.get("PROVIDER_MODE") === "live" ? "NOT REQUIRED" : "PASS") : "FAIL", STUB);

// ---------------------------------------------------------------- usage headroom

try {
  const key = Deno.env.get("LOCAL_SERVICE_KEY") ?? "";
  const headers = key ? { apikey: key, Authorization: `Bearer ${key}` } : undefined;
  const limits = await (await fetch(`${BASE}/rest/v1/daily_usage_limits?select=counter_name,daily_limit`, { headers })).json();
  const counters = await (await fetch(`${BASE}/rest/v1/daily_usage_counters?select=counter_name,used&counter_date=eq.${new Date().toISOString().slice(0, 10)}`, { headers })).json();
  if (Array.isArray(limits) && limits.length === 4) {
    const used = new Map((Array.isArray(counters) ? counters : []).map((r: { counter_name: string; used: number }) => [r.counter_name, r.used]));
    const tight = limits.filter((l: { counter_name: string; daily_limit: number }) => (used.get(l.counter_name) ?? 0) >= l.daily_limit * 0.8);
    add("Usage limits", tight.length === 0 ? "PASS" : "WARNING", tight.length === 0 ? "all counters have headroom" : `${tight.map((l: {counter_name: string}) => l.counter_name).join(", ")} above 80%`);
  } else {
    add("Usage limits", key ? "FAIL" : "WARNING", key ? "limits not seeded" : "service key absent; cannot read");
  }
} catch {
  add("Usage limits", "WARNING", "could not read counters");
}

// ---------------------------------------------------------------- migration ledger
//
// Read-only comparison of the committed migration files against the versions recorded
// in supabase_migrations.schema_migrations. It never applies, repairs or rewrites
// anything: a missing or extra version is reported, not fixed.

async function localMigrationVersions(): Promise<string[]> {
  const versions: string[] = [];
  try {
    for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
      if (!entry.isFile || !entry.name.endsWith(".sql")) continue;
      const match = /^(\d{14})_/.exec(entry.name);
      if (match) versions.push(match[1]);
    }
  } catch {
    return [];
  }
  return versions.sort();
}

async function dockerDbContainer(): Promise<string | null> {
  try {
    const command = new Deno.Command("docker", {
      args: ["ps", "--format", "{{.Names}}"],
      stdout: "piped",
      stderr: "null",
    });
    const { success, stdout } = await command.output();
    if (!success) return null;
    const names = new TextDecoder().decode(stdout).split("\n").map((line) => line.trim());
    return names.find((name) => name.startsWith("supabase_db_")) ?? null;
  } catch {
    return null;
  }
}

async function appliedMigrationVersions(container: string): Promise<string[] | null> {
  try {
    const command = new Deno.Command("docker", {
      args: [
        "exec",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-Atc",
        "select version from supabase_migrations.schema_migrations order by version",
      ],
      stdout: "piped",
      stderr: "null",
    });
    const { success, stdout } = await command.output();
    if (!success) return null;
    return new TextDecoder().decode(stdout)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^\d{14}$/.test(line));
  } catch {
    return null;
  }
}

const localVersions = await localMigrationVersions();
if (localVersions.length === 0) {
  add("Migration files", "FAIL", `no timestamped migrations found in ${MIGRATIONS_DIR}`);
} else {
  add("Migration files", "PASS", `${localVersions.length} committed`);
}

const dbContainer = await dockerDbContainer();
if (!dbContainer) {
  add("Migration ledger", "WARNING", "no supabase_db_* container found; ledger not compared");
} else {
  const applied = await appliedMigrationVersions(dbContainer);
  if (applied === null) {
    add("Migration ledger", "WARNING", `could not read supabase_migrations in ${dbContainer}`);
  } else {
    const appliedSet = new Set(applied);
    const localSet = new Set(localVersions);
    const unapplied = localVersions.filter((version) => !appliedSet.has(version));
    const untracked = applied.filter((version) => !localSet.has(version));

    if (unapplied.length === 0 && untracked.length === 0) {
      add("Migration ledger", "PASS", `${applied.length} applied, matches the committed files`);
    } else {
      const detail = [
        unapplied.length ? `not applied: ${unapplied.join(", ")}` : "",
        untracked.length ? `applied without a file: ${untracked.join(", ")}` : "",
      ].filter(Boolean).join("; ");
      // Applied-without-file is a failure (the history is not reproducible). Committed
      // but not applied is a warning because the local stack may simply predate a file.
      add("Migration ledger", untracked.length ? "FAIL" : "WARNING", detail);
    }
  }
}

// ---------------------------------------------------------------- CORS preflight
//
// Probes the real platform answer for both functions. The local edge runtime answers
// OPTIONS itself (before the function runs) and forces `Access-Control-Allow-Origin: *`,
// so this reports what the browser actually receives rather than what _shared/cors.ts
// intends. See docs/cors-verification.md.

async function corsProbe(fn: "chat-turn" | "speak"): Promise<{ status: number; acao: string | null } | null> {
  try {
    const response = await fetch(`${BASE}/functions/v1/${fn}`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,apikey,content-type",
      },
    });
    return { status: response.status, acao: response.headers.get("access-control-allow-origin") };
  } catch {
    return null;
  }
}

for (const fn of ["chat-turn", "speak"] as const) {
  const probe = await corsProbe(fn);
  if (!probe) {
    add(`CORS OPTIONS ${fn}`, "FAIL", "probe failed");
    continue;
  }
  if (probe.status !== 200 && probe.status !== 204) {
    add(`CORS OPTIONS ${fn}`, "FAIL", `unexpected status ${probe.status}`);
  } else if (probe.acao === "http://localhost:5173") {
    add(`CORS OPTIONS ${fn}`, "PASS", `204/200 with the exact origin (${probe.status})`);
  } else if (probe.acao === "*") {
    // Platform-injected wildcard: correct for local dev, but it means the exact-origin
    // allowlist cannot be relied on. Authentication is JWT + RLS, not CORS.
    add(`CORS OPTIONS ${fn}`, "WARNING", `platform wildcard ACAO=* (status ${probe.status}); see docs/cors-verification.md`);
  } else {
    add(`CORS OPTIONS ${fn}`, "WARNING", `ACAO=${probe.acao ?? "(absent)"} (status ${probe.status})`);
  }
}

// ---------------------------------------------------------------- content and secrets

add("Question bank", validateBank().length === 0 && QUESTIONS.length === 150 ? "PASS" : "FAIL", `${QUESTIONS.length} questions`);
add("Department distribution", DEPARTMENT_KEYS.every((d) => QUESTIONS.filter((q) => q.department === d).length === 30) ? "PASS" : "FAIL");
add("Groq key", Deno.env.get("GROQ_API_KEY") ? "PASS" : "WARNING", "absent is expected in stub mode");
add("Gnani key", Deno.env.get("GNANI_API_KEY") ? "PASS" : "WARNING", "absent is expected in stub mode");
add("Frontend URL", Deno.env.get("VITE_SUPABASE_URL") ? "PASS" : "WARNING", "frontend-owned variable");
add("Frontend key", Deno.env.get("VITE_SUPABASE_KEY") ? "PASS" : "WARNING", "frontend-owned variable");

for (const [name, status, detail] of rows) console.log(`${status.padEnd(12)} ${name}${detail ? ` — ${detail}` : ""}`);
const failed = rows.filter(([, status]) => status === "FAIL").length;
console.log(`\n${rows.length - failed}/${rows.length} checks passed`);
Deno.exit(failed === 0 ? 0 : 1);
