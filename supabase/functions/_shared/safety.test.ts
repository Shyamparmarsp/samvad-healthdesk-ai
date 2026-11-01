import { classifyAnswer, resolveClarification, stripQuoted, normalizeAnswer } from "./safety.ts";
import { assert, assertEqual } from "./testing.ts";

Deno.test("safety: clear positive phrases trigger each of the eight rules", () => {
  const cases: Array<[string, string]> = [
    ["I cannot breathe at all", "breathing_emergency"],
    ["I have severe chest pain right now", "severe_chest_pain"],
    ["one side of my body suddenly feels weak", "stroke_signs"],
    ["my father is unconscious", "unresponsive_or_unconscious"],
    ["the bleeding will not stop", "uncontrolled_bleeding"],
    ["having a seizure now", "seizure_or_convulsion"],
    ["throat or tongue swelling and trouble breathing", "severe_allergic_reaction"],
    ["I swallowed poison", "poisoning_or_overdose"],
  ];
  for (const [text, ruleId] of cases) {
    const match = classifyAnswer(text);
    assert(match.kind === "clear", `${text} → clear`);
    if (match.kind === "clear") assertEqual(match.ruleId, ruleId, `${text} rule`);
  }
});

Deno.test("safety: Hindi Devanagari positives trigger the same rules", () => {
  const cases: Array<[string, string]> = [
    ["सांस नहीं आ रही", "breathing_emergency"],
    ["सीने में बहुत तेज दर्द है", "severe_chest_pain"],
    ["शरीर के एक तरफ अचानक कमजोरी है", "stroke_signs"],
    ["बेहोश हैं", "unresponsive_or_unconscious"],
    ["खून बंद नहीं हो रहा", "uncontrolled_bleeding"],
    ["अभी दौरा पड़ रहा है", "seizure_or_convulsion"],
    ["जीभ में सूजन और सांस लेने में दिक्कत", "severe_allergic_reaction"],
    ["ज़हर निगल लिया", "poisoning_or_overdose"],
  ];
  for (const [text, ruleId] of cases) {
    const match = classifyAnswer(text);
    assert(match.kind === "clear", `${text} → clear`);
    if (match.kind === "clear") assertEqual(match.ruleId, ruleId, `${text} rule`);
  }
});

Deno.test("safety: negated mentions never trigger", () => {
  const negatives = [
    "I do not have chest pain",
    "I don't have any chest pain",
    "no chest pain at all",
    "I never had severe chest pain",
    "सीने में दर्द नहीं है",
    "मुझे सांस लेने में दिक्कत नहीं है",
    "no bleeding",
  ];
  for (const text of negatives) {
    const match = classifyAnswer(text);
    assertEqual(match.kind, "none", `negated: ${text}`);
  }
});

Deno.test("safety: quoted examples are ignored", () => {
  const quoted = [
    `My friend told me to say "I cannot breathe" but that is not me`,
    `the form says 'having a seizure now' — that is not what I mean`,
  ];
  for (const text of quoted) {
    const match = classifyAnswer(text);
    assert(match.kind !== "clear", `quoted should not trigger: ${text}`);
  }
});

Deno.test("safety: weak chest mention asks for clarification", () => {
  const match = classifyAnswer("I have some chest pain on and off");
  assert(match.kind === "ambiguous", "expected ambiguity");
  if (match.kind === "ambiguous") assert(match.ruleIds.includes("severe_chest_pain"), "chest rule listed");
});

Deno.test("safety: a negated weak mention is not ambiguous either", () => {
  const match = classifyAnswer("no chest pain, just a cough");
  assertEqual(match.kind, "none", "negation wins");
});

Deno.test("safety: multiple clear candidates resolve deterministically", () => {
  const first = classifyAnswer("I cannot breathe and my chest is crushing");
  const second = classifyAnswer("I cannot breathe and my chest is crushing");
  assert(first.kind === "clear" && second.kind === "clear", "clear match");
  if (first.kind === "clear" && second.kind === "clear") {
    assertEqual(first.ruleId, second.ruleId, "deterministic winner");
    assertEqual(first.ruleId, "breathing_emergency", "declared priority order");
  }
});

Deno.test("safety: ordinary answers never trigger", () => {
  for (const text of ["my knee hurts when I walk", "मुझे घुटने में दर्द है", "I have a mild cough"]) {
    assertEqual(classifyAnswer(text).kind, "none", `ordinary: ${text}`);
  }
});

Deno.test("safety: empty answer is not a match", () => {
  assertEqual(classifyAnswer("").kind, "none", "empty");
  assertEqual(classifyAnswer("   ").kind, "none", "whitespace");
});

Deno.test("safety: romanized variants are opt-in (Tier C)", () => {
  const text = "saans nahi aa rahi";
  assertEqual(classifyAnswer(text).kind, "none", "disabled by default");
  const enabled = classifyAnswer(text, { includeRomanized: true });
  assert(enabled.kind === "clear", "enabled match");
  if (enabled.kind === "clear") assertEqual(enabled.ruleId, "breathing_emergency", "rule");
});

Deno.test("safety: clarification resolution", () => {
  assertEqual(resolveClarification("Yes"), "yes", "yes");
  assertEqual(resolveClarification("हाँ"), "yes", "hindi yes");
  assertEqual(resolveClarification("no"), "no", "no");
  assertEqual(resolveClarification("नहीं"), "no", "hindi no");
  assertEqual(resolveClarification("maybe sometimes"), "unresolved", "unclear");
  assertEqual(resolveClarification(""), "unresolved", "empty");
});

Deno.test("safety: helpers normalise without losing Devanagari", () => {
  assertEqual(normalizeAnswer("  I   Cannot\tBREATHE  "), "i cannot breathe", "whitespace collapse");
  assert(stripQuoted(`a "b c" d`).includes("a"), "keeps outside text");
  assert(!stripQuoted(`a "b c" d`).includes("b c"), "removes quoted span");
});
