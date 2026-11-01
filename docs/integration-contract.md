# Backend ↔ Frontend Integration Contract

**Audience:** Antigravity (frontend) and the project owner.
**Backend source of truth:** `supabase/functions/_shared/contract.ts` (mirror of `src/types/`), `_shared/validation.ts`, `_shared/errors.ts`, `_shared/consent.ts`.
**Status:** the backend is implemented against this contract. Two items need frontend adoption (§2 and §3). Neither changes the envelope; both are additive.

The single endpoint is `POST /functions/v1/chat-turn`. `POST /functions/v1/speak` returns audio.

---

## 1. Authentication

- Every call requires a Supabase user JWT on `Authorization`. `verify_jwt` stays enabled.
- The patient is an **anonymous** Supabase user created with `signInAnonymously()`. Anonymous users carry the `authenticated` Postgres role, so the backend never trusts the role — it always derives the user from verified claims.
- Every read and write is filtered by `user_id = auth.uid()`. A session or report belonging to another identity returns **404**, never 403, so existence is never confirmed.
- Doctors authenticate with email/password and are mapped in `doctor_profiles`. They only read reports through RLS and never touch the intake endpoint.

---

## 2. Audio confirmation — `transcript_preview` (frontend adoption required)

An audio turn is **transcribed but not accepted**. `turn_count` does not change. The backend returns one field:

```ts
transcript_preview?: {
  state: "transcript_preview";   // literal, always this value
  text: string;                  // the transcription, editable by the patient
  question_id: QuestionId;       // the question it answers
}
```

There is no second name for this field. `pending_transcript` does not exist.

**Flow:** send `submit_turn` with `audio_base64` + `audio_format` → show `transcript_preview.text` in the "What we heard" step → the patient confirms or edits → send the same `submit_turn` again with `text` (no audio). The backend then stores `original_text` (the transcript) and `final_text` (the confirmed text) and counts the turn.

Accepted audio formats: `audio/wav`, `audio/mpeg`, `audio/ogg`, `audio/flac`, `audio/aac`, `audio/mp4`. **`audio/webm` is rejected before any provider call** — encode WAV (or OGG) in the browser.

---

## 3. Consent — one versioned copy (frontend adoption required)

- `CONSENT_VERSION = "2026-11-01.v1"`
- The backend persists the exact wording the patient accepted. A version mismatch is rejected with `invalid_request`, so the stored copy can never disagree with what was displayed.
- The frontend must display this exact text and send this exact version.

**English**

> I understand that Samvad HealthDesk AI is an AI intake assistant and not a doctor, and that it cannot diagnose or treat me. I agree that the health information I give will be processed to prepare a preliminary report, and that this report will be shared with the hospital's doctor only if I submit it. I can stop at any time.

**Hindi** (draft — owner review pending)

> मैं समझता/समझती हूँ कि संवाद हेल्थडेस्क AI एक AI इनटेक सहायक है, डॉक्टर नहीं है, और यह मेरा निदान या इलाज नहीं कर सकता। मैं सहमत हूँ कि मेरी दी गई स्वास्थ्य जानकारी से एक प्रारंभिक रिपोर्ट तैयार की जाएगी, और यह रिपोर्ट केवल तब अस्पताल के डॉक्टर के साथ साझा की जाएगी जब मैं इसे सबमिट करूँगा/करूँगी। मैं किसी भी समय रुक सकता/सकती हूँ।

`_shared/contract.test.ts` asserts the version string, both texts and the rejection path, so a drift on the backend side fails CI. The frontend should mirror the constant and, if convenient, assert the same strings.

---

## 4. The six actions

All requests are JSON with a discriminating `action`. Unknown actions and unknown top-level keys are rejected with `invalid_request`.

```ts
{ action: "start_session"; language?: "en" | "hi" }
{ action: "resume_session"; session_id: string }
{ action: "record_consent"; session_id: string; consent: boolean; consent_version: string; language: "en" | "hi" }
{ action: "submit_turn"; session_id: string; question_id: QuestionId;
  text?: string; audio_base64?: string; audio_format?: string }   // exactly one of text/audio
{ action: "correct_draft_report"; session_id: string; report_id: string;
  updates: Partial<Record<CorrectableField, { value: unknown; status: "provided" | "declined" }>> }
{ action: "submit_report"; session_id: string; report_id: string }
```

`QuestionId` is the union already in `src/types/api.ts`: `greeting`, `name`, `age`, `gender`, `primary_concern`, `duration`, `severity`, `conditions`, `medications`, `allergies`, `other_symptoms`, `emergency_clarification`.

### Response envelope (unchanged)

```ts
{
  session_id: string;
  session_status: "created" | "consented" | "declined" | "in_progress" | "emergency" | "ended" | "submitted";
  current_question?: { id: QuestionId; text: string; text_hi?: string; options?: string[]; is_ambiguous_emergency?: boolean };
  messages: ChatMessage[];
  turn_count: number;
  max_turns: 15;
  is_complete: boolean;
  is_cap_reached: boolean;
  can_submit: boolean;
  draft_report?: ReportDocumentV1;
  submitted_report?: ReportRow;
  emergency_triggered?: boolean;
  demo_busy?: boolean;
  transcript_preview?: TranscriptPreview;   // §2
  error?: string;                            // §5
}
```

`messages` contains the conversation so far, including the assistant question. `turn_index` is 0 for assistant rows.

---

## 5. Errors

`error` is a code, never prose and never patient data. The frontend owns all copy and translation. HTTP status is transport-level; expected domain states return 200 with a code.

| Code | HTTP | Meaning | Recovery |
|---|---|---|---|
| `demo_busy` | 200 | Global session cap reached (also `demo_busy: true`) | Show the approved demo-busy copy; do not create a session |
| `turn_cap_reached` | 200 | 15 accepted answers | Show the incomplete preview with **End session** only when `can_submit` is false |
| `invalid_request` | 400 | Malformed body, bad version, bad audio format/size, uninterpretable value | Fix and resend; never retry blindly |
| `unauthorized` | 401 | Missing/invalid JWT | Re-authenticate |
| `not_found` | 404 | Session or report not owned by this identity | Do not retry; do not reveal why |
| `invalid_state` | 409 | Action not allowed in this state (e.g. correcting a submitted report) | Refresh via `resume_session` |
| `invalid_question_state` | 409 | Answer sent for a question that is no longer current | Refresh via `resume_session` |
| `invalid_question` | 400 | Unknown question id | Client bug |
| `field_not_editable` | 400 | Correction touched routing/flags/status/reference/summary | Client bug |
| `invalid_field_status` | 400 | Declining a required field (gender excepted) or an illegal status | Client bug |
| `provider_unavailable` | 200 | Prisma/Timbre/Groq failed or is capped | Offer text entry / text question; never claim success |
| `transcript_empty` | 200 | No speech detected | Ask to repeat or type; no turn consumed |
| `audio_in_progress` | 200 | Another audio attempt holds the claim | Refresh shortly |
| `audio_superseded` | 200 | A late transcription arrived after the session moved on | Refresh; discard |
| `internal` | 500 | Unexpected server failure | Show a retry state |

**Never show success before the backend confirms.** Disable send while a request is in flight; after an uncertain response, call `resume_session` rather than replaying the action.

---

## 6. Report v1.2 and the gender invariant

`ReportDocumentV1` is unchanged except for the gender rule:

- An explicit choice: `{ "status": "provided", "value": "male" | "female" | "other" }`.
- "Prefer not to say": `{ "status": "declined", "value": null }`.
- **`"value": "declined"` is never emitted.** The `declined` member of `GenderValue` exists in the type but is not a stored value.
- Declined gender is a handled answer: it never blocks completion, never blocks submission, and must not render as a warning.

Everything else follows `docs/report-design.md` v1.2: three report statuses only (`draft`, `submitted`, `urgent_partial`), a value only when `provided`, `urgent_partial` has `summary: null`.

### Correction allowlist

Allowed on a `draft` only: `patient.name`, `patient.age`, `patient.gender`, `primary_concern`, `clinical_details.duration`, `clinical_details.severity`, `clinical_details.conditions`, `clinical_details.medications`, `clinical_details.allergies`, `clinical_details.other_symptoms`.

Rejected with `field_not_editable`: `id`, `session_id`, `user_id`, `schema_version`, `status`, `intake_reference`, `submitted_at`, `created_at`, `updated_at`, `routing_snapshot`, `possible_urgent`, `needs_human_review`, `emergency`, `reviewed_at`, `reviewed_by`, `missing_information`, `summary`, and any unknown key.

---

## 7. Emergency and booking

- A deterministic match returns `emergency_triggered: true` with `session_status: "emergency"` and a `draft_report` whose `status` is `urgent_partial`. Show the plain-text 112 guidance — no `tel:` link, no button, no claim that anyone was notified.
- Ambiguity returns `current_question.id === "emergency_clarification"` with Yes/No options. **"No" negates only that candidate**; it is not a safety clearance. The patient's ambiguous statement is preserved in `messages`.
- Emergency and `urgent_partial` reports never receive routine slots. Routine booking is also paused for a submitted report with `possible_urgent` or `needs_human_review` until a doctor marks it reviewed.
- `speak` accepts `{ session_id, question_id }` only. It returns audio bytes for an **adaptive** current question, or `{ "text": "..." }` when TTS is unavailable or capped. Cached opening prompts are served from `public/audio/` and must never call `speak`.

---

## 8. Turn limit and resume

- **15 accepted answers maximum.** The 15th is saved. If completion is satisfied, review and submit continue normally; otherwise the response is `is_cap_reached: true`, `can_submit: false`, and the only action is End.
- `resume_session` is safe to call at any time. It repairs an interrupted acceptance (an answer stored but not counted) using deterministic question selection — it never calls a provider.
- Sessions are only resumable by the same persisted anonymous identity. A lost browser identity means a lost session; there is no recovery by session id, name or phone.

---

## 9. Verification fixtures

`supabase/functions/_shared/contract.test.ts` contains canonical JSON for every action and for the three response shapes that matter (`active`, `transcript_preview`, `submitted`). It is run by `deno test --allow-read` and fails if the backend drifts from this document. Antigravity can copy those fixtures into a frontend test without importing backend code.

---

## 10. Mark Reviewed RPC (implemented, `20261102120000_mark_report_reviewed.sql`)

```
POST /rest/v1/rpc/mark_report_reviewed
Authorization: Bearer <doctor JWT>      apikey: <publishable/anon>
{ "p_report_id": "<report uuid>" }

200 → [ { "report_id": uuid, "reviewed_at": ISO-8601, "reviewed_by": uuid, "already_reviewed": boolean } ]
```

- `reviewed_by` is the authenticated doctor identity (`auth.uid()`), exactly as approved in RD-17.
- `already_reviewed: true` means the first review is preserved; the timestamp never changes.
- Errors arrive as PostgREST errors: `42501` (not a doctor / not authorised), `P0002` (not found), `22023` (draft, not reviewable). The UI shows a generic failure and must not claim success.

| Caller | `submitted` report | `urgent_partial` emergency report | Draft |
|---|---|---|---|
| Assigned doctor | **allowed** | not applicable | rejected |
| Emergency doctor | only if assigned | **allowed** | rejected |
| General Medicine doctor | only if assigned | **denied (OD-03 interim)** | rejected |
| Any other mapped doctor | denied | denied | rejected |
| Patient / anonymous | denied | denied | denied |

Review changes exactly two columns. It never changes status, flags, content, routing or booking eligibility, so an emergency report stays permanently unbookable.

Frontend usage: call it, then re-read the report; do not update local state optimistically.

---

## 11. Availability and booking RPCs (implemented, `20261102130000_availability_and_booking.sql`)

```
POST /rest/v1/rpc/get_available_slots
{ "p_report_id": "<uuid>", "p_days": 14 }
200 → [ { "slot_start": "2026-11-03T09:00:00+05:30", "slot_end": "..." } ]

POST /rest/v1/rpc/book_appointment
{ "p_report_id": "<uuid>", "p_slot_start": "2026-11-03T09:00:00+05:30" }
200 → [ { "appointment_id", "reference_code", "slot_start", "slot_end", "doctor_id", "already_booked": false } ]
```

**The client never supplies a doctor, department or patient id.** Doctor and department are derived from the report server-side; ownership comes from `auth.uid()`.

| Rule | Behaviour |
|---|---|
| Caller | Authenticated patient, owns the report and session |
| Report status | `submitted` only. Draft and `urgent_partial` are refused |
| Department | Must be bookable and not Emergency |
| Review hold | If `possible_urgent` or `needs_human_review`, `reviewed_at` must be set (Mark Reviewed releases the hold) |
| Horizon | Next **14** days in `Asia/Kolkata`, weekdays only, 09:00–17:00, 30-minute slots, lunch 13:00–14:00 excluded, last start 16:30 |
| Past / occupied | Excluded |
| Booking | Slot is revalidated inside the same transaction; concurrent losers get a conflict |
| Repeat | Same report + same slot returns the existing appointment with `already_booked: true`; a different slot is rejected |

Errors (PostgREST): `P0002` not found / not owned, `22023` not eligible (draft, urgent, emergency, bad horizon), `42501` held pending review, `23505` slot taken or already booked.

**Frontend mapping note (authoritative):** pass the **`slot_start` timestamp returned by `get_available_slots`** as `p_slot_start`, unchanged and in the same ISO-8601 offset form (`+05:30`). Do **not** invent a slot id, and do **not** send `doctor_id` — the server derives the doctor and department from the report. `BookAppointmentRequest.slot_id` / `.doctor_id` are presentation-only and must not be treated as authority.

**SQLSTATE → UI mapping (recoverable):**

| SQLSTATE | Meaning | UI behaviour |
|---|---|---|
| `23505` | Slot taken, or this report already booked another slot | Show "That slot was just taken", refresh availability, let the patient choose again. Never show SQL text. |
| `42501` | Report held pending review, or not a doctor (review RPC) | Show the approved "booking paused until a doctor reviews it" copy |
| `22023` | Not eligible: draft, `urgent_partial`, emergency department, invalid horizon | No slots UI; emergency shows the 112 guidance only |
| `P0002` | Report not found or not owned | Generic failure; do not reveal why |
| `28000` | Not authenticated | Re-authenticate |

PostgREST returns these in the `code` field of the error body. The message is a stable English string; the UI must key off `code`, not the message, and must never surface database details to the patient.

**Horizon enforcement:** `p_days` is optional (default 14) and capped server-side; `NULL`, `0`, negative or `> 14` values raise `22023`. The client cannot extend the horizon by changing the argument. Slots are generated for the Asia/Kolkata date range `today … today + (p_days - 1)`.

**Documented deviation:** `get_available_slots` is `SECURITY DEFINER`, not invoker, because `reports` deliberately has no browser read policy, so an invoker function cannot validate ownership. It keeps an empty `search_path`, checks `auth.uid()`, and grants EXECUTE to `authenticated` only. No table access was added.

---

## 12. Open decisions that affect the UI

| ID | Question | Current backend behaviour |
|---|---|---|
| OD-02 | Does the emergency clarification answer consume one of the 15 turns? | **Not counted.** The answer is stored in `sessions.clarification_answer` for evidence, the question stays current until resolved. Do not build UI that assumes either rule until the owner decides. |
| OD-09 | Does a later clear "No" clear an earlier `needs_human_review`? | **No.** The flag is conservative and stays set until the owner decides. |
| OD-03 | May a General Medicine doctor mark an Emergency report reviewed? | **No (interim).** Read cross-visibility does not grant review authority. The Emergency doctor may review; General Medicine is denied until the owner decides. |

## 13. Frontend adoption status (verified 2 November 2026)

Read-only check of the frontend worktree — both previously open items are **adopted**:

- `src/types/api.ts` declares `TranscriptPreview` with `state: 'transcript_preview'` and `transcript_preview?: TranscriptPreview`; `src/lib/api.ts` builds it and documents that `turn_count` is unchanged while it is present.
- `src/types/consent.ts` exports `CONSENT_VERSION = '2026-11-01.v1'` and the same English wording.

No mismatch found in the six action definitions or the report v1.2 correction semantics.

---

## 14. Adaptive intake question bank (`question-bank-v1`)

**Status:** draft content, `draft_owner_review` on every entry. Not clinically validated. Hindi wording requires human review.

| Item | Value |
|---|---|
| Bank version | `question-bank-v1` |
| Questions | **150** — 30 each for `general_medicine`, `orthopedics`, `general_surgery`, `dermatology`, `cardiology` |
| Language variants | **300** (one English + one Hindi text per question, paired under one id) |
| ID convention | `GM-001…GM-030`, `ORTH-…`, `SURG-…`, `DERM-…`, `CARD-…`; stable across versions, never reused |
| Answer types | `free_text`, `yes_no`, `single_choice` |
| Source | `supabase/functions/_shared/intake/bank-v1.ts` (static, version-controlled; no database table) |

Each question carries a department, topic and tag list, one report field, optional localised options, version and review status. Choice options are stored as `{ value, en, hi }`.

**Language behaviour:** the same id always returns the same clinical question. `questionText(id, "en" | "hi")` selects the stored text; nothing is translated at runtime. Patient answers may be English, Hindi, Hinglish or a mix — the backend stores the patient's words verbatim and never replaces them.

**`current_question` usage (unchanged shape):**

```json
{
  "id": "CARD-003",
  "text": "Does it come with walking or climbing?",
  "text_hi": "चलने या सीढ़ी चढ़ने पर होती है?",
  "options": ["Yes", "No"]
}
```

Choice questions return localised `options`; a bank id is passed in the existing `question_id` field of `submit_turn`. **No `QuestionId` union change is required for rendering** — the union should be widened to accept bank ids (`string`) when the adaptive flow ships, or the frontend can accept `string` for `current_question.id`.

**Retrieval:** deterministic metadata only (department → tag overlap → missing report field), max 8 candidates. Groq may select **one candidate id** via a strict JSON schema; it cannot write question text. Invalid id, malformed output, timeout or missing key falls back to the first candidate deterministically.

**Limits:** at most **3** adaptive questions per session (`MAX_ADAPTIVE_QUESTIONS`), on top of the scripted core; adaptive answers count toward the 15-answer cap only after patient confirmation; no provider calls after the cap; adaptive questions never run in emergency or `urgent_partial` flows.

**Fixture:** `supabase/functions/_shared/intake/question-bank.test.ts` asserts counts, pairing, option localisation and retrieval behaviour.

---

## 15. Adaptive question activation (wired into `chat-turn`)

The bank is now live in the conversation flow, after the scripted core.

**Sequence:** emergency matcher and clarification → scripted fixed questions → scripted adaptive questions (duration, severity, conditions, medications, allergies, other symptoms) → **if the report is still incomplete** and the adaptive budget remains, one bank question → draft on completion.

**Delivery:** the chosen bank id is stored in `sessions.current_question_id`, so it survives `resume_session` (verified: `GM-016` returned again after resume). `current_question` is unchanged in shape:

```json
{ "id": "GM-016", "text": "Do you have pain in your abdomen?", "text_hi": "पेट में दर्द है?", "options": ["हाँ", "नहीं"] }
```

Choice questions return localised `options`; `yes_no` returns `["Yes","No"]` or `["हाँ","नहीं"]`; `free_text` returns no options.

**Durable limits (derived from `messages`, no new columns):**
- asked bank ids = distinct `question_id` on patient rows that match the bank
- adaptive answers = same set, so it counts confirmed answers only
- a transcript preview is not a message, so it never counts
- maximum **3** adaptive bank questions per session
- adaptive answers are ordinary accepted turns and count toward the 15-answer cap

**Answer parsing:** a bank id is mapped to the core question that owns the same report field, so decline/unknown/yes-no handling is identical to the scripted flow. The patient's words are stored verbatim in `final_text`.

**Safety:** selection never runs for `emergency` or `submitted` sessions, never when the report is already complete, never after 3 adaptive answers, never when no candidate matches (no provider call in that case), and never after the 15-answer cap. Missing key, malformed JSON, timeout, invalid or out-of-set id → deterministic first candidate.

**Type guidance:** keep `QuestionId` for the core ids and add a separate union or validated type for bank ids (`BankQuestionId = "GM-001" | … | "CARD-030"`). Do not widen the core union to `string`; validate at runtime with `getQuestion(id)`.

**Known limitation (smallest future fix):** adaptive retrieval uses `general_medicine` until a department is known, because the report (and therefore the routed department) does not exist before completion. Persisting the Groq department suggestion on the session when it is first computed would let retrieval use the correct bank.

---

## 16. Preliminary department for adaptive retrieval (verified)

The session now caches the preliminary department in `sessions.preliminary_department` (new column, FK to `departments`, `CHECK` excludes `'emergency'`). It is written only by the backend from the validated routing result and reused for every subsequent adaptive selection and for draft routing — Groq is asked **once per session**, never per turn.

- Source: the validated `suggestDepartment` → `resolveRouting` pair already used for drafts.
- Fallback: General Medicine with `is_fallback: true` when routing is unavailable, malformed or inconclusive.
- Emergency is never routed: the deterministic matcher runs first, and the column check rejects `'emergency'`.
- Browser input never supplies a department; drafts and adaptive retrieval read the same cached value, so they cannot disagree.

**No response-shape change.** No frontend change is required.
