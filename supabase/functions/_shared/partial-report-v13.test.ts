/**
 * Report contract v1.3 — structural and document-level guarantees.
 *
 * These run without a database. The SQL itself is exercised by the migration in staging and
 * by the assertions below on the exact statements that matter for safety:
 *   - `partial` is a new enum value, not a reuse of `urgent_partial`;
 *   - the urgent-queue predicate is untouched (`urgent_partial` only);
 *   - doctors read `partial` through the same assignment policy, never a broader one;
 *   - routine booking accepts `partial`, emergency stays refused;
 *   - the JSON document keeps every v1.2 field and never invents a value.
 */

import { assert, assertEqual } from "./testing.ts";
import { buildReportDocument, emptyFieldMap, isComplete, missingInformation, templateSummary, validateReportDocument } from "./report.ts";
import { applyAnswer, parseAnswer } from "./conversation.ts";
import type { RoutingSnapshot } from "./contract.ts";

const MIGRATIONS = new URL("../../migrations/", import.meta.url);

const ENUM_FILE = "20261104083816_report_status_partial.sql";
const RULES_FILE = "20261104083818_partial_reports_v13.sql";

function read(name: string): string {
  return Deno.readTextFileSync(new URL(name, MIGRATIONS));
}

const ROUTING: RoutingSnapshot = {
  department_key: "general_medicine",
  department_name: "General Medicine",
  doctor_id: "11111111-1111-4111-8111-111111111111",
  doctor_name: "Dr. Aditi Rao",
  is_fallback: true,
  preliminary: true,
};

Deno.test("v1.3 schema: partial is an additive enum value", () => {
  const sql = read(ENUM_FILE).toLowerCase();
  assert(sql.includes("alter type public.report_status add value if not exists 'partial'"), "additive only");
  assert(!sql.includes("drop type"), "no type is dropped");
  assert(!/alter\s+(type|table)\s+[^;]*\brename\b/.test(sql), "no rename statement");
});

Deno.test("v1.3 schema: urgent_partial stays the only urgent-queue status", () => {
  const rules = read(RULES_FILE).toLowerCase();
  // The policy and RPCs may mention partial, but the emergency status keeps its meaning.
  assert(rules.includes("status in ('submitted', 'partial', 'urgent_partial')"), "doctor read includes partial");
  assert(rules.includes("status in ('submitted', 'partial')"), "booking includes partial");
  assert(rules.includes("v_report.status = 'urgent_partial'"), "emergency branch unchanged");
  // The queue predicate lives in the doctor UI; it must still be urgent_partial only.
  const shell = Deno.readTextFileSync(new URL("../../../src/features/doctor/DoctorShell.tsx", import.meta.url));
  assert(shell.includes("r.status === 'urgent_partial'"), "urgent queue predicate unchanged");
});

Deno.test("v1.3 schema: no broadened read or grant", () => {
  const rules = read(RULES_FILE).toLowerCase();
  assert(!rules.includes("to anon"), "anon gains nothing");
  assert(!rules.includes("grant select on public.reports"), "no table grant added");
  assert(rules.includes("revoke all on function public.get_available_slots"), "execute revoked then granted narrowly");
  assert(rules.includes("grant execute on function public.get_available_slots(uuid, integer) to authenticated"), "authenticated only");
});

Deno.test("v1.3 document: partial report keeps every v1.2 field and invents nothing", () => {
  let fields = emptyFieldMap();
  for (const [question, answer] of [
    ["name", "Synthetic Patient"],
    ["age", "44"],
    ["gender", "Female"],
  ] as const) {
    const parsed = parseAnswer(question, answer);
    assert(parsed !== null, `parsed ${question}`);
    fields = applyAnswer(fields, parsed!);
  }

  assertEqual(isComplete(fields), false, "three answers are not a complete intake");

  const doc = buildReportDocument({
    language: "en",
    fields,
    routing: ROUTING,
    status: "partial",
    summary: templateSummary(fields),
  });

  assertEqual(validateReportDocument(doc).length, 0, "schema-valid document");
  assertEqual(doc.patient.name.value, "Synthetic Patient", "provided value kept");
  assertEqual(doc.clinical_details.allergies.status, "not_asked", "unanswered stays not_asked");
  assertEqual(doc.clinical_details.allergies.value, null, "no invented value");
  assertEqual(doc.clinical_details.medications.status, "not_asked", "distinct status kept");
  assert(doc.missing_information.includes("clinical_details.allergies"), "missing list populated");
  assertEqual(doc.summary, null, "no summary is fabricated when nothing is reportable");
  assertEqual(doc.emergency, null, "partial is never an emergency report");
  assertEqual(doc.schema_version, 1, "document structure unchanged");
});

Deno.test("v1.3 document: a declined answer never becomes a negative finding", () => {
  let fields = emptyFieldMap();
  for (const [question, answer] of [
    ["name", "Synthetic Patient"],
    ["primary_concern", "knee pain"],
    ["allergies", "prefer not to say"],
  ] as const) {
    const parsed = parseAnswer(question, answer);
    fields = applyAnswer(fields, parsed!);
  }
  assertEqual(fields["clinical_details.allergies"].status, "declined", "declined preserved");
  const missing = missingInformation(fields);
  assert(missing.includes("clinical_details.allergies"), "declined still listed as not provided");

  const doc = buildReportDocument({
    language: "en",
    fields,
    routing: ROUTING,
    status: "partial",
    summary: templateSummary(fields),
  });
  const text = JSON.stringify(doc).toLowerCase();
  for (const forbidden of ["no allergies", "denies", "negative for", "no medication"]) {
    assert(!text.includes(forbidden), `no fabricated negative finding: ${forbidden}`);
  }
});

Deno.test("v1.3: the complete-intake path keeps its existing completion gate", () => {
  // The partial path is additive: a complete submission still requires isComplete().
  assertEqual(isComplete(emptyFieldMap()), false, "empty intake is incomplete");
});
