/**
 * Unified backend release check.
 *
 * Runs every mandatory check in a safe order and reports PASS / FAIL / BLOCKED /
 * NOT TESTED. It never repairs anything, never applies a migration or seed, never calls a
 * live provider and never touches another worktree unless `--frontend` is passed.
 *
 *   deno run --allow-all scripts/release-check.ts
 *   deno run --allow-all scripts/release-check.ts --skip-smoke
 *   deno run --allow-all scripts/release-check.ts --frontend
 *
 * Exit code: 0 only when every required check is PASS. A BLOCKED mandatory check is a
 * non-zero exit — an unavailable prerequisite is never reported as success.
 */

const ENV = Deno.env.toObject();
const BASE = ENV.LOCAL_URL ?? "http://127.0.0.1:54321";
const STUB = ENV.STUB_URL ?? "http://127.0.0.1:8787";
const DB_CONTAINER = ENV.DB_CONTAINER ?? "supabase_db_samvad-backend";
const FRONTEND_DIR = ENV.FRONTEND_DIR ?? "../samvad-integration";

const SKIP_SMOKE = Deno.args.includes("--skip-smoke");
const RUN_FRONTEND = Deno.args.includes("--frontend");

type Status = "PASS" | "FAIL" | "BLOCKED" | "NOT TESTED" | "SKIPPED";
interface Step {
  group: string;
  name: string;
  status: Status;
  required: boolean;
  detail: string;
  ms: number;
}

const steps: Step[] = [];
const results: Array<{ name: string; status: Status; required: boolean; detail: string; ms: number }> = [];

// ---------------------------------------------------------------- helpers

async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Runs a command.
 *
 * `envOverrides` matters: `src/lib/api.ts` chooses its mode from the VITE_* variables at
 * import time, so the mock suites must not see them or they would hit the real backend.
 *
 * Note: Deno MERGES the `env` map with the inherited environment (it does not replace
 * it), so `delete` has no effect on a child. A variable is therefore neutralised by
 * setting it to an empty string, which `isSupabaseConfigured` treats as "not set".
 */
async function run(
  command: string,
  args: string[],
  cwd?: string,
  envOverrides?: Record<string, string | undefined>,
): Promise<{ ok: boolean; out: string; code: number }> {
  const env = { ...ENV };
  for (const [key, value] of Object.entries(envOverrides ?? {})) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  try {
    const process = new Deno.Command(command, {
      args,
      cwd,
      env,
      stdout: "piped",
      stderr: "piped",
    });
    const { success, stdout, stderr, code } = await process.output();
    const text = new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr);
    return { ok: success, out: text, code };
  } catch (error) {
    return { ok: false, out: String(error), code: -1 };
  }
}

async function step(group: string, name: string, required: boolean, fn: () => Promise<{ ok: boolean; detail: string }>): Promise<void> {
  const started = performance.now();
  let outcome: { ok: boolean; detail: string };
  try {
    outcome = await fn();
  } catch (error) {
    outcome = { ok: false, detail: `exception: ${String(error).slice(0, 120)}` };
  }
  const ms = Math.round(performance.now() - started);
  const status: Status = outcome.ok ? "PASS" : required ? "FAIL" : "NOT TESTED";
  const row = { name, status, required, detail: outcome.detail, ms };
  steps.push({ group, ...row });
  console.log(`${status.padEnd(10)} ${name}${outcome.detail ? ` — ${outcome.detail}` : ""} (${ms} ms)`);
}

const lastLine = (text: string) => text.trimEnd().split("\n").filter((line) => line.trim().length > 0).slice(-1)[0] ?? "";

// ---------------------------------------------------------------- prerequisites

const apiUp = await reachable(`${BASE}/rest/v1/`);
const stubUp = await reachable(`${STUB}/__stats`);
const functionsUp = (await reachable(`${BASE}/functions/v1/chat-turn`)) || false;
const dbUp = (await run("docker", ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-Atc", "select 1"])).ok;

console.log("Release check — prerequisites");
console.log(`  local API      ${apiUp ? "up" : "DOWN"} (${BASE})`);
console.log(`  edge functions ${functionsUp ? "up" : "DOWN"}`);
console.log(`  provider stub  ${stubUp ? "up" : "DOWN"} (${STUB})`);
console.log(`  database       ${dbUp ? "up" : "DOWN"} (${DB_CONTAINER})`);
console.log("");

// ---------------------------------------------------------------- 1. static

await step("static", "deno check chat-turn + speak", true, async () => {
  const result = await run("deno", ["check", "supabase/functions/chat-turn/index.ts", "supabase/functions/speak/index.ts"]);
  return { ok: result.ok, detail: result.ok ? "type check clean" : lastLine(result.out) };
});

await step("static", "deno unit tests", true, async () => {
  const result = await run("deno", ["test", "--allow-read", "--allow-env", "supabase/functions/"]);
  const match = /(\d+) passed \| (\d+) failed/.exec(result.out);
  return {
    ok: result.ok && Boolean(match),
    detail: match ? `${match[1]} passed, ${match[2]} failed` : lastLine(result.out),
  };
});

await step("static", "question bank validation (150, bilingual)", true, async () => {
  const result = await run("deno", ["run", "--allow-read", "--allow-write", "--allow-env", "scripts/export-question-bank.ts", "--check"]);
  return { ok: result.ok, detail: result.ok ? "150 questions valid" : lastLine(result.out) };
});

await step("static", "question bank reviewer dashboard", true, async () => {
  const result = await run("deno", ["run", "--allow-read", "--allow-write", "--allow-env", "scripts/question-bank-status.ts", "--json"]);
  return { ok: result.ok, detail: result.ok ? "CSV ids match the bank" : lastLine(result.out) };
});

await step("static", "contract fixtures (17 canonical)", true, async () => {
  const result = await run("deno", ["run", "--allow-read", "--allow-write", "--allow-env", "scripts/export-contract-fixtures.ts", "--check"]);
  return { ok: result.ok, detail: result.ok ? "17 fixtures valid" : lastLine(result.out) };
});

await step("static", "secret scan (tracked files)", true, async () => {
  const result = await run("git", [
    "grep", "-nE",
    "eyJhbGciOi|sb_secret_[A-Za-z0-9]|gsk_[A-Za-z0-9]{20}",
    "--", ".", ":!package-lock.json", ":!supabase/functions/node_modules",
  ]);
  // git grep exits 1 when there are no matches, which is the success case here.
  const noHits = result.code === 1 || result.out.trim().length === 0;
  return { ok: noHits, detail: noHits ? "no key-shaped strings in tracked files" : "possible secret found (see git grep)" };
});

// ---------------------------------------------------------------- 2. provider harness

await step("providers", "provider harness default mode makes no request", true, async () => {
  // Deliberately omits --allow-net: if the harness tried to reach a provider it would fail.
  const result = await run("deno", ["run", "--allow-env", "--allow-write", "supabase/tests/provider-verification.ts"]);
  const report = (() => {
    try {
      return JSON.parse(Deno.readTextFileSync("provider-verification-result.json"));
    } catch {
      return null;
    }
  })();
  const disabledNetwork = result.ok;
  const zeroRequests = report?.externalRequests === 0 && report?.mode === "non-live";
  return {
    ok: disabledNetwork && Boolean(zeroRequests),
    detail: `no --allow-net; report mode=${report?.mode ?? "missing"} requests=${report?.externalRequests ?? "?"}`,
  };
});

await step("providers", "provider harness live mode fails closed without keys", true, async () => {
  const result = await run("deno", [
    "run", "--allow-env", "--allow-net", "--allow-write",
    "supabase/tests/provider-verification.ts", "--live",
  ]);
  // exit 2 + "no request was made" is the desired refusal.
  const refused = result.code === 2 && /no request was made/i.test(result.out);
  return { ok: refused, detail: refused ? "refused before any request (exit 2)" : `exit ${result.code}: ${lastLine(result.out)}` };
});

// ---------------------------------------------------------------- 3. database

if (!dbUp) {
  await step("database", "database release verification", true, async () => ({
    ok: false,
    detail: "BLOCKED: local database container not reachable",
  }));
} else {
  await step("database", "database release verification (read-only)", true, async () => {
    const result = await run("deno", ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-run", "--allow-write", "scripts/verify-db-release.ts", "--json"]);
    const report = (() => {
      try {
        return JSON.parse(Deno.readTextFileSync("db-release-result.json"));
      } catch {
        return null;
      }
    })();
    return {
      ok: result.ok,
      detail: report ? `${report.summary.pass}/${report.summary.total} pass, ${report.summary.fail} fail, ${report.summary.blocked} blocked` : lastLine(result.out),
    };
  });

  for (const suite of ["rls", "constraints", "mark_reviewed", "booking", "ist_boundary", "doctor_appointments"]) {
    await step("database", `sql suite: ${suite}`, true, async () => {
      const result = await run("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], undefined);
      // psql reads the file from stdin; use a shell-free approach via a temp file copy.
      const shell = await run("sh", [
        "-c",
        `docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/${suite}.sql`,
      ]);
      void result;
      const passes = (shell.out.match(/NOTICE:\s+PASS/g) ?? []).length;
      const errored = /ERROR:/.test(shell.out);
      return { ok: shell.code === 0 && !errored && passes > 0, detail: `${passes} assertions passed${errored ? ", ERROR raised" : ""}` };
    });
  }
}

// ---------------------------------------------------------------- 4. operations

await step("operations", "demo preflight", true, async () => {
  const result = await run("deno", ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-run", "scripts/demo-preflight.ts"]);
  const summary = /(\d+)\/(\d+) checks passed/.exec(result.out);
  return { ok: result.ok, detail: summary ? `${summary[1]}/${summary[2]} checks` : lastLine(result.out) };
});

await step("operations", "reset safety self-test", true, async () => {
  const result = await run("deno", ["run", "--allow-net", "--allow-env", "scripts/demo-reset.ts", "--self-test"]);
  const passes = (result.out.match(/^PASS /gm) ?? []).length;
  return { ok: result.ok, detail: `${passes} refusal cases passed` };
});

if (!stubUp || !functionsUp) {
  await step("operations", "demo smoke (integration + adaptive)", true, async () => ({
    ok: false,
    detail: "BLOCKED: provider stub or edge functions are not running",
  }));
} else if (SKIP_SMOKE) {
  await step("operations", "demo smoke (integration + adaptive)", false, async () => ({
    ok: false,
    detail: "--skip-smoke requested; NOT TESTED in this run",
  }));
} else {
  await step("operations", "demo smoke (integration + adaptive)", true, async () => {
    const result = await run("deno", [
      "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--allow-run",
      "scripts/demo-smoke.ts",
    ]);
    const report = (() => {
      try {
        return JSON.parse(Deno.readTextFileSync("demo-smoke-result.json"));
      } catch {
        return null;
      }
    })();
    const suites = report?.suites?.map((s: { suite: string; passed: number | null; total: number | null }) => `${s.suite} ${s.passed}/${s.total}`).join(", ");
    return {
      ok: result.ok && Boolean(report?.ok),
      detail: suites ? `${suites}; identities created=${report.identityIsolation?.createdByThisRun} deleted=${report.identityIsolation?.deleted}` : lastLine(result.out),
    };
  });
}

// ---------------------------------------------------------------- 5. optional frontend

if (RUN_FRONTEND) {
  await step("frontend", "typescript", true, async () => {
    const result = await run("npx", ["tsc", "--noEmit"], FRONTEND_DIR);
    return { ok: result.ok, detail: result.ok ? "clean" : lastLine(result.out) };
  });
  await step("frontend", "unit + api suites", true, async () => {
    // Mock and simulated suites must not see the Supabase variables; the real-stack
    // suite resolves the local stack itself. Passing VITE_* here would silently turn
    // every mock test into a live call and produce false failures.
    const result = await run("npm", ["test"], FRONTEND_DIR, {
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_KEY: "",
    });
    const counts = [...result.out.matchAll(/^ℹ pass (\d+)$/gm)].map((m) => Number(m[1]));
    const failures = [...result.out.matchAll(/^ℹ fail (\d+)$/gm)].map((m) => Number(m[1]));
    return { ok: result.ok, detail: `pass=${counts.join("+") || "?"} fail=${failures.join("+") || "?"}` };
  });
  await step("frontend", "production build", true, async () => {
    const result = await run("npm", ["run", "build"], FRONTEND_DIR);
    return { ok: result.ok, detail: result.ok ? "build succeeded" : lastLine(result.out) };
  });
} else {
  await step("frontend", "typescript + tests + build", false, async () => ({
    ok: false,
    detail: "not requested; run with --frontend",
  }));
}

// ---------------------------------------------------------------- report

const required = steps.filter((row) => row.required);
const failedRequired = required.filter((row) => row.status !== "PASS");
const summary = {
  total: steps.length,
  pass: steps.filter((row) => row.status === "PASS").length,
  fail: steps.filter((row) => row.status === "FAIL").length,
  blocked: steps.filter((row) => row.status === "BLOCKED").length,
  notTested: steps.filter((row) => row.status === "NOT TESTED").length,
};

const report = {
  generatedAt: new Date().toISOString(),
  prerequisites: { apiUp, functionsUp, stubUp, dbUp, skipSmoke: SKIP_SMOKE, frontend: RUN_FRONTEND },
  summary,
  steps,
  ok: failedRequired.length === 0,
  liveProviders: "NOT TESTED — no live provider call is made by this runner",
};

await Deno.writeTextFile("release-check-result.json", JSON.stringify(report, null, 2) + "\n");

console.log("");
console.log(`Summary: ${summary.pass} PASS, ${summary.fail} FAIL, ${summary.blocked} BLOCKED, ${summary.notTested} NOT TESTED`);
console.log(`Required checks failing: ${failedRequired.length}`);
if (failedRequired.length) {
  for (const row of failedRequired) console.log(`  - ${row.group}/${row.name}: ${row.status} — ${row.detail}`);
}
console.log("Live providers: NOT TESTED (no live call is made).");
console.log("Wrote release-check-result.json");

Deno.exit(report.ok ? 0 : 1);
