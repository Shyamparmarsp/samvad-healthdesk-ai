/**
 * Doctor assistant — facts derived from rows the doctor is already authorised to read.
 *
 * The counters follow docs/report-design.md §15 exactly:
 *   New / awaiting review = status submitted AND reviewed_at IS NULL
 *   Urgent               = status urgent_partial
 *   Complete intake      = status submitted
 *   Partial intake       = status partial (v1.3 early finish)
 *   Reviewed             = reviewed_at IS NOT NULL
 *   Booked / not booked  = a confirmed appointment exists (or does not)
 *
 * Nothing here is a placeholder: every number comes from the RLS-scoped rows returned by
 * `src/lib/api.ts`. The Hindi sentences are rendered by the backend-owned module
 * `supabase/functions/_shared/doctor-summary.ts`, which is also what the `speak` Edge
 * Function uses, so the shown text and the spoken text are byte-identical.
 */

import {
  istDateKey,
  parseInstant,
} from './booking-time';
import type { ReportRow } from '../types/report';
import type { Appointment } from '../types/doctor';
import {
  SUMMARY_FACTS_VERSION,
  istTimeOfDay,
  type AppointmentCounts,
  type AppointmentTab,
  type ReportCounts,
  type ReportFilterTab,
  type ReportFocus,
  type SummaryFacts,
} from '../../supabase/functions/_shared/doctor-summary';

export type { SummaryFacts, SummaryLanguage } from '../../supabase/functions/_shared/doctor-summary';
export type {
  AppointmentTab,
  ReportFilterTab,
  ReportCounts,
  AppointmentCounts,
  ReportFocus,
  TimeOfDay,
} from '../../supabase/functions/_shared/doctor-summary';
export {
  renderHindiSummary,
  renderEnglishSummary,
  renderSummary,
  parseSummaryLanguage,
  parseSummaryFacts,
  istTimeOfDay,
  MAX_SUMMARY_CHARACTERS,
} from '../../supabase/functions/_shared/doctor-summary';

/** The ten tracked intake fields; the report's own `missing_information` list is authoritative. */
const TRACKED_FIELD_COUNT = 10;

function localDayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return istDateKey(value);
}

export function buildReportCounts(reports: ReportRow[], now: Date = new Date()): ReportCounts {
  const todayKey = istDateKey(now);
  const counts: ReportCounts = {
    total: reports.length,
    today: 0,
    awaiting_review: 0,
    complete: 0,
    partial: 0,
    reviewed: 0,
    urgent: 0,
  };

  for (const report of reports) {
    const receivedKey = localDayKey(report.submitted_at ?? report.created_at);
    if (todayKey && receivedKey === todayKey) counts.today += 1;

    if (report.status === 'urgent_partial') counts.urgent += 1;
    if (report.status === 'partial') counts.partial += 1;
    if (report.status === 'submitted') counts.complete += 1;
    if (report.status === 'submitted' && !report.reviewed_at) counts.awaiting_review += 1;
    if (report.reviewed_at) counts.reviewed += 1;
  }

  return counts;
}

export function buildAppointmentCounts(
  appointments: Appointment[],
  now: Date = new Date(),
): AppointmentCounts {
  const todayKey = istDateKey(now);
  const confirmed = appointments.filter((appointment) => appointment.status === 'confirmed');

  const counts: AppointmentCounts = {
    today: 0,
    today_upcoming: 0,
    today_completed: 0,
    future: 0,
    past: 0,
    cancelled: appointments.length - confirmed.length,
    next_starts: [],
    next_is_today: false,
  };

  const upcoming: { start: Date; iso: string; dateKey: string | null }[] = [];

  for (const appointment of confirmed) {
    const start = parseInstant(appointment.slot_start);
    if (!start) continue; // An unreadable slot is never counted as scheduled.
    const end = parseInstant(appointment.slot_end);
    const dateKey = istDateKey(start);
    if (!dateKey || !todayKey) continue;

    if (dateKey === todayKey) {
      counts.today += 1;
      if (end && end.getTime() < now.getTime()) counts.today_completed += 1;
      else counts.today_upcoming += 1;
    } else if (dateKey > todayKey) {
      counts.future += 1;
    } else {
      counts.past += 1;
    }

    if (start.getTime() >= now.getTime()) {
      upcoming.push({ start, iso: start.toISOString(), dateKey });
    }
  }

  upcoming.sort((a, b) => a.start.getTime() - b.start.getTime());
  counts.next_starts = upcoming.slice(0, 3).map((entry) => entry.iso);
  counts.next_is_today = upcoming.length > 0 && upcoming[0].dateKey === todayKey;

  return counts;
}

export function buildReportFocus(report: ReportRow): ReportFocus {
  const document = report.report;

  /**
   * `missing_information` is the backend-derived, doctor-facing list; it is the same
   * authority the report page renders. Recomputing "missing" from field statuses would
   * let the spoken summary contradict the screen (for example, an `unknown` allergy is
   * still listed as missing information).
   */
  const missingInformation = Array.isArray(document.missing_information)
    ? document.missing_information.filter((entry) => typeof entry === 'string' && entry.trim() !== '')
    : [];
  const missing = Math.min(missingInformation.length, TRACKED_FIELD_COUNT);
  const answered = Math.max(0, TRACKED_FIELD_COUNT - missing);
  const concernValue = document.primary_concern?.value;

  return {
    state:
      report.status === 'urgent_partial' ? 'urgent' : report.status === 'partial' ? 'partial' : 'complete',
    reviewed: Boolean(report.reviewed_at),
    concern_recorded:
      document.primary_concern?.status === 'provided' &&
      typeof concernValue === 'string' &&
      concernValue.trim() !== '',
    answered_fields: answered,
    missing_fields: missing,
    emergency_flag: Boolean(document.emergency) || Boolean(report.emergency_rule_id),
    possible_urgent: Boolean(report.possible_urgent || report.needs_human_review),
  };
}

export function buildDashboardFacts(input: {
  reports: ReportRow[];
  appointments: Appointment[];
  intent: 'greeting' | 'summary';
  now?: Date;
}): SummaryFacts {
  const now = input.now ?? new Date();
  return {
    v: SUMMARY_FACTS_VERSION,
    context: 'dashboard',
    intent: input.intent,
    time_of_day: istTimeOfDay(now),
    reports: buildReportCounts(input.reports, now),
    appointments: buildAppointmentCounts(input.appointments, now),
  };
}

export function buildReportsFacts(input: {
  /** The rows currently displayed after tab + search filtering. */
  displayed: ReportRow[];
  tab: ReportFilterTab;
  search: string;
  now?: Date;
}): SummaryFacts {
  const now = input.now ?? new Date();
  return {
    v: SUMMARY_FACTS_VERSION,
    context: 'reports',
    time_of_day: istTimeOfDay(now),
    tab: input.tab,
    search: input.search.trim().length > 0,
    reports: buildReportCounts(input.displayed, now),
  };
}

export function buildAppointmentsFacts(input: {
  appointments: Appointment[];
  tab: AppointmentTab;
  now?: Date;
}): SummaryFacts {
  const now = input.now ?? new Date();
  return {
    v: SUMMARY_FACTS_VERSION,
    context: 'appointments',
    time_of_day: istTimeOfDay(now),
    tab: input.tab,
    appointments: buildAppointmentCounts(input.appointments, now),
  };
}

export function buildReportDetailFacts(report: ReportRow, now: Date = new Date()): SummaryFacts {
  return {
    v: SUMMARY_FACTS_VERSION,
    context: 'report_detail',
    time_of_day: istTimeOfDay(now),
    focus: buildReportFocus(report),
  };
}

export function buildUrgentReviewFacts(reports: ReportRow[], now: Date = new Date()): SummaryFacts {
  const pending = reports.filter((report) => !report.reviewed_at).length;
  return {
    v: SUMMARY_FACTS_VERSION,
    context: 'urgent_review',
    time_of_day: istTimeOfDay(now),
    queue_total: reports.length,
    queue_pending: pending,
    queue_reviewed: reports.length - pending,
  };
}

export function buildUrgentDetailFacts(
  report: ReportRow,
  urgentQueue: ReportRow[],
  now: Date = new Date(),
): SummaryFacts {
  return {
    v: SUMMARY_FACTS_VERSION,
    context: 'urgent_detail',
    time_of_day: istTimeOfDay(now),
    queue_total: urgentQueue.length,
    focus: buildReportFocus(report),
  };
}
