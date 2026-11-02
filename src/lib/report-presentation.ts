/**
 * Report presentation helpers (D-01, D-14, D-15, D-32, D-33, D-46).
 *
 * Every helper here is pure so the patient review screen and the doctor screens can
 * share one interpretation of the authoritative report row. Nothing in this module
 * invents clinical content: a value is either read from the report or reported as
 * unavailable, and "None" is only produced when the source genuinely says "none".
 */

import type { FieldValue, InfoStatus, ReportDocumentV1, ReportRow } from '../types/report';

// ---------------------------------------------------------------------------
// Information status labels (D-14)
// ---------------------------------------------------------------------------

/** UI labels for the six report-v1.2 information statuses. */
export const INFO_STATUS_LABELS: Readonly<Record<InfoStatus, string>> = {
  provided: 'Provided',
  declined: 'Declined',
  unknown: 'Unknown',
  unclear: 'Unclear',
  not_provided: 'Not provided',
  not_asked: 'Not asked',
};

const KNOWN_STATUSES = new Set<string>([
  'provided',
  'declined',
  'unknown',
  'unclear',
  'not_provided',
  'not_asked',
]);

export interface PresentedField {
  /** What the screen should show. Never an invented clinical value. */
  text: string;
  /** True when the report carries no usable value for this field. */
  isAbsent: boolean;
  /** The status actually used to build `text`; `unavailable` means the field was missing. */
  status: InfoStatus | 'unavailable';
}

function isFieldValueLike(value: unknown): value is FieldValue<unknown> {
  return typeof value === 'object' && value !== null && 'status' in (value as object);
}

function renderValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
    return items.length > 0 ? items.join(', ') : null;
  }
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Present one structured field. A patient who answered "none" is shown "None", a
 * patient who declined is shown "Declined", and a report that is missing the field
 * entirely is shown as unavailable instead of being mislabelled "Not provided".
 */
export function presentField(field: unknown): PresentedField {
  if (!isFieldValueLike(field)) {
    return { text: 'Unavailable', isAbsent: true, status: 'unavailable' };
  }

  const rawStatus = (field as { status?: unknown }).status;
  if (typeof rawStatus !== 'string' || !KNOWN_STATUSES.has(rawStatus)) {
    return { text: 'Unavailable', isAbsent: true, status: 'unavailable' };
  }

  const status = rawStatus as InfoStatus;
  const value = (field as { value?: unknown }).value;

  if (status === 'provided') {
    const rendered = renderValue(value);
    if (rendered === null) {
      // A "provided" field with no value is not trustworthy; say so rather than
      // claiming the patient did not provide it.
      return { text: 'Unavailable', isAbsent: true, status: 'unavailable' };
    }
    return { text: rendered, isAbsent: false, status };
  }

  return { text: INFO_STATUS_LABELS[status], isAbsent: true, status };
}

/** Clinical list field: "None" is preserved when the patient actually said none. */
export function presentClinicalList(field: unknown): PresentedField {
  return presentField(field);
}

// ---------------------------------------------------------------------------
// Gender (D-46)
// ---------------------------------------------------------------------------

const GENDER_LABELS: Readonly<Record<string, string>> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
};

export function presentGender(field: unknown): string {
  if (!isFieldValueLike(field)) return 'Unavailable';
  const status = (field as { status?: unknown }).status;
  const value = (field as { value?: unknown }).value;
  if (status === 'declined') return 'Prefer not to say';
  if (typeof value === 'string') {
    const label = GENDER_LABELS[value.toLowerCase()];
    if (label) return label;
    return value.trim() === '' ? 'Unavailable' : value;
  }
  if (typeof status === 'string' && KNOWN_STATUSES.has(status)) {
    return INFO_STATUS_LABELS[status as InfoStatus];
  }
  return 'Unavailable';
}

// ---------------------------------------------------------------------------
// Warning flags (P0 D-01)
// ---------------------------------------------------------------------------

export type WarningFlagKind = 'possible_urgent' | 'needs_human_review' | 'emergency_rule';

export interface WarningFlag {
  kind: WarningFlagKind;
  label: string;
}

export type WarningFlagsState = 'available' | 'unavailable' | 'malformed';

export interface WarningFlagsSummary {
  state: WarningFlagsState;
  flags: WarningFlag[];
  /** True when the source did not include all three warning keys. */
  incomplete: boolean;
}

const WARNING_KEYS = ['possible_urgent', 'needs_human_review', 'emergency_rule_id'] as const;

/**
 * Read the warning flags from the authoritative report row.
 *
 * - `available` + empty `flags`   → the report genuinely has no warning flags ("None").
 * - `unavailable`                 → the row or its warning data is missing; never "None".
 * - `malformed`                   → some values could not be interpreted; the flags that
 *                                   *can* be trusted are still returned and shown.
 *
 * Clinical flags are never dropped, and nothing is inferred from other fields.
 */
export function describeWarningFlags(row: unknown): WarningFlagsSummary {
  if (typeof row !== 'object' || row === null) {
    return { state: 'unavailable', flags: [], incomplete: true };
  }

  const record = row as Record<string, unknown>;
  const presentKeys = WARNING_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(record, key));
  if (presentKeys.length === 0) {
    return { state: 'unavailable', flags: [], incomplete: true };
  }

  const flags: WarningFlag[] = [];
  let malformed = presentKeys.length < WARNING_KEYS.length;

  const possibleUrgent = record.possible_urgent;
  if (possibleUrgent === true) {
    flags.push({ kind: 'possible_urgent', label: 'Possible urgent' });
  } else if (possibleUrgent !== false && possibleUrgent !== undefined) {
    malformed = true;
  }

  const needsHumanReview = record.needs_human_review;
  if (needsHumanReview === true) {
    flags.push({ kind: 'needs_human_review', label: 'Needs human review' });
  } else if (needsHumanReview !== false && needsHumanReview !== undefined) {
    malformed = true;
  }

  const ruleId = record.emergency_rule_id;
  if (typeof ruleId === 'string' && ruleId.trim() !== '') {
    flags.push({ kind: 'emergency_rule', label: `Emergency rule: ${ruleId.trim()}` });
  } else if (ruleId !== null && ruleId !== undefined && ruleId !== '') {
    malformed = true;
  }

  const state: WarningFlagsState = malformed ? 'malformed' : 'available';
  return { state, flags, incomplete: presentKeys.length < WARNING_KEYS.length };
}

// ---------------------------------------------------------------------------
// Missing information (D-15)
// ---------------------------------------------------------------------------

const MISSING_INFO_LABELS: Readonly<Record<string, string>> = {
  name: 'full name',
  age: 'age',
  gender: 'gender',
  primary_concern: 'primary concern',
  duration: 'duration',
  severity: 'severity',
  conditions: 'existing conditions',
  medications: 'medications',
  allergies: 'allergies',
  other_symptoms: 'other symptoms',
};

export function humaniseMissingField(field: string): string {
  const key = field.trim();
  if (!key) return '';
  const mapped = MISSING_INFO_LABELS[key] ?? MISSING_INFO_LABELS[key.replace(/^clinical_details\./, '')];
  if (mapped) return mapped;
  return key
    .replace(/^clinical_details\./, '')
    .replace(/^patient\./, '')
    .replace(/_/g, ' ');
}

/**
 * Render `report.missing_information` (the authoritative list) rather than
 * recomputing absence from falsy values.
 */
export function presentMissingInformation(report: unknown): { text: string; fields: string[] } {
  const list = (report as { missing_information?: unknown } | null | undefined)?.missing_information;
  if (!Array.isArray(list)) {
    return { text: 'Unavailable', fields: [] };
  }
  const labels = list
    .filter((item): item is string => typeof item === 'string')
    .map(humaniseMissingField)
    .filter((label) => label !== '');
  if (labels.length === 0) return { text: 'None', fields: [] };
  return { text: labels.join(', '), fields: labels };
}

// ---------------------------------------------------------------------------
// Source chip (D-33)
// ---------------------------------------------------------------------------

const LANGUAGE_LABELS: Readonly<Record<string, string>> = {
  en: 'English',
  hi: 'हिंदी · Hindi',
};

/**
 * Derive the source chip from the stored report and, when available, the stored
 * message input modes. It never claims "Voice" when the data does not say so.
 */
export function describeSourceChip(
  report: ReportDocumentV1 | null | undefined,
  inputModes: ReadonlyArray<'voice' | 'text' | null | undefined> = [],
): string {
  const language = report?.patient?.language;
  const languageLabel = typeof language === 'string' ? LANGUAGE_LABELS[language] : null;

  const modes = new Set(inputModes.filter((mode): mode is 'voice' | 'text' => mode === 'voice' || mode === 'text'));
  let modeLabel: string | null = null;
  if (modes.size === 1) {
    modeLabel = modes.has('voice') ? 'Voice' : 'Text';
  } else if (modes.size > 1) {
    modeLabel = 'Voice + text';
  }

  if (modeLabel && languageLabel) return `${modeLabel} · ${languageLabel}`;
  if (modeLabel) return modeLabel;
  if (languageLabel) return languageLabel;
  return 'Source unavailable';
}

// ---------------------------------------------------------------------------
// Reviewer (D-32)
// ---------------------------------------------------------------------------

/** Neutral, data-derived reviewer label. Never hardcodes a doctor name. */
export function describeReviewer(row: unknown, resolvedReviewerName?: string | null): string {
  const reviewedAt = (row as { reviewed_at?: unknown } | null | undefined)?.reviewed_at;
  if (typeof reviewedAt !== 'string' || reviewedAt.trim() === '') return 'Not reviewed';
  if (resolvedReviewerName && resolvedReviewerName.trim() !== '') {
    return `Reviewed by ${resolvedReviewerName.trim()}`;
  }
  return 'Reviewed';
}

/** True when the report carries a review timestamp. */
export function isReportReviewed(row: ReportRow | null | undefined): boolean {
  return typeof row?.reviewed_at === 'string' && row.reviewed_at.trim() !== '';
}
