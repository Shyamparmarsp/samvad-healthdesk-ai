/**
 * Emergency-matcher certification tests (contract-level, offline).
 *
 * These tests pin the documented contract in docs/demo-emergency-rules.md and
 * docs/integration-contract.md. They do not invent phrases: every trigger case is
 * derived from the configured rule table in safety.ts, so adding a phrase without
 * certifying it is impossible to miss.
 *
 * The demonstrated deviations found during the audit (negation scoping and
 * single-quoted examples) are intentionally NOT asserted as desired behaviour here.
 * They are recorded as defects in docs/emergency-certification/audit-report.md and
 * probed by the audit harness (supabase/tests/emergency-certification.ts).
 */

import {
  EMERGENCY_RULES,
  classifyAnswer,
  normalizeAnswer,
  resolveClarification,
  stripQuoted,
} from "./safety.ts";
import { assert, assertEqual } from "./testing.ts";

const EXPECTED_RULE_ORDER = [
  "breathing_emergency",
  "severe_chest_pain",
  "stroke_signs",
  "unresponsive_or_unconscious",
  "uncontrolled_bleeding",
  "seizure_or_convulsion",
  "severe_allergic_reaction",
  "poisoning_or_overdose",
] as const;

Deno.test("cert: exactly the eight documented rules exist, in declared precedence order", () => {
  assertEqual(EMERGENCY_RULES.length, 8, "rule count");
  assertEqual(
    EMERGENCY_RULES.map((rule) => rule.id).join(","),
    EXPECTED_RULE_ORDER.join(","),
    "rule ids and precedence order",
  );
});

Deno.test("cert: every configured English clear phrase triggers a clear emergency", () => {
  const failures: string[] = [];
  for (const rule of EMERGENCY_RULES) {
    for (const phrase of rule.clear) {
      const match = classifyAnswer(phrase);
      if (match.kind !== "clear") {
        failures.push(`${rule.id} / ${phrase} => ${match.kind}`);
      }
    }
  }
  assertEqual(failures.length, 0, `unmatched clear phrases: ${failures.join("; ")}`);
});

Deno.test("cert: every configured Hindi clear phrase triggers a clear emergency", () => {
  const failures: string[] = [];
  for (const rule of EMERGENCY_RULES) {
    for (const phrase of rule.clearHi) {
      const match = classifyAnswer(phrase);
      if (match.kind !== "clear") {
        failures.push(`${rule.id} / ${phrase} => ${match.kind}`);
      }
    }
  }
  assertEqual(failures.length, 0, `unmatched Hindi clear phrases: ${failures.join("; ")}`);
});

Deno.test("cert: the declared precedence order is the one that wins", () => {
  // Declared priority, not position in the sentence, decides the rule id.
  const match = classifyAnswer("I cannot breathe and I have severe chest pain");
  assert(match.kind === "clear", "clear");
  if (match.kind === "clear") assertEqual(match.ruleId, "breathing_emergency", "priority");

  // A phrase that exists in two rules resolves to the earlier rule id by declaration.
  // "throat is swelling and i cannot breathe" is listed under severe_allergic_reaction
  // but contains the earlier breathing rule's phrase; the breathing rule wins.
  const shared = classifyAnswer("throat is swelling and i cannot breathe");
  assert(shared.kind === "clear", "clear");
  if (shared.kind === "clear") assertEqual(shared.ruleId, "breathing_emergency", "declared order");
});

Deno.test("cert: every configured ambiguous phrase requests clarification", () => {
  const failures: string[] = [];
  for (const rule of EMERGENCY_RULES) {
    for (const phrase of [...rule.ambiguous, ...rule.ambiguousHi]) {
      const match = classifyAnswer(phrase);
      if (match.kind !== "ambiguous") {
        failures.push(`${rule.id} / ${phrase} => ${match.kind}`);
      } else if (!match.ruleIds.includes(rule.id)) {
        failures.push(`${rule.id} / ${phrase} => ${match.ruleIds.join(",")}`);
      }
    }
  }
  assertEqual(failures.length, 0, `unmatched ambiguous phrases: ${failures.join("; ")}`);
});

Deno.test("cert: ambiguous and clear mentions never resolve to none", () => {
  // A clear match outranks an ambiguous one in the same answer.
  const match = classifyAnswer("some chest pain and I cannot breathe");
  assert(match.kind === "clear", "clear outranks ambiguous");

  const weak = classifyAnswer("I have some chest pain on and off");
  assert(weak.kind === "ambiguous", "weak mention is never silently safe");
  if (weak.kind === "ambiguous") {
    assertEqual(weak.ruleIds[0], "severe_chest_pain", "first candidate in rule order");
  }
});

Deno.test("cert: romanised variants are opt-in and none leak into the default matcher", () => {
  for (const rule of EMERGENCY_RULES) {
    for (const phrase of rule.romanized) {
      assertEqual(classifyAnswer(phrase).kind, "none", `disabled by default: ${phrase}`);
      const enabled = classifyAnswer(phrase, { includeRomanized: true });
      assert(enabled.kind === "clear", `enabled: ${phrase}`);
      if (enabled.kind === "clear") assertEqual(enabled.ruleId, rule.id, `enabled rule: ${phrase}`);
    }
  }
});

Deno.test("cert: case, whitespace, punctuation and apostrophe variants normalise", () => {
  const positives = [
    "I CANNOT BREATHE",
    "I Cannot Breathe",
    "   I    cannot     breathe   ",
    "I cannot breathe.",
    "I cannot breathe!!!",
    "cannot-breathe",
    "I can't breathe",
    "I can’t breathe",
    "I can\u2019t breathe",
    "severe chest pain?",
    "SEVERE   CHEST   PAIN",
  ];
  for (const text of positives) {
    const match = classifyAnswer(text);
    assert(match.kind === "clear", `expected clear: ${JSON.stringify(text)}`);
  }

  assertEqual(
    normalizeAnswer("  I   Cannot\tBREATHE  "),
    "i cannot breathe",
    "normalisation is stable",
  );
  // Devanagari and its marks survive normalisation.
  assert(normalizeAnswer("साँस लेने में बहुत तकलीफ़").includes("तकलीफ़"), "Devanagari retained");
});

Deno.test("cert: double-quoted examples are removed before matching", () => {
  for (const text of [
    'My friend told me to say "I cannot breathe"',
    'The form says "having a seizure now"',
    'she said “severe chest pain”',
  ]) {
    assertEqual(classifyAnswer(text).kind, "none", `quoted: ${text}`);
  }
  assert(!stripQuoted('a "b c" d').includes("b c"), "quoted span removed");
  assert(stripQuoted('a "b c" d').includes("a"), "surrounding text kept");
});

Deno.test("cert: negated mentions of the trigger phrase do not trigger", () => {
  const negatives = [
    "I do not have chest pain",
    "I don't have any chest pain",
    "no chest pain at all",
    "I never had severe chest pain",
    "I am not bleeding",
    "no bleeding",
    "सीने में दर्द नहीं है",
    "मुझे सांस लेने में दिक्कत नहीं है",
  ];
  const failures = negatives.filter((text) => classifyAnswer(text).kind !== "none");
  assertEqual(failures.length, 0, `negation missed: ${failures.join("; ")}`);
});

Deno.test("cert: ordinary non-emergency answers never trigger", () => {
  const ordinary = [
    "my knee hurts when I walk",
    "मुझे घुटने में दर्द है",
    "I have a mild cough",
    "I have a headache for two days",
    "my skin is itchy",
    "I feel tired",
    "I have a fever",
    "मुझे बुखार है",
    "routine check-up",
    "I need a refill for my blood pressure medicine",
    "it hurts a little when I climb stairs",
    "I have had a rash since yesterday",
    "no fever, mild cough",
  ];
  const failures = ordinary.filter((text) => classifyAnswer(text).kind !== "none");
  assertEqual(failures.length, 0, `false positive: ${failures.join("; ")}`);
});

Deno.test("cert: empty and whitespace-only answers are not matches", () => {
  for (const text of ["", "   ", "\n\t", "...", "।"]) {
    assertEqual(classifyAnswer(text).kind, "none", `empty: ${JSON.stringify(text)}`);
  }
});

Deno.test("cert: the fixed clarification question text is not itself a trigger", () => {
  // Only the patient's answer is classified; this pins that an assistant prompt is inert.
  for (const text of [
    "Is this happening to you right now?",
    "क्या यह अभी आपके साथ हो रहा है?",
  ]) {
    assertEqual(classifyAnswer(text).kind, "none", `question text: ${text}`);
  }
});

Deno.test("cert: classification is deterministic", () => {
  const inputs = [
    "I cannot breathe",
    "some chest pain",
    "मुझे सांस लेने में दिक्कत है",
    "my knee hurts",
  ];
  for (const text of inputs) {
    const first = JSON.stringify(classifyAnswer(text));
    for (let index = 0; index < 5; index += 1) {
      assertEqual(JSON.stringify(classifyAnswer(text)), first, `stable: ${text}`);
    }
  }
});

Deno.test("cert: clarification resolution never converts an unclear answer into safety", () => {
  assertEqual(resolveClarification("Yes"), "yes", "yes");
  assertEqual(resolveClarification("yes please"), "yes", "yes phrase");
  assertEqual(resolveClarification("हाँ"), "yes", "Hindi yes");
  assertEqual(resolveClarification("No"), "no", "no");
  assertEqual(resolveClarification("नहीं"), "no", "Hindi no");
  assertEqual(resolveClarification("maybe sometimes"), "unresolved", "unclear");
  assertEqual(resolveClarification("not really"), "unresolved", "partial negation is not 'no'");
  assertEqual(resolveClarification(""), "unresolved", "empty");
  assertEqual(resolveClarification("   "), "unresolved", "whitespace");
});

Deno.test("cert: a negation outside the mention's clause segment does not cancel it", () => {
  const cases: Array<[string, "clear" | "ambiguous"]> = [
    ["I cannot breathe but I have no fever", "clear"],
    ["No fever but I cannot breathe", "clear"],
    ["I have chest pain but no fever", "ambiguous"],
    ["I have chest pain and no fever", "ambiguous"],
    ["I have chest pain with no fever", "ambiguous"],
    ["I have severe chest pain and no fever", "clear"],
    ["मुझे बुखार नहीं है और सांस नहीं आ रही", "clear"],
  ];
  for (const [text, expected] of cases) {
    const match = classifyAnswer(text);
    assertEqual(match.kind, expected, `scoped negation: ${text}`);
  }

  const stillNegated = [
    "I have no chest pain and no fever",
    "I do not think I have chest pain",
    "I have never in my life had chest pain",
    "मुझे सांस लेने में दिक्कत नहीं है",
    "मुझे सीने में दर्द नहीं है",
  ];
  for (const text of stillNegated) {
    assertEqual(classifyAnswer(text).kind, "none", `governing negation: ${text}`);
  }

  // A contrast before the mention must not import its negation either.
  assertEqual(classifyAnswer("I am not sure but I have chest pain").kind, "ambiguous", "contrast segment");
});

Deno.test("cert: every occurrence is considered, not only the first", () => {
  for (const text of [
    "no chest pain, but chest pain now",
    "no chest pain. chest pain now",
  ]) {
    const match = classifyAnswer(text);
    assertEqual(match.kind, "ambiguous", `later positive occurrence: ${text}`);
    if (match.kind === "ambiguous") {
      assert(match.ruleIds.includes("severe_chest_pain"), "chest rule present");
    }
  }
});

Deno.test("cert: single-quoted examples are inert and apostrophes still work", () => {
  for (const text of [
    "The form says 'having a seizure now'",
    "My friend told me to say 'I cannot breathe'",
    "I said 'no chest pain'",
  ]) {
    assertEqual(classifyAnswer(text).kind, "none", `quoted example: ${text}`);
  }
  assertEqual(classifyAnswer("I can't breathe").kind, "clear", "contraction still triggers");
  assertEqual(classifyAnswer("I don't have chest pain").kind, "none", "contraction negation");
  assertEqual(classifyAnswer("the patient's chest pain").kind, "ambiguous", "possessive apostrophe");

  assert(!stripQuoted("a 'b c' d").includes("b c"), "quoted span removed");
  assertEqual(stripQuoted("don't stop"), "don't stop", "contraction preserved");
});
