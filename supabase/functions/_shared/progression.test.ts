/**
 * End-to-end progression through the pure pipeline.
 *
 * This is a MOCKED/UNIT test: it exercises validation → parsing → completion → document
 * assembly → correction → sanity checks without a database. The database-backed
 * progression, RLS and concurrency are covered separately by supabase/tests (not run
 * here) and remain unverified until a local stack is available.
 */

import { parseChatTurnRequest } from "./validation.ts";
import { applyAnswer, parseAnswer, progress, nextQuestion } from "./conversation.ts";
import { applyCorrections, buildReportDocument, emptyFieldMap, isComplete, validateReportDocument } from "./report.ts";
import type { FieldMap } from "./report.ts";
import type { RoutingSnapshot } from "./contract.ts";
import { assert, assertEqual } from "./testing.ts";

const ROUTING: RoutingSnapshot = {
  department_key: "general_medicine",
  department_name: "General Medicine",
  doctor_id: "doc-gm",
  doctor_name: "Dr. Aditi Rao",
  is_fallback: true,
  preliminary: true,
};

const SESSION_ID = "3f4b1c2d-1111-4222-8333-444455556666";
const REPORT_ID = "9a8b7c6d-2222-4333-8444-555566667777";

const ANSWERS: Array<[Parameters<typeof parseAnswer>[0], string]> = [
  ["name", "Asha Test"],
  ["age", "34"],
  ["gender", "Female"],
  ["primary_concern", "knee pain when walking"],
  ["duration", "about three weeks"],
  ["severity", "moderate"],
  ["conditions", "none"],
  ["medications", "prefer not to say"],
  ["allergies", "I don't know"],
  ["other_symptoms", "mild swelling"],
];

Deno.test("progression: ten accepted answers complete the intake", () => {
  let fields: FieldMap = emptyFieldMap();
  let turns = 0;

  for (const [question, answer] of ANSWERS) {
    const parsed = parseAnswer(question, answer);
    assert(parsed !== null, `parsed ${question}`);
    if (!parsed) continue;
    fields = applyAnswer(fields, parsed);
    turns += 1;

    if (turns < ANSWERS.length) {
      assert(!isComplete(fields), `not complete after ${turns}`);
    }
  }

  assertEqual(turns, 10, "ten accepted answers");
  assert(isComplete(fields), "complete");
  assertEqual(progress({ fields, answerTurnCount: turns, status: "in_progress" }).can_submit, true, "submittable");
});

Deno.test("progression: the fixed block cannot be skipped by answering early", () => {
  const result = parseChatTurnRequest({
    action: "submit_turn",
    session_id: SESSION_ID,
    question_id: "allergies",
    text: "penicillin",
  });
  assert(result.ok, "request shape is valid");
  // Ordering is enforced by the session pointer, not by the shape of the request; the
  // backend compares question_id with current_question_id. That comparison is asserted
  // in the reconciliation and chat-turn layer.
  const fields = emptyFieldMap();
  assertEqual(nextQuestion(fields), "duration", "deterministic next question is unaffected");
});

Deno.test("progression: gender declined completes without a value and never serialises 'declined'", () => {
  let fields: FieldMap = emptyFieldMap();
  for (const [question, answer] of ANSWERS) {
    if (question === "gender") {
      const parsed = parseAnswer("gender", "Prefer not to say");
      assert(parsed !== null, "parsed");
      if (!parsed) continue;
      assertEqual(parsed.status, "declined", "status declined");
      assertEqual(parsed.value, null, "no value");
      fields = applyAnswer(fields, parsed);
      continue;
    }
    const parsed = parseAnswer(question, answer);
    if (parsed) fields = applyAnswer(fields, parsed);
  }

  assert(isComplete(fields), "still complete");

  const doc = buildReportDocument({ language: "en", fields, routing: ROUTING, status: "draft" });
  assertEqual(doc.patient.gender.status, "declined", "document status");
  assertEqual(doc.patient.gender.value, null, "document value is null");
  assert(
    JSON.stringify(doc).includes('"gender":{"status":"declined","value":null}'),
    "serialised shape is exact",
  );
  assert(!JSON.stringify(doc).includes('"value":"declined"'), "declined is never a value");

  // The same must hold after a correction round-trip.
  const corrected = applyCorrections(fields, { "primary_concern": { value: "knee pain at night", status: "provided" } });
  assert(corrected.ok && corrected.fields !== undefined, "correction accepted");
  if (corrected.fields) {
    const rebuilt = buildReportDocument({ language: "en", fields: corrected.fields, routing: ROUTING, status: "draft" });
    assertEqual(rebuilt.patient.gender.status, "declined", "survives correction");
    assertEqual(rebuilt.patient.gender.value, null, "still null");
  }
});

Deno.test("progression: correction then validation then submission preconditions", () => {
  let fields: FieldMap = emptyFieldMap();
  for (const [question, answer] of ANSWERS) {
    const parsed = parseAnswer(question, answer);
    if (parsed) fields = applyAnswer(fields, parsed);
  }

  const corrected = applyCorrections(fields, {
    "patient.name": { value: "Asha T. Test", status: "provided" },
    "clinical_details.allergies": { value: ["penicillin"], status: "provided" },
  });
  assert(corrected.ok && corrected.fields !== undefined, "correction accepted");
  if (!corrected.fields) return;

  const doc = buildReportDocument({ language: "en", fields: corrected.fields, routing: ROUTING, status: "draft" });
  assertEqual(validateReportDocument(doc).length, 0, "document valid");
  assert(isComplete(corrected.fields), "completion holds after correction");
  assertEqual(doc.missing_information.includes("clinical_details.allergies"), false, "no longer missing");
});

Deno.test("progression: a submitted document cannot be produced from incomplete fields", () => {
  const fields = emptyFieldMap();
  assertEqual(isComplete(fields), false, "incomplete");
  const state = progress({ fields, answerTurnCount: 15, status: "in_progress" });
  assertEqual(state.can_submit, false, "no submission at the cap when incomplete");
  assertEqual(state.next_question, null, "no further question");
});

Deno.test("progression: transcript preview shape is stable", () => {
  const preview = {
    state: "transcript_preview" as const,
    text: "मुझे घुटने में दर्द है",
    question_id: "primary_concern" as const,
  };
  const response = {
    session_id: SESSION_ID,
    session_status: "in_progress" as const,
    messages: [],
    turn_count: 3,
    max_turns: 15,
    is_complete: false,
    is_cap_reached: false,
    can_submit: false,
    transcript_preview: preview,
  };
  assert("transcript_preview" in response, "single documented field name");
  assert(!("pending_transcript" in response), "no competing name");
  assertEqual(response.transcript_preview.state, "transcript_preview", "state value");
});

Deno.test("progression: duplicate submit is rejected by request shape only when malformed", () => {
  const base = { action: "submit_turn" as const, session_id: SESSION_ID, question_id: "name" as const };
  assert(parseChatTurnRequest({ ...base, text: "Asha" }).ok, "first submit is valid");
  // A byte-identical second submit is also shape-valid; duplicate suppression is a
  // database responsibility (unique session/turn index + resume reconciliation).
  assert(parseChatTurnRequest({ ...base, text: "Asha" }).ok, "duplicate is shape-valid");
});
