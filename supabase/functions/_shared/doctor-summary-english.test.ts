/**
 * English summary path — deterministic renderer, model validation and prompt selection.
 *
 * Mirrors the Hindi guarantees: same authoritative facts, Latin script only, every number
 * traceable to the facts, no clinical or contact claims, and a safe fallback when the
 * model answer is unusable.
 */

import {
  MAX_SUMMARY_CHARACTERS,
  renderEnglishSummary,
  renderSummary,
  type SummaryFacts,
} from "./doctor-summary.ts";
import { phraseDoctorSummary, validateModelSummary } from "./doctor-summary-llm.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} — expected ${String(expected)}, got ${String(actual)}`);
  }
}

const DEVANAGARI = /[\u0900-\u097F]/;

const ZERO_REPORTS = {
  total: 0,
  today: 0,
  awaiting_review: 0,
  complete: 0,
  partial: 0,
  reviewed: 0,
  urgent: 0,
};

const ZERO_APPOINTMENTS = {
  today: 0,
  today_upcoming: 0,
  today_completed: 0,
  future: 0,
  past: 0,
  cancelled: 0,
  next_starts: [] as string[],
  next_is_today: false,
};

const dashboard: SummaryFacts = {
  v: 1,
  context: "dashboard",
  intent: "greeting",
  time_of_day: "morning",
  reports: { total: 3, today: 2, awaiting_review: 2, complete: 2, partial: 1, reviewed: 1, urgent: 1 },
  appointments: {
    today: 4,
    today_upcoming: 2,
    today_completed: 1,
    future: 1,
    past: 0,
    cancelled: 0,
    next_starts: ["2026-11-06T04:00:00.000Z"],
    next_is_today: true,
  },
};

Deno.test("english summary: renders every context in English with the supplied facts", () => {
  const facts: SummaryFacts[] = [
    dashboard,
    { v: 1, context: "dashboard", intent: "summary", time_of_day: "evening", reports: ZERO_REPORTS, appointments: ZERO_APPOINTMENTS },
    { v: 1, context: "reports", time_of_day: "morning", tab: "urgent", search: true, reports: { ...ZERO_REPORTS, total: 2, today: 1, awaiting_review: 1, partial: 1, complete: 1, urgent: 1 } },
    { v: 1, context: "appointments", time_of_day: "morning", tab: "upcoming", appointments: { ...ZERO_APPOINTMENTS, future: 3, next_starts: ["2026-11-09T03:30:00.000Z"], next_is_today: false } },
    { v: 1, context: "urgent_review", time_of_day: "morning", queue_total: 2, queue_pending: 1, queue_reviewed: 1 },
    {
      v: 1,
      context: "report_detail",
      time_of_day: "morning",
      focus: { state: "partial", reviewed: false, concern_recorded: true, answered_fields: 7, missing_fields: 3, emergency_flag: false, possible_urgent: false },
    },
    {
      v: 1,
      context: "urgent_detail",
      time_of_day: "morning",
      queue_total: 1,
      focus: { state: "urgent", reviewed: false, concern_recorded: true, answered_fields: 4, missing_fields: 6, emergency_flag: true, possible_urgent: true },
    },
  ];

  for (const fact of facts) {
    const text = renderEnglishSummary(fact);
    assert(text.length > 0, `${fact.context} produced text`);
    assert(text.length <= MAX_SUMMARY_CHARACTERS, `${fact.context} stays under the cap`);
    assert(!DEVANAGARI.test(text), `${fact.context} is English only`);
    assert(/[A-Za-z]/.test(text), `${fact.context} has Latin text`);
    assert(!/undefined|null|NaN/.test(text), `${fact.context} has no placeholders`);
    assert(!/Vikram|Kumar|INT-|APT-/.test(text), `${fact.context} carries no identifier`);
  }

  const greeting = renderEnglishSummary(dashboard);
  assert(greeting.startsWith("Good morning, Doctor."), "time-of-day greeting");
  assert(greeting.includes("4 appointments"), "appointment count from facts");
  assert(greeting.includes("9:30 AM"), "IST time in English form");
  assert(greeting.includes("1 report is in the urgent category"), "urgent count");

  const empty = renderEnglishSummary({ v: 1, context: "dashboard", intent: "summary", time_of_day: "morning", reports: ZERO_REPORTS, appointments: ZERO_APPOINTMENTS });
  assert(empty.includes("No appointments are scheduled for today."), "honest empty appointments");
  assert(empty.includes("No reports are available right now."), "honest empty reports");
  assert(!/\d+ (appointments?|reports?)/.test(empty), "no invented counts");
});

Deno.test("english summary: language dispatcher keeps Hindi and English distinct", () => {
  const english = renderSummary(dashboard, "en");
  const hindi = renderSummary(dashboard, "hi");
  assert(!DEVANAGARI.test(english), "en has no Devanagari");
  assert(DEVANAGARI.test(hindi), "hi is Devanagari");
  assert(english !== hindi, "different renderings");
});

Deno.test("english validation: accepts a compliant briefing", () => {
  const text =
    "Good morning, Doctor. You have 4 appointments today, and 2 of them are still upcoming. Your next appointment is at 9:30 AM. 1 report is in the urgent category and 2 are awaiting review. You may want to review the urgent report first.";
  const result = validateModelSummary(text, dashboard, "en");
  assert(result.ok, `expected acceptance, got ${result.reason}`);
});

Deno.test("english validation: rejects invented numbers, times and dates", () => {
  const base =
    "Good morning, Doctor. You have 4 appointments today. Your next appointment is at 9:30 AM. 1 report is in the urgent category. 2 reports are awaiting review.";
  assertEqual(validateModelSummary(base.replace("4 appointments", "7 appointments"), dashboard, "en").reason, "appointment_count", "count");
  assertEqual(validateModelSummary(base.replace("9:30 AM", "2:15 PM"), dashboard, "en").reason, "unsupported_time", "time");
  assertEqual(validateModelSummary(`${base} On 9 December the clinic is closed.`, dashboard, "en").reason, "unsupported_date", "date");
});

Deno.test("english validation: rejects Hindi output and clinical claims", () => {
  assertEqual(
    validateModelSummary("सुप्रभात डॉक्टर, आज 4 अपॉइंटमेंट हैं।", dashboard, "en").reason,
    "devanagari",
    "Devanagari in English mode",
  );
  assertEqual(
    validateModelSummary("Good morning, Doctor. This looks like a viral infection. Take paracetamol twice daily.", dashboard, "en").reason,
    "clinical_claim",
    "diagnosis/prescription",
  );
  assertEqual(
    validateModelSummary("Good morning, Doctor. The ambulance has been alerted and the patient was contacted.", dashboard, "en").reason,
    "clinical_claim",
    "contact claim",
  );
});

Deno.test("english validation: unsupported status claims are refused, honest negatives allowed", () => {
  const noUrgent: SummaryFacts = { ...dashboard, reports: { ...dashboard.reports, urgent: 0 } };
  assertEqual(
    validateModelSummary("Doctor, 1 report is in the urgent category.", noUrgent, "en").reason,
    "unsupported_claim",
    "urgent claim",
  );
  assert(
    validateModelSummary("Doctor, no reports are in the urgent category today.", noUrgent, "en").ok,
    "an honest negative is allowed",
  );

  const unusedSlots: SummaryFacts = { ...dashboard, appointments: { ...ZERO_APPOINTMENTS } };
  assertEqual(
    validateModelSummary("Doctor, your next appointment is at 9:30 AM.", unusedSlots, "en").reason,
    "unsupported_time",
    "time without a slot",
  );
  assert(
    validateModelSummary("Doctor, no appointments are scheduled today.", unusedSlots, "en").ok,
    "honest empty day",
  );
});

Deno.test("english validation: spelled-out counts are normalised and checked", () => {
  assert(
    validateModelSummary("Good morning, Doctor. You have four appointments today.", dashboard, "en").ok,
    "true spelled-out count accepted",
  );
  assertEqual(
    validateModelSummary("Good morning, Doctor. You have seven appointments today.", dashboard, "en").reason,
    "appointment_count",
    "untrue spelled-out count rejected",
  );
});

Deno.test("english phrasing: the English prompt is sent and one good answer costs one call", async () => {
  const calls: { body: Record<string, unknown> }[] = [];
  const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body ?? "{}")) });
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary:
                    "Good morning, Doctor. You have 4 appointments today and 2 are still upcoming. Your next appointment is at 9:30 AM. 1 report is in the urgent category and 2 are awaiting review.",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  }) as typeof fetch;

  const outcome = await phraseDoctorSummary(dashboard, "en", { apiKey: "test-key", fetchImpl, timeoutMs: 500 });
  assert(outcome.ok, "accepted");
  if (!outcome.ok) return;
  assertEqual(outcome.attempts, 1, "one attempt");
  assert(calls.length === 1, "one provider call");
  const system = (calls[0].body.messages as { role: string; content: string }[])[0].content;
  assert(system.includes("natural English"), "English prompt used");
  assert(!system.includes("Devanagari script only"), "Hindi-only instruction is not sent");
  assertEqual(calls[0].body.model, "qwen/qwen3.8-27b", "same Qwen model");
});
