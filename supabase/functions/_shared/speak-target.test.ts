/**
 * `speak` target resolution — regression guard.
 *
 * These cases encode the shipped contract: exactly one server-known target per request,
 * a session uuid for session-scoped targets, an allowlisted message id, a known question
 * id, and a validated fact set for the doctor assistant. Free text is never accepted,
 * and a doctor summary must not require a patient session (a real bug caught here).
 */

import { resolveSpeakTarget } from "./speak-target.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} — expected ${String(expected)}, got ${String(actual)}`);
  }
}

const SESSION = "3f9a3c9e-6f0e-4b31-9e4a-2b6a1f5c7d10";

const SUMMARY_FACTS = {
  v: 1,
  context: "dashboard",
  intent: "greeting",
  time_of_day: "morning",
  reports: { total: 1, today: 1, awaiting_review: 1, complete: 1, partial: 0, reviewed: 0, urgent: 0 },
  appointments: {
    today: 1,
    today_upcoming: 1,
    today_completed: 0,
    future: 0,
    past: 0,
    cancelled: 0,
    next_starts: ["2026-11-05T04:00:00.000Z"],
    next_is_today: true,
  },
};

Deno.test("speak target: a doctor summary needs no patient session", () => {
  const target = resolveSpeakTarget({ summary_facts: SUMMARY_FACTS });
  assert(target !== null, "accepted");
  assertEqual(target?.kind, "summary", "kind");
});

Deno.test("speak target: an adaptive question needs a session and a known id", () => {
  const ok = resolveSpeakTarget({ session_id: SESSION, question_id: "duration" });
  assertEqual(ok?.kind, "question", "core adaptive id accepted");
  if (ok?.kind !== "question") return;
  assertEqual(ok.sessionId, SESSION, "session carried through");
  assertEqual(ok.questionId, "duration", "question id carried through");

  assertEqual(resolveSpeakTarget({ session_id: SESSION, question_id: "GM-001" })?.kind, "question", "bank id accepted");
  assertEqual(resolveSpeakTarget({ session_id: "not-a-uuid", question_id: "duration" }), null, "session must be a uuid");
  assertEqual(resolveSpeakTarget({ session_id: SESSION, question_id: "make_up_a_question" }), null, "unknown id refused");
  assertEqual(resolveSpeakTarget({ session_id: SESSION, question_id: 42 }), null, "non-string id refused");
});

Deno.test("speak target: system messages are allowlisted", () => {
  const ok = resolveSpeakTarget({ session_id: SESSION, message_id: "report_sent" });
  assertEqual(ok?.kind, "message", "allowlisted id accepted");
  assertEqual(resolveSpeakTarget({ session_id: SESSION, message_id: "free_text" }), null, "unknown message id refused");
});

Deno.test("speak target: exactly one target, never free text", () => {
  assertEqual(resolveSpeakTarget({ session_id: SESSION, question_id: "duration", message_id: "report_sent" }), null, "two targets");
  assertEqual(
    resolveSpeakTarget({ session_id: SESSION, question_id: "duration", summary_facts: SUMMARY_FACTS }),
    null,
    "summary + question",
  );
  assertEqual(resolveSpeakTarget({ session_id: SESSION }), null, "no target");
  assertEqual(resolveSpeakTarget({ session_id: SESSION, text: "बोलो जो मन करे" }), null, "free text is not a target");
  assertEqual(resolveSpeakTarget(null), null, "null body");
  assertEqual(resolveSpeakTarget("hello"), null, "string body");
  assertEqual(resolveSpeakTarget([SUMMARY_FACTS]), null, "array body");
});

Deno.test("speak target: a malformed fact set is refused", () => {
  assertEqual(resolveSpeakTarget({ summary_facts: { ...SUMMARY_FACTS, v: 9 } }), null, "version");
  assertEqual(resolveSpeakTarget({ summary_facts: { ...SUMMARY_FACTS, text: "x" } }), null, "unknown key");
  assertEqual(resolveSpeakTarget({ summary_facts: "कुछ भी" }), null, "string facts");
});
