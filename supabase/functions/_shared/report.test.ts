import {
  applyCorrections,
  buildReportDocument,
  emptyFieldMap,
  generateIntakeReference,
  isComplete,
  missingInformation,
  normalizeFieldValue,
  templateSummary,
  validateReportDocument,
} from "./report.ts";
import type { FieldMap } from "./report.ts";
import type { RoutingSnapshot } from "./contract.ts";
import { assert, assertEqual } from "./testing.ts";

const ROUTING: RoutingSnapshot = {
  department_key: "general_medicine",
  department_name: "General Medicine",
  doctor_id: "11111111-1111-4111-8111-111111111111",
  doctor_name: "Dr. Aditi Rao",
  is_fallback: true,
  preliminary: true,
};

function completeFields(): FieldMap {
  const fields = emptyFieldMap();
  fields["patient.name"] = { status: "provided", value: "Asha Test" };
  fields["patient.age"] = { status: "provided", value: 34 };
  fields["patient.gender"] = { status: "provided", value: "female" };
  fields.primary_concern = { status: "provided", value: "knee pain when walking" };
  fields["clinical_details.duration"] = { status: "provided", value: "about three weeks" };
  fields["clinical_details.severity"] = { status: "provided", value: "moderate" };
  fields["clinical_details.conditions"] = { status: "provided", value: [] };
  fields["clinical_details.medications"] = { status: "declined", value: null };
  fields["clinical_details.allergies"] = { status: "unknown", value: null };
  fields["clinical_details.other_symptoms"] = { status: "provided", value: ["mild swelling"] };
  return fields;
}

Deno.test("report: completion requires the six answered fields plus four asked once", () => {
  const fields = completeFields();
  assert(isComplete(fields), "complete");

  const missingDuration: FieldMap = { ...fields, "clinical_details.duration": { status: "unclear", value: null } };
  assert(!isComplete(missingDuration), "unclear duration blocks completion");

  const notAsked: FieldMap = { ...fields, "clinical_details.allergies": { status: "not_asked", value: null } };
  assert(!isComplete(notAsked), "unasked optional field blocks completion");
});

Deno.test("report: gender declined is a handled answer and never blocks completion", () => {
  const fields = completeFields();
  fields["patient.gender"] = { status: "declined", value: null };
  assert(isComplete(fields), "declined gender completes the question");

  const doc = buildReportDocument({ language: "en", fields, routing: ROUTING, status: "draft" });
  assertEqual(doc.patient.gender.status, "declined", "status recorded");
  assertEqual(doc.patient.gender.value, null, "no value with declined");
});

Deno.test("report: optional fields count as handled when declined or unknown", () => {
  const fields = completeFields();
  fields["clinical_details.conditions"] = { status: "declined", value: null };
  fields["clinical_details.medications"] = { status: "unknown", value: null };
  assert(isComplete(fields), "declined and unknown are handled");
});

Deno.test("report: value is present only when the status is provided", () => {
  const fields = completeFields();
  const doc = buildReportDocument({ language: "hi", fields, routing: ROUTING, status: "draft" });
  for (const entry of [
    doc.patient.name,
    doc.patient.age,
    doc.patient.gender,
    doc.primary_concern,
    doc.clinical_details.duration,
    doc.clinical_details.severity,
    doc.clinical_details.conditions,
    doc.clinical_details.medications,
    doc.clinical_details.allergies,
    doc.clinical_details.other_symptoms,
  ]) {
    if (entry.status === "provided") assert(entry.value !== null, "provided has a value");
    else assertEqual(entry.value, null, "non-provided has no value");
  }
});

Deno.test("report: urgent_partial carries no generated summary", () => {
  const fields = completeFields();
  const doc = buildReportDocument({
    language: "en",
    fields,
    routing: { ...ROUTING, department_key: "emergency", department_name: "Emergency", doctor_id: "22222222-2222-4222-8222-222222222222", doctor_name: "Dr. Neha Verma", is_fallback: false },
    status: "urgent_partial",
    emergency: { rule_id: "breathing_emergency", patient_statement: "सांस नहीं आ रही", triggered_at: "2026-11-01T10:00:00.000Z" },
  });
  assertEqual(doc.summary, null, "summary is null for urgent_partial");
  assertEqual(doc.emergency?.rule_id, "breathing_emergency", "rule recorded");
});

Deno.test("report: normal report summary restates only provided fields", () => {
  const fields = completeFields();
  const doc = buildReportDocument({ language: "en", fields, routing: ROUTING, status: "draft" });
  assert(doc.summary !== null, "summary exists");
  if (!doc.summary) return;
  assert(doc.summary.text.includes("knee pain when walking"), "concern included");
  assert(doc.summary.text.includes("mild swelling"), "other symptoms included");
  assert(!doc.summary.text.includes("high blood pressure"), "no invented condition");
  assert(!doc.summary.text.includes("diagnosis"), "no diagnosis language");
  assertEqual(doc.summary.source, "template", "template source");
  assert(doc.summary.generated_from.includes("primary_concern"), "provenance recorded");
  assert(!doc.summary.generated_from.includes("clinical_details.medications"), "declined field excluded");
});

Deno.test("report: correction accepts an allowlisted field", () => {
  const fields = completeFields();
  const result = applyCorrections(fields, { "primary_concern": { value: "knee pain at night", status: "provided" } });
  assert(result.ok, "accepted");
  if (!result.ok || !result.fields) return;
  assertEqual(result.fields.primary_concern.value, "knee pain at night", "value updated");
});

Deno.test("report: correction rejects protected and unknown fields", () => {
  const fields = completeFields();
  for (const key of ["status", "routing_snapshot", "summary", "missing_information", "possible_urgent", "reviewed_by"]) {
    const result = applyCorrections(fields, { [key]: { value: "x", status: "provided" } } as never);
    assert(!result.ok, `${key} rejected`);
    if (!result.ok) assertEqual(result.code, "field_not_editable", `${key} code`);
  }
});

Deno.test("report: correction rejects a status other than provided/declined", () => {
  const result = applyCorrections(completeFields(), {
    "clinical_details.severity": { value: null, status: "unclear" },
  } as never);
  assert(!result.ok, "rejected");
  if (!result.ok) assertEqual(result.code, "invalid_field_status", "code");
});

Deno.test("report: a required field cannot be declined, gender can", () => {
  const declineName = applyCorrections(completeFields(), { "patient.name": { value: null, status: "declined" } });
  assert(!declineName.ok, "name cannot be declined");

  const declineGender = applyCorrections(completeFields(), { "patient.gender": { value: null, status: "declined" } });
  assert(declineGender.ok, "gender may be declined");
});

Deno.test("report: invalid values are rejected", () => {
  const cases: Array<[string, unknown]> = [
    ["patient.age", 200],
    ["patient.age", "abc"],
    ["patient.gender", "unknown-value"],
    ["clinical_details.allergies", ["a".repeat(600)]],
    ["patient.name", "   "],
  ];
  for (const [key, value] of cases) {
    const result = applyCorrections(completeFields(), { [key]: { value, status: "provided" } } as never);
    assert(!result.ok, `${key} rejects ${String(value)}`);
  }
});

Deno.test("report: field normalisation bounds", () => {
  assertEqual(normalizeFieldValue("patient.age", "34"), 34, "numeric string");
  assertEqual(normalizeFieldValue("patient.age", 34.5), null, "non-integer");
  assertEqual(normalizeFieldValue("patient.age", -1), null, "negative");
  assertEqual(normalizeFieldValue("patient.gender", "female"), "female", "gender accepted");
  assertEqual(normalizeFieldValue("patient.gender", "F"), null, "gender rejected");
});

Deno.test("report: missing_information lists every non-provided field in order", () => {
  const fields = completeFields();
  const missing = missingInformation(fields);
  assert(missing.includes("clinical_details.medications"), "declined listed");
  assert(missing.includes("clinical_details.allergies"), "unknown listed");
  assert(!missing.includes("primary_concern"), "provided absent");
  assertEqual(missing[0], "clinical_details.medications", "document order preserved");
});

Deno.test("report: document validation catches invariant violations", () => {
  const fields = completeFields();
  const doc = buildReportDocument({ language: "en", fields, routing: ROUTING, status: "draft" });
  assertEqual(validateReportDocument(doc).length, 0, "clean document passes");

  const broken = JSON.parse(JSON.stringify(doc));
  broken.primary_concern = { status: "declined", value: "leaked" };
  assert(validateReportDocument(broken).length > 0, "violation detected");
});

Deno.test("report: intake reference format and IST date", () => {
  const fixed = new Date("2026-11-01T19:30:00.000Z"); // 02 Nov 01:00 IST
  let counter = 0;
  const reference = generateIntakeReference(fixed, () => {
    counter = (counter + 1) % 32;
    return counter / 32;
  });
  assert(reference.startsWith("SHD-20261102-"), `IST date used: ${reference}`);
  assertEqual(reference.length, 4 + 8 + 1 + 6, "length");
  assert(/^SHD-\d{8}-[0-9A-HJKMNP-TV-Z]{6}$/.test(reference), "crockford alphabet");
});
