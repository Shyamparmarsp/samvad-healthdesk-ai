/**
 * Focused adaptive-retrieval certification.
 *
 * The retrieval layer is deterministic and metadata-only. These tests pin the ranking,
 * exclusion, eligibility and fallback rules, including the 50 bank-v2 questions whose
 * fields are outside report v1.2.
 */

import {
  DEPARTMENT_KEYS,
  QUESTIONS,
  retrieveCandidates,
} from "./question-bank.ts";
import { MAX_ADAPTIVE_QUESTIONS, selectAdaptiveQuestion } from "./select.ts";
import { assert, assertEqual } from "../testing.ts";

const REPORT_FIELDS = new Set([
  "patient.name",
  "patient.age",
  "patient.gender",
  "primary_concern",
  "clinical_details.duration",
  "clinical_details.severity",
  "clinical_details.conditions",
  "clinical_details.medications",
  "clinical_details.allergies",
  "clinical_details.other_symptoms",
]);

const conversationLevel = QUESTIONS.filter((question) => !REPORT_FIELDS.has(question.field));

Deno.test("retrieval: department relevance is absolute", () => {
  for (const department of DEPARTMENT_KEYS) {
    const sample = QUESTIONS.find((question) => question.department === department);
    assert(Boolean(sample), `${department} has a question`);
    const result = retrieveCandidates({ department, tags: [sample!.tags[0]] });
    assert(result.length > 0, `${department} has candidates`);
    assert(result.every((question) => question.department === department), `${department} filter`);
  }
});

Deno.test("retrieval: tag overlap is the primary relevance signal", () => {
  const chest = retrieveCandidates({ department: "cardiology", tags: ["chest"] });
  assert(chest.length > 0, "chest candidates");
  assert(chest.every((question) => question.tags.includes("chest")), "only chest-tagged questions");
});

Deno.test("retrieval: a missing report field adds relevance without inventing a match", () => {
  const severity = retrieveCandidates({
    department: "general_medicine",
    tags: [],
    missingFields: ["clinical_details.severity"],
  });
  assert(severity.length > 0, "severity candidates");
  assert(severity.every((question) => question.field === "clinical_details.severity"), "field-only match");
});

Deno.test("retrieval: ranking is score-descending, then id-ascending", () => {
  const ranked = retrieveCandidates({
    department: "general_medicine",
    tags: ["fever"],
    missingFields: ["clinical_details.severity"],
  });
  // GM-003 matches fever + missing severity (3), GM-001 and GM-002 match fever (2),
  // with GM-001 before GM-002 on the id tie-break.
  assertEqual(ranked[0].id, "GM-003", "highest score first");
  assertEqual(ranked[1].id, "GM-001", "id tie-break");
  assertEqual(ranked[2].id, "GM-002", "id tie-break");
});

Deno.test("retrieval: already-asked and duplicate ids are excluded", () => {
  const first = retrieveCandidates({ department: "general_medicine", tags: ["fever"] });
  assert(first.length > 0, "baseline candidates");
  const asked = [first[0].id, first[0].id, first[1]?.id].filter(Boolean) as string[];
  const again = retrieveCandidates({
    department: "general_medicine",
    tags: ["fever"],
    askedIds: asked,
  });
  for (const id of asked) assert(!again.some((question) => question.id === id), `${id} excluded`);
  assertEqual(new Set(again.map((question) => question.id)).size, again.length, "no duplicate candidates");
});

Deno.test("retrieval: all 150 questions remain eligible when their own tags are relevant", () => {
  for (const question of QUESTIONS) {
    const asked = QUESTIONS.filter((entry) => entry.id !== question.id).map((entry) => entry.id);
    const result = retrieveCandidates({
      department: question.department,
      tags: question.tags,
      askedIds: asked,
    });
    assert(result.some((entry) => entry.id === question.id), `${question.id} must remain eligible`);
  }
});

Deno.test("retrieval: all 50 conversation-level questions remain eligible", () => {
  assertEqual(conversationLevel.length, 50, "conversation-level question pool");
  for (const question of conversationLevel) {
    const asked = QUESTIONS.filter((entry) => entry.id !== question.id).map((entry) => entry.id);
    const result = retrieveCandidates({
      department: question.department,
      tags: question.tags,
      askedIds: asked,
    });
    assert(result.some((entry) => entry.id === question.id), `${question.id} (${question.field}) remains eligible`);
  }
});

Deno.test("retrieval: neutral field scores do not make every question eligible", () => {
  const allReportFields = [...REPORT_FIELDS];
  const result = retrieveCandidates({
    department: "general_medicine",
    tags: [],
    missingFields: allReportFields,
  });
  assert(result.length > 0, "report-field questions are eligible");
  assert(result.every((question) => REPORT_FIELDS.has(question.field)), "only report-field questions score");
  assert(!result.some((question) => conversationLevel.some((entry) => entry.id === question.id)), "conversation-level questions stay neutral");
});

Deno.test("retrieval: zero candidates has a safe null fallback", async () => {
  const none = retrieveCandidates({
    department: "cardiology",
    tags: ["definitely-not-a-real-tag"],
  });
  assertEqual(none.length, 0, "no neutral matches");
  assertEqual(await selectAdaptiveQuestion({ apiKey: "" }, none, "unmatched concern"), null, "no invented question");
});

Deno.test("retrieval: the fallback always stays inside the candidate set", async () => {
  const candidates = retrieveCandidates({ department: "cardiology", tags: ["chest"] });
  const picked = await selectAdaptiveQuestion({ apiKey: "" }, candidates, "chest discomfort");
  assert(picked !== null, "fallback exists when candidates exist");
  assert(candidates.some((question) => question.id === picked!.id), "fallback id is a candidate");
  assertEqual(picked!.source, "fallback", "deterministic source");
});

Deno.test("retrieval: candidate ceiling is eight and the adaptive cap is three", () => {
  const many = retrieveCandidates({
    department: "cardiology",
    tags: ["chest", "pain", "breathing"],
  });
  assert(many.length > 0 && many.length <= 8, "eight-candidate ceiling");
  assertEqual(MAX_ADAPTIVE_QUESTIONS, 3, "three-adaptive-question limit");
});
