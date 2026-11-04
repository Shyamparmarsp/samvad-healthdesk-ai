/**
 * Continuation past the tenth answer, and the spoken system messages.
 *
 * The production defect: after the ten scripted answers, a declined core field emptied the
 * candidate pool (every remaining candidate targeted an already-handled report field), so
 * the selector returned null at turn 10 and the UI showed a dead end. These tests pin the
 * corrected behaviour: conversation-level bank questions keep the intake going to 15, no id
 * or topic repeats, the department stays relevant, and completion copy is exact.
 */

import { assert, assertEqual } from "./testing.ts";
import { applyAnswer, MAX_ANSWER_TURNS, parseAnswer } from "./conversation.ts";
import { emptyFieldMap, isComplete } from "./report.ts";
import { QUESTIONS, getQuestion, retrieveContinuationCandidates } from "./intake/question-bank.ts";
import { MAX_ADAPTIVE_QUESTIONS, canAskAdaptiveQuestion } from "./intake/select.ts";
import { SYSTEM_MESSAGES, isSystemMessageId, systemMessageText } from "./messages.ts";

const CORE: Array<[string, string]> = [
  ["name", "Asha"],
  ["age", "34"],
  ["gender", "Female"],
  ["primary_concern", "headache and fever for 3 days"],
  // The declined duration is exactly what used to end the conversation at turn 10.
  ["duration", "prefer not to say"],
  ["severity", "Moderate"],
  ["conditions", "None"],
  ["medications", "None"],
  ["allergies", "None"],
  ["other_symptoms", "None"],
];

function coreFields() {
  let fields = emptyFieldMap();
  for (const [question, answer] of CORE) {
    const parsed = parseAnswer(question as never, answer);
    assert(parsed !== null, `parsed ${question}`);
    fields = applyAnswer(fields, parsed!);
  }
  return fields;
}

Deno.test("continuation: the ten-answer core is not complete and offers no core question", () => {
  const fields = coreFields();
  assertEqual(isComplete(fields), false, "declined duration keeps the intake incomplete");
});

Deno.test("continuation: a declined core field no longer empties the candidate pool", () => {
  const fields = coreFields();
  const handled = (Object.keys(fields) as Array<keyof typeof fields>).filter((key) => fields[key].status !== "not_asked");
  const tags = String(fields.primary_concern.value).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);

  const candidates = retrieveContinuationCandidates({
    department: "general_medicine",
    tags,
    handledFields: handled,
    askedIds: [],
    askedTopics: [],
    seed: "session-a",
    limit: 6,
  });
  assert(candidates.length > 0, "candidates remain after the core");
  assert(
    candidates.every((candidate) => !(handled as string[]).includes(candidate.field)),
    "no handled report field is offered again",
  );
  const reportFields = ["patient.name", "patient.age", "patient.gender", "primary_concern",
    "clinical_details.duration", "clinical_details.severity", "clinical_details.conditions",
    "clinical_details.medications", "clinical_details.allergies", "clinical_details.other_symptoms"];
  assert(
    candidates.some((candidate) => !reportFields.includes(candidate.field)),
    "conversation-level questions are available for continuation",
  );
});

Deno.test("continuation: turns 11-15 are five distinct, relevant bank questions", () => {
  const fields = coreFields();
  const asked: string[] = [];
  const topics: string[] = [];
  const seed = "session-b";
  const tags = String(fields.primary_concern.value).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
  const handled = (Object.keys(fields) as Array<keyof typeof fields>).filter((key) => fields[key].status !== "not_asked");

  const picked: string[] = [];
  for (let turn = 11; turn <= 15; turn += 1) {
    assert(canAskAdaptiveQuestion(picked.length), `bank budget allows turn ${turn}`);
    const candidates = retrieveContinuationCandidates({
      department: "general_medicine",
      tags,
      handledFields: handled,
      askedIds: asked,
      askedTopics: topics,
      seed,
      limit: 6,
    });
    assert(candidates.length > 0, `a candidate exists for turn ${turn}`);
    const choice = candidates[0];
    picked.push(choice.id);
    asked.push(choice.id);
    topics.push(choice.topic);
  }

  assertEqual(picked.length, 5, "five continuation questions");
  assertEqual(new Set(picked).size, 5, "no question id repeats");
  assert(
    picked.every((id) => getQuestion(id)?.department === "general_medicine"),
    "every question belongs to the routed department",
  );
  assertEqual(CORE.length + picked.length, MAX_ANSWER_TURNS, "core + bank reaches exactly the 15-turn maximum");
  assertEqual(MAX_ADAPTIVE_QUESTIONS, 5, "bank budget is five");
});

Deno.test("continuation: equal-score questions rotate per session but stay stable within one", () => {
  const input = {
    department: "general_medicine" as const,
    tags: [] as string[],
    handledFields: [] as string[],
    askedIds: [] as string[],
    askedTopics: [] as string[],
    limit: 6,
  };
  const a = retrieveContinuationCandidates({ ...input, seed: "session-one" }).map((q) => q.id);
  const aAgain = retrieveContinuationCandidates({ ...input, seed: "session-one" }).map((q) => q.id);
  assertEqual(a.join(","), aAgain.join(","), "stable within a session");

  const seeds = ["s1", "s2", "s3", "s4", "s5"].map((seed) =>
    retrieveContinuationCandidates({ ...input, seed }).map((q) => q.id).join(",")
  );
  assert(new Set(seeds).size > 1, "different sessions can order the pool differently");
});

Deno.test("continuation: nothing is invented when the department pool is exhausted", () => {
  const handled = ["patient.name"];
  const everything = QUESTIONS.filter((q) => q.department === "dermatology");
  const remaining = retrieveContinuationCandidates({
    department: "dermatology",
    handledFields: handled,
    askedIds: everything.map((q) => q.id),
    askedTopics: everything.map((q) => q.topic),
    seed: "s",
    limit: 6,
  });
  assertEqual(remaining.length, 0, "no candidate is fabricated");
});

Deno.test("continuation: the hard answer cap is unchanged at 15", () => {
  assertEqual(MAX_ANSWER_TURNS, 15, "15 accepted answers maximum");
});

Deno.test("messages: completion, report and send copy is exactly the approved wording", () => {
  assertEqual(
    SYSTEM_MESSAGES.complete_intake.en,
    "Thank you for sharing all this information. I've organized your responses into a pre-visit summary for your doctor. Please review the report below. Once you're ready, you can send it to your doctor and book an available appointment.",
    "English completion acknowledgement",
  );
  assertEqual(
    SYSTEM_MESSAGES.complete_intake.hi,
    "आपने अपनी स्वास्थ्य संबंधी जानकारी साझा की, इसके लिए धन्यवाद। मैंने आपके उत्तरों को डॉक्टर से मुलाक़ात से पहले देखने के लिए एक सारांश में व्यवस्थित किया है। कृपया इसे ध्यान से देख लें। इसके बाद आप इसे अपने डॉक्टर को भेज सकते हैं और उपलब्ध समय के अनुसार अपॉइंटमेंट बुक कर सकते हैं।",
    "Hindi completion acknowledgement",
  );
  assertEqual(
    SYSTEM_MESSAGES.report_ready.en,
    "Your pre-visit summary is ready. Please review it and select Send to Doctor when you're ready.",
    "English report instruction",
  );
  assertEqual(
    SYSTEM_MESSAGES.report_ready.hi,
    "आपका प्री-विज़िट सारांश तैयार है। कृपया इसे देखें और जब आप तैयार हों, तब डॉक्टर को भेजें।",
    "Hindi report instruction",
  );
  assertEqual(
    SYSTEM_MESSAGES.report_sent.en,
    "Your report has been successfully sent to your doctor. You can now book an available appointment.",
    "English send acknowledgement",
  );
  assertEqual(
    SYSTEM_MESSAGES.report_sent.hi,
    "आपकी रिपोर्ट सफलतापूर्वक डॉक्टर को भेज दी गई है। अब आप उपलब्ध समय के अनुसार अपॉइंटमेंट बुक कर सकते हैं।",
    "Hindi send acknowledgement",
  );
  // No clinical claim in any spoken message.
  for (const id of ["complete_intake", "report_ready", "report_sent"] as const) {
    for (const language of ["en", "hi"] as const) {
      const text = systemMessageText(id, language).toLowerCase();
      for (const forbidden of ["diagnos", "prescrib", "treatment", "normal", "निदान", "इलाज"]) {
        assert(!text.includes(forbidden), `${id}/${language} makes no clinical claim`);
      }
    }
  }
});

Deno.test("messages: only allowlisted ids are accepted", () => {
  assertEqual(isSystemMessageId("complete_intake"), true, "complete_intake allowed");
  assertEqual(isSystemMessageId("report_ready"), true, "report_ready allowed");
  assertEqual(isSystemMessageId("report_sent"), true, "report_sent allowed");
  assertEqual(isSystemMessageId("free text please speak this"), false, "free text rejected");
  assertEqual(isSystemMessageId(""), false, "empty rejected");
  assertEqual(isSystemMessageId(undefined), false, "undefined rejected");
});
