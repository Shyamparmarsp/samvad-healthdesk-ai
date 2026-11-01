/**
 * Doctor profile mapping utility.
 *
 * Maps two existing Supabase Auth users (created by the OWNER in the Dashboard) to the
 * fictional doctor records seeded by `supabase/seed.sql`. It never creates users, never
 * touches `auth.users`, never handles passwords and prints no credentials.
 *
 *   # dry run (default) — prints the plan and changes nothing
 *   DOCTOR_GM_UID=<uuid> DOCTOR_EM_UID=<uuid> \
 *     deno run --allow-net --allow-env scripts/map-doctor-profiles.ts
 *
 *   # apply (explicit)
 *   DOCTOR_GM_UID=<uuid> DOCTOR_EM_UID=<uuid> \
 *     deno run --allow-net --allow-env scripts/map-doctor-profiles.ts --confirm
 *
 * Safe to re-run: an existing identical mapping is reported as "unchanged".
 * Exit codes: 0 ok (or dry run), 1 conflict/invalid input, 2 missing configuration.
 */

const CONFIRM = Deno.args.includes("--confirm");
const BASE = Deno.env.get("LOCAL_URL") ?? Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const KEY = Deno.env.get("LOCAL_SERVICE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const GM_UID = (Deno.env.get("DOCTOR_GM_UID") ?? "").trim().toLowerCase();
const EM_UID = (Deno.env.get("DOCTOR_EM_UID") ?? "").trim().toLowerCase();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function fail(message: string, code = 1): never {
  console.error(`ERROR: ${message}`);
  Deno.exit(code);
}

if (!BASE) fail("LOCAL_URL (or SUPABASE_URL) is required", 2);
if (!KEY) fail("LOCAL_SERVICE_KEY (or SUPABASE_SECRET_KEY) is required", 2);

// Never point this at a project the operator does not intend to change.
let host = "";
try {
  host = new URL(BASE).hostname;
} catch {
  fail(`invalid base URL: ${BASE}`, 2);
}

if (!GM_UID || !EM_UID) {
  fail("DOCTOR_GM_UID and DOCTOR_EM_UID are required (copy each Auth user's UID from the Dashboard)", 2);
}
for (const [label, value] of [["DOCTOR_GM_UID", GM_UID], ["DOCTOR_EM_UID", EM_UID]] as const) {
  if (!UUID_RE.test(value)) fail(`${label} is not a UUID: refusing to continue`, 1);
}
if (GM_UID === EM_UID) fail("the two Auth UIDs must be different", 1);

const headers = {
  apikey: KEY,
  authorization: `Bearer ${KEY}`,
  "content-type": "application/json",
};

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} → ${response.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

interface Doctor { id: string; display_name: string; department_key: string }
interface Profile { user_id: string; doctor_id: string }

console.log(`Doctor profile mapping — ${CONFIRM ? "APPLY" : "DRY RUN"} against ${host}\n`);

const doctors = await rest<Doctor[]>("doctors?select=id,display_name,department_key&order=department_key");
const general = doctors.filter((doctor) => doctor.department_key === "general_medicine");
const emergency = doctors.filter((doctor) => doctor.department_key === "emergency");

if (general.length !== 1) fail(`expected exactly one general_medicine doctor, found ${general.length}`);
if (emergency.length !== 1) fail(`expected exactly one emergency doctor, found ${emergency.length}`);
if (doctors.length !== 6) console.warn(`WARNING: expected 6 fictional doctors, found ${doctors.length}`);

const plan: Array<{ user: string; label: string; doctor: Doctor }> = [
  { user: GM_UID, label: "General Medicine", doctor: general[0] },
  { user: EM_UID, label: "Emergency", doctor: emergency[0] },
];

const existing = await rest<Profile[]>("doctor_profiles?select=user_id,doctor_id");
const byUser = new Map(existing.map((row) => [row.user_id, row.doctor_id]));
const byDoctor = new Map(existing.map((row) => [row.doctor_id, row.user_id]));

let conflicts = 0;
for (const entry of plan) {
  const currentDoctor = byUser.get(entry.user);
  const currentUser = byDoctor.get(entry.doctor.id);

  if (currentDoctor === entry.doctor.id) {
    console.log(`  unchanged   ${entry.label}: ${entry.doctor.display_name} (already mapped)`);
    continue;
  }
  if (currentDoctor && currentDoctor !== entry.doctor.id) {
    console.log(`  CONFLICT    ${entry.label}: this Auth user is already mapped to another doctor`);
    conflicts += 1;
    continue;
  }
  if (currentUser && currentUser !== entry.user) {
    console.log(
      `  CONFLICT    ${entry.label}: ${entry.doctor.display_name} is already mapped to a different Auth user`,
    );
    conflicts += 1;
    continue;
  }
  console.log(`  ${CONFIRM ? "map        " : "would map  "} ${entry.label}: ${entry.doctor.display_name}`);
}

if (conflicts > 0) {
  console.error(`\n${conflicts} conflict(s). Nothing was written. Resolve them in the Dashboard first.`);
  Deno.exit(1);
}

if (!CONFIRM) {
  console.log("\nDry run complete. Nothing was written. Re-run with --confirm to apply.");
  Deno.exit(0);
}

for (const entry of plan) {
  if (byUser.get(entry.user) === entry.doctor.id) continue;
  await rest("doctor_profiles", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: entry.user, doctor_id: entry.doctor.id }),
  });
}

// ---------------------------------------------------------------- verification

const verified = await rest<Array<{ user_id: string; doctor_id: string }>>(
  "doctor_profiles?select=user_id,doctor_id",
);
const finalByUser = new Map(verified.map((row) => [row.user_id, row.doctor_id]));
const problems: string[] = [];
for (const entry of plan) {
  if (finalByUser.get(entry.user) !== entry.doctor.id) {
    problems.push(`${entry.label} is not mapped to ${entry.doctor.display_name}`);
  }
}
const doctorIds = new Set(verified.map((row) => row.doctor_id));
if (doctorIds.size !== verified.length) problems.push("a doctor is mapped more than once");

console.log("\nVerification");
for (const entry of plan) {
  const ok = finalByUser.get(entry.user) === entry.doctor.id;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${entry.label} → ${entry.doctor.display_name}`);
}
console.log(`  total mappings: ${verified.length}`);

if (problems.length) {
  for (const problem of problems) console.error(`  FAIL ${problem}`);
  Deno.exit(1);
}
console.log("\nBoth doctor identities are correctly mapped. The doctor portal can be deployed.");
