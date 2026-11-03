/**
 * Repetition safeguards for adaptive selection.
 *
 * The owner observed questions being repeated. Retrieval already excludes exact ids that
 * were asked, but the v2 bank holds several questions per topic and per report field, so a
 * second "duration" or "other symptoms" question could still be chosen. These tests pin the
 * deterministic filters that make a repeat impossible unless the flow explicitly needs a
 * clarification (which uses its own fixed question id, not the bank).
 */

import { QUESTIONS, retrieveCandidates } from "./intake/question-bank.ts";
import { eligibleCandidates, MAX_ADAPTIVE_QUESTIONS } from "./intake/select.ts";
import { assert, assertEqual } from "./testing.ts";

Deno.test("repetition: a field the session already handled is never offered again", () => {
  const candidates = retrieveCandidates({
    department: "general_medicine",
    tags: ["fever"],
    missingFields: ["clinical_details.duration"],
  });
  assert(candidates.some((question) => question.field === "clinical_details.duration"), "baseline offers duration");

  const eligible = eligibleCandidates(candidates, {
    handledFields: ["clinical_details.duration"],
  });
  assert(
    !eligible.some((question) => question.field === "clinical_details.duration"),
    "handled duration is excluded",
  );
});

Deno.test("repetition: declined and unknown answers count as handled", () => {
  // A declined answer is stored with status "declined". The field is answered (the patient
  // refused), so asking a differently-worded duration question again is repetition.
  const candidates = retrieveCandidates({ department: "general_medicine", tags: ["fever"] });
  assert(candidates.length > 1, "baseline candidates");

  const eligible = eligibleCandidates(candidates, {
    handledFields: ["clinical_details.duration", "clinical_details.severity"],
  });
  assertEqual(
    eligible.some((question) => question.field === "clinical_details.duration"),
    false,
    "duration excluded",
  );
  assertEqual(
    eligible.some((question) => question.field === "clinical_details.severity"),
    false,
    "severity excluded",
  );
});

Deno.test("repetition: one shared field stops a whole family of near-duplicate questions", () => {
  // GM-004 … GM-008 all fill clinical_details.other_symptoms. Answering any one of them
  // must end that family instead of asking four more "any other symptoms?" variants.
  const family = QUESTIONS.filter(
    (question) => question.department === "general_medicine" && question.field === "clinical_details.other_symptoms",
  );
  assert(family.length >= 3, "the bank really has several questions for this field");

  const eligible = eligibleCandidates(family, { handledFields: ["clinical_details.other_symptoms"] });
  assertEqual(eligible.length, 0, "no other-symptoms question can be chosen again");
});

Deno.test("repetition: a covered topic is excluded even for a different field", () => {
  const fever = retrieveCandidates({ department: "general_medicine", tags: ["fever"] });
  assert(fever.some((question) => question.topic === "fever"), "baseline fever question");

  const eligible = eligibleCandidates(fever, { askedTopics: ["fever"] });
  assertEqual(
    eligible.some((question) => question.topic === "fever"),
    false,
    "topic covered",
  );
});

Deno.test("repetition: filtering keeps the approved ranking of the remaining questions", () => {
  const ranked = retrieveCandidates({ department: "general_medicine", tags: ["fever"] });
  const eligible = eligibleCandidates(ranked, { handledFields: ["clinical_details.duration"] });
  const expected = ranked.filter((question) => question.field !== "clinical_details.duration");
  assertEqual(eligible.map((q) => q.id).join(","), expected.map((q) => q.id).join(","), "order preserved");
});

Deno.test("repetition: already-asked ids stay excluded after filtering", () => {
  const candidates = retrieveCandidates({
    department: "general_medicine",
    tags: ["fever"],
    askedIds: ["GM-001", "GM-003"],
  });
  const eligible = eligibleCandidates(candidates);
  assert(!eligible.some((q) => q.id === "GM-001"), "asked id excluded");
  assert(!eligible.some((q) => q.id === "GM-003"), "asked id excluded");
});

Deno.test("repetition: the adaptive budget is unchanged", () => {
  assertEqual(MAX_ADAPTIVE_QUESTIONS, 3, "still at most three adaptive questions");
});

Deno.test("repetition: no candidate is invented when everything is covered", () => {
  const candidates = retrieveCandidates({ department: "general_medicine", tags: ["fever"] });
  const handledFields = [...new Set(candidates.map((question) => question.field))];
  const askedTopics = candidates.map((question) => question.topic);
  const eligible = eligibleCandidates(candidates, { handledFields, askedTopics });
  assertEqual(eligible.length, 0, "nothing left to ask");
});
