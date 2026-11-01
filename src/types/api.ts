/**
 * API Contract Types — chat-turn actions, speak, booking and doctor endpoints
 * Source: AGENTS.md, MILESTONES.md M1-S9, docs/report-design.md, backend contract.ts
 */

import { CorrectableField, ReportDocumentV1, ReportRow, SessionStatus } from './report';
import { Appointment, DoctorProfile } from './doctor';

export type CoreQuestionId =
  | 'greeting'
  | 'name'
  | 'age'
  | 'gender'
  | 'primary_concern'
  | 'duration'
  | 'severity'
  | 'conditions'
  | 'medications'
  | 'allergies'
  | 'other_symptoms'
  | 'emergency_clarification';

export type BankDepartmentPrefix = 'GM' | 'ORTH' | 'SURG' | 'DERM' | 'CARD';
export type BankQuestionId = `${BankDepartmentPrefix}-${string}`;

export type AnyQuestionId = CoreQuestionId | BankQuestionId;

/**
 * QuestionId covers both fixed core IDs and adaptive bank IDs (GM-001..CARD-030).
 */
export type QuestionId = AnyQuestionId;

export type AnswerType = 'free_text' | 'yes_no' | 'single_choice';

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'assistant' | 'patient';
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
  answer_type?: AnswerType;
}

export interface TranscriptPreview {
  state: 'transcript_preview';
  /** The transcription, shown to the patient for confirmation or correction. */
  text: string;
  /** The question the transcription answers. */
  question_id: QuestionId;
}

// 6 chat-turn actions
export interface StartSessionAction {
  action: 'start_session';
  language?: 'en' | 'hi';
}

export interface ResumeSessionAction {
  action: 'resume_session';
  session_id: string;
}

export interface RecordConsentAction {
  action: 'record_consent';
  session_id: string;
  consent: boolean;
  consent_version: string;
  language: 'en' | 'hi';
}

export interface SubmitTurnAction {
  action: 'submit_turn';
  session_id: string;
  question_id: QuestionId;
  text?: string;
  audio_base64?: string;
  audio_format?: string;
}

export interface CorrectDraftReportAction {
  action: 'correct_draft_report';
  session_id: string;
  report_id: string;
  updates: Partial<Record<CorrectableField, { value: unknown; status: 'provided' | 'declined' }>>;
}

export interface SubmitReportAction {
  action: 'submit_report';
  session_id: string;
  report_id: string;
}

export type ChatTurnAction =
  | StartSessionAction
  | ResumeSessionAction
  | RecordConsentAction
  | SubmitTurnAction
  | CorrectDraftReportAction
  | SubmitReportAction;

export interface ChatTurnResponse {
  session_id: string;
  session_status: SessionStatus;
  current_question?: CurrentQuestion;
  messages: ChatMessage[];
  turn_count: number;
  max_turns: number; // 15
  is_complete: boolean;
  is_cap_reached: boolean;
  can_submit: boolean;
  draft_report?: ReportDocumentV1;
  submitted_report?: ReportRow;
  emergency_triggered?: boolean;
  demo_busy?: boolean;
  /**
   * Audio confirmation step. Present only when an audio turn has been transcribed and
   * is awaiting the patient's confirmation. While present, turn_count is unchanged
   * and the turn has not been accepted; the patient confirms by sending the same
   * question with text.
   */
  transcript_preview?: TranscriptPreview;
  error?: string;
}

export interface AvailableSlot {
  slot_start: string;
  slot_end: string;
}

export interface BookAppointmentRequest {
  report_id: string;
  slot_id?: string;
  slot_start?: string;
  doctor_id?: string;
  patient_name?: string;
}

export interface BookAppointmentResponse {
  appointment: Appointment;
  reference_code: string;
  already_booked?: boolean;
}

export interface MarkReportReviewedResponse {
  success: boolean;
  report_id: string;
  reviewed_at: string;
  reviewed_by: string | null;
  already_reviewed?: boolean;
}

export interface DoctorLoginResponse {
  doctor: DoctorProfile;
  token: string;
}
