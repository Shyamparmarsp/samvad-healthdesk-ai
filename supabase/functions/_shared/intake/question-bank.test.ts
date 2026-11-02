import {
  BANK_VERSION, DEPARTMENT_KEYS, QUESTIONS, QUESTIONS_BY_ID, getQuestion, localizedOptions,
  questionText, retrieveCandidates, validateBank,
} from "./question-bank.ts";
import { MAX_ADAPTIVE_QUESTIONS, selectAdaptiveQuestion } from "./select.ts";
import { assert, assertEqual } from "../testing.ts";

Deno.test("bank: exactly 150 unique questions, 30 per department", () => {
  assertEqual(QUESTIONS.length, 150, "total");
  assertEqual(new Set(QUESTIONS.map((q) => q.id)).size, 150, "unique ids");
  for (const department of DEPARTMENT_KEYS) {
    assertEqual(QUESTIONS.filter((q) => q.department === department).length, 30, department);
  }
  assertEqual(BANK_VERSION, "question-bank-v2", "bank version");
});

Deno.test("bank: GM-002 keeps the owner-supplied bilingual options", () => {
  const question = getQuestion("GM-002");
  assert(question !== null, "GM-002 exists");
  assertEqual(question!.options.length, 2, "option count");
  assertEqual(question!.options[0].value, "constant", "first value");
  assertEqual(question!.options[0].en, "Constant", "first English");
  assertEqual(question!.options[0].hi, "लगातार", "first Hindi");
  assertEqual(question!.options[1].value, "intermittent", "second value");
  assertEqual(question!.options[1].en, "Comes and goes", "second English");
  assertEqual(question!.options[1].hi, "आता-जाता है", "second Hindi");
  assertEqual(localizedOptions("GM-002", "en").join(" | "), "Constant | Comes and goes", "English list");
  assertEqual(localizedOptions("GM-002", "hi").join(" | "), "लगातार | आता-जाता है", "Hindi list");
});

Deno.test("bank: GM-001 keeps its owner-supplied wording", () => {
  assertEqual(questionText("GM-001", "en"), "When did the fever start?", "english");
  assertEqual(questionText("GM-001", "hi"), "बुखार कब शुरू हुआ?", "hindi");
});

Deno.test("bank: 150 questions carry 300 language variants", () => {
  const variants = QUESTIONS.flatMap((q) => [q.en, q.hi]);
  assertEqual(variants.length, 300, "variants");
  assert(variants.every((text) => text.trim().length > 0), "no blank variants");
  for (const question of QUESTIONS) {
    assert(question.en !== question.hi, `${question.id}: languages must differ`);
  }
});

Deno.test("bank: structural validation passes", () => {
  const problems = validateBank();
  assertEqual(problems.length, 0, problems.join("; "));
});

Deno.test("bank: validation rejects a broken entry", () => {
  const broken = [{
    ...QUESTIONS[0],
    id: "GM-999",
    hi: "English only",
    field: "not_a_field",
    answerType: "single_choice" as const,
    options: [],
  }];
  const problems = validateBank(broken as never);
  assert(problems.some((p) => p.includes("not Devanagari")), "hindi check");
  // Option 3: non-report fields are legal; a malformed field name is still rejected.
  const malformed = QUESTIONS.map((q, index) =>
    index === 0 ? { ...q, field: "not-a-report-field" } : q,
  );
  assert(validateBank(malformed).some((p) => p.includes("invalid report field")), "field check");
  assert(problems.some((p) => p.includes("at least two options")), "option check");
});

Deno.test("bank: same id yields paired texts and stable identity", () => {
  for (const id of ["GM-001", "ORTH-015", "CARD-030"]) {
    assert(questionText(id, "en") !== questionText(id, "hi"), `${id} texts differ`);
    assertEqual(getQuestion(id)?.id, id, "identity stable");
  }
  assertEqual(questionText("GM-001", "en"), "When did the fever start?", "english");
  assertEqual(questionText("GM-001", "hi"), "बुखार कब शुरू हुआ?", "hindi");
  assertEqual(questionText("GM-404", "en"), null, "unknown id");
});

Deno.test("bank: localized options exist for choice questions", () => {
  const choice = QUESTIONS.filter((q) => q.answerType === "single_choice");
  assert(choice.length >= 10, "there are choice questions");
  for (const question of choice) {
    const en = localizedOptions(question.id, "en");
    const hi = localizedOptions(question.id, "hi");
    assertEqual(en.length, hi.length, `${question.id} option counts`);
    assert(en.every((label) => label.length > 0), `${question.id} english options`);
    assert(hi.every((label) => /[\u0900-\u097F]/.test(label)), `${question.id} hindi options`);
  }
});

Deno.test("retrieval: by department and symptom tags", () => {
  const chest = retrieveCandidates({ department: "cardiology", tags: ["chest"] });
  assert(chest.length > 0 && chest.length <= 8, "bounded candidate set");
  assert(chest.every((q) => q.department === "cardiology"), "department filter");
  assert(chest[0].tags.includes("chest"), "tag relevance first");

  const knee = retrieveCandidates({ department: "orthopedics", tags: ["injury"] });
  assert(knee.some((q) => q.id === "ORTH-002"), "injury question surfaced");
});

Deno.test("retrieval: missing report fields boost relevance", () => {
  const byField = retrieveCandidates({ department: "dermatology", tags: ["itch"], missingFields: ["clinical_details.severity"] });
  assert(byField.length > 0, "candidates found");
  assert(byField[0].field === "clinical_details.severity" || byField.some((q) => q.field === "clinical_details.severity"), "severity question present");
});

Deno.test("retrieval: previously asked questions are excluded", () => {
  const first = retrieveCandidates({ department: "general_medicine", tags: ["fever"] });
  const asked = first.slice(0, 2).map((q) => q.id);
  const again = retrieveCandidates({ department: "general_medicine", tags: ["fever"], askedIds: asked });
  for (const id of asked) assert(!again.some((q) => q.id === id), `asked ${id} not repeated`);
});

Deno.test("retrieval: respects the 8-candidate ceiling and 0 matches", () => {
  const many = retrieveCandidates({ department: "cardiology", tags: ["chest", "pain", "breathing"] });
  assert(many.length <= 8, "capped at 8");
  assertEqual(retrieveCandidates({ department: "cardiology", tags: ["unlikely-tag"] }).length, 0, "no matches");
});

function groqStub(content: string | null, status = 200): typeof fetch {
  return ((_input: RequestInfo | URL) =>
    Promise.resolve(content === null
      ? new Response("{}", { status })
      : new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status, headers: { "content-type": "application/json" } }))) as typeof fetch;
}

const CANDIDATES = retrieveCandidates({ department: "cardiology", tags: ["chest"] });
const OPTS = { apiKey: "stub", timeoutMs: 50 };

Deno.test("selection: accepts an id inside the candidate set", async () => {
  const chosen = CANDIDATES[1].id;
  const result = await selectAdaptiveQuestion({ ...OPTS, fetchImpl: groqStub(JSON.stringify({ question_id: chosen })) }, CANDIDATES, "chest discomfort");
  assertEqual(result?.id, chosen, "model choice honoured");
  assertEqual(result?.source, "model", "source");
});

Deno.test("selection: rejects an id outside the candidate set and malformed output", async () => {
  const outside = await selectAdaptiveQuestion({ ...OPTS, fetchImpl: groqStub('{"question_id":"GM-001"}') }, CANDIDATES, "chest");
  assertEqual(outside?.source, "fallback", "outside id rejected");
  assert(CANDIDATES.some((q) => q.id === outside?.id), "fallback stays in the candidate set");

  const malformed = await selectAdaptiveQuestion({ ...OPTS, fetchImpl: groqStub("not json") }, CANDIDATES, "chest");
  assertEqual(malformed?.source, "fallback", "malformed JSON falls back");

  const extra = await selectAdaptiveQuestion({ ...OPTS, fetchImpl: groqStub(JSON.stringify({ question_id: CANDIDATES[0].id, text: "invented question" })) }, CANDIDATES, "chest");
  assertEqual(extra?.source, "fallback", "extra fields rejected");
});

Deno.test("selection: provider failure, timeout and missing key fall back deterministically", async () => {
  assertEqual((await selectAdaptiveQuestion({ ...OPTS, fetchImpl: groqStub(null, 500) }, CANDIDATES, "chest"))?.source, "fallback", "500");
  assertEqual((await selectAdaptiveQuestion({ ...OPTS, fetchImpl: groqStub(null, 429) }, CANDIDATES, "chest"))?.source, "fallback", "429");
  const aborted = new Error("aborted");
  aborted.name = "AbortError";
  assertEqual((await selectAdaptiveQuestion({ ...OPTS, fetchImpl: (() => Promise.reject(aborted)) as unknown as typeof fetch }, CANDIDATES, "chest"))?.source, "fallback", "timeout");
  assertEqual((await selectAdaptiveQuestion({ apiKey: "" }, CANDIDATES, "chest"))?.source, "fallback", "no key");
  assertEqual(await selectAdaptiveQuestion(OPTS, [], "chest"), null, "no candidates");
});

Deno.test("selection: the model can never supply question text", async () => {
  const result = await selectAdaptiveQuestion({ ...OPTS, fetchImpl: groqStub(JSON.stringify({ question_id: CANDIDATES[0].id })) }, CANDIDATES, "chest");
  const question = getQuestion(result!.id)!;
  assertEqual(questionText(question.id, "en"), question.en, "text comes from the bank, not the model");
  assertEqual(MAX_ADAPTIVE_QUESTIONS, 3, "adaptive cap");
});

Deno.test("safety: the bank never carries diagnosis or advice wording", () => {
  const forbidden = /\b(diagnos|prescrib|risk score|probability|you should|take .{0,20}tablet)\b/i;
  for (const question of QUESTIONS) {
    assert(!forbidden.test(question.en), `${question.id}: unsafe English wording`);
  }
});
