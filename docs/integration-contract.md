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

**Frontend mapping note:** `BookAppointmentRequest.slot_id` and `.doctor_id` are presentation data. Send `p_slot_start` from `slot_id` (ISO start) and ignore `doctor_id`; the server derives it.

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
