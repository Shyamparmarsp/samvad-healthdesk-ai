# Frontend-Backend Contract Review — Samvad HealthDesk AI

**Document Version:** 1.2
**Date:** 2 November 2026
**Audited Files (Read-Only):**
- `supabase/functions/_shared/contract.ts` (Backend Wire Contract Mirror)
- `docs/report-design.md` (v1.2 Contract)
- `docs/integration-contract.md` (Backend ↔ Frontend Integration Contract §§10–16)
- `docs/provider-notes.md` (M1-S5 Verified Facts)
- `src/types/api.ts`, `src/types/report.ts`, `src/types/consent.ts` (Frontend Contract)

---

## 1. Executive Summary

This document confirms full alignment between the frontend (`samvad-frontend` on `feat/frontend`) and backend (`samvad-backend` on `feat/backend`) for Milestone 4 (M4-S8). No unilaterally renamed fields exist. The wire contract is authoritative in `src/types/` and mirrored in `supabase/functions/_shared/contract.ts`.

---

## 2. Agreement on Core Specifications

### 2.1 The Six `chat-turn` Actions
Both frontend and backend accept and process exactly six discriminated actions:
1. `start_session`: `{ action: "start_session", language?: "en" | "hi" }`
2. `resume_session`: `{ action: "resume_session", session_id: string }`
3. `record_consent`: `{ action: "record_consent", session_id: string, consent: boolean, consent_version: string, language: "en" | "hi" }`
4. `submit_turn`: `{ action: "submit_turn", session_id: string, question_id: QuestionId, text?: string, audio_base64?: string, audio_format?: string }`
5. `correct_draft_report`: `{ action: "correct_draft_report", session_id: string, report_id: string, updates: Partial<Record<CorrectableField, { value: unknown, status: "provided" | "declined" }>> }`
6. `submit_report`: `{ action: "submit_report", session_id: string, report_id: string }`

Unknown action keys and unexpected parameters are rejected with `invalid_request` (HTTP 400).

### 2.2 Response Envelope and Status Enums
The response shape `ChatTurnResponse` contains:
- `session_id: string`
- `session_status: "created" | "consented" | "declined" | "in_progress" | "emergency" | "ended" | "submitted"` (terminal status is `"ended"`, matching `SessionStatus`)
- `current_question?: CurrentQuestion` (`{ id: QuestionId, text: string, text_hi?: string, options?: string[], is_ambiguous_emergency?: boolean }`)
- `messages: ChatMessage[]`
- `turn_count: number`
- `max_turns: number` (fixed at 15)
- `is_complete: boolean`
- `is_cap_reached: boolean`
- `can_submit: boolean`
- `draft_report?: ReportDocumentV1`
- `submitted_report?: ReportRow`
- `emergency_triggered?: boolean`
- `demo_busy?: boolean`
- `transcript_preview?: TranscriptPreview`
- `error?: string`

### 2.3 Audio Transcript Preview (`transcript_preview`) and Audio Formats
**Resolved Convention:** A single agreed field name `transcript_preview` and state name `"transcript_preview"` is used across both frontend and backend:
```typescript
export interface TranscriptPreview {
  state: "transcript_preview";
  text: string;
  question_id: QuestionId;
}
```
- **Turn Accounting:** Present only when an audio turn is uploaded and transcribed awaiting patient review. While present, `turn_count` is **not** incremented, the answer has not been accepted into the medical record, and no completion checks fire.
- **Confirmation:** The patient reviews and optionally edits the text, then submits the turn with `{ action: "submit_turn", question_id, text }`. This increments `turn_count` and processes the answer.
- **Supported Audio Formats:** `audio/wav`, `audio/mpeg`, `audio/ogg`, `audio/flac`, `audio/aac`, `audio/mp4`. `audio/webm` is explicitly rejected before any provider call.

### 2.4 Versioned Consent Copy
**Exact Version:** `CONSENT_VERSION = "2026-11-01.v1"`.
No synthetic placeholder (`consent_vN`) is displayed or persisted. The exact English and Hindi immutable copy in `src/types/consent.ts` and `_shared/consent.ts` is:
- **EN:** `"I understand that Samvad HealthDesk AI is an AI intake assistant and not a doctor, and that it cannot diagnose or treat me. I agree that the health information I give will be processed to prepare a preliminary report, and that this report will be shared with the hospital's doctor only if I submit it. I can stop at any time."`
- **HI:** `"मैं समझता/समझती हूँ कि संवाद हेल्थडेस्क AI एक AI इनटेक सहायक है, डॉक्टर नहीं है, और यह मेरा निदान या इलाज नहीं कर सकता। मैं सहमत हूँ कि मेरी दी गई स्वास्थ्य जानकारी से एक प्रारंभिक रिपोर्ट तैयार की जाएगी, और यह रिपोर्ट केवल तब अस्पताल के डॉक्टर के साथ साझा की जाएगी जब मैं इसे सबमिट करूँगा/करूँगी। मैं किसी भी समय रुक सकता/सकती हूँ।"`

### 2.5 Report v1.2 Invariants & Gender Declined Rule
- **RD-02 Invariant:** `value !== null ⟺ status === "provided"`. All other statuses (`declined`, `unknown`, `unclear`, `not_provided`, `not_asked`) carry `value: null`.
- **Gender Value Invariant (Report v1.2):** `GenderValue` members for provided values are `"male" | "female" | "other"`. When the patient chooses "Prefer not to say", it is recorded as `status: "declined"` with `value: null`. `"declined"` is never stored as a value.
- **Completion & Missing Info:** Both backend `isComplete()` and frontend completion logic treat gender `declined` as answered. It does not block completion or submission and is omitted from `missing_information`.
- **Correction Allowlist:** Strictly limited to the 10 `CORRECTABLE_FIELDS`. `NON_DECLINABLE_FIELDS` (`patient.name`, `patient.age`, `primary_concern`, `clinical_details.duration`, `clinical_details.severity`) reject `{ status: "declined" }`.
- **Protected Fields:** `id`, `session_id`, `user_id`, `schema_version`, `status`, `intake_reference`, `submitted_at`, `created_at`, `updated_at`, `routing_snapshot`, `possible_urgent`, `needs_human_review`, `emergency`, `reviewed_at`, `reviewed_by`, `missing_information`, `summary`, `doctor_id`, `department_key`.
- **Summary Nullability (RD-10):** `summary` is `null` for `urgent_partial` reports to prevent AI hallucinations during clinical emergencies.

### 2.6 Spend Protection & 15-Turn Cap
- The 15th turn allows submission if completion criteria are met.
- If incomplete at turn 15, the patient is presented with an incomplete summary and exactly one action: `"End session"`. No submission, booking, or doctor assignment is possible.
- Global cap triggers `demo_busy: true` (copy: *"This demo has reached today’s usage limit. Please try again later."*).

---

## 3. Database RPC Alignment (M4)

### 3.1 Mark Reviewed RPC (`public.mark_report_reviewed`)
- **Signature:** `mark_report_reviewed(p_report_id uuid)`
- **Return Type:** `table (report_id uuid, reviewed_at timestamptz, reviewed_by uuid, already_reviewed boolean)`
- **Authorisation:** Validated inline from `auth.uid()`. `reviewed_by` is set to `auth.uid()`.
- **OD-03 Interim Rule:**
  - For `submitted` reports: Assigned doctor only.
  - For `urgent_partial` reports: Emergency doctor only. General Medicine has read cross-visibility only and is denied review with `42501`.
  - Draft reports: Rejected with `22023`.
- **Idempotency:** When `reviewed_at` is already set, the existing timestamp is preserved and `already_reviewed: true` is returned.
- **Client Mapping:** `DoctorReportDetail.tsx` and `DoctorUrgentDetail.tsx` handle errors without optimistic local state mutations.

### 3.2 Availability RPC (`public.get_available_slots`)
- **Signature:** `get_available_slots(p_report_id uuid, p_days integer default 14)`
- **Return Type:** `table (slot_start timestamptz, slot_end timestamptz)`
- **Trust Model:** Caller never supplies doctor or department; both are derived from `reports` owned by `auth.uid()`.
- **Horizon & Schedule:** Computes Asia/Kolkata weekday slots (09:00–17:00, 30 min slots, lunch 13:00–14:00 excluded, past slots excluded) for `today … today + (p_days - 1)`.
- **Hold Enforced:** Submitted reports with `possible_urgent` or `needs_human_review` raise SQLSTATE `42501` (`'report is held pending review'`) until marked reviewed.
- **Emergency Invariant:** Emergency reports raise SQLSTATE `22023` and never produce routine slots.

### 3.3 Atomic Booking RPC (`public.book_appointment`)
- **Signature:** `book_appointment(p_report_id uuid, p_slot_start timestamptz)`
- **Return Type:** `table (appointment_id uuid, reference_code text, slot_start timestamptz, slot_end timestamptz, doctor_id uuid, already_booked boolean)`
- **Trust Model:** Caller passes `p_report_id` and the exact ISO-8601 offset timestamp (`+05:30`) returned by `get_available_slots`.
- **Atomic Reservation:** Re-validates slot availability inside the transaction; concurrent losers receive SQLSTATE `23505` (`'slot is no longer available'`).
- **Idempotency:** Repeated booking of the exact same report and slot returns the existing appointment with `already_booked: true`, treated by the UI as success.
- **SQLSTATE Error Translations:**
  - `23505` $\rightarrow$ *"That slot was just taken. Please select another slot."* (triggers slot reload).
  - `42501` $\rightarrow$ *"Booking paused until a doctor reviews this report."*
  - `22023` $\rightarrow$ *"Emergency reports are permanently ineligible for routine booking."*
  - `P0002` $\rightarrow$ *"Report not found or not owned."*

---

## 4. Dual Application Mode Architecture

- `src/lib/api.ts` provides explicit mode control: `getAppMode(): AppMode` and `setAppMode(mode: AppMode)`.
- **Mock Mode:** Self-contained in-memory simulation for local testing, offline validation, and UI development.
- **Supabase Mode:** Real calls to Supabase Auth, Edge Functions (`chat-turn`, `speak`), and PostgreSQL RPCs (`mark_report_reviewed`, `get_available_slots`, `book_appointment`).
- **Fail-Loud Guarantee:** Errors in Supabase mode are re-thrown with descriptive domain messages and **never** silently fall back to mock data.
- **Boundary Invariant:** `src/lib/api.ts` is the single module that communicates with `src/lib/supabase.ts`.

---

## 5. Question Bank Ownership Boundary & Adaptive Selection

- **Canonical Ownership:** The backend is the single canonical owner of the 150-question bilingual bank (`supabase/functions/_shared/intake/`).
- **Wire Transparency:** In real Supabase mode, the frontend receives `id` (e.g., `GM-001`, `ORTH-002`), `text`, `text_hi`, `options`, and `answer_type` directly over the wire from `chat-turn`. Real-mode patients never load question content from a second frontend bank copy.
- **Frontend Mock Fixture:** A lightweight representative fixture (`src/lib/mock-adaptive-bank.ts`, 15 questions, 3 per department) is retained strictly for offline mock-mode testing and UI state validation.
- **UI Responsiveness:** `ConversationView` natively renders localized options as quick-reply chips, supports dynamic Hindi/English switching with Devanagari text, and preserves question state on resume.

---

## 6. Conclusion
The frontend contract strictly mirrors `docs/integration-contract.md` §§10–16 and all backend migrations. All six actions, three RPCs, security holds, adaptive bank wire representations, and error mappings are fully reconciled.
