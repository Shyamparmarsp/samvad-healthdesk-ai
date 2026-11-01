import {
  applyAnswer,
  canAcceptAnswer,
  nextAdaptiveQuestion,
  nextFixedAfter,
  nextQuestion,
  parseAnswer,
  progress,
  MAX_ANSWER_TURNS,
} from "./conversation.ts";
import { emptyFieldMap, type FieldMap } from "./report.ts";
import { assert, assertEqual } from "./testing.ts";

function answered(fields: FieldMap, questionId: Parameters<typeof parseAnswer>[0], text: string): FieldMap {
  const parsed = parseAnswer(questionId, text);
  assert(parsed !== null, `parsed ${questionId}`);
  if (!parsed) return fields;
  return applyAnswer(fields, parsed);
}

function completeFields(): FieldMap {
  let fields = emptyFieldMap();
  fields["patient.name"] = { status: "provided", value: "Asha Test" };
  fields["patient.age"] = { status: "provided", value: 34 };
  fields["patient.gender"] = { status: "provided", value: "female" };
  fields.primary_concern = { status: "provided", value: "knee pain" };
  fields["clinical_details.duration"] = { status: "provided", value: "three weeks" };
  fields["clinical_details.severity"] = { status: "provided", value: "moderate" };
  fields["clinical_details.conditions"] = { status: "provided", value: [] };
  fields["clinical_details.medications"] = { status: "declined", value: null };
  fields["clinical_details.allergies"] = { status: "unknown", value: null };
  fields["clinical_details.other_symptoms"] = { status: "provided", value: ["swelling"] };
  return fields;
}

Deno.test("conversation: fixed order cannot be skipped", () => {
  assertEqual(nextFixedAfter("name"), "age", "name → age");
  assertEqual(nextFixedAfter("age"), "gender", "age → gender");
  assertEqual(nextFixedAfter("gender"), "primary_concern", "gender → concern");
  assertEqual(nextFixedAfter("primary_concern"), null, "concern ends the fixed block");
});

Deno.test("conversation: adaptive questions follow the declared order", () => {
  const fields = emptyFieldMap();
  assertEqual(nextAdaptiveQuestion(fields), "duration", "first adaptive");
  fields["clinical_details.duration"] = { status: "provided", value: "3 weeks" };
  assertEqual(nextAdaptiveQuestion(fields), "severity", "then severity");
});

Deno.test("conversation: a model preference is honoured only for an unasked approved field", () => {
  const fields = emptyFieldMap();
  assertEqual(nextQuestion(fields, { preferred: "allergies" }), "allergies", "approved preference honoured");

  const asked = { ...fields, "clinical_details.allergies": { status: "declined", value: null } } as FieldMap;
  assertEqual(nextQuestion(asked, { preferred: "allergies" }), "duration", "asked field ignored");

  assertEqual(nextQuestion(fields, { preferred: "greeting" }), "duration", "non-adaptive id ignored");
});

Deno.test("conversation: parsing recognises declined, unknown and none", () => {
  const declined = parseAnswer("medications", "prefer not to say");
  assertEqual(declined?.status, "declined", "declined");
  const unknown = parseAnswer("allergies", "I don't know");
  assertEqual(unknown?.status, "unknown", "unknown");
  const none = parseAnswer("conditions", "none");
  assertEqual(none?.status, "provided", "none is an answer");
  assertEqual(JSON.stringify(none?.value), "[]", "empty list");
  const hindiNone = parseAnswer("conditions", "कुछ नहीं");
  assertEqual(JSON.stringify(hindiNone?.value), "[]", "hindi none");
});

Deno.test("conversation: gender 'Prefer not to say' is a handled refusal", () => {
  const parsed = parseAnswer("gender", "Prefer not to say");
  assertEqual(parsed?.status, "declined", "declined status");
  assertEqual(parsed?.value, null, "no value, preserving the invariant");

  const male = parseAnswer("gender", "Male");
  assertEqual(male?.status, "provided", "explicit choice is provided");
  assertEqual(male?.value, "male", "value stored");
});

Deno.test("conversation: age must be a whole number", () => {
  assertEqual(parseAnswer("age", "34")?.value, 34, "digits");
  assertEqual(parseAnswer("age", "34 years")?.value, 34, "digits with unit");
  assertEqual(parseAnswer("age", "abc")?.status, "unclear", "letters are unclear");
  assertEqual(parseAnswer("age", "200")?.status, "unclear", "out of range");
});

Deno.test("conversation: list answers split on commas", () => {
  const parsed = parseAnswer("conditions", "high blood pressure, diabetes");
  assertEqual(JSON.stringify(parsed?.value), JSON.stringify(["high blood pressure", "diabetes"]), "split");
});

Deno.test("conversation: answers are written with the value/status invariant", () => {
  const fields = answered(emptyFieldMap(), "name", "Asha Test");
  assertEqual(fields["patient.name"].status, "provided", "status");
  assertEqual(fields["patient.name"].value, "Asha Test", "value");

  const declined = answered(fields, "allergies", "prefer not to say");
  assertEqual(declined["clinical_details.allergies"].status, "declined", "declined status");
  assertEqual(declined["clinical_details.allergies"].value, null, "no value");
});

Deno.test("conversation: progress before completion", () => {
  const result = progress({ fields: emptyFieldMap(), answerTurnCount: 3, status: "in_progress" });
  assertEqual(result.is_complete, false, "incomplete");
  assertEqual(result.can_submit, false, "cannot submit");
  assertEqual(result.next_question, "duration", "next adaptive question");
});

Deno.test("conversation: progress at the cap with a complete intake still allows submission", () => {
  const result = progress({ fields: completeFields(), answerTurnCount: 15, status: "in_progress" });
  assertEqual(result.is_complete, true, "complete");
  assertEqual(result.is_cap_reached, true, "cap");
  assertEqual(result.can_submit, true, "submission allowed");
});

Deno.test("conversation: progress at the cap with an incomplete intake is End-only", () => {
  const result = progress({ fields: emptyFieldMap(), answerTurnCount: 15, status: "in_progress" });
  assertEqual(result.is_complete, false, "incomplete");
  assertEqual(result.can_submit, false, "no submit");
  assertEqual(result.next_question, null, "no further question");
});

Deno.test("conversation: an emergency session can never submit", () => {
  const result = progress({ fields: completeFields(), answerTurnCount: 5, status: "emergency" });
  assertEqual(result.can_submit, false, "emergency blocks submission");
});

Deno.test("conversation: the 15-answer cap is enforced", () => {
  assertEqual(canAcceptAnswer(14, "in_progress"), true, "14 allowed");
  assertEqual(canAcceptAnswer(15, "in_progress"), false, "15 blocks");
  assertEqual(MAX_ANSWER_TURNS, 15, "constant");
  assertEqual(canAcceptAnswer(3, "ended"), false, "ended blocks");
  assertEqual(canAcceptAnswer(3, "declined"), false, "declined blocks");
});
