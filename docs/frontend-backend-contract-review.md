# Frontend-Backend Contract Review — Samvad HealthDesk AI

**Document Version:** 1.0  
**Date:** 2 November 2026  
**Audited Files (Read-Only):**
- `supabase/functions/_shared/contract.ts` (Backend Wire Contract Mirror)
- `docs/report-design.md` (v1.2 Contract)
- `docs/provider-notes.md` (M1-S5 Verified Facts)
- `src/types/api.ts`, `src/types/report.ts`, `src/types/consent.ts` (Frontend Contract)

---

## 1. Executive Summary

This document confirms full alignment between the frontend (`samvad-frontend` on `feat/frontend`) and backend (`samvad-backend` on `feat/backend`) for Milestone 2. No unilaterally renamed fields exist. The wire contract is authoritative in `src/types/` and mirrored in `supabase/functions/_shared/contract.ts`.

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
- `session_status: "created" | "consented" | "declined" | "in_progress" | "emergency" | "ended" | "submitted"`
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

### 2.3 Audio Transcript Preview (`transcript_preview`)
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
- Internal database columns (`pending_transcript_*`) remain private to Supabase Edge Function orchestration and are never leaked to the client wire contract.

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
- **Summary Nullability (RD-10):** `summary` is `null` for `urgent_partial` reports to prevent AI hallucinations during clinical emergencies.

### 2.6 Spend Protection & 15-Turn Cap
- The 15th turn allows submission if completion criteria are met.
- If incomplete at turn 15, the patient is presented with an incomplete summary and exactly one action: `"End session"`. No submission, booking, or doctor assignment is possible.
- Global cap triggers `demo_busy: true` (copy: *"This demo has reached today’s usage limit. Please try again later."*).

---

## 3. Unresolved / Open Items from Decision Register
1. **RD-14 / Hindi Medical Translations:** Hindi strings for safety-critical states and the consent statement are marked `DRAFT — For Owner Review`.
2. **Provider Audio Encoding (Browser):** Gnani Prisma v2.5 accepts WAV, MP3, OGG, FLAC, AAC, M4A, but rejects WebM. Production audio recording will transcode or encapsulate into WAV/MP4 before base64 encoding.

---

## 4. Conclusion
The frontend `src/types/`, `src/lib/api.ts`, and UI components conform 100% to the mirrored contract. No breaking discrepancies remain.
