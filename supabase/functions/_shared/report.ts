/**
 * Report document construction, correction and completion.
 *
 * Contract: docs/report-design.md v1.1 (approved decisions RD-01, RD-02, RD-06, RD-17,
 * RD-22; RD-03/04/05/09/11/19/21/25 still open — the behaviour below follows the
 * documented working rule and flags those spots).
 *
 * Invariants enforced here:
 *   - value is non-null if and only if status is "provided" (RD-02, approved).
 *   - gender "declined" is a handled answer and never blocks completion (RD-06).
 *   - urgent_partial carries summary = null (RD-10, approved).
 *   - the summary restates only provided fields and adds no facts.
 *   - only the allowlisted fields are patient-correctable; routing, flags, doctor,
 *     status, reference and review fields are rejected.
 */

import {
  CORRECTABLE_FIELDS,
  type CorrectableField,
  type DepartmentKey,
  type EmergencyBlock,
  type FieldValue,
  type GenderValue,
  type InfoStatus,
  type ReportDocumentV1,
  type RoutingSnapshot,
  type SummaryInfo,
} from "./contract.ts";
import { AppError } from "./errors.ts";

export const REPORT_SCHEMA_VERSION = 1 as const;

export const CLINICAL_FIELDS: readonly CorrectableField[] = CORRECTABLE_FIELDS;

/** Fields a patient may never decline. Gender is the documented exception (RD-06). */
const NON_DECLINABLE_FIELDS: readonly CorrectableField[] = [
  "patient.name",
  "patient.age",
  "primary_concern",
  "clinical_details.duration",
  "clinical_details.severity",
];

export const MAX_TEXT_LENGTH = 500;
export const MAX_NAME_LENGTH = 120;
export const MAX_LIST_ITEMS = 20;
export const MIN_AGE = 0;
export const MAX_AGE = 120;

const GENDERS: readonly GenderValue[] = ["male", "female", "other", "declined"];

export type FieldMap = Record<CorrectableField, FieldValue<unknown>>;

function field<T>(status: InfoStatus, value: T | null): FieldValue<T> {
  return { status, value: status === "provided" ? value : null };
}

export function notAsked<T>(): FieldValue<T> {
  return { status: "not_asked", value: null };
}

/** All ten clinical fields in report order, defaulted to not_asked. */
export function emptyFieldMap(): FieldMap {
  return {
    "patient.name": notAsked<string>(),
    "patient.age": notAsked<number>(),
    "patient.gender": notAsked<GenderValue>(),
    "primary_concern": notAsked<string>(),
    "clinical_details.duration": notAsked<string>(),
    "clinical_details.severity": notAsked<string>(),
    "clinical_details.conditions": notAsked<string[]>(),
    "clinical_details.medications": notAsked<string[]>(),
    "clinical_details.allergies": notAsked<string[]>(),
    "clinical_details.other_symptoms": notAsked<string[]>(),
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

function cleanList(value: unknown): string[] | null {
  if (!isStringArray(value)) return null;
  // An empty list is a valid answer: the patient reported "none".
  if (value.length > MAX_LIST_ITEMS) return null;
  const cleaned: string[] = [];
  for (const item of value) {
    const text = cleanText(item, MAX_TEXT_LENGTH);
    if (text === null) return null;
    cleaned.push(text);
  }
  return cleaned;
}

/** Validates a value for one field and returns the normalised value or null. */
export function normalizeFieldValue(field: CorrectableField, raw: unknown): unknown | null {
  switch (field) {
    case "patient.name":
      return cleanText(raw, MAX_NAME_LENGTH);
    case "patient.age": {
      const numeric = typeof raw === "string" ? Number(raw.trim()) : raw;
      if (typeof numeric !== "number" || !Number.isInteger(numeric)) return null;
      if (numeric < MIN_AGE || numeric > MAX_AGE) return null;
      return numeric;
    }
    case "patient.gender":
      return typeof raw === "string" && (GENDERS as readonly string[]).includes(raw)
        ? (raw as GenderValue)
        : null;
    case "clinical_details.conditions":
    case "clinical_details.medications":
    case "clinical_details.allergies":
    case "clinical_details.other_symptoms":
      return cleanList(raw);
    default:
      return cleanText(raw, MAX_TEXT_LENGTH);
  }
}

export function missingInformation(fields: FieldMap): CorrectableField[] {
  return CLINICAL_FIELDS.filter((key) => fields[key].status !== "provided");
}

/**
 * Deterministic summary. Restates provided values only; introduces no symptom, cause,
 * diagnosis, probability, medicine, treatment or advice.
 */
export function templateSummary(fields: FieldMap): SummaryInfo | null {
  const used: string[] = [];
  const sentences: string[] = [];

  const concern = fields.primary_concern;
  if (concern.status === "provided" && typeof concern.value === "string") {
    used.push("primary_concern");
    const duration = fields["clinical_details.duration"];
    const severity = fields["clinical_details.severity"];
    let sentence = `Patient reports ${concern.value}`;
    if (duration.status === "provided" && typeof duration.value === "string") {
      used.push("clinical_details.duration");
      sentence += ` for ${duration.value}`;
    }
    if (severity.status === "provided" && typeof severity.value === "string") {
      used.push("clinical_details.severity");
      sentence += `, described as ${severity.value}`;
    }
    sentences.push(`${sentence}.`);
  } else {
    if (fields["clinical_details.duration"].status === "provided") {
      used.push("clinical_details.duration");
    }
    if (fields["clinical_details.severity"].status === "provided") {
      used.push("clinical_details.severity");
    }
  }

  const listSentences: Array<[CorrectableField, string]> = [
    ["clinical_details.conditions", "Existing conditions reported"],
    ["clinical_details.medications", "Medicines reported"],
    ["clinical_details.allergies", "Allergies reported"],
    ["clinical_details.other_symptoms", "Other symptoms reported"],
  ];

  for (const [key, label] of listSentences) {
    const entry = fields[key];
    if (entry.status === "provided" && isStringArray(entry.value) && entry.value.length > 0) {
      used.push(key);
      sentences.push(`${label}: ${entry.value.join(", ")}.`);
    }
  }

  if (sentences.length === 0) return null;
  return { text: sentences.join(" "), source: "template", generated_from: used };
}

export interface BuildDocumentInput {
  language: "en" | "hi";
  fields: FieldMap;
  routing: RoutingSnapshot;
  emergency?: EmergencyBlock | null;
  /** Only used for a normal report; urgent_partial always stores null (RD-10). */
  summary?: SummaryInfo | null;
  status: "draft" | "submitted" | "urgent_partial";
}

export function buildReportDocument(input: BuildDocumentInput): ReportDocumentV1 {
  const { fields, routing, status, language } = input;

  const name = fields["patient.name"] as FieldValue<string>;
  const age = fields["patient.age"] as FieldValue<number>;
  const gender = fields["patient.gender"] as FieldValue<GenderValue>;
  const concern = fields.primary_concern as FieldValue<string>;
  const duration = fields["clinical_details.duration"] as FieldValue<string>;
  const severity = fields["clinical_details.severity"] as FieldValue<string>;
  const conditions = fields["clinical_details.conditions"] as FieldValue<string[]>;
  const medications = fields["clinical_details.medications"] as FieldValue<string[]>;
  const allergies = fields["clinical_details.allergies"] as FieldValue<string[]>;
  const otherSymptoms = fields["clinical_details.other_symptoms"] as FieldValue<string[]>;

  const isUrgent = status === "urgent_partial";

  return {
    schema_version: REPORT_SCHEMA_VERSION,
    patient: {
      name: { status: name.status, value: name.value },
      age: { status: age.status, value: age.value },
      gender: { status: gender.status, value: gender.value },
      language,
    },
    primary_concern: { status: concern.status, value: concern.value },
    clinical_details: {
      duration: { status: duration.status, value: duration.value },
      severity: { status: severity.status, value: severity.value },
      conditions: { status: conditions.status, value: conditions.value },
      medications: { status: medications.status, value: medications.value },
      allergies: { status: allergies.status, value: allergies.value },
      other_symptoms: { status: otherSymptoms.status, value: otherSymptoms.value },
    },
    missing_information: missingInformation(fields),
    summary: isUrgent ? null : (input.summary ?? templateSummary(fields)),
    routing_snapshot: routing,
    emergency: input.emergency ?? null,
  };
}

export type CorrectionRequest = Partial<
  Record<CorrectableField, { value: unknown; status: "provided" | "declined" }>
>;

export interface CorrectionResult {
  ok: boolean;
  fields?: FieldMap;
  code?: "field_not_editable" | "invalid_field_status" | "invalid_request";
}

/**
 * Applies patient corrections to a field map. Rejects any non-allowlisted key, any
 * status other than provided/declined, declining a required field (gender excepted),
 * and any invalid value.
 */
export function applyCorrections(current: FieldMap, updates: CorrectionRequest): CorrectionResult {
  const next: FieldMap = { ...current };

  for (const [rawKey, patch] of Object.entries(updates)) {
    const key = rawKey as CorrectableField;
    if (!CLINICAL_FIELDS.includes(key)) {
      return { ok: false, code: "field_not_editable" };
    }
    if (patch === null || typeof patch !== "object") {
      return { ok: false, code: "invalid_request" };
    }
    const status = (patch as { status?: unknown }).status;
    if (status !== "provided" && status !== "declined") {
      return { ok: false, code: "invalid_field_status" };
    }

    if (status === "declined") {
      if (NON_DECLINABLE_FIELDS.includes(key)) {
        return { ok: false, code: "invalid_field_status" };
      }
      next[key] = field("declined", null);
      continue;
    }

    const value = normalizeFieldValue(key, (patch as { value?: unknown }).value);
    if (value === null) {
      return { ok: false, code: "invalid_request" };
    }
    next[key] = { status: "provided", value };
  }

  // Re-assert the approved invariant across the whole map.
  for (const key of CLINICAL_FIELDS) {
    const entry = next[key];
    if (entry.status === "provided" ? entry.value === null : entry.value !== null) {
      return { ok: false, code: "invalid_request" };
    }
  }

  return { ok: true, fields: next };
}

/**
 * Completion rules from AGENTS.md and docs/report-design.md §8.
 * Gender "declined" satisfies the question and never blocks completion.
 */
export function isComplete(fields: FieldMap): boolean {
  const required: CorrectableField[] = [
    "patient.name",
    "patient.age",
    "patient.gender",
    "primary_concern",
    "clinical_details.duration",
    "clinical_details.severity",
  ];

  for (const key of required) {
    const entry = fields[key];
    if (entry.status === "provided") continue;
    if (key === "patient.gender" && entry.status === "declined") continue;
    return false;
  }

  const askedOnce: CorrectableField[] = [
    "clinical_details.conditions",
    "clinical_details.medications",
    "clinical_details.allergies",
    "clinical_details.other_symptoms",
  ];
  for (const key of askedOnce) {
    if (fields[key].status === "not_asked") return false;
  }

  return true;
}

/** Structural validation for a document read back from the database. */
export function validateReportDocument(value: unknown): string[] {
  const problems: string[] = [];
  if (typeof value !== "object" || value === null) return ["document is not an object"];
  const doc = value as Partial<ReportDocumentV1>;

  if (doc.schema_version !== 1) problems.push("unsupported schema_version");

  const checkField = (label: string, entry: unknown): void => {
    if (typeof entry !== "object" || entry === null) {
      problems.push(`${label} is not a field object`);
      return;
    }
    const { status, value: fieldValue } = entry as { status?: unknown; value?: unknown };
    if (status !== "provided" && status !== "declined" && status !== "unknown" &&
        status !== "unclear" && status !== "not_provided" && status !== "not_asked") {
      problems.push(`${label} has an unknown status`);
      return;
    }
    if (status === "provided" ? fieldValue === null : fieldValue !== null) {
      problems.push(`${label} violates the value/status invariant`);
    }
  };

  const patient = doc.patient;
  if (typeof patient !== "object" || patient === null) {
    problems.push("patient block is missing");
  } else {
    checkField("patient.name", patient.name);
    checkField("patient.age", patient.age);
    checkField("patient.gender", patient.gender);
    if (patient.language !== "en" && patient.language !== "hi") {
      problems.push("patient.language is invalid");
    }
  }

  checkField("primary_concern", doc.primary_concern);

  const details = doc.clinical_details;
  if (typeof details !== "object" || details === null) {
    problems.push("clinical_details block is missing");
  } else {
    checkField("clinical_details.duration", details.duration);
    checkField("clinical_details.severity", details.severity);
    checkField("clinical_details.conditions", details.conditions);
    checkField("clinical_details.medications", details.medications);
    checkField("clinical_details.allergies", details.allergies);
    checkField("clinical_details.other_symptoms", details.other_symptoms);
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Intake reference — format is RD-19 (proposed), still awaiting owner approval.
// ---------------------------------------------------------------------------

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function istDateStamp(now: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now).replaceAll("-", "");
}

/**
 * SHD-YYYYMMDD-XXXXXX using the Asia/Kolkata date.
 * `random` is injectable so tests are deterministic.
 */
export function generateIntakeReference(now: Date, random: () => number = Math.random): string {
  let suffix = "";
  while (suffix.length < 6) {
    const index = Math.floor(random() * CROCKFORD.length) % CROCKFORD.length;
    suffix += CROCKFORD[index];
  }
  return `SHD-${istDateStamp(now)}-${suffix}`;
}

/** Ensures a routing snapshot can never be marked non-preliminary. */
export function requirePreliminaryRouting(routing: RoutingSnapshot): RoutingSnapshot {
  if (!routing.preliminary) {
    throw new AppError("internal");
  }
  if (routing.department_key === "emergency" && routing.is_fallback) {
    throw new AppError("internal");
  }
  return routing;
}

export function isDepartmentKey(value: unknown): value is DepartmentKey {
  return (
    value === "general_medicine" ||
    value === "orthopedics" ||
    value === "emergency" ||
    value === "general_surgery" ||
    value === "dermatology" ||
    value === "cardiology"
  );
}

/** Rebuilds the editable field map from a stored document (used by corrections). */
export function fieldsFromDocument(doc: ReportDocumentV1): FieldMap {
  return {
    "patient.name": doc.patient.name as FieldValue<unknown>,
    "patient.age": doc.patient.age as FieldValue<unknown>,
    "patient.gender": doc.patient.gender as FieldValue<unknown>,
    "primary_concern": doc.primary_concern as FieldValue<unknown>,
    "clinical_details.duration": doc.clinical_details.duration as FieldValue<unknown>,
    "clinical_details.severity": doc.clinical_details.severity as FieldValue<unknown>,
    "clinical_details.conditions": doc.clinical_details.conditions as FieldValue<unknown>,
    "clinical_details.medications": doc.clinical_details.medications as FieldValue<unknown>,
    "clinical_details.allergies": doc.clinical_details.allergies as FieldValue<unknown>,
    "clinical_details.other_symptoms": doc.clinical_details.other_symptoms as FieldValue<unknown>,
  };
}
