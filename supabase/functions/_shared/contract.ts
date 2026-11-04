/**
 * Wire contract mirror.
 *
 * The authoritative definitions live in `src/types/` (frontend-owned, M1-S9). Edge
 * Functions cannot import outside `supabase/functions/` because the CLI bundles only
 * the function directory, so the request/response shapes are mirrored here.
 *
 * Rules:
 *   - This file must change only when `src/types/api.ts` and `src/types/report.ts` change.
 *   - No extra top-level response fields may be invented here.
 *   - The mapper in `chat-turn/index.ts` is the only place that builds a response.
 *
 * Mirrored on 1 November 2026 from the frontend worktree contract:
 *   QuestionId, ChatMessage, six ChatTurnAction variants, ChatTurnResponse,
 *   ReportStatus, SessionStatus, InfoStatus, FieldValue, ReportDocumentV1, ReportRow.
 */

export type ReportStatus = "draft" | "submitted" | "partial" | "urgent_partial";

export type SessionStatus =
  | "created"
  | "consented"
  | "declined"
  | "in_progress"
  | "emergency"
  | "ended"
  | "submitted";

export type InfoStatus =
  | "provided"
  | "declined"
  | "unknown"
  | "unclear"
  | "not_provided"
  | "not_asked";

export interface FieldValue<T> {
  status: InfoStatus;
  value: T | null;
}

/**
 * Gender values that can be stored. "Prefer not to say" is NOT a value: it is recorded
 * as { status: "declined", value: null } (report v1.2). The literal "declined" is
 * deliberately absent so it cannot be emitted or accepted as a value.
 */
export type GenderValue = "male" | "female" | "other";

export type DepartmentKey =
  | "general_medicine"
  | "orthopedics"
  | "emergency"
  | "general_surgery"
  | "dermatology"
  | "cardiology";

export interface PatientInfo {
  name: FieldValue<string>;
  age: FieldValue<number>;
  gender: FieldValue<GenderValue>;
  language: "en" | "hi";
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
  source: "template" | "groq";
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
  summary: SummaryInfo | null;
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
  | "patient.name"
  | "patient.age"
  | "patient.gender"
  | "primary_concern"
  | "clinical_details.duration"
  | "clinical_details.severity"
  | "clinical_details.conditions"
  | "clinical_details.medications"
  | "clinical_details.allergies"
  | "clinical_details.other_symptoms";

export const CORRECTABLE_FIELDS: readonly CorrectableField[] = [
  "patient.name",
  "patient.age",
  "patient.gender",
  "primary_concern",
  "clinical_details.duration",
  "clinical_details.severity",
  "clinical_details.conditions",
  "clinical_details.medications",
  "clinical_details.allergies",
  "clinical_details.other_symptoms",
];

export const PROTECTED_FIELDS = [
  "id",
  "session_id",
  "user_id",
  "schema_version",
  "status",
  "intake_reference",
  "submitted_at",
  "created_at",
  "updated_at",
  "routing_snapshot",
  "possible_urgent",
  "needs_human_review",
  "emergency",
  "reviewed_at",
  "reviewed_by",
  "missing_information",
  "summary",
] as const;

export type QuestionId =
  | "greeting"
  | "name"
  | "age"
  | "gender"
  | "primary_concern"
  | "duration"
  | "severity"
  | "conditions"
  | "medications"
  | "allergies"
  | "other_symptoms"
  | "emergency_clarification";

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "assistant" | "patient";
  content: string;
  question_id?: QuestionId;
  created_at: string;
  turn_index: number;
}

export interface CurrentQuestion {
  id: QuestionId;
  text: string;
  text_hi?: string;
  options?: string[];
  is_ambiguous_emergency?: boolean;
}

export interface ChatTurnResponse {
  session_id: string;
  session_status: SessionStatus;
  current_question?: CurrentQuestion;
  messages: ChatMessage[];
  turn_count: number;
  max_turns: number;
  is_complete: boolean;
  is_cap_reached: boolean;
  can_submit: boolean;
  /**
   * v1.3: number of distinct accepted answers in this session, and whether the patient may
   * finish early and send a partial report (>= 3 accepted answers, no report sent yet).
   * Computed from persisted rows, never from the client's message list.
   */
  accepted_answer_count?: number;
  can_finish_partial?: boolean;
  /** v1.4 response flag: no further question is available, so the report is ready. */
  intake_complete?: boolean;
  draft_report?: ReportDocumentV1;
  submitted_report?: ReportRow;
  emergency_triggered?: boolean;
  demo_busy?: boolean;
  /**
   * Audio confirmation step. Present only when an audio turn has been transcribed and
   * is awaiting the patient's confirmation. While present, `turn_count` is unchanged
   * and the turn has not been accepted; the patient confirms by sending the same
   * question with `text`.
   *
   * This is ONE name used by both sides (docs/report-design.md calls the state
   * `transcript_preview`). There is deliberately no second field such as
   * `pending_transcript`.
   */
  transcript_preview?: TranscriptPreview;
  error?: string;
}

export interface TranscriptPreview {
  state: "transcript_preview";
  /** The transcription, shown to the patient for confirmation or correction. */
  text: string;
  /** The question the transcription answers. */
  question_id: QuestionId;
}
