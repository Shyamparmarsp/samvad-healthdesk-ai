/**
 * Report Types — Patient Intake Report Contract
 * Source: docs/report-design.md v1.2, backend _shared/contract.ts
 */

export type ReportStatus = 'draft' | 'submitted' | 'urgent_partial';

export type SessionStatus =
  | 'created'
  | 'consented'
  | 'declined'
  | 'in_progress'
  | 'emergency'
  | 'ended'
  | 'submitted';

export type InfoStatus =
  | 'provided'
  | 'declined'
  | 'unknown'
  | 'unclear'
  | 'not_provided'
  | 'not_asked';

export interface FieldValue<T> {
  status: InfoStatus;
  value: T | null;
}

/**
 * Report v1.2 invariant (RD-02, RD-06):
 * When status = 'provided', value is 'male' | 'female' | 'other'.
 * When "Prefer not to say" is chosen, status = 'declined' and value = null.
 * 'declined' is never stored as a value.
 */
export type GenderValue = 'male' | 'female' | 'other';

export type DepartmentKey =
  | 'general_medicine'
  | 'orthopedics'
  | 'emergency'
  | 'general_surgery'
  | 'dermatology'
  | 'cardiology';

export interface PatientInfo {
  name: FieldValue<string>;
  age: FieldValue<number>;
  gender: FieldValue<GenderValue>;
  language: 'en' | 'hi';
}

export interface ClinicalDetails {
  duration: FieldValue<string>;
  severity: FieldValue<string>;
  conditions: FieldValue<string[]>;
  medications: FieldValue<string[]>;
  allergies: FieldValue<string[]>;
  other_symptoms: FieldValue<string[]>;
}

export interface SummaryInfo {
  text: string;
  source: 'template' | 'groq';
  generated_from: string[];
}

export interface RoutingSnapshot {
  department_key: DepartmentKey;
  department_name: string;
  doctor_id: string;
  doctor_name: string;
  is_fallback: boolean;
  preliminary: boolean;
}

export interface EmergencyBlock {
  rule_id: string;
  patient_statement: string;
  triggered_at: string;
}

export interface ReportDocumentV1 {
  schema_version: 1;
  patient: PatientInfo;
  primary_concern: FieldValue<string>;
  clinical_details: ClinicalDetails;
  missing_information: string[];
  summary: SummaryInfo | null; // null for urgent_partial per RD-10
  routing_snapshot: RoutingSnapshot;
  emergency: EmergencyBlock | null;
}

export interface ReportRow {
  id: string;
  session_id: string;
  user_id: string;
  status: ReportStatus;
  schema_version: number;
  department_key: DepartmentKey;
  doctor_id: string;
  intake_reference: string;
  possible_urgent: boolean;
  needs_human_review: boolean;
  emergency_rule_id: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  report: ReportDocumentV1;
}

export type CorrectableField =
  | 'patient.name'
  | 'patient.age'
  | 'patient.gender'
  | 'primary_concern'
  | 'clinical_details.duration'
  | 'clinical_details.severity'
  | 'clinical_details.conditions'
  | 'clinical_details.medications'
  | 'clinical_details.allergies'
  | 'clinical_details.other_symptoms';

export const CORRECTABLE_FIELDS: readonly CorrectableField[] = [
  'patient.name',
  'patient.age',
  'patient.gender',
  'primary_concern',
  'clinical_details.duration',
  'clinical_details.severity',
  'clinical_details.conditions',
  'clinical_details.medications',
  'clinical_details.allergies',
  'clinical_details.other_symptoms',
] as const;

export const PROTECTED_FIELDS = [
  'id',
  'session_id',
  'user_id',
  'doctor_id',
  'department_key',
  'schema_version',
  'status',
  'intake_reference',
  'submitted_at',
  'created_at',
  'updated_at',
  'routing_snapshot',
  'possible_urgent',
  'needs_human_review',
  'emergency',
  'reviewed_at',
  'reviewed_by',
  'missing_information',
  'summary',
] as const;

export const NON_DECLINABLE_FIELDS = [
  'patient.name',
  'patient.age',
  'primary_concern',
  'clinical_details.duration',
  'clinical_details.severity',
] as const;
