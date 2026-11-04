/**
 * Emergency-workflow regression tests (offline, no database, no provider).
 *
 * Two things are pinned here:
 *
 *   1. Execution order inside `chat-turn`: the deterministic matcher is evaluated on the
 *      patient-confirmed text before answer parsing, question selection, adaptive bank
 *      retrieval, Groq routing or draft generation. A model response therefore cannot
 *      override an emergency.
 *   2. The surrounding state machine that must not drift while the emergency path is
 *      maintained: 15-answer cap, adaptive budget, completion criteria, urgent_partial
 *      document shape and schema version.
 *
 * The live HTTP proof lives in supabase/tests/emergency-certification.ts.
 */

import { assert, assertEqual } from "./testing.ts";
import {
  MAX_ANSWER_TURNS,
  applyAnswer,
  canAcceptAnswer,
  nextQuestion,
  parseAnswer,
  progress,
} from "./conversation.ts";
import {
  MAX_ADAPTIVE_QUESTIONS,
} from "./intake/select.ts";
import {
  REPORT_SCHEMA_VERSION,
  buildReportDocument,
  emptyFieldMap,
  isComplete,
  templateSummary,
} from "./report.ts";
import { resolveEmergencyRouting, type DepartmentRecord, type DoctorRecord } from "./routing.ts";
import type { ReportDocumentV1 } from "./contract.ts";

const CHAT_TURN = await Deno.readTextFile(
  new URL("../chat-turn/index.ts", import.meta.url),
);
const REPORT_SOURCE = await Deno.readTextFile(new URL("./report.ts", import.meta.url));
const CONVERSATION_SOURCE = await Deno.readTextFile(new URL("./conversation.ts", import.meta.url));

function indexOfOrFail(source: string, needle: string): number {
  const index = source.indexOf(needle);
  assert(index >= 0, `missing from source: ${needle}`);
  return index;
}

Deno.test("workflow: the matcher runs before parsing, question selection and providers", () => {
  const turnStart = indexOfOrFail(CHAT_TURN, "async function handleSubmitTurn(");
  const turnEnd = indexOfOrFail(CHAT_TURN.slice(turnStart), "async function handleCorrectDraft(");
  const turn = CHAT_TURN.slice(turnStart, turnStart + turnEnd);

  const classify = indexOfOrFail(turn, "const match = classifyAnswer(text);");
  const parse = indexOfOrFail(turn, "const parsed = coreAnswerId ? parseAnswer(coreAnswerId, text) : null;");
  const nextFixed = indexOfOrFail(turn, "let nextId: string | null = nextQuestion(fields,");
  const adaptive = indexOfOrFail(turn, "nextId = await maybeAdaptiveQuestion(admin, session, fields,");
  const draft = indexOfOrFail(turn, "const document = await ensureDraftReport(admin, updated, fields);");

  assert(classify < parse, "classifyAnswer must precede answer parsing");
  assert(classify < nextFixed, "classifyAnswer must precede fixed/adaptive question selection");
  assert(classify < adaptive, "classifyAnswer must precede bank-question retrieval");
  assert(classify < draft, "classifyAnswer must precede draft generation");
});

Deno.test("workflow: a clear match returns before any normal-answer path", () => {
  const branchStart = indexOfOrFail(CHAT_TURN, 'if (match.kind === "clear") {');
  const branchEnd = indexOfOrFail(CHAT_TURN.slice(branchStart), "if (match.kind === \"ambiguous\") {");
  const branch = CHAT_TURN.slice(branchStart, branchStart + branchEnd);

  assert(branch.includes("respondWithEmergency("), "urgent response is produced inside the branch");
  assert(branch.includes("return await respondWithEmergency("), "branch returns immediately");
  for (const forbidden of ["parseAnswer(", "nextQuestion(", "maybeAdaptiveQuestion(", "suggestDepartment(", "ensureDraftReport("]) {
    assert(!branch.includes(forbidden), `clear branch must not reach ${forbidden}`);
  }
});

Deno.test("workflow: a clear trigger in the clarification answer is classified before yes/no", () => {
  const start = indexOfOrFail(CHAT_TURN, 'if (request.question_id === "emergency_clarification"');
  const end = indexOfOrFail(CHAT_TURN.slice(start), "// Deterministic emergency evaluation");
  const branch = CHAT_TURN.slice(start, start + end);

  const classify = indexOfOrFail(branch, "const clearInClarification = classifyAnswer(text);");
  const resolve = indexOfOrFail(branch, "const resolution = resolveClarification(text);");
  assert(classify < resolve, "clear classification must precede the yes/no parser");
  assert(branch.includes("clearInClarification.ruleId"), "the clear rule id is used");
  assert(branch.includes("return await respondWithEmergency("), "a clear trigger enters the urgent path");
});

Deno.test("workflow: the emergency transition clears the stale current question", () => {
  const start = indexOfOrFail(CHAT_TURN, "async function createEmergencyReport(");
  const end = indexOfOrFail(CHAT_TURN.slice(start), "async function respondWithEmergency(");
  const body = CHAT_TURN.slice(start, start + end);
  assert(body.includes("current_question_id: null"), "current_question_id must be cleared");
});

Deno.test("workflow: cap and terminal-state refusals are distinct", () => {
  const start = indexOfOrFail(CHAT_TURN, "async function handleSubmitTurn(");
  const end = indexOfOrFail(CHAT_TURN.slice(start), "async function handleCorrectDraft(");
  const body = CHAT_TURN.slice(start, start + end);
  const guard = indexOfOrFail(body, "if (!canAcceptAnswer(session.answer_turn_count, session.status)) {");
  const cap = indexOfOrFail(body, 'error: "turn_cap_reached"');
  const state = indexOfOrFail(body, 'error: "invalid_state"');
  assert(cap > guard, "cap refusal stays inside the guard");
  assert(state > guard, "terminal-state refusal stays inside the guard");
});

Deno.test("workflow: adaptive selection refuses emergency and submitted sessions", () => {
  const start = indexOfOrFail(CHAT_TURN, "async function maybeAdaptiveQuestion(");
  const end = indexOfOrFail(CHAT_TURN.slice(start), "async function ensureDraftReport(");
  const body = CHAT_TURN.slice(start, start + end);
  assert(
    body.includes('if (session.status === "emergency" || session.status === "submitted") return null;'),
    "emergency guard missing from adaptive selection",
  );
  assertEqual(MAX_ADAPTIVE_QUESTIONS, 5, "adaptive budget: five bank follow-ups after the ten-answer core");
});

Deno.test("workflow: urgent report creation is emergency-scoped and never submitted", () => {
  const start = indexOfOrFail(CHAT_TURN, "async function createEmergencyReport(");
  const end = indexOfOrFail(CHAT_TURN.slice(start), "async function respondWithEmergency(");
  const body = CHAT_TURN.slice(start, start + end);

  assert(body.includes("await emergencyRouting(admin)"), "uses the dedicated emergency routing helper");
  assert(!body.includes("await resolveRouting("), "never uses model/fallback routing");

  const helperStart = indexOfOrFail(CHAT_TURN, "async function emergencyRouting(");
  const helperEnd = indexOfOrFail(CHAT_TURN.slice(helperStart), "function mapMessages(");
  const helper = CHAT_TURN.slice(helperStart, helperStart + helperEnd);
  assert(helper.includes("resolveEmergencyRouting("), "helper resolves the seeded Emergency doctor");
  assert(!helper.includes("suggestDepartment("), "helper never calls a model");
  assert(body.includes('status: "urgent_partial"'), "writes urgent_partial");
  assert(body.includes('department_key: "emergency"'), "routes to Emergency");
  assert(body.includes("possible_urgent: false"), "does not re-use the model urgency flag");
  assert(body.includes('update({ status: "emergency"') || body.includes("status: \"emergency\""), "marks the session ended");
  assert(!body.includes("submitted_at:"), "never writes submitted_at");
});

Deno.test("workflow: submit_report rejects an emergency session", () => {
  const start = indexOfOrFail(CHAT_TURN, "async function handleSubmitReport(");
  const end = indexOfOrFail(CHAT_TURN.slice(start), "export default {");
  const body = CHAT_TURN.slice(start, start + end);
  assert(body.includes('if (session.status === "emergency") throw new AppError("invalid_state");'), "missing emergency guard");
});

Deno.test("workflow: no notification, dispatch or treatment claim exists in the backend paths", () => {
  const claim = /notified|dispatched|ambulance|called 112|emergency services were/i;
  for (const [label, source] of [
    ["chat-turn", CHAT_TURN],
    ["report", REPORT_SOURCE],
  ] as const) {
    assert(!claim.test(source), `${label} contains a notification/dispatch/advice claim`);
  }
});

Deno.test("workflow: can_submit is false for an emergency session even when complete", () => {
  const fields = completeFields();
  const state = progress({ fields, answerTurnCount: 8, status: "emergency" });
  assertEqual(state.can_submit, false, "emergency can never submit");
  assertEqual(progress({ fields, answerTurnCount: 8, status: "in_progress" }).can_submit, true, "normal complete can submit");
});

Deno.test("workflow: the 15-answer cap and its End-only preview are unchanged", () => {
  assertEqual(MAX_ANSWER_TURNS, 15, "cap unchanged");
  const incomplete = partiallyCompleteFields();
  const complete = completeFields();

  assertEqual(canAcceptAnswer(14, "in_progress"), true, "turn 14 accepted");
  assertEqual(canAcceptAnswer(15, "in_progress"), false, "turn 16 refused");
  assertEqual(canAcceptAnswer(0, "emergency"), false, "emergency refuses answers");
  assertEqual(canAcceptAnswer(0, "ended"), false, "ended refuses answers");

  const cappedIncomplete = progress({ fields: incomplete, answerTurnCount: 15, status: "in_progress" });
  assertEqual(cappedIncomplete.is_cap_reached, true, "cap flag");
  assertEqual(cappedIncomplete.can_submit, false, "incomplete cap cannot submit");
  assertEqual(cappedIncomplete.next_question, null, "incomplete cap offers no next question");

  const cappedComplete = progress({ fields: complete, answerTurnCount: 15, status: "in_progress" });
  assertEqual(cappedComplete.can_submit, true, "complete at cap may still submit");
});

Deno.test("workflow: completion criteria are unchanged", () => {
  const complete = completeFields();
  assertEqual(isComplete(complete), true, "complete fields");
  assertEqual(isComplete(partiallyCompleteFields()), false, "missing required field");

  const genderDeclined = completeFields({ "patient.gender": { status: "declined", value: null } });
  assertEqual(isComplete(genderDeclined), true, "declined gender is handled (RD-06)");

  const listNotAsked = completeFields({ "clinical_details.allergies": { status: "not_asked", value: null } });
  assertEqual(isComplete(listNotAsked), false, "each ask-once field must be asked");
});

Deno.test("workflow: fixed order then scripted adaptive order is unchanged", () => {
  assertEqual(nextQuestion(emptyFieldMap(), { afterFixed: "name" }), "age", "name→age");
  assertEqual(nextQuestion(emptyFieldMap(), { afterFixed: "age" }), "gender", "age→gender");
  assertEqual(nextQuestion(emptyFieldMap(), { afterFixed: "gender" }), "primary_concern", "gender→concern");
  assertEqual(nextQuestion(emptyFieldMap(), { afterFixed: "primary_concern" }), "duration", "concern→duration");
  assertEqual(nextQuestion(emptyFieldMap()), "duration", "first adaptive");
});

Deno.test("workflow: urgent_partial document carries no summary and keeps schema version 1", () => {
  const routing = emergencyRouting();
  const document = buildReportDocument({
    language: "en",
    fields: partiallyCompleteFields(),
    routing,
    status: "urgent_partial",
    emergency: {
      rule_id: "breathing_emergency",
      patient_statement: "synthetic",
      triggered_at: "2026-11-02T00:00:00.000Z",
    },
    summary: templateSummary(completeFields()),
  });

  assertEqual(document.schema_version, REPORT_SCHEMA_VERSION, "schema version");
  assertEqual(REPORT_SCHEMA_VERSION, 1, "schema version constant");
  assertEqual(document.summary, null, "urgent partial has no summary (RD-10)");
  assertEqual(document.routing_snapshot.department_key, "emergency", "emergency routing");
  assertEqual(document.emergency?.rule_id, "breathing_emergency", "rule id kept");
  assertEqual(document.primary_concern.status, "not_asked", "unreached field stays explicit");
});

Deno.test("workflow: a normal draft still has a non-clinical template summary", () => {
  const fields = completeFields();
  const summary = templateSummary(fields);
  assert(summary !== null, "normal summary exists");
  if (!summary) return;
  assert(summary.source === "template", "template source");
  assert(summary.generated_from.length > 0, "cites fields");
  const prohibited = /diagnos|prescrib|treatment|take .* medicine|you should/i;
  assert(!prohibited.test(summary.text), `summary contains advice-like wording: ${summary.text}`);
});

Deno.test("workflow: conversation module has no emergency-specific completion shortcut", () => {
  // The urgent path is owned by chat-turn; the state machine must not gain a second one.
  assert(!CONVERSATION_SOURCE.includes("urgent_partial"), "conversation.ts must not write report status");
  assert(!CONVERSATION_SOURCE.includes("classifyAnswer"), "conversation.ts must not duplicate the matcher");
});

/* -------------------------------------------------------------------------- */

function completeFields(overrides: Record<string, { status: string; value: unknown }> = {}) {
  let fields = emptyFieldMap();
  const answers: Array<[string, string]> = [
    ["name", "Synthetic Patient"],
    ["age", "34"],
    ["gender", "Female"],
    ["primary_concern", "my knee hurts when I walk"],
    ["duration", "two weeks"],
    ["severity", "mild"],
    ["conditions", "none"],
    ["medications", "none"],
    ["allergies", "none"],
    ["other_symptoms", "none"],
  ];
  for (const [questionId, text] of answers) {
    const parsed = parseAnswer(questionId as never, text);
    assert(parsed !== null, `parse failed for ${questionId}`);
    if (parsed) fields = applyAnswer(fields, parsed);
  }
  for (const [key, value] of Object.entries(overrides)) {
    (fields as Record<string, unknown>)[key] = value;
  }
  return fields;
}

function partiallyCompleteFields() {
  const fields = completeFields();
  return {
    ...fields,
    "primary_concern": { status: "not_asked" as const, value: null },
  };
}

function emergencyRouting() {
  const departments: DepartmentRecord[] = [
    { key: "emergency", name: "Emergency", booking_enabled: false, is_emergency: true },
    { key: "general_medicine", name: "General Medicine", booking_enabled: true, is_emergency: false },
  ];
  const doctors: DoctorRecord[] = [
    { id: "00000000-0000-4000-8000-000000000001", display_name: "Dr. Emergency", department_key: "emergency" },
  ];
  return resolveEmergencyRouting(departments, doctors);
}

// Keep the document type referenced so a contract change breaks this test file.
const _documentShape: ReportDocumentV1 | null = null;
void _documentShape;
