/**
 * Safe local demo reset. Dry-run by default; requires --confirm to delete anything.
 * Refuses any non-local target. Never deletes auth users; preserves reference data.
 */
const BASE = Deno.env.get("LOCAL_URL") ?? "http://127.0.0.1:54321";
const KEY = Deno.env.get("LOCAL_SERVICE_KEY") ?? "";
const CONFIRM = Deno.args.includes("--confirm");
const SELF_TEST = Deno.args.includes("--self-test");

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "0.0.0.0", "host.docker.internal"]);
export function isLocalTarget(url: string): boolean {
  try {
    const parsed = new URL(url);
    return LOCAL_HOSTS.has(parsed.hostname) && (parsed.port === "54321" || parsed.port === "54322");
  } catch {
    return false;
  }
}

if (SELF_TEST) {
  const cases: Array<[string, boolean]> = [
    ["http://127.0.0.1:54321", true],
    ["http://localhost:54322", true],
    ["https://abcdefgh.supabase.co", false],
    ["http://10.0.0.5:54321", false],
    ["not a url", false],
  ];
  let failed = 0;
  for (const [url, expected] of cases) {
    const actual = isLocalTarget(url);
    if (actual !== expected) { console.error(`FAIL ${url}: expected ${expected} got ${actual}`); failed++; }
    else console.log(`PASS ${url} -> local=${actual}`);
  }
  Deno.exit(failed === 0 ? 0 : 1);
}

if (!isLocalTarget(BASE)) {
  console.error(`REFUSED: ${BASE} is not a local Supabase instance. No request was made.`);
  Deno.exit(2);
}
if (!KEY) {
  console.error("REFUSED: LOCAL_SERVICE_KEY is required (local demo only).");
  Deno.exit(2);
}

const TABLES = ["appointments", "reports", "messages", "consent_records", "sessions"];
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: "return=representation" };

const counts: Array<[string, number]> = [];
for (const table of TABLES) {
  const r = await fetch(`${BASE}/rest/v1/${table}?select=id&limit=1000`, { headers });
  const rows = await r.json();
  counts.push([table, Array.isArray(rows) ? rows.length : 0]);
}

console.log(`Target: ${BASE} (local)\n`);
for (const [table, count] of counts) console.log(`  ${CONFIRM ? "delete" : "would delete"} ${count} rows from ${table}`);
console.log("\nPreserved: migrations, departments, doctors, doctor_profiles, doctor_schedules, usage tables, auth users.");

if (!CONFIRM) {
  console.log("\nDry run. Re-run with --confirm to delete only the rows listed above.");
  Deno.exit(0);
}

for (const table of TABLES) {
  const r = await fetch(`${BASE}/rest/v1/${table}?id=not.is.null`, { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } });
  if (!r.ok) { console.error(`FAILED deleting ${table}: ${r.status}`); Deno.exit(1); }
}
console.log("\nReset complete. Recovery: re-run the demo smoke test to recreate synthetic data.");
