/**
 * Demo smoke runner: executes the committed local HTTP suites and emits JSON.
 *
 * Requires the local stack, `supabase functions serve`, and the provider stub.
 * Run with:
 *   deno run --allow-net --allow-env --allow-read --allow-write --allow-run scripts/demo-smoke.ts
 *
 * Identity isolation and cleanup (M4-S16-B):
 *   - The set of anonymous Auth identities is snapshotted before the run.
 *   - Every suite creates its own anonymous identities; no suite reuses a previous
 *     identity, and no fixture identity is shared between suites.
 *   - After the run, only the anonymous identities that appeared *during* this run are
 *     deleted (Auth cascade removes their sessions, messages, consent records, reports
 *     and appointments). Pre-existing demo identities and the mapped doctor accounts are
 *     never touched, and nothing is truncated.
 *   - Cleanup failure makes the run fail: a smoke run that leaves identities behind is
 *     not clean.
 *
 * Exit code is non-zero when any suite fails, produces no parseable result, or cleanup
 * fails.
 */

const ENV = Deno.env.toObject();
const BASE = ENV.LOCAL_URL ?? "http://127.0.0.1:54321";
const SERVICE = ENV.LOCAL_SERVICE_KEY ?? ENV.SERVICE_ROLE_KEY ?? ENV.SECRET_KEY ?? "";
const RUN_ID = crypto.randomUUID();

const suites: Array<[string, string]> = [
  ["integration", "supabase/tests/integration.ts"],
  ["adaptive", "supabase/tests/adaptive.ts"],
];

interface SuiteResult {
  suite: string;
  ok: boolean;
  exitCode: number;
  passed: number | null;
  total: number | null;
  tail: string;
}

function authHeaders(): HeadersInit {
  return { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };
}

/** Anonymous identities currently present on the local stack. */
async function anonymousIdentityIds(): Promise<Set<string> | null> {
  if (!SERVICE) return null;
  try {
    const ids = new Set<string>();
    for (let page = 1; page <= 5; page += 1) {
      const response = await fetch(
        `${BASE}/auth/v1/admin/users?page=${page}&per_page=200`,
        { headers: authHeaders() },
      );
      if (!response.ok) return null;
      const body = await response.json() as {
        users?: Array<{ id: string; is_anonymous?: boolean }>;
      };
      const users = body.users ?? [];
      for (const user of users) {
        if (user.is_anonymous) ids.add(user.id);
      }
      if (users.length < 200) break;
    }
    return ids;
  } catch {
    return null;
  }
}

/** Deletes only the given identities; the Auth cascade removes their own rows. */
async function deleteIdentities(ids: string[]): Promise<number> {
  let failed = 0;
  for (const id of ids) {
    try {
      const response = await fetch(`${BASE}/auth/v1/admin/users/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) failed += 1;
    } catch {
      failed += 1;
    }
  }
  return failed;
}

/** "52/52 scenarios passed" → { passed: 52, total: 52 } */
function parseCounts(text: string): { passed: number | null; total: number | null } {
  const match = /(\d+)\s*\/\s*(\d+)\s+(?:adaptive\s+|integration\s+)?scenarios? passed/.exec(text);
  if (!match) {
    const single = /(?:^|\s)(\d+)\s+scenarios?\b/.exec(text);
    return { passed: single ? Number(single[1]) : null, total: single ? Number(single[1]) : null };
  }
  return { passed: Number(match[1]), total: Number(match[2]) };
}

if (!SERVICE) {
  console.error("LOCAL_SERVICE_KEY is required for identity isolation and cleanup");
  Deno.exit(2);
}

const before = await anonymousIdentityIds();
if (before === null) {
  console.error("Could not snapshot anonymous identities; refusing to run without cleanup");
  Deno.exit(2);
}

const results: SuiteResult[] = [];

for (const [name, file] of suites) {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-net", "--allow-env", "--allow-read", file],
    env: { ...ENV, SMOKE_RUN_ID: RUN_ID },
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  const text = new TextDecoder().decode(output.stdout) + new TextDecoder().decode(output.stderr);
  const tail = text.trimEnd().split("\n").slice(-1)[0] ?? "";
  const { passed, total } = parseCounts(text);
  // A suite that exits 0 without a parseable summary is not a pass.
  const ok = output.success && total !== null;
  results.push({ suite: name, ok, exitCode: output.code, passed, total, tail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${tail}`);
}

const after = await anonymousIdentityIds();
const created = after === null ? [] : [...after].filter((id) => !before.has(id));
const cleanupFailures = await deleteIdentities(created);

const remaining = await anonymousIdentityIds();
const leaked = remaining === null ? null : [...remaining].filter((id) => !before.has(id)).length;
const cleanupOk = cleanupFailures === 0 && leaked === 0;

const ok = results.every((result) => result.ok) && cleanupOk;

const report = {
  runId: RUN_ID,
  generatedAt: new Date().toISOString(),
  target: BASE,
  providerMode: "stub",
  identityIsolation: {
    preexistingAnonymous: before.size,
    createdByThisRun: created.length,
    deleted: created.length - cleanupFailures,
    remainingFromThisRun: leaked,
  },
  suites: results,
  cleanup: { attempted: created.length, failed: cleanupFailures, ok: cleanupOk },
  ok,
};

await Deno.writeTextFile("demo-smoke-result.json", JSON.stringify(report, null, 2));
console.log(
  `\n${ok ? "SMOKE PASS" : "SMOKE FAIL"} — wrote demo-smoke-result.json ` +
    `(${created.length} run identities created, ${created.length - cleanupFailures} deleted)`,
);
console.log("Note: backend HTTP/DB only. Browser UI is not exercised.");
Deno.exit(ok ? 0 : 1);
