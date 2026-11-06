/**
 * Samwad Assistant — doctor-facing Hindi summary engine.
 *
 * One pure module renders the exact Hindi sentence the doctor reads and the exact
 * sentence Gnani Timbre speaks. The browser imports it (via `src/lib/assistant-summary.ts`)
 * and the `speak` Edge Function imports it, so the two can never disagree.
 *
 * Design rules (AGENTS.md, docs/report-design.md §15):
 *   - Facts are counts and stable statuses only. No patient name, phone, identifier or
 *     free-text symptom is accepted here, so nothing identifying can be spoken.
 *   - The renderer never diagnoses, never predicts risk, never prescribes and never
 *     claims that a doctor, ambulance or emergency service was contacted.
 *   - Counts are supplied by the caller from rows it is already authorised to read.
 *     This module never invents a number, a time or a status.
 *   - The text stays below the Timbre request cap (600 characters) by construction.
 *
 * `parseSummaryFacts` is the strict wire validator used by `speak`; it accepts only the
 * fixed shape below, so the function cannot be turned into a free-text TTS proxy.
 */

export const SUMMARY_FACTS_VERSION = 1 as const;

/** Must stay below Timbre's MAX_TEXT_CHARACTERS (600) in `_shared/timbre.ts`. */
export const MAX_SUMMARY_CHARACTERS = 560;

export type AssistantContextKind =
  | "dashboard"
  | "reports"
  | "report_detail"
  | "urgent_detail"
  | "urgent_review"
  | "appointments";

export type SummaryIntent = "greeting" | "summary";
export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";
export type ReportFilterTab = "all" | "urgent" | "booked" | "not_booked";
export type AppointmentTab = "today" | "upcoming" | "past";
export type ReportIntakeState = "complete" | "partial" | "urgent";

export interface ReportCounts {
  /** Every report visible to this doctor in the current set. */
  total: number;
  /** Reports whose intake was created today (Asia/Kolkata). */
  today: number;
  /** status = submitted AND reviewed_at IS NULL. */
  awaiting_review: number;
  /** status = submitted (intake complete). */
  complete: number;
  /** status = partial (v1.3 early finish). */
  partial: number;
  /** reviewed_at IS NOT NULL. */
  reviewed: number;
  /** status = urgent_partial (deterministic emergency queue). */
  urgent: number;
}

export interface AppointmentCounts {
  /** Confirmed appointments whose slot starts today (Asia/Kolkata). */
  today: number;
  /** Today's appointments that have not started yet. */
  today_upcoming: number;
  /** Today's appointments whose slot end is in the past. */
  today_completed: number;
  /** Confirmed appointments on a later IST day. */
  future: number;
  /** Confirmed appointments on an earlier IST day. */
  past: number;
  /** Cancelled appointments in the visible set. Never counted as booked. */
  cancelled: number;
  /** Up to three upcoming slot starts, chronological, ISO instants. */
  next_starts: string[];
  /** True when `next_starts[0]` is today, so the clock alone is unambiguous. */
  next_is_today: boolean;
}

export interface ReportFocus {
  state: ReportIntakeState;
  reviewed: boolean;
  concern_recorded: boolean;
  /** Tracked report fields that carry a handled status (provided/declined/unknown). */
  answered_fields: number;
  /** Tracked report fields still missing (not_provided/unclear/not_asked). */
  missing_fields: number;
  /** Deterministic emergency rule fired for this report (stored flag only). */
  emergency_flag: boolean;
  /** Supplementary possible_urgent / needs_human_review flag (stored flag only). */
  possible_urgent: boolean;
}

export type SummaryFacts =
  | {
      v: typeof SUMMARY_FACTS_VERSION;
      context: "dashboard";
      intent: SummaryIntent;
      time_of_day: TimeOfDay;
      reports: ReportCounts;
      appointments: AppointmentCounts;
    }
  | {
      v: typeof SUMMARY_FACTS_VERSION;
      context: "reports";
      time_of_day: TimeOfDay;
      tab: ReportFilterTab;
      search: boolean;
      reports: ReportCounts;
    }
  | {
      v: typeof SUMMARY_FACTS_VERSION;
      context: "appointments";
      time_of_day: TimeOfDay;
      tab: AppointmentTab;
      appointments: AppointmentCounts;
    }
  | {
      v: typeof SUMMARY_FACTS_VERSION;
      context: "urgent_review";
      time_of_day: TimeOfDay;
      queue_total: number;
      queue_pending: number;
      queue_reviewed: number;
    }
  | {
      v: typeof SUMMARY_FACTS_VERSION;
      context: "report_detail";
      time_of_day: TimeOfDay;
      focus: ReportFocus;
    }
  | {
      v: typeof SUMMARY_FACTS_VERSION;
      context: "urgent_detail";
      time_of_day: TimeOfDay;
      queue_total: number;
      focus: ReportFocus;
    };

// ---------------------------------------------------------------- IST formatting

const IST_TIME_ZONE = "Asia/Kolkata";
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

const HINDI_MONTHS = [
  "जनवरी",
  "फ़रवरी",
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

export function parseInstant(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!ISO_INSTANT.test(trimmed)) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

interface ClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Calendar + clock fields as seen in Asia/Kolkata, never the host zone. */
export function istClockParts(value: Date | string): ClockParts | null {
  const date = typeof value === "string" ? parseInstant(value) : value;
  if (!date || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? NaN);
  const hourValue = read("hour");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    // en-GB renders midnight as 24 in some ICU builds.
    hour: hourValue === 24 ? 0 : hourValue,
    minute: read("minute"),
  };
}

/** `YYYY-MM-DD` for an Asia/Kolkata calendar day. */
export function istDateKey(value: Date | string = new Date()): string | null {
  const parts = istClockParts(value);
  if (!parts) return null;
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * Time-of-day bucket for the greeting. Late night is "नमस्कार", never a farewell such
 * as "शुभ रात्रि".
 */
export function istTimeOfDay(now: Date = new Date()): TimeOfDay {
  const parts = istClockParts(now);
  const hour = parts ? parts.hour : 9;
  if (hour >= 4 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** "सुबह 9:30" — the day-part is repeated by the caller as "… बजे". */
export function hindiClock(value: string): string | null {
  const parts = istClockParts(value);
  if (!parts) return null;
  const part =
    parts.hour < 4 ? "रात" : parts.hour < 12 ? "सुबह" : parts.hour < 16 ? "दोपहर" : parts.hour < 20 ? "शाम" : "रात";
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  const clock = parts.minute === 0 ? `${hour12}` : `${hour12}:${pad2(parts.minute)}`;
  return `${part} ${clock}`;
}

/** "9 नवंबर" */
export function hindiDate(value: string): string | null {
  const parts = istClockParts(value);
  if (!parts) return null;
  return `${parts.day} ${HINDI_MONTHS[parts.month - 1] ?? ""}`.trim();
}

// ---------------------------------------------------------------- Hindi helpers

/** Hindi verb agreement for a counted noun: "1 रिपोर्ट है", "3 रिपोर्ट हैं". */
function hai(count: number): string {
  return count === 1 ? "है" : "हैं";
}

const GREETING_OPENING: Readonly<Record<TimeOfDay, string>> = {
  morning: "सुप्रभात डॉक्टर! आपका दिन शुभ हो।",
  afternoon: "नमस्कार डॉक्टर! आपका दिन शुभ हो।",
  evening: "शुभ संध्या डॉक्टर! आपका दिन शुभ हो।",
  night: "नमस्कार डॉक्टर! आपका दिन शुभ हो।",
};

const GREETING_CLOSING = "आपका दिन अच्छा रहे, डॉक्टर!";

const TAB_LABEL_HI: Readonly<Record<ReportFilterTab, string>> = {
  all: "सभी",
  urgent: "अत्यावश्यक",
  booked: "बुक किए गए",
  not_booked: "बुक न किए गए",
};

// ---------------------------------------------------------------- Sentence builders

function appointmentSentences(appointments: AppointmentCounts): string[] {
  const sentences: string[] = [];

  if (appointments.today === 0) {
    sentences.push(
      appointments.future > 0
        ? `आज कोई अपॉइंटमेंट निर्धारित नहीं है, लेकिन आगे ${appointments.future} अपॉइंटमेंट निर्धारित ${hai(
            appointments.future,
          )}।`
        : "आज कोई अपॉइंटमेंट निर्धारित नहीं है।",
    );
  } else {
    let line = `आज आपके कुल ${appointments.today} अपॉइंटमेंट निर्धारित ${hai(appointments.today)}।`;
    if (appointments.today_upcoming > 0) {
      const upcomingWord = appointments.today_upcoming === 1 ? "वाला" : "वाले";
      line += ` इनमें ${appointments.today_upcoming} अपॉइंटमेंट अभी आने ${upcomingWord} ${hai(
        appointments.today_upcoming,
      )}।`;
    } else if (appointments.today_completed > 0) {
      line += " आज के सभी अपॉइंटमेंट पूरे हो चुके हैं।";
    }
    sentences.push(line);

    const first = appointments.next_starts[0] ? hindiClock(appointments.next_starts[0]) : null;
    if (first) {
      // A slot that is not today needs its date, or "at 9:30" would read as today.
      const firstDay = !appointments.next_is_today && appointments.next_starts[0]
        ? hindiDate(appointments.next_starts[0])
        : null;
      sentences.push(
        firstDay
          ? `आपका अगला अपॉइंटमेंट ${firstDay} को ${first} बजे है।`
          : `आपका अगला अपॉइंटमेंट ${first} बजे है।`,
      );
      const second = appointments.next_starts[1] ? hindiClock(appointments.next_starts[1]) : null;
      if (second) {
        const secondDay = !appointments.next_is_today && appointments.next_starts[1]
          ? hindiDate(appointments.next_starts[1])
          : null;
        sentences.push(
          secondDay
            ? `उसके बाद ${secondDay} को ${second} बजे अगला अपॉइंटमेंट निर्धारित है।`
            : `उसके बाद ${second} बजे अगला अपॉइंटमेंट निर्धारित है।`,
        );
      }
    }
  }

  if (appointments.cancelled > 0) {
    sentences.push(
      `${appointments.cancelled} अपॉइंटमेंट रद्द ${hai(appointments.cancelled)}; वे अपॉइंटमेंट सूची में बुक नहीं गिने जाते।`,
    );
  }

  return sentences;
}

/**
 * Report set sentences. Every sentence stands alone and is only emitted when the
 * corresponding count is non-zero, so the summary never claims a category that the
 * data does not support.
 */
function reportSentences(reports: ReportCounts): string[] {
  if (reports.total === 0) return ["अभी आपके पास कोई रिपोर्ट उपलब्ध नहीं है।"];

  const sentences: string[] = [];
  if (reports.urgent > 0) {
    sentences.push(`${reports.urgent} रिपोर्ट अत्यावश्यक श्रेणी में ${hai(reports.urgent)}।`);
  }
  if (reports.partial > 0) {
    sentences.push(`${reports.partial} रिपोर्ट का इंटेक अधूरा है।`);
  }
  if (reports.awaiting_review > 0) {
    sentences.push(`${reports.awaiting_review} रिपोर्ट समीक्षा की प्रतीक्षा में ${hai(reports.awaiting_review)}।`);
  }
  if (reports.complete > 0) {
    sentences.push(`${reports.complete} रिपोर्ट का इंटेक पूरा हो चुका है।`);
  }
  if (reports.reviewed > 0) {
    sentences.push(`${reports.reviewed} रिपोर्ट की समीक्षा पूरी हो चुकी है।`);
  }
  if (sentences.length === 0) {
    sentences.push("अभी कोई रिपोर्ट समीक्षा के लिए लंबित नहीं है।");
  }
  return sentences;
}

function suggestionSentence(reports: ReportCounts): string | null {
  if (reports.urgent > 0) return "आप चाहें तो पहले अत्यावश्यक रिपोर्ट देख सकते हैं।";
  if (reports.partial > 0) return "आप चाहें तो पहले अधूरी रिपोर्ट देख सकते हैं।";
  if (reports.awaiting_review > 0) return "आप चाहें तो पहली रिपोर्ट खोलकर समीक्षा शुरू कर सकते हैं।";
  return null;
}

/** Fact sentences for the currently selected report. Never a clinical conclusion. */
function focusSentences(focus: ReportFocus): string[] {
  const sentences: string[] = [];

  if (focus.state === "urgent") {
    sentences.push(
      focus.emergency_flag
        ? "यह रिपोर्ट सुरक्षा नियम के कारण अत्यावश्यक श्रेणी में दर्ज है और इसका इंटेक बीच में रोका गया था।"
        : "यह रिपोर्ट अत्यावश्यक श्रेणी में दर्ज है और इसका इंटेक बीच में रोका गया था।",
    );
  } else if (focus.state === "partial") {
    sentences.push("यह रिपोर्ट अधूरी है, क्योंकि इंटेक बीच में समाप्त हुआ था।");
  } else {
    sentences.push("यह रिपोर्ट पूरी हो चुकी है।");
  }

  sentences.push(
    focus.concern_recorded
      ? "मरीज़ ने अपनी मुख्य परेशानी दर्ज की है।"
      : "मरीज़ ने अपनी मुख्य परेशानी दर्ज नहीं की है।",
  );

  if (focus.missing_fields > 0) {
    sentences.push(
      `रिपोर्ट में ${focus.answered_fields} जानकारी दर्ज ${hai(
        focus.answered_fields,
      )} और ${focus.missing_fields} जानकारी अभी प्राप्त नहीं हुई ${hai(focus.missing_fields)}।`,
    );
  } else if (focus.answered_fields > 0) {
    sentences.push(`रिपोर्ट की सभी ${focus.answered_fields} जानकारियाँ दर्ज हो चुकी हैं।`);
  }

  if (focus.possible_urgent) {
    sentences.push("इस रिपोर्ट पर अतिरिक्त समीक्षा का चिह्न लगा है।");
  }

  sentences.push(
    focus.reviewed ? "इस रिपोर्ट की समीक्षा पूरी हो चुकी है।" : "इस रिपोर्ट की समीक्षा अभी बाकी है।",
  );

  if (!focus.reviewed) {
    sentences.push("कृपया रिपोर्ट में उपलब्ध उत्तरों और बाकी अधूरी जानकारी की समीक्षा करें।");
  }

  return sentences;
}

function limitToBudget(sentences: string[]): string {
  const text = sentences.join(" ").replace(/\s+/g, " ").trim();
  if (text.length <= MAX_SUMMARY_CHARACTERS) return text;
  // Safety net for pathological fixture data: drop whole optional sentences from the
  // end rather than cutting a sentence in half.
  const kept = [...sentences];
  while (kept.length > 1) {
    kept.pop();
    const candidate = kept.join(" ").replace(/\s+/g, " ").trim();
    if (candidate.length <= MAX_SUMMARY_CHARACTERS) return candidate;
  }
  return text.slice(0, MAX_SUMMARY_CHARACTERS);
}

/**
 * Renders the Hindi summary. Deterministic: the same facts always produce the same
 * sentence, so the displayed text and the spoken text are identical.
 */
export function renderHindiSummary(facts: SummaryFacts): string {
  switch (facts.context) {
    case "dashboard": {
      const sentences: string[] = [];
      if (facts.intent === "greeting") sentences.push(GREETING_OPENING[facts.time_of_day]);
      else sentences.push("डॉक्टर, आज के काम की जानकारी इस प्रकार है।");

      sentences.push(...appointmentSentences(facts.appointments));

      if (facts.reports.today > 0) {
        sentences.push(`आज आपको ${facts.reports.today} नई रिपोर्ट प्राप्त हुई ${hai(facts.reports.today)}।`);
      }
      sentences.push(...reportSentences(facts.reports));

      const suggestion = suggestionSentence(facts.reports);
      if (suggestion) sentences.push(suggestion);
      if (facts.intent === "greeting") sentences.push(GREETING_CLOSING);
      return limitToBudget(sentences);
    }

    case "reports": {
      const sentences: string[] = [];
      const filterParts: string[] = [];
      if (facts.tab !== "all") filterParts.push(`‘${TAB_LABEL_HI[facts.tab]}’ फ़िल्टर लागू है`);
      if (facts.search) filterParts.push("खोज लागू है");
      sentences.push(
        filterParts.length > 0
          ? `डॉक्टर, ${filterParts.join(" और ")}, इसलिए इस सूची में ${facts.reports.total} रिपोर्ट दिखाई दे रही ${hai(
              facts.reports.total,
            )}।`
          : `डॉक्टर, इस सूची में कुल ${facts.reports.total} रिपोर्ट दिखाई दे रही ${hai(facts.reports.total)}।`,
      );

      if (facts.reports.total === 0) {
        sentences.push("इस चयन में अभी कोई रिपोर्ट नहीं है; आप फ़िल्टर बदलकर दोबारा देख सकते हैं।");
        return limitToBudget(sentences);
      }

      sentences.push(...reportSentences(facts.reports));
      const suggestion = suggestionSentence(facts.reports);
      if (suggestion) sentences.push(suggestion);
      return limitToBudget(sentences);
    }

    case "appointments": {
      const sentences: string[] = [];
      const appointments = facts.appointments;

      if (facts.tab === "today") {
        sentences.push(...appointmentSentences(appointments));
        if (appointments.today > 0) {
          sentences.push("आज के बाकी अपॉइंटमेंट सूची में उपलब्ध हैं।");
        }
      } else if (facts.tab === "upcoming") {
        if (appointments.future === 0) {
          sentences.push("डॉक्टर, आने वाले दिनों में कोई अपॉइंटमेंट निर्धारित नहीं है।");
        } else {
          sentences.push(
            `डॉक्टर, आने वाले दिनों में ${appointments.future} अपॉइंटमेंट निर्धारित ${hai(
              appointments.future,
            )}।`,
          );
          const first = appointments.next_starts[0];
          const clock = first ? hindiClock(first) : null;
          const day = first ? hindiDate(first) : null;
          if (clock) {
            sentences.push(
              day && !appointments.next_is_today
                ? `अगला अपॉइंटमेंट ${day} को ${clock} बजे है।`
                : `अगला अपॉइंटमेंट ${clock} बजे है।`,
            );
          }
        }
      } else {
        if (appointments.past === 0) {
          sentences.push("डॉक्टर, पिछले अपॉइंटमेंट में कोई प्रविष्टि नहीं है।");
        } else {
          sentences.push(
            `डॉक्टर, पिछले अपॉइंटमेंट में ${appointments.past} प्रविष्टि ${hai(appointments.past)}।`,
          );
        }
      }

      if (appointments.cancelled > 0) {
        sentences.push(
          `${appointments.cancelled} अपॉइंटमेंट रद्द ${hai(appointments.cancelled)}; वे बुक नहीं गिने जाते।`,
        );
      }
      return limitToBudget(sentences);
    }

    case "urgent_review": {
      if (facts.queue_total === 0) {
        return "डॉक्टर, इस समय अत्यावश्यक सूची खाली है। सामान्य रिपोर्ट की समीक्षा जारी रख सकते हैं।";
      }
      const sentences = [
        `डॉक्टर, अत्यावश्यक सूची में इस समय ${facts.queue_total} रिपोर्ट ${hai(facts.queue_total)}।`,
        `इनमें ${facts.queue_pending} की समीक्षा बाकी है और ${facts.queue_reviewed} की समीक्षा पूरी हो चुकी है।`,
        "इन रिपोर्टों के लिए सामान्य अपॉइंटमेंट उपलब्ध नहीं हैं।",
      ];
      return limitToBudget(sentences);
    }

    case "report_detail": {
      return limitToBudget(["डॉक्टर,", ...focusSentences(facts.focus)]);
    }

    case "urgent_detail": {
      const sentences = [
        `डॉक्टर, अत्यावश्यक सूची में इस समय ${facts.queue_total} रिपोर्ट ${hai(facts.queue_total)}।`,
        ...focusSentences({ ...facts.focus, state: "urgent" }),
        "इस रिपोर्ट के लिए सामान्य अपॉइंटमेंट उपलब्ध नहीं हैं।",
      ];
      return limitToBudget(sentences);
    }
  }
}

// ---------------------------------------------------------------- English helpers

export type SummaryLanguage = "hi" | "en";

/** "9:30 AM" (Asia/Kolkata, uppercase period). */
export function englishClock(value: string): string | null {
  const parts = istClockParts(value);
  if (!parts) return null;
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  const period = parts.hour < 12 ? "AM" : "PM";
  return parts.minute === 0 ? `${hour12} ${period}` : `${hour12}:${pad2(parts.minute)} ${period}`;
}

const ENGLISH_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "9 November" */
export function englishDate(value: string): string | null {
  const parts = istClockParts(value);
  if (!parts) return null;
  return `${parts.day} ${ENGLISH_MONTHS[parts.month - 1] ?? ""}`.trim();
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

const GREETING_OPENING_EN: Readonly<Record<TimeOfDay, string>> = {
  morning: "Good morning, Doctor.",
  afternoon: "Good afternoon, Doctor.",
  evening: "Good evening, Doctor.",
  night: "Hello, Doctor.",
};

const GREETING_CLOSING_EN = "Have a productive day.";

const TAB_LABEL_EN: Readonly<Record<ReportFilterTab, string>> = {
  all: "all",
  urgent: "urgent",
  booked: "booked",
  not_booked: "not booked",
};

function appointmentSentencesEn(appointments: AppointmentCounts): string[] {
  const sentences: string[] = [];

  if (appointments.today === 0) {
    sentences.push(
      appointments.future > 0
        ? `No appointments are scheduled for today, but ${appointments.future} ${plural(
            appointments.future,
            "appointment is",
            "appointments are",
          )} on the calendar for later days.`
        : "No appointments are scheduled for today.",
    );
  } else {
    let line = `You have ${appointments.today} ${plural(
      appointments.today,
      "appointment",
      "appointments",
    )} scheduled today.`;
    if (appointments.today_upcoming > 0) {
      line += ` ${appointments.today_upcoming} of them ${plural(
        appointments.today_upcoming,
        "is",
        "are",
      )} still upcoming.`;
    } else if (appointments.today_completed > 0) {
      line += " All of today's appointments are complete.";
    }
    sentences.push(line);

    const first = appointments.next_starts[0] ? englishClock(appointments.next_starts[0]) : null;
    if (first) {
      const firstDay =
        !appointments.next_is_today && appointments.next_starts[0]
          ? englishDate(appointments.next_starts[0])
          : null;
      sentences.push(
        firstDay
          ? `Your next appointment is on ${firstDay} at ${first}.`
          : `Your next appointment is at ${first}.`,
      );
      const second = appointments.next_starts[1] ? englishClock(appointments.next_starts[1]) : null;
      if (second) {
        const secondDay =
          !appointments.next_is_today && appointments.next_starts[1]
            ? englishDate(appointments.next_starts[1])
            : null;
        sentences.push(
          secondDay
            ? `The appointment after that is on ${secondDay} at ${second}.`
            : `The appointment after that is at ${second}.`,
        );
      }
    }
  }

  if (appointments.cancelled > 0) {
    sentences.push(
      `${appointments.cancelled} ${plural(
        appointments.cancelled,
        "appointment is",
        "appointments are",
      )} cancelled and not counted as booked.`,
    );
  }

  return sentences;
}

function reportSentencesEn(reports: ReportCounts): string[] {
  if (reports.total === 0) return ["No reports are available right now."];

  const sentences: string[] = [];
  if (reports.urgent > 0) {
    sentences.push(
      `${reports.urgent} ${plural(reports.urgent, "report is", "reports are")} in the urgent category.`,
    );
  }
  if (reports.partial > 0) {
    sentences.push(
      `${reports.partial} ${plural(reports.partial, "report has", "reports have")} an incomplete intake.`,
    );
  }
  if (reports.awaiting_review > 0) {
    sentences.push(
      `${reports.awaiting_review} ${plural(
        reports.awaiting_review,
        "report is",
        "reports are",
      )} awaiting review.`,
    );
  }
  if (reports.complete > 0) {
    sentences.push(
      `${reports.complete} ${plural(reports.complete, "report has", "reports have")} a complete intake.`,
    );
  }
  if (reports.reviewed > 0) {
    sentences.push(
      `${reports.reviewed} ${plural(reports.reviewed, "report has", "reports have")} been reviewed.`,
    );
  }
  if (sentences.length === 0) sentences.push("No reports are pending review right now.");
  return sentences;
}

function suggestionSentenceEn(reports: ReportCounts): string | null {
  if (reports.urgent > 0) return "You may want to review the urgent report first.";
  if (reports.partial > 0) return "You may want to review the incomplete report first.";
  if (reports.awaiting_review > 0) return "You may want to open the first report and begin the review.";
  return null;
}

function focusSentencesEn(focus: ReportFocus): string[] {
  const sentences: string[] = [];

  if (focus.state === "urgent") {
    sentences.push(
      focus.emergency_flag
        ? "This report is in the urgent category because a safety rule matched, and its intake was stopped early."
        : "This report is in the urgent category and its intake was stopped early.",
    );
  } else if (focus.state === "partial") {
    sentences.push("This report is incomplete because the intake ended early.");
  } else {
    sentences.push("This report is complete.");
  }

  sentences.push(
    focus.concern_recorded
      ? "The patient recorded a main concern."
      : "The patient did not record a main concern.",
  );

  if (focus.missing_fields > 0) {
    sentences.push(
      `The report has ${focus.answered_fields} recorded ${plural(
        focus.answered_fields,
        "field",
        "fields",
      )} and ${focus.missing_fields} ${plural(focus.missing_fields, "field", "fields")} still missing.`,
    );
  } else if (focus.answered_fields > 0) {
    sentences.push(`All ${focus.answered_fields} tracked fields are recorded.`);
  }

  if (focus.possible_urgent) sentences.push("This report is flagged for additional review.");

  sentences.push(
    focus.reviewed ? "This report has been reviewed." : "This report is still awaiting review.",
  );

  if (!focus.reviewed) {
    sentences.push("Please review the recorded answers and the missing information.");
  }

  return sentences;
}

/**
 * Renders the English summary. Same facts, same structure as the Hindi renderer, so the
 * deterministic fallback always matches the selected language.
 */
export function renderEnglishSummary(facts: SummaryFacts): string {
  switch (facts.context) {
    case "dashboard": {
      const sentences: string[] = [];
      if (facts.intent === "greeting") sentences.push(GREETING_OPENING_EN[facts.time_of_day]);
      else sentences.push("Doctor, here is your current workload.");

      sentences.push(...appointmentSentencesEn(facts.appointments));

      if (facts.reports.today > 0) {
        sentences.push(
          `${facts.reports.today} new ${plural(
            facts.reports.today,
            "report was",
            "reports were",
          )} received today.`,
        );
      }
      sentences.push(...reportSentencesEn(facts.reports));

      const suggestion = suggestionSentenceEn(facts.reports);
      if (suggestion) sentences.push(suggestion);
      if (facts.intent === "greeting") sentences.push(GREETING_CLOSING_EN);
      return limitToBudget(sentences);
    }

    case "reports": {
      const sentences: string[] = [];
      const filters: string[] = [];
      if (facts.tab !== "all") filters.push(`the ${TAB_LABEL_EN[facts.tab]} filter`);
      if (facts.search) filters.push("a search");
      const opening =
        filters.length === 0
          ? ""
          : filters.length === 1
            ? `${filters[0].charAt(0).toUpperCase()}${filters[0].slice(1)} is applied, so `
            : `${filters[0].charAt(0).toUpperCase()}${filters[0].slice(1)} and ${filters[1]} are applied, so `;
      sentences.push(
        `Doctor, ${opening}this list shows ${facts.reports.total} ${plural(
          facts.reports.total,
          "report",
          "reports",
        )}.`,
      );

      if (facts.reports.total === 0) {
        sentences.push("No reports match this selection. Adjust the filter to see more.");
        return limitToBudget(sentences);
      }

      sentences.push(...reportSentencesEn(facts.reports));
      const suggestion = suggestionSentenceEn(facts.reports);
      if (suggestion) sentences.push(suggestion);
      return limitToBudget(sentences);
    }

    case "appointments": {
      const sentences: string[] = [];
      const appointments = facts.appointments;

      if (facts.tab === "today") {
        sentences.push(...appointmentSentencesEn(appointments));
        if (appointments.today > 0) sentences.push("Today's remaining appointments are in the list.");
      } else if (facts.tab === "upcoming") {
        if (appointments.future === 0) {
          sentences.push("Doctor, no appointments are scheduled in the coming days.");
        } else {
          sentences.push(
            `Doctor, ${appointments.future} ${plural(
              appointments.future,
              "appointment is",
              "appointments are",
            )} scheduled in the coming days.`,
          );
          const first = appointments.next_starts[0];
          const clock = first ? englishClock(first) : null;
          const day = first ? englishDate(first) : null;
          if (clock) {
            sentences.push(
              day && !appointments.next_is_today
                ? `The next appointment is on ${day} at ${clock}.`
                : `The next appointment is at ${clock}.`,
            );
          }
        }
      } else if (appointments.past === 0) {
        sentences.push("Doctor, there are no past appointment entries.");
      } else {
        sentences.push(
          `Doctor, ${appointments.past} past ${plural(
            appointments.past,
            "appointment is",
            "appointments are",
          )} available.`,
        );
      }

      if (appointments.cancelled > 0) {
        sentences.push(
          `${appointments.cancelled} ${plural(
            appointments.cancelled,
            "appointment is",
            "appointments are",
          )} cancelled and not counted as booked.`,
        );
      }
      return limitToBudget(sentences);
    }

    case "urgent_review": {
      if (facts.queue_total === 0) {
        return "Doctor, the urgent queue is empty right now. You can continue with routine reports.";
      }
      return limitToBudget([
        `Doctor, the urgent queue currently has ${facts.queue_total} ${plural(
          facts.queue_total,
          "report",
          "reports",
        )}.`,
        `${facts.queue_pending} are awaiting review and ${facts.queue_reviewed} have been reviewed.`,
        "Routine appointments are not available for these reports.",
      ]);
    }

    case "report_detail":
      return limitToBudget(["Doctor,", ...focusSentencesEn(facts.focus)]);

    case "urgent_detail":
      return limitToBudget([
        `Doctor, the urgent queue currently has ${facts.queue_total} ${plural(
          facts.queue_total,
          "report",
          "reports",
        )}.`,
        ...focusSentencesEn({ ...facts.focus, state: "urgent" }),
        "Routine appointments are not available for this report.",
      ]);
  }
}

/** Renders the deterministic fallback in the selected language. */
export function renderSummary(facts: SummaryFacts, language: SummaryLanguage): string {
  return language === "en" ? renderEnglishSummary(facts) : renderHindiSummary(facts);
}

/** Validates a requested summary language; anything else falls back to Hindi. */
export function parseSummaryLanguage(value: unknown): SummaryLanguage {
  return value === "en" ? "en" : "hi";
}

// ---------------------------------------------------------------- Strict validation

const CONTEXTS: readonly AssistantContextKind[] = [
  "dashboard",
  "reports",
  "report_detail",
  "urgent_detail",
  "urgent_review",
  "appointments",
];
const TIME_OF_DAY: readonly TimeOfDay[] = ["morning", "afternoon", "evening", "night"];
const REPORT_TABS: readonly ReportFilterTab[] = ["all", "urgent", "booked", "not_booked"];
const APPOINTMENT_TABS: readonly AppointmentTab[] = ["today", "upcoming", "past"];
const INTAKE_STATES: readonly ReportIntakeState[] = ["complete", "partial", "urgent"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function readCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 999) return null;
  return value;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function readReportCounts(value: unknown): ReportCounts | null {
  if (!isRecord(value)) return null;
  const keys = ["total", "today", "awaiting_review", "complete", "partial", "reviewed", "urgent"] as const;
  if (!hasOnlyKeys(value, keys)) return null;
  const counts = {} as ReportCounts;
  for (const key of keys) {
    const parsed = readCount(value[key]);
    if (parsed === null) return null;
    counts[key] = parsed;
  }
  return counts;
}

function readAppointmentCounts(value: unknown): AppointmentCounts | null {
  if (!isRecord(value)) return null;
  const keys = [
    "today",
    "today_upcoming",
    "today_completed",
    "future",
    "past",
    "cancelled",
    "next_starts",
    "next_is_today",
  ] as const;
  if (!hasOnlyKeys(value, keys)) return null;

  const counts = {} as AppointmentCounts;
  for (const key of ["today", "today_upcoming", "today_completed", "future", "past", "cancelled"] as const) {
    const parsed = readCount(value[key]);
    if (parsed === null) return null;
    counts[key] = parsed;
  }
  if (!Array.isArray(value.next_starts) || value.next_starts.length > 3) return null;
  const starts: string[] = [];
  for (const entry of value.next_starts) {
    if (!parseInstant(entry)) return null;
    starts.push((entry as string).trim());
  }
  const nextIsToday = readBoolean(value.next_is_today);
  if (nextIsToday === null) return null;
  counts.next_starts = starts;
  counts.next_is_today = nextIsToday;
  return counts;
}

function readReportFocus(value: unknown): ReportFocus | null {
  if (!isRecord(value)) return null;
  const keys = [
    "state",
    "reviewed",
    "concern_recorded",
    "answered_fields",
    "missing_fields",
    "emergency_flag",
    "possible_urgent",
  ] as const;
  if (!hasOnlyKeys(value, keys)) return null;

  const state = readEnum(value.state, INTAKE_STATES);
  const reviewed = readBoolean(value.reviewed);
  const concern = readBoolean(value.concern_recorded);
  const answered = readCount(value.answered_fields);
  const missing = readCount(value.missing_fields);
  const emergency = readBoolean(value.emergency_flag);
  const possible = readBoolean(value.possible_urgent);
  if (!state || reviewed === null || concern === null) return null;
  if (answered === null || missing === null || emergency === null || possible === null) return null;
  if (answered + missing > 50) return null;
  return {
    state,
    reviewed,
    concern_recorded: concern,
    answered_fields: answered,
    missing_fields: missing,
    emergency_flag: emergency,
    possible_urgent: possible,
  };
}

/**
 * Validates a `speak` request's `summary_facts`. Anything outside the fixed shape is
 * rejected, which is what keeps this from becoming an arbitrary text-to-speech endpoint.
 */
export function parseSummaryFacts(input: unknown): SummaryFacts | null {
  if (!isRecord(input) || input.v !== SUMMARY_FACTS_VERSION) return null;
  const context = readEnum(input.context, CONTEXTS);
  if (!context) return null;
  const timeOfDay = readEnum(input.time_of_day, TIME_OF_DAY);
  if (!timeOfDay) return null;

  switch (context) {
    case "dashboard": {
      if (!hasOnlyKeys(input, ["v", "context", "intent", "time_of_day", "reports", "appointments"])) return null;
      const intent = readEnum(input.intent, ["greeting", "summary"] as const);
      const reports = readReportCounts(input.reports);
      const appointments = readAppointmentCounts(input.appointments);
      if (!intent || !reports || !appointments) return null;
      return { v: SUMMARY_FACTS_VERSION, context, intent, time_of_day: timeOfDay, reports, appointments };
    }
    case "reports": {
      if (!hasOnlyKeys(input, ["v", "context", "time_of_day", "tab", "search", "reports"])) return null;
      const tab = readEnum(input.tab, REPORT_TABS);
      const search = readBoolean(input.search);
      const reports = readReportCounts(input.reports);
      if (!tab || search === null || !reports) return null;
      return { v: SUMMARY_FACTS_VERSION, context, time_of_day: timeOfDay, tab, search, reports };
    }
    case "appointments": {
      if (!hasOnlyKeys(input, ["v", "context", "time_of_day", "tab", "appointments"])) return null;
      const tab = readEnum(input.tab, APPOINTMENT_TABS);
      const appointments = readAppointmentCounts(input.appointments);
      if (!tab || !appointments) return null;
      return { v: SUMMARY_FACTS_VERSION, context, time_of_day: timeOfDay, tab, appointments };
    }
    case "urgent_review": {
      if (!hasOnlyKeys(input, ["v", "context", "time_of_day", "queue_total", "queue_pending", "queue_reviewed"])) {
        return null;
      }
      const queueTotal = readCount(input.queue_total);
      const queuePending = readCount(input.queue_pending);
      const queueReviewed = readCount(input.queue_reviewed);
      if (queueTotal === null || queuePending === null || queueReviewed === null) return null;
      if (queuePending + queueReviewed > queueTotal) return null;
      return {
        v: SUMMARY_FACTS_VERSION,
        context,
        time_of_day: timeOfDay,
        queue_total: queueTotal,
        queue_pending: queuePending,
        queue_reviewed: queueReviewed,
      };
    }
    case "report_detail": {
      if (!hasOnlyKeys(input, ["v", "context", "time_of_day", "focus"])) return null;
      const focus = readReportFocus(input.focus);
      if (!focus) return null;
      return { v: SUMMARY_FACTS_VERSION, context, time_of_day: timeOfDay, focus };
    }
    case "urgent_detail": {
      if (!hasOnlyKeys(input, ["v", "context", "time_of_day", "queue_total", "focus"])) return null;
      const queueTotal = readCount(input.queue_total);
      const focus = readReportFocus(input.focus);
      if (queueTotal === null || !focus) return null;
      return { v: SUMMARY_FACTS_VERSION, context, time_of_day: timeOfDay, queue_total: queueTotal, focus };
    }
  }
}
