/**
 * Retention dry run — READ ONLY.
 *
 * Reports what a 30-day post-competition cleanup WOULD delete, in foreign-key order.
 * This script contains no delete path. Deletion is an owner action requiring separate
 * approval (docs/data-retention-and-deletion.md).
 *
 *   deno run --allow-net --allow-env --allow-read --allow-write scripts/retention-dry-run.ts
 *
 * Refuses any non-local target; prints counts only, never patient content.
 */

const BASE = Deno.env.get("LOCAL_URL") ?? "http://127.0.0.1:54321";
const KEY = Deno.env.get("LOCAL_SERVICE_KEY") ?? "";

let host = "";
try {
  host = new URL(BASE).hostname;
} catch {
  console.error(`invalid URL: ${BASE}`);
  Deno.exit(2);
}

// Hard guard: this tool exists for the local demonstration stack. A remote target needs a
// separate, owner-approved procedure.
if (host !== "127.0.0.1" && host !== "localhost") {
  console.error(`REFUSED: ${BASE} is not a local stack. Remote cleanup is an owner action.`);
  Deno.exit(2);
}
if (!KEY) {
  console.error("REFUSED: LOCAL_SERVICE_KEY is required.");
  Deno.exit(2);
}

const headers = { apikey: KEY, authorization: `Bearer ${KEY}` };

/**
 * Counts rows with a HEAD request. No column is assumed: `departments` keys on `key`,
 * `doctor_profiles` on `user_id` and `daily_usage_limits` on `counter_name`, so selecting
 * `id` would fail for them.
 */
async function count(table: string): Promise<number | null> {
  const response = await fetch(`${BASE}/rest/v1/${table}`, {
    method: "HEAD",
    headers: { ...headers, prefer: "count=exact", range: "0-0" },
  });
  if (!response.ok) return null;
  const range = response.headers.get("content-range") ?? "";
  const total = range.split("/")[1];
  return total && total !== "*" ? Number(total) : null;
}

const PATIENT_TABLES: Array<[string, string]> = [
  ["appointments", "confirmed bookings"],
  ["reports", "draft, submitted and urgent_partial reports"],
  ["messages", "patient answers and assistant questions"],
  ["consent_records", "consent decisions and wording version"],
  ["sessions", "intake session state"],
];
const REFERENCE_TABLES: Array<[string, string]> = [
  ["departments", "reference"],
  ["doctors", "reference"],
  ["doctor_schedules", "reference"],
  ["doctor_profiles", "demo doctor mapping"],
  ["daily_usage_limits", "operational"],
];

const rows: Array<{ table: string; description: string; count: number | null }> = [];
for (const [table, description] of PATIENT_TABLES) rows.push({ table, description, count: await count(table) });

const reference: Array<{ table: string; count: number | null }> = [];
for (const [table] of REFERENCE_TABLES) reference.push({ table, count: await count(table) });

// Anonymous patient identities are counted through the admin API (still read-only).
let anonymousUsers: number | null = null;
try {
  const response = await fetch(`${BASE}/auth/v1/admin/users?per_page=200`, { headers });
  if (response.ok) {
    const body = await response.json() as { users?: Array<{ is_anonymous?: boolean }> };
    anonymousUsers = (body.users ?? []).filter((user) => user.is_anonymous).length;
  }
} catch {
  anonymousUsers = null;
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: "dry-run",
  readOnly: true,
  target: host,
  deletionOrder: [
    "appointments",
    "reports",
    "messages",
    "consent_records",
    "sessions",
    "auth.users (anonymous patients only)",
  ],
  wouldDelete: rows,
  anonymousPatientIdentities: anonymousUsers,
  preserved: reference,
  preservedNote: "Reference data, demo doctor accounts, usage guardrails and migrations are never deleted by retention.",
  policy: "Owner-approved: 30 days after the competition/demo period, owner-executed, separate approval required.",
};

console.log("Retention dry run (READ ONLY — nothing was deleted)\n");
for (const row of rows) console.log(`  would delete  ${row.table.padEnd(17)} ${row.count ?? "?"} rows  (${row.description})`);
console.log(`  would delete  ${"auth.users".padEnd(17)} ${anonymousUsers ?? "?"} anonymous patient identities`);
console.log("\nPreserved:");
for (const row of reference) console.log(`  keep          ${row.table.padEnd(17)} ${row.count ?? "?"} rows`);
console.log("\nDeletion order: " + report.deletionOrder.join(" → "));
console.log("Owner approval is required before any deletion. This script cannot delete.");

await Deno.writeTextFile("retention-dry-run-result.json", JSON.stringify(report, null, 2) + "\n");
console.log("\nWrote retention-dry-run-result.json");
