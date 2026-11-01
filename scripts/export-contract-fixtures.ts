/**
 * Generates the frontend contract fixtures from the backend builders, then validates
 * them.   deno run --allow-read --allow-write scripts/export-contract-fixtures.ts [--check]
 */
import { buildReportDocument, emptyFieldMap, generateIntakeReference } from "../supabase/functions/_shared/intake/../report.ts";
import { getQuestion, localizedOptions } from "../supabase/functions/_shared/intake/question-bank.ts";
import { CONSENT_TEXT, CONSENT_VERSION } from "../supabase/functions/_shared/consent.ts";

const CHECK = Deno.args.includes("--check");
const DIR = new URL("../docs/frontend-contract-fixtures/", import.meta.url);
const SID = "3f4b1c2d-1111-4222-8333-444455556666";
const RID = "9a8b7c6d-2222-4333-8444-555566667777";

const fields = emptyFieldMap();
fields["patient.name"] = { status: "provided", value: "Asha Test" };
fields["patient.age"] = { status: "provided", value: 34 };
fields["patient.gender"] = { status: "declined", value: null };
fields.primary_concern = { status: "provided", value: "knee pain when walking" };
fields["clinical_details.duration"] = { status: "provided", value: "three weeks" };
fields["clinical_details.severity"] = { status: "provided", value: "moderate" };
fields["clinical_details.conditions"] = { status: "provided", value: [] };
fields["clinical_details.medications"] = { status: "declined", value: null };
fields["clinical_details.allergies"] = { status: "unknown", value: null };
fields["clinical_details.other_symptoms"] = { status: "provided", value: ["mild swelling"] };

const routing = {
  department_key: "orthopedics", department_name: "Orthopedics",
  doctor_id: "00000000-0000-4000-8000-000000000001", doctor_name: "Dr. Kabir Mehta",
  is_fallback: false, preliminary: true,
} as const;

const draft = buildReportDocument({ language: "en", fields, routing, status: "draft" });
const urgent = buildReportDocument({
  language: "en", fields, routing: { ...routing, department_key: "emergency", department_name: "Emergency" }, status: "urgent_partial",
  emergency: { rule_id: "breathing_emergency", patient_statement: "I cannot breathe", triggered_at: "2026-11-02T10:00:00.000Z" },
});
const bank = getQuestion("CARD-003")!;
const yesNo = getQuestion("GM-004")!;

const FIXTURES: Record<string, unknown> = {
  "start-session.json": { session_id: SID, session_status: "created", current_question: { id: "name", text: "What is your name?", text_hi: "आपका नाम क्या है?" }, messages: [], turn_count: 0, max_turns: 15, is_complete: false, is_cap_reached: false, can_submit: false },
  "consent.json": { consent_version: CONSENT_VERSION, language: "en", consent_text: CONSENT_TEXT.en, session_status: "consented" },
  "question-core.json": { id: "primary_concern", text: "What is your main concern today?", text_hi: "आज आपकी मुख्य समस्या क्या है?" },
  "question-adaptive-en.json": { id: bank.id, text: bank.en, text_hi: bank.hi, options: localizedOptions(bank.id, "en") },
  "question-adaptive-hi.json": { id: bank.id, text: bank.en, text_hi: bank.hi, options: localizedOptions(bank.id, "hi") },
  "question-adaptive-yes-no.json": { id: yesNo.id, text: yesNo.en, text_hi: yesNo.hi, options: ["Yes", "No"] },
  "transcript-preview.json": { session_id: SID, session_status: "in_progress", turn_count: 3, transcript_preview: { state: "transcript_preview", text: "मुझे घुटने में दर्द है", question_id: "primary_concern" } },
  "draft-report.json": { status: "draft", report: draft },
  "submitted-report.json": { id: RID, session_id: SID, status: "submitted", intake_reference: generateIntakeReference(new Date("2026-11-02T06:00:00Z"), () => 0.5), report: draft, reviewed_at: null, reviewed_by: null },
  "urgent-partial-report.json": { status: "urgent_partial", report: urgent },
  "resume-session.json": { session_id: SID, session_status: "in_progress", turn_count: 4, is_complete: false, is_cap_reached: false, can_submit: false },
  "mark-reviewed.json": { report_id: RID, reviewed_at: "2026-11-02T10:00:00.000Z", reviewed_by: "00000000-0000-4000-8000-000000000003", already_reviewed: false },
  "available-slots.json": [{ slot_start: "2026-11-03T09:00:00+05:30", slot_end: "2026-11-03T09:30:00+05:30" }],
  "booking-success.json": [{ appointment_id: "00000000-0000-4000-8000-0000000000aa", reference_code: "APT-20261103-K9X2PQ", slot_start: "2026-11-03T09:00:00+05:30", slot_end: "2026-11-03T09:30:00+05:30", doctor_id: routing.doctor_id, already_booked: false }],
  "booking-conflict.json": { code: "23505", message: "slot is no longer available", details: null, hint: null },
  "auth-failure.json": { code: "UNAUTHORIZED_NO_AUTH_HEADER", message: "Missing authorization header" },
  "demo-busy.json": { session_id: "", session_status: "created", messages: [], turn_count: 0, max_turns: 15, is_complete: false, is_cap_reached: false, can_submit: false, demo_busy: true, error: "demo_busy" },
};

if (!CHECK) {
  for (const [name, body] of Object.entries(FIXTURES)) {
    await Deno.writeTextFile(new URL(name, DIR), JSON.stringify(body, null, 2) + "\n");
  }
  console.log(`wrote ${Object.keys(FIXTURES).length} fixtures`);
}

const problems: string[] = [];
const required = ["session_id", "session_status", "can_submit"];
for (const name of Object.keys(FIXTURES)) {
  const text = await Deno.readTextFile(new URL(name, DIR));
  if (!text.endsWith("\n")) problems.push(`${name}: missing trailing newline`);
  const parsed = JSON.parse(text);
  if (text.includes('"pending_transcript"')) problems.push(`${name}: competing field name`);
  if (name.startsWith("question-adaptive") && !("options" in (parsed as object))) problems.push(`${name}: missing options`);
}
const start = JSON.parse(await Deno.readTextFile(new URL("start-session.json", DIR)));
for (const key of required) if (!(key in start)) problems.push(`start-session.json: missing ${key}`);
const declined = JSON.parse(JSON.stringify(draft)).patient.gender;
if (declined.status !== "declined" || declined.value !== null) problems.push("draft-report.json: gender declined invariant");

if (problems.length) { for (const p of problems) console.error(`FAIL ${p}`); Deno.exit(1); }
console.log(`VALID ${Object.keys(FIXTURES).length} fixtures`);
