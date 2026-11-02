/**
 * Appointment date/time helpers (D-03, D-21).
 *
 * The demo is Asia/Kolkata-only. Every slot timestamp is formatted with an explicit
 * `timeZone`, never with the browser's local zone, and a slot identifier is never
 * accepted as a timestamp.
 */

export const CLINIC_TIME_ZONE = 'Asia/Kolkata';

const ISO_INSTANT_PREFIX = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a real instant. Rejects slot ids such as `slot-doc-2026-11-03-09:00`. */
export function parseInstant(value: string | null | undefined): Date | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!ISO_INSTANT_PREFIX.test(trimmed)) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function isValidInstant(value: string | null | undefined): boolean {
  return parseInstant(value) !== null;
}

function formatWith(instant: string | Date | null | undefined, options: Intl.DateTimeFormatOptions): string | null {
  const date = instant instanceof Date ? instant : parseInstant(instant ?? null);
  if (!date) return null;
  return new Intl.DateTimeFormat('en-IN', { timeZone: CLINIC_TIME_ZONE, ...options }).format(date);
}

/** "3:30 PM" in Asia/Kolkata. */
export function formatIstTime(instant: string | Date | null | undefined): string | null {
  const formatted = formatWith(instant, { hour: 'numeric', minute: '2-digit', hour12: true });
  // en-IN renders the period in lower case; the UI (and the Figma frame) uses upper case.
  return formatted ? formatted.replace(/\b(am|pm)\b/gi, (match) => match.toUpperCase()) : null;
}

/** "Mon, 02 Nov 2026" in Asia/Kolkata. */
export function formatIstDate(instant: string | Date | null | undefined): string | null {
  const date = instant instanceof Date ? instant : parseInstant(instant ?? null);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TIME_ZONE,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = read('weekday');
  const day = read('day');
  const month = read('month');
  const year = read('year');
  if (!weekday || !day || !month || !year) return null;
  return `${weekday}, ${day} ${month} ${year}`;
}

/** "Mon 02 Nov 2026 · 03:30 PM" in Asia/Kolkata (the Figma confirmation line). */
export function formatIstDateTime(instant: string | Date | null | undefined): string | null {
  const date = formatIstDate(instant);
  const time = formatIstTime(instant);
  if (!date || !time) return null;
  return `${date} · ${time}`;
}

/**
 * Confirmation-screen formatter. Returns an explicit unavailable marker instead of
 * "Invalid Date" when the stored value is not a real instant.
 */
export function formatAppointmentWhen(instant: string | null | undefined): { text: string; valid: boolean } {
  const formatted = formatIstDateTime(instant);
  if (!formatted) return { text: 'Date and time unavailable', valid: false };
  return { text: formatted, valid: true };
}

/** `YYYY-MM-DD` date key in Asia/Kolkata (never the UTC/`toISOString` day). */
export function istDateKey(value: Date | string | null | undefined = new Date()): string | null {
  const date = value instanceof Date ? value : parseInstant(value ?? null);
  if (!date) return null;
  // en-CA renders ISO-like YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE }).format(date);
}

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && DATE_KEY.test(value);
}

export interface DateOption {
  dateKey: string;
  dayName: string;
  label: string;
}

/**
 * Build weekday date options using IST calendar days. `skip` days are skipped from
 * today before the first candidate (1 = tomorrow).
 */
export function buildWeekdayDateOptions(from: Date, count: number, skip = 1): DateOption[] {
  const options: DateOption[] = [];
  if (count <= 0) return options;

  let offset = Math.max(0, skip);
  // Hard stop well beyond any realistic window so a bad clock cannot loop forever.
  const limit = skip + count * 3 + 14;

  while (options.length < count && offset <= limit) {
    const candidate = new Date(from.getTime() + offset * 86_400_000);
    const key = istDateKey(candidate);
    if (!key) break;
    const weekdayIndex = new Date(`${key}T12:00:00+05:30`).getUTCDay();
    const isWeekend = weekdayIndex === 0 || weekdayIndex === 6;
    if (!isWeekend) {
      options.push({
        dateKey: key,
        dayName: new Intl.DateTimeFormat('en-US', { timeZone: CLINIC_TIME_ZONE, weekday: 'short' }).format(candidate),
        label: new Intl.DateTimeFormat('en-US', { timeZone: CLINIC_TIME_ZONE, day: '2-digit', month: 'short' }).format(candidate),
      });
    }
    offset += 1;
  }

  return options;
}

/** Add minutes to an instant, returning a new ISO instant. */
export function addMinutes(instant: string, minutes: number): string | null {
  const date = parseInstant(instant);
  if (!date) return null;
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}
