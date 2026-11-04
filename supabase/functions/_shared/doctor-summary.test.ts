/**
 * Backend-owned checks for the doctor assistant summary module.
 *
 * The same module is imported by the browser, so these tests are the guard that the
 * spoken sentence (rendered inside `speak`) and the on-screen sentence cannot drift and
 * that the `summary_facts` payload can never be turned into free-text synthesis.
 */

import {
  MAX_SUMMARY_CHARACTERS,
  istDateKey,
  istTimeOfDay,
  parseSummaryFacts,
  renderHindiSummary,
  type SummaryFacts,
} from "./doctor-summary.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} — expected ${String(expected)}, got ${String(actual)}`);
  }
}

const REPORTS_ZERO = {
  total: 0,
  today: 0,
  awaiting_review: 0,
  complete: 0,
  partial: 0,
  reviewed: 0,
  urgent: 0,
};

const APPOINTMENTS_ZERO = {
  today: 0,
  today_upcoming: 0,
  today_completed: 0,
  future: 0,
  past: 0,
  cancelled: 0,
  next_starts: [] as string[],
  next_is_today: false,
};

const morning = new Date("2026-11-05T03:00:00.000Z"); // 08:30 IST

const dashboardGreeting: SummaryFacts = {
  v: 1,
  context: "dashboard",
  intent: "greeting",
  time_of_day: "morning",
  reports: { ...REPORTS_ZERO, total: 3, today: 2, awaiting_review: 2, partial: 1, complete: 1, urgent: 1 },
  appointments: {
    ...APPOINTMENTS_ZERO,
    today: 2,
    today_upcoming: 1,
    today_completed: 1,
    next_starts: ["2026-11-05T04:00:00.000Z"],
    next_is_today: true,
  },
};

Deno.test("doctor summary: greeting is Devanagari, warm and factual", () => {
  const text = renderHindiSummary(dashboardGreeting);
  assert(text.startsWith("सुप्रभात डॉक्टर!"), "time-of-day greeting");
  assert(text.includes("आज आपके कुल 2 अपॉइंटमेंट"), "appointment count comes from facts");
  assert(text.includes("सुबह 9:30 बजे"), "next appointment time in IST");
  assert(text.endsWith("आपका दिन अच्छा रहे, डॉक्टर!"), "closing line");
  assert(/[\u0900-\u097F]/.test(text), "Devanagari script");
  assert(text.length <= MAX_SUMMARY_CHARACTERS, `stays under the Timbre cap (${text.length})`);
});

Deno.test("doctor summary: IST day and greeting buckets", () => {
  assertEqual(istDateKey(new Date("2026-11-05T19:00:00.000Z")), "2026-11-06", "midnight IST rollover");
  assertEqual(istTimeOfDay(morning), "morning", "morning");
  assertEqual(istTimeOfDay(new Date("2026-11-05T08:30:00.000Z")), "afternoon", "afternoon");
  assertEqual(istTimeOfDay(new Date("2026-11-05T14:00:00.000Z")), "evening", "evening");
  assertEqual(istTimeOfDay(new Date("2026-11-05T20:00:00.000Z")), "night", "night");
});

Deno.test("doctor summary: no clinical conclusion, prescription or contact claim", () => {
  const texts = [
    renderHindiSummary(dashboardGreeting),
    renderHindiSummary({
      v: 1,
      context: "urgent_detail",
      time_of_day: "evening",
      queue_total: 2,
      focus: {
        state: "urgent",
        reviewed: false,
        concern_recorded: true,
        answered_fields: 4,
        missing_fields: 6,
        emergency_flag: true,
        possible_urgent: true,
      },
    }),
  ];
  for (const text of texts) {
    for (const forbidden of ["निदान", "दवा", "इलाज", "उपचार", "एम्बुलेंस", "सूचित कर दिया"]) {
      assert(!text.includes(forbidden), `never claims "${forbidden}"`);
    }
  }
});

Deno.test("doctor summary: facts validator rejects everything that is not the fixed shape", () => {
  assert(parseSummaryFacts(dashboardGreeting) !== null, "valid facts accepted");
  assertEqual(parseSummaryFacts("डॉक्टर, कुछ भी बोलो"), null, "free text rejected");
  assertEqual(parseSummaryFacts({ ...dashboardGreeting, text: "arbitrary" }), null, "unknown key rejected");
  assertEqual(parseSummaryFacts({ ...dashboardGreeting, v: 3 }), null, "version rejected");
  assertEqual(parseSummaryFacts({ ...dashboardGreeting, intent: "shout" }), null, "intent allowlist");
  assertEqual(
    parseSummaryFacts({ ...dashboardGreeting, reports: { ...REPORTS_ZERO, total: 1000 } }),
    null,
    "count upper bound",
  );
  assertEqual(
    parseSummaryFacts({
      ...dashboardGreeting,
      appointments: { ...APPOINTMENTS_ZERO, next_starts: ["2026-11-05T04:00:00.000Z", "x", "y", "z"] },
    }),
    null,
    "time list is bounded and ISO",
  );
});

Deno.test("doctor summary: validator normalises without adding fields", () => {
  const parsed = parseSummaryFacts(dashboardGreeting);
  assert(parsed !== null, "parsed");
  if (!parsed) return;
  assertEqual(Object.keys(parsed).sort().join(","), "appointments,context,intent,reports,time_of_day,v", "no extra keys");
  assertEqual(renderHindiSummary(parsed), renderHindiSummary(dashboardGreeting), "rendering is deterministic");
});

Deno.test("doctor summary: empty data states the absence of activity", () => {
  const text = renderHindiSummary({
    v: 1,
    context: "dashboard",
    intent: "summary",
    time_of_day: "afternoon",
    reports: REPORTS_ZERO,
    appointments: APPOINTMENTS_ZERO,
  });
  assert(text.includes("आज कोई अपॉइंटमेंट निर्धारित नहीं है"), "no appointments");
  assert(text.includes("कोई रिपोर्ट उपलब्ध नहीं है"), "no reports");
  assert(!/\d+ (अपॉइंटमेंट|रिपोर्ट)/.test(text), "no invented counts");
});

Deno.test("doctor summary: impossible queue splits are rejected", () => {
  assertEqual(
    parseSummaryFacts({
      v: 1,
      context: "urgent_review",
      time_of_day: "morning",
      queue_total: 1,
      queue_pending: 2,
      queue_reviewed: 2,
    }),
    null,
    "pending + reviewed cannot exceed total",
  );
});
