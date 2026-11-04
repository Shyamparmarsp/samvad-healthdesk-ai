/**
 * Stage B — Groq Qwen phrasing for the Samwad Assistant.
 *
 * Stage A (deterministic counts) lives in `doctor-summary.ts` and is the only source of
 * truth. This module asks the already-configured Groq model (`GROQ_MODEL`,
 * `qwen/qwen3.8-27b`, see `groq.ts` and `docs/provider-notes.md`) to phrase those facts
 * as a short Hindi briefing, then validates the answer before anyone sees or hears it.
 *
 * What the model receives: a compact fact projection — counts, statuses and
 * IST-formatted times. Never a patient name, age, phone number, transcript, symptom
 * text, intake reference, session id or report id.
 *
 * What the model may do: choose warm, natural Hindi wording and sentence order.
 * What it may not do: compute a number, change a status, add a time, mention a patient,
 * diagnose, prescribe, or claim that anyone was contacted. `validateModelSummary`
 * enforces each of those independently of the prompt, and the caller falls back to the
 * deterministic renderer when validation fails.
 */

import { requestStructured, type GroqOptions } from "./groq.ts";
import {
  istClockParts,
  parseInstant,
  type SummaryFacts,
} from "./doctor-summary.ts";

/** A briefing, not a page narration. Well inside the Timbre request cap. */
export const SUMMARY_MAX_CHARACTERS = 420;
const SUMMARY_MIN_CHARACTERS = 12;

const HINDI_MONTHS = [
  "जनवरी",
  "फ़रवरी",
  "फरवरी",
  "मार्च",
  "अप्रैल",
  "मई",
  "जून",
  "जुलाई",
  "अगस्त",
  "सितंबर",
  "अक्टूबर",
  "नवंबर",
  "दिसंबर",
] as const;

/**
 * Hindi number words mapped to their value.
 *
 * The briefing prefers digits, but Hindi models slip into words ("एक रिपोर्ट"). A count
 * written as a word is still a count, so it is normalised to its digit and validated like
 * any other number instead of being rejected outright.
 */
const HINDI_NUMBER_WORDS: Readonly<Record<string, number>> = {
  शून्य: 0,
  एक: 1,
  दो: 2,
  तीन: 3,
  चार: 4,
  पांच: 5,
  पाँच: 5,
  छह: 6,
  सात: 7,
  आठ: 8,
  नौ: 9,
  दस: 10,
  ग्यारह: 11,
  बारह: 12,
  तेरह: 13,
  चौदह: 14,
  पंद्रह: 15,
  सोलह: 16,
  सत्रह: 17,
  अठारह: 18,
  उन्नीस: 19,
  बीस: 20,
  तीस: 30,
  चालीस: 40,
  पचास: 50,
  साठ: 60,
  सत्तर: 70,
  अस्सी: 80,
  नब्बे: 90,
  सौ: 100,
};

/** Clinical or contact claims the assistant must never make. */
const FORBIDDEN_PHRASES = [
  "निदान",
  "रोग",
  "बीमारी",
  "संक्रमण",
  "संभवतः",
  "निमोनिया",
  "हो सकता है",
  "लगता है",
  "दवा",
  "दवाई",
  "इलाज",
  "उपचार",
  "पर्चा",
  "संभावना",
  "जोखिम",
  "प्रिस्क्रिप्शन",
  "एम्बुलेंस",
  "112",
  "सूचित",
  "भेज दिया",
  "सलाह",
  "इंजेक्शन",
  "डायग्नोसिस",
] as const;

export type SummaryRejection =
  | "empty"
  | "too_short"
  | "too_long"
  | "not_hindi"
  | "latin_text"
  | "number_words"
  | "unsupported_number"
  | "appointment_count"
  | "report_count"
  | "unsupported_time"
  | "unsupported_date"
  | "unsupported_claim"
  | "clinical_claim";

export interface SummaryValidation {
  ok: boolean;
  reason?: SummaryRejection;
}

const DEVANAGARI_TEXT = /[\u0900-\u097F]/;
const LATIN_LETTER = /[A-Za-z]/;
const DEVANAGARI_DIGITS = /[\u0966-\u096F]/g;
const ASCII_DIGITS = "0123456789";

function normaliseDigits(text: string): string {
  let normalised = text.replace(DEVANAGARI_DIGITS, (digit) => ASCII_DIGITS[digit.charCodeAt(0) - 0x0966]);
  // Number words become digits so a spelled-out count is checked against the facts too.
  for (const [word, value] of Object.entries(HINDI_NUMBER_WORDS)) {
    normalised = normalised.replace(new RegExp(`(^|[^\\u0900-\\u097F])${word}(?=[^\\u0900-\\u097F]|$)`, "g"), `$1${value}`);
  }
  return normalised;
}

/** Every number the supplied facts can justify, and the per-noun subsets. */
interface AllowedFacts {
  counts: Set<number>;
  reportCounts: Set<number>;
  appointmentCounts: Set<number>;
  times: Set<string>;
  hours: Set<number>;
  dates: Set<string>;
  allowUrgent: boolean;
  allowReviewed: boolean;
  allowPendingReview: boolean;
  allowPartial: boolean;
  allowNextAppointment: boolean;
  allowUpcoming: boolean;
}

function collectAllowed(facts: SummaryFacts): AllowedFacts {
  const allowed: AllowedFacts = {
    counts: new Set(),
    reportCounts: new Set(),
    appointmentCounts: new Set(),
    times: new Set(),
    hours: new Set(),
    dates: new Set(),
    allowUrgent: false,
    allowReviewed: false,
    allowPendingReview: false,
    allowPartial: false,
    allowNextAppointment: false,
    allowUpcoming: false,
  };

  const addReports = (reports: {
    total: number;
    today: number;
    awaiting_review: number;
    complete: number;
    partial: number;
    reviewed: number;
    urgent: number;
  }) => {
    for (const value of [
      reports.total,
      reports.today,
      reports.awaiting_review,
      reports.complete,
      reports.partial,
      reports.reviewed,
      reports.urgent,
    ]) {
      allowed.counts.add(value);
      allowed.reportCounts.add(value);
    }
    if (reports.urgent > 0) allowed.allowUrgent = true;
    if (reports.reviewed > 0) allowed.allowReviewed = true;
    if (reports.awaiting_review > 0) allowed.allowPendingReview = true;
    if (reports.partial > 0) allowed.allowPartial = true;
  };

  const addAppointments = (appointments: {
    today: number;
    today_upcoming: number;
    today_completed: number;
    future: number;
    past: number;
    cancelled: number;
    next_starts: string[];
    next_is_today: boolean;
  }) => {
    for (const value of [
      appointments.today,
      appointments.today_upcoming,
      appointments.today_completed,
      appointments.future,
      appointments.past,
      appointments.cancelled,
    ]) {
      allowed.counts.add(value);
      allowed.appointmentCounts.add(value);
    }
    if (appointments.today_upcoming > 0 || appointments.future > 0) allowed.allowUpcoming = true;
    for (const start of appointments.next_starts) {
      const parts = istClockParts(start);
      if (!parts) continue;
      allowed.allowNextAppointment = true;
      const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
      allowed.hours.add(hour12);
      allowed.counts.add(hour12);
      allowed.counts.add(parts.minute);
      allowed.times.add(`${hour12}:${String(parts.minute).padStart(2, "0")}`);
      allowed.dates.add(`${parts.day}:${parts.month}`);
      allowed.counts.add(parts.day);
    }
  };

  switch (facts.context) {
    case "dashboard":
      addReports(facts.reports);
      addAppointments(facts.appointments);
      break;
    case "reports":
      addReports(facts.reports);
      break;
    case "appointments":
      addAppointments(facts.appointments);
      break;
    case "urgent_review":
      for (const value of [facts.queue_total, facts.queue_pending, facts.queue_reviewed]) {
        allowed.counts.add(value);
        allowed.reportCounts.add(value);
      }
      if (facts.queue_total > 0) allowed.allowUrgent = true;
      if (facts.queue_reviewed > 0) allowed.allowReviewed = true;
      if (facts.queue_pending > 0) allowed.allowPendingReview = true;
      break;
    case "report_detail":
      addFocus(facts.focus);
      break;
    case "urgent_detail":
      addFocus(facts.focus);
      allowed.counts.add(facts.queue_total);
      allowed.reportCounts.add(facts.queue_total);
      allowed.allowUrgent = true;
      break;
  }

  function addFocus(focus: {
    state: "complete" | "partial" | "urgent";
    reviewed: boolean;
    answered_fields: number;
    missing_fields: number;
    possible_urgent: boolean;
    emergency_flag: boolean;
  }) {
    for (const value of [focus.answered_fields, focus.missing_fields]) {
      allowed.counts.add(value);
      allowed.reportCounts.add(value);
    }
    if (focus.state !== "complete" || focus.emergency_flag || focus.possible_urgent) allowed.allowUrgent = true;
    if (focus.state !== "complete") allowed.allowPartial = true;
    if (focus.reviewed) allowed.allowReviewed = true;
    else allowed.allowPendingReview = true;
  }

  return allowed;
}

/**
 * Validates a model-written Hindi briefing against the authoritative facts.
 *
 * Rejections are reasons, never echoes of the model text, so nothing unsupported can
 * leak into a log line.
 */
export function validateModelSummary(raw: string, facts: SummaryFacts): SummaryValidation {
  const text = normaliseDigits(raw.replace(/\s+/g, " ").trim());
  if (text.length === 0) return { ok: false, reason: "empty" };
  if (text.length < SUMMARY_MIN_CHARACTERS) return { ok: false, reason: "too_short" };
  if (text.length > SUMMARY_MAX_CHARACTERS) return { ok: false, reason: "too_long" };
  if (!DEVANAGARI_TEXT.test(text)) return { ok: false, reason: "not_hindi" };
  if (LATIN_LETTER.test(text)) return { ok: false, reason: "latin_text" };

  // A number word outside the mapped set ("इक्कीस") cannot be verified, so it is refused.
  const unmappedNumberWord = /(इक्कीस|बाईस|तेईस|चौबीस|पच्चीस|छब्बीस|सत्ताईस|अट्ठाईस|उनतीस|इकतीस|बत्तीस|तैंतीस|चौंतीस|पैंतीस|छत्तीस|सैंतीस|अड़तीस|उनतालीस|इकतालीस|बयालीस|तैंतालीस|चवालीस|पैंतालीस|छियालीस|सैंतालीस|अड़तालीस|उनचास|इक्यावन|बावन|तिरपन|चौवन|पचपन|छप्पन|सत्तावन|अट्ठावन|उनसठ|इकसठ|बासठ|तिरसठ|चौंसठ|पैंसठ|छियासठ|सड़सठ|अड़सठ|उनहत्तर|इकहत्तर|बहत्तर|तिहत्तर|चौहत्तर|पचहत्तर|छिहत्तर|सतहत्तर|अठहत्तर|उनासी|इक्यासी|बयासी|तिरासी|चौरासी|पचासी|छियासी|सत्तासी|अट्ठासी|नवासी|हज़ार|हजार)/;
  const wordMatch = text.match(unmappedNumberWord);
  if (wordMatch) {
    // Mapped words such as "सौ" are normalised above; only unmapped ones remain.
    return { ok: false, reason: "number_words" };
  }

  for (const phrase of FORBIDDEN_PHRASES) {
    if (text.includes(phrase)) return { ok: false, reason: "clinical_claim" };
  }

  const allowed = collectAllowed(facts);

  // Counts directly attached to a noun must belong to that noun's category.
  for (const match of text.matchAll(/(\d+)\s*(?:नई\s+|नयी\s+|कुल\s+)?(अपॉइंटमेंट)/g)) {
    if (!allowed.appointmentCounts.has(Number(match[1]))) return { ok: false, reason: "appointment_count" };
  }
  for (const match of text.matchAll(/(\d+)\s*(?:नई\s+|नयी\s+|कुल\s+)?(रिपोर्ट)/g)) {
    if (!allowed.reportCounts.has(Number(match[1]))) return { ok: false, reason: "report_count" };
  }

  // Times and dates must be a real supplied slot, not a plausible-looking invention.
  for (const match of text.matchAll(/(\d{1,2}):(\d{2})/g)) {
    const value = `${Number(match[1])}:${match[2]}`;
    if (!allowed.times.has(value)) return { ok: false, reason: "unsupported_time" };
  }
  // "9:30 बजे" must not be read as the hour 30; only bare hours are checked here.
  const withoutClockTimes = text.replace(/\d{1,2}:\d{2}/g, " ");
  for (const match of withoutClockTimes.matchAll(/(\d{1,2})\s*बजे/g)) {
    if (!allowed.hours.has(Number(match[1]))) return { ok: false, reason: "unsupported_time" };
  }
  for (const match of text.matchAll(/(\d{1,2})\s*(जनवरी|फ़रवरी|फरवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितंबर|अक्टूबर|नवंबर|दिसंबर)/g)) {
    const monthIndex = HINDI_MONTHS.indexOf(match[2] as (typeof HINDI_MONTHS)[number]);
    const month = monthIndex >= 0 ? monthIndex + 1 : -1;
    if (!allowed.dates.has(`${Number(match[1])}:${month}`)) return { ok: false, reason: "unsupported_date" };
  }

  // Every remaining digit run must trace back to a supplied count.
  for (const match of text.matchAll(/\d+/g)) {
    const value = Number(match[0]);
    if (!allowed.counts.has(value)) return { ok: false, reason: "unsupported_number" };
  }

  /**
   * Status claims must be backed by the fact that enables them.
   *
   * A *negative* statement ("कोई अत्यावश्यक रिपोर्ट नहीं है") is allowed because it is
   * true when the count is zero; only a positive assertion without the supporting fact
   * is rejected. Sentences are checked individually so a negation elsewhere in the
   * briefing cannot excuse an unsupported claim.
   */
  const sentences = text
    .split(/[।!?]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
  const isNegated = (sentence: string) => sentence.includes("नहीं");

  for (const sentence of sentences) {
    if (isNegated(sentence)) continue;

    if (!allowed.allowUrgent && sentence.includes("अत्यावश्यक")) {
      return { ok: false, reason: "unsupported_claim" };
    }
    if (!allowed.allowReviewed && /(समीक्षा पूरी|समीक्षा कर ली|समीक्षा हो चुकी)/.test(sentence)) {
      return { ok: false, reason: "unsupported_claim" };
    }
    if (!allowed.allowPendingReview && /(समीक्षा बाकी|समीक्षा की प्रतीक्षा|समीक्षा के लिए उपलब्ध)/.test(sentence)) {
      return { ok: false, reason: "unsupported_claim" };
    }
    if (!allowed.allowPartial && /(अधूरा|अधूरी|अपूर्ण)/.test(sentence)) {
      return { ok: false, reason: "unsupported_claim" };
    }
    if (!allowed.allowNextAppointment && sentence.includes("अगला अपॉइंटमेंट")) {
      return { ok: false, reason: "unsupported_claim" };
    }
    if (!allowed.allowUpcoming && /(आने वाले|आगामी)/.test(sentence)) {
      return { ok: false, reason: "unsupported_claim" };
    }
  }

  return { ok: true };
}

/**
 * The fact projection sent to Groq. English keys, IST-formatted times, no identifiers,
 * and no free-text patient content of any kind.
 */
export function buildModelInput(facts: SummaryFacts): string {
  const base: Record<string, unknown> = { page: facts.context, time_of_day: facts.time_of_day };

  const reports = (value: {
    total: number;
    today: number;
    awaiting_review: number;
    complete: number;
    partial: number;
    reviewed: number;
    urgent: number;
  }) => ({
    total: value.total,
    received_today: value.today,
    awaiting_review: value.awaiting_review,
    complete_intake: value.complete,
    partial_intake: value.partial,
    reviewed: value.reviewed,
    urgent_category: value.urgent,
  });

  const appointments = (value: {
    today: number;
    today_upcoming: number;
    today_completed: number;
    future: number;
    past: number;
    cancelled: number;
    next_starts: string[];
  }) => ({
    today: value.today,
    later_today: value.today_upcoming,
    completed_today: value.today_completed,
    future_days: value.future,
    past: value.past,
    cancelled: value.cancelled,
    next_start_ist: value.next_starts.map((start) => formatIstFactTime(start)).filter(Boolean),
  });

  switch (facts.context) {
    case "dashboard":
      return JSON.stringify({
        ...base,
        greeting: facts.intent === "greeting",
        appointments: appointments(facts.appointments),
        reports: reports(facts.reports),
      });
    case "reports":
      return JSON.stringify({
        ...base,
        active_filter: facts.tab,
        search_applied: facts.search,
        shown_reports: reports(facts.reports),
      });
    case "appointments":
      return JSON.stringify({ ...base, active_tab: facts.tab, appointments: appointments(facts.appointments) });
    case "urgent_review":
      return JSON.stringify({
        ...base,
        urgent_queue_total: facts.queue_total,
        urgent_queue_pending_review: facts.queue_pending,
        urgent_queue_reviewed: facts.queue_reviewed,
      });
    case "report_detail":
      return JSON.stringify({
        ...base,
        selected_report: {
          intake: facts.focus.state,
          reviewed: facts.focus.reviewed,
          main_concern_recorded: facts.focus.concern_recorded,
          answered_fields: facts.focus.answered_fields,
          missing_fields: facts.focus.missing_fields,
          extra_review_flag: facts.focus.possible_urgent,
        },
      });
    case "urgent_detail":
      return JSON.stringify({
        ...base,
        urgent_queue_total: facts.queue_total,
        selected_report: {
          intake: facts.focus.state,
          reviewed: facts.focus.reviewed,
          main_concern_recorded: facts.focus.concern_recorded,
          answered_fields: facts.focus.answered_fields,
          missing_fields: facts.focus.missing_fields,
          emergency_rule_recorded: facts.focus.emergency_flag,
          extra_review_flag: facts.focus.possible_urgent,
        },
      });
  }
}

function formatIstFactTime(iso: string): string | null {
  const date = parseInstant(iso);
  if (!date) return null;
  const parts = istClockParts(date);
  if (!parts) return null;
  const part = parts.hour < 4 ? "रात" : parts.hour < 12 ? "सुबह" : parts.hour < 16 ? "दोपहर" : parts.hour < 20 ? "शाम" : "रात";
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  return `${part} ${hour12}:${String(parts.minute).padStart(2, "0")}`;
}

const SYSTEM_PROMPT = `You write the spoken briefing for "Samwad Assistant", a Hindi helper inside a doctor's dashboard in an educational demo.

Hard rules, in order of importance:
1. Reply in Hindi using Devanagari script only. Never use Latin letters and never use English words. Numbers must be written with digits (for example 4), never as words (never "चार").
2. Use only the facts in the JSON input. Never compute, add, round, estimate or invent a count, a time, a date, a status or a category. If a value is 0, you may say that nothing is scheduled or pending for it.
3. Never mention a patient name, age, gender, phone number, reference code, symptom, medicine or diagnosis. Never say a report is reviewed unless the input says reviewed is true or a reviewed count above 0.
4. Never claim that a doctor, ambulance, emergency service or anyone else was contacted or alerted. Never mention 112.
5. Never give medical advice, a diagnosis, a disease probability, a prescription or a treatment suggestion.
6. Write 2 to 4 short sentences, at most ${SUMMARY_MAX_CHARACTERS} characters. Address the doctor once as "डॉक्टर" and keep a warm, calm, professional tone. Prefer mentioning the most important item first: urgent items, then partial intake, then pending review, then appointments.
7. When greeting is true, open with "सुप्रभात" (morning), "नमस्कार" (afternoon or night) or "शुभ संध्या" (evening) according to time_of_day, and close with a short good wish. When greeting is false, start with "डॉक्टर," and do not repeat a greeting.
8. Output only the JSON object {"summary": "<Hindi text>"}.`;

export interface PhraseOptions extends GroqOptions {
  /** Injected clock for tests; the prompt never depends on it. */
  now?: Date;
}

export type PhraseOutcome =
  | { ok: true; text: string; model: string; attempts: number }
  | { ok: false; attempts: number; reason: string };

/**
 * One Groq attempt, plus one corrective retry. Returns a failure reason (a stable code,
 * never model text) so the caller can fall back deterministically.
 */
export async function phraseDoctorSummary(facts: SummaryFacts, options: PhraseOptions): Promise<PhraseOutcome> {
  const input = buildModelInput(facts);
  let lastReason = "rejected";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const system =
      attempt === 1
        ? SYSTEM_PROMPT
        : `${SYSTEM_PROMPT}\n\nThe previous answer was rejected (${lastReason}). Rewrite it so it follows every rule exactly.`;

    const result = await requestStructured<{ summary: string }>(options, {
      schemaName: "doctor_assistant_briefing",
      schema: {
        type: "object",
        properties: { summary: { type: "string" } },
        required: ["summary"],
        additionalProperties: false,
      },
      system,
      user: input,
      maxCompletionTokens: 400,
      validate: (parsed) => {
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
        const keys = Object.keys(parsed as Record<string, unknown>);
        if (keys.length !== 1 || keys[0] !== "summary") return null;
        const summary = (parsed as { summary?: unknown }).summary;
        return typeof summary === "string" ? { summary } : null;
      },
    });

    if (!result.ok) {
      lastReason = result.kind;
      // An auth/config failure will not improve on a second attempt.
      if (result.kind === "auth" || result.kind === "config") break;
      continue;
    }

    const validation = validateModelSummary(result.value.summary, facts);
    if (validation.ok) {
      return {
        ok: true,
        text: result.value.summary.replace(/\s+/g, " ").trim(),
        model: result.model,
        attempts: attempt,
      };
    }

    lastReason = validation.reason ?? "rejected";
  }

  return { ok: false, attempts: 2, reason: lastReason };
}
