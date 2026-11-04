/**
 * Stage B (Groq Qwen) — prompt, validation and fallback guarantees.
 *
 * The provider is stubbed, so these run offline and assert the safety contract:
 * the model only phrases supplied facts, invented numbers/statuses/times are rejected,
 * non-Hindi output is rejected, and a second failure leaves the caller on the
 * deterministic renderer. Live provider calls are made only by the deployed function.
 */

import {
  buildModelInput,
  phraseDoctorSummary,
  validateModelSummary,
  SUMMARY_MAX_CHARACTERS,
} from "./doctor-summary-llm.ts";
import type { SummaryFacts } from "./doctor-summary.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} — expected ${String(expected)}, got ${String(actual)}`);
  }
}

const dashboardFacts: SummaryFacts = {
  v: 1,
  context: "dashboard",
  intent: "greeting",
  time_of_day: "morning",
  reports: { total: 3, today: 2, awaiting_review: 2, complete: 2, partial: 1, reviewed: 0, urgent: 1 },
  appointments: {
    today: 4,
    today_upcoming: 2,
    today_completed: 1,
    future: 1,
    past: 0,
    cancelled: 0,
    next_starts: ["2026-11-05T04:00:00.000Z"], // 09:30 IST
    next_is_today: true,
  },
};

const validHindi =
  "सुप्रभात डॉक्टर! आज आपके कुल 4 अपॉइंटमेंट हैं, जिनमें 2 अभी आने वाले हैं। आपका अगला अपॉइंटमेंट सुबह 9:30 बजे है। 3 रिपोर्ट में से 1 का इंटेक अधूरा है और 2 समीक्षा की प्रतीक्षा में हैं। आप चाहें तो पहले अधूरी रिपोर्ट देख सकते हैं। आपका दिन अच्छा रहे!";

interface Call {
  url: string;
  body: Record<string, unknown>;
}

function stubFetch(contents: string[], calls: Call[] = [], status = 200): typeof fetch {
  let index = 0;
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: typeof input === "string" ? input : input.toString(),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    const content = contents[Math.min(index, contents.length - 1)];
    index += 1;
    return Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
}

const options = (fetchImpl: typeof fetch) => ({ apiKey: "test-key", fetchImpl, timeoutMs: 500 });

Deno.test("qwen summary: a compliant Hindi briefing is accepted", () => {
  const result = validateModelSummary(validHindi, dashboardFacts);
  assert(result.ok, `expected acceptance, got ${result.reason}`);
});

Deno.test("qwen summary: invented counts, times and dates are rejected", () => {
  const inventedCount = validHindi.replace("कुल 4 अपॉइंटमेंट", "कुल 7 अपॉइंटमेंट");
  assertEqual(validateModelSummary(inventedCount, dashboardFacts).reason, "appointment_count", "invented count");

  const inventedReport = validHindi.replace("3 रिपोर्ट", "6 रिपोर्ट");
  assertEqual(validateModelSummary(inventedReport, dashboardFacts).reason, "report_count", "invented report count");

  const inventedTime = validHindi.replace("सुबह 9:30 बजे", "दोपहर 2:15 बजे");
  assertEqual(validateModelSummary(inventedTime, dashboardFacts).reason, "unsupported_time", "invented time");

  const inventedDate = validHindi.replace("आज आपके कुल", "5 दिसंबर को आपके कुल");
  assertEqual(validateModelSummary(inventedDate, dashboardFacts).reason, "unsupported_date", "invented date");
});

Deno.test("qwen summary: English, number words and clinical claims are rejected", () => {
  const english = "Good morning Doctor, you have 4 appointments today.";
  assertEqual(validateModelSummary(english, dashboardFacts).reason, "not_hindi", "no Devanagari");

  const mixed = "सुप्रभात डॉक्टर! You have 4 अपॉइंटमेंट.";
  assertEqual(validateModelSummary(mixed, dashboardFacts).reason, "latin_text", "latin letters");

  // A spelled-out count is normalised and checked like any other number.
  const wordsOk = validHindi.replace("कुल 4 अपॉइंटमेंट", "कुल चार अपॉइंटमेंट");
  assert(validateModelSummary(wordsOk, dashboardFacts).ok, "a true spelled-out count is accepted");
  const wordsWrong = validHindi.replace("कुल 4 अपॉइंटमेंट", "कुल सात अपॉइंटमेंट");
  assertEqual(validateModelSummary(wordsWrong, dashboardFacts).reason, "appointment_count", "an untrue spelled-out count is rejected");

  const diagnosis = `${validHindi} संभवतः यह निमोनिया है।`;
  assertEqual(validateModelSummary(diagnosis, dashboardFacts).reason, "clinical_claim", "diagnosis");

  const prescription = `${validHindi} उन्हें पैरासिटामोल की दवा दें।`;
  assertEqual(validateModelSummary(prescription, dashboardFacts).reason, "clinical_claim", "prescription");

  const contact = `${validHindi} एम्बुलेंस को सूचित कर दिया गया है।`;
  assertEqual(validateModelSummary(contact, dashboardFacts).reason, "clinical_claim", "contact claim");
});

Deno.test("qwen summary: a status the facts do not support is rejected", () => {
  const reviewed = "डॉक्टर, सभी रिपोर्ट की समीक्षा पूरी हो चुकी है।";
  assertEqual(validateModelSummary(reviewed, dashboardFacts).reason, "unsupported_claim", "reviewed claim");

  const noUrgentFacts: SummaryFacts = {
    ...dashboardFacts,
    reports: { ...dashboardFacts.reports, urgent: 0 },
  };
  assertEqual(
    validateModelSummary("डॉक्टर, 1 रिपोर्ट अत्यावश्यक श्रेणी में है।", noUrgentFacts).reason,
    "unsupported_claim",
    "urgency claim",
  );

  const noAppointmentFacts: SummaryFacts = {
    ...dashboardFacts,
    appointments: { ...dashboardFacts.appointments, next_starts: [], today_upcoming: 0, today: 0 },
  };
  assertEqual(
    validateModelSummary("डॉक्टर, आपका अगला अपॉइंटमेंट जल्द है।", noAppointmentFacts).reason,
    "unsupported_claim",
    "next-appointment claim",
  );
  assertEqual(
    validateModelSummary("डॉक्टर, आपका अगला अपॉइंटमेंट 9:30 बजे है।", noAppointmentFacts).reason,
    "unsupported_time",
    "an unsupplied time is rejected even before the claim check",
  );
});

Deno.test("qwen summary: honest negative statements are accepted", () => {
  const empty: SummaryFacts = {
    v: 1,
    context: "dashboard",
    intent: "greeting",
    time_of_day: "morning",
    reports: { total: 0, today: 0, awaiting_review: 0, complete: 0, partial: 0, reviewed: 0, urgent: 0 },
    appointments: {
      today: 0,
      today_upcoming: 0,
      today_completed: 0,
      future: 0,
      past: 0,
      cancelled: 0,
      next_starts: [],
      next_is_today: false,
    },
  };

  for (const text of [
    "सुप्रभात डॉक्टर! इस समय कोई अत्यावश्यक रिपोर्ट नहीं है। आपका दिन शुभ हो।",
    "डॉक्टर, आने वाले समय में कोई अपॉइंटमेंट निर्धारित नहीं है।",
    "डॉक्टर, इस समय कोई रिपोर्ट समीक्षा की प्रतीक्षा में नहीं है।",
  ]) {
    const result = validateModelSummary(text, empty);
    assert(result.ok, `expected acceptance for a true negative, got ${result.reason}`);
  }

  // A positive claim in a different sentence is still refused.
  const mixed = "डॉक्टर, कोई अपॉइंटमेंट नहीं है। 1 रिपोर्ट अत्यावश्यक श्रेणी में है।";
  assertEqual(validateModelSummary(mixed, empty).reason, "report_count", "an unsupported count in another sentence is still refused");
});

Deno.test("qwen summary: length bounds are enforced", () => {
  assertEqual(validateModelSummary("", dashboardFacts).reason, "empty", "empty");
  assertEqual(validateModelSummary("डॉक्टर", dashboardFacts).reason, "too_short", "too short");
  const long = `डॉक्टर, ${"यह जानकारी है। ".repeat(60)}`;
  assertEqual(validateModelSummary(long, dashboardFacts).reason, "too_long", "too long");
  assert(long.length > SUMMARY_MAX_CHARACTERS, "fixture is genuinely over the cap");
});

Deno.test("qwen summary: the fact payload carries no identifiers or patient content", () => {
  const payload = buildModelInput(dashboardFacts);
  for (const forbidden of ["Vikram", "patient", "name", "phone", "session", "report_id", "INT-", "096"]) {
    assert(!payload.toLowerCase().includes(forbidden.toLowerCase()), `payload excludes "${forbidden}"`);
  }
  assert(payload.includes('"appointments"'), "payload has the counts");
  assert(payload.includes('"reports"'), "payload has the report counts");
});

Deno.test("qwen summary: a good first answer costs exactly one call", async () => {
  const calls: Call[] = [];
  const outcome = await phraseDoctorSummary(
    dashboardFacts,
    options(stubFetch([JSON.stringify({ summary: validHindi })], calls)),
  );
  assert(outcome.ok, "accepted");
  if (!outcome.ok) return;
  assertEqual(outcome.attempts, 1, "one attempt");
  assert(outcome.text.startsWith("सुप्रभात"), "text preserved");
  assertEqual(calls.length, 1, "one provider call");
  assertEqual(calls[0].url.includes("/chat/completions"), true, "chat completions endpoint");
  assertEqual(calls[0].body.model, "qwen/qwen3.8-27b", "the configured Qwen model is used");
  assertEqual(calls[0].body.max_completion_tokens, 400, "summary budget, not the 32-token id budget");
  assertEqual(calls[0].body.temperature, 0, "deterministic decoding");
  const schema = (calls[0].body.response_format as { json_schema: { strict: boolean } }).json_schema;
  assertEqual(schema.strict, true, "strict structured output");
});

Deno.test("qwen summary: one corrective retry, then success", async () => {
  const calls: Call[] = [];
  const bad = JSON.stringify({ summary: "Doctor, you have 9 appointments." });
  const good = JSON.stringify({ summary: validHindi });
  const outcome = await phraseDoctorSummary(dashboardFacts, options(stubFetch([bad, good], calls)));
  assert(outcome.ok, "second attempt accepted");
  if (!outcome.ok) return;
  assertEqual(outcome.attempts, 2, "retried once");
  assertEqual(calls.length, 2, "two provider calls");
  const secondSystem = (calls[1].body.messages as { role: string; content: string }[])[0].content;
  assert(secondSystem.includes("rejected"), "retry tells the model why without echoing its text");
});

Deno.test("qwen summary: two bad answers leave the caller on the fallback", async () => {
  const bad = JSON.stringify({ summary: "डॉक्टर, you have 9 appointments." });
  const outcome = await phraseDoctorSummary(dashboardFacts, options(stubFetch([bad, bad])));
  assert(!outcome.ok, "not accepted");
  if (outcome.ok) return;
  assertEqual(outcome.reason, "latin_text", "stable rejection reason");
});

Deno.test("qwen summary: a provider error is a typed failure, never text", async () => {
  const calls: Call[] = [];
  const outcome = await phraseDoctorSummary(dashboardFacts, options(stubFetch([""], calls, 500)));
  assert(!outcome.ok, "server error rejected");
  if (outcome.ok) return;
  assertEqual(outcome.reason, "server", "typed failure");
  assert(!JSON.stringify(outcome).includes("choices"), "no provider body echoed");
});

Deno.test("qwen summary: a missing key makes no request", async () => {
  const calls: Call[] = [];
  const outcome = await phraseDoctorSummary(dashboardFacts, {
    apiKey: "",
    fetchImpl: stubFetch([JSON.stringify({ summary: validHindi })], calls),
  });
  assert(!outcome.ok, "refused");
  assertEqual(calls.length, 0, "no provider call without a key");
});

Deno.test("qwen summary: a timeout falls back without a second network attempt", async () => {
  let calls = 0;
  const slow = ((_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  }) as typeof fetch;

  const outcome = await phraseDoctorSummary(dashboardFacts, { apiKey: "k", fetchImpl: slow, timeoutMs: 20 });
  assert(!outcome.ok, "timeout rejected");
  if (outcome.ok) return;
  assertEqual(outcome.reason, "timeout", "timeout reason");
  // The retry is allowed but must not return model text; both attempts abort.
  assertEqual(calls, 2, "bounded attempts");
});
