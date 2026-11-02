# Frontend ↔ Backend Contract Map (Figma Reconstruction Freeze)

**Frozen at:** 2 November 2026
**Backend source:** `feat/backend` @ `e5d77e5`
**Frontend source:** `feat/frontend` @ `7a28175`; `feat/frontend-figma-parity` starts there and adds only this document
**Release branch:** `release/samvad-rc1` @ `318ab7b`

This document is the contract inventory for the Figma-faithful UI reconstruction. It lists
what the UI may change (presentation, layout, component structure) and what must remain
byte-compatible with the backend (request fields, response fields, action names, RPC names,
ownership semantics and state transitions).

**Rule:** a visual rebuild may replace every component in `src/features/**`. It may not
change `src/lib/api.ts` signatures/return shapes, `src/types/**`, the six `chat-turn`
actions, the two Edge Function request/response shapes, the four RPC names or the report
schema without an explicit owner-approved contract change.

Companion documents:

| Topic | Document |
|---|---|
| Backend contract source | `supabase/functions/_shared/contract.ts`, `validation.ts`, `errors.ts` (backend worktree) |
| Backend prose contract | `docs/integration-contract.md` (backend worktree) |
| Backend deployment/security | `docs/backend-deployment-runbook.md`, `docs/security-and-access-review.md` |
| Frontend integration detail | `src/lib/api.ts`, `tests/api/README.md` |
| Frontend report types | `src/types/api.ts`, `src/types/report.ts`, `src/types/consent.ts`, `src/types/doctor.ts` |

> `docs/frontend-backend-contract-review.md` (v1.2) is older and partly stale: it treats
> `report_id` as required, lists three RPCs and omits adaptive bank IDs. Where the two
> disagree, this map and `docs/integration-contract.md` win.

---

## 1. Verified branch and commit matrix

| Branch | HEAD | Worktree | Status | Role |
|---|---|---|---|---|
| `feat/backend` | `e5d77e5` | `../samvad-backend` | clean | backend, Edge Functions, migrations, contract source |
| `feat/frontend` | `7a28175` | not checked out | clean | committed frontend baseline |
| `feat/frontend-figma-parity` | `7a28175` + this document | `../samvad-frontend` | clean | active reconstruction branch; application-code tree identical to `feat/frontend` |
| `release/samvad-rc1` | `318ab7b` | `../samvad-integration` | clean | release/docs branch; frontend snapshot only, no `supabase/` tree |

Other refs seen in the repository (not part of this freeze):

| Ref | HEAD | Note |
|---|---|---|
| `feat/frontend-integration` | `f309c53` | older integration branch |
| `release/rc-1` | `c38111e` | older release branch; not `release/samvad-rc1` |

### 1.1 Commit-reference discrepancy resolved

| Handoff reference | What it actually is | Current correct reference |
|---|---|---|
| Backend `e5d77e5` | current `feat/backend` tip (docs + evidence commit) | **correct** |
| Frontend `ed86b73` | an **ancestor of `feat/backend`** (`ops: refresh smoke and rehearsal evidence`), 8 commits behind the backend tip; it is not a frontend commit | **`7a28175`** (`feat/frontend`; the parity branch starts here) |
| Integration `d85ec56` | a release-docs commit that is an ancestor of `release/samvad-rc1`, 9 commits behind the tip | **`318ab7b`** (`release/samvad-rc1`) |

Evidence:

- `git merge-base --is-ancestor ed86b73 e5d77e5` → true; `git rev-list --count ed86b73..e5d77e5` → 8.
- `git merge-base --is-ancestor d85ec56 318ab7b` → true; `git rev-list --count d85ec56..318ab7b` → 9.
- `git branch --contains ed86b73` → `feat/backend` only.
- `git branch --contains d85ec56` → `release/samvad-rc1` only.

### 1.2 Which branch is behind

| Relationship | Result |
|---|---|
| `release/samvad-rc1` vs `feat/frontend` | release is **2 commits behind**: missing `bccbd83` (doctor conversation note) and `7a28175` (deploy/bundle readiness) |
| release's last frontend snapshot | `1311166` (merged via `7b8daa4`) |
| release vs `feat/backend` | release contains **no** `supabase/` or `scripts/` tree at all; both branches diverged at `d955be2`. This is a frontend-only release branch, not a "behind by N commits" backend branch |
| frontend branch state | `feat/frontend` and `feat/frontend-figma-parity` both start at `7a28175`; the parity branch adds this document only, and no application-code reconstruction commit exists yet |

**No merge was performed.** The release branch is behind the frontend baseline and does not
integrate the backend worktree.

---

## 2. Architecture and trust boundaries

```
Patient browser (anonymous Supabase JWT)
  └─ src/lib/api.ts ── chat-turn Edge Function ── Groq (adaptive/routing) / Prisma (STT)
                    └─ speak Edge Function ─────── Timbre (TTS, adaptive only)
                    └─ PostgREST RPCs ──────────── PostgreSQL (RLS + SQL functions)
Doctor browser (email/password JWT)
  └─ src/lib/api.ts ── auth + PostgREST reports (RLS) + doctor RPCs
```

- `src/lib/api.ts` is the **only** frontend module allowed to call Supabase Auth,
  `.from()`, `.rpc()` or `.functions.invoke()`. Components must not import
  `src/lib/supabase.ts` directly.
- Every Edge Function call requires a valid user JWT. The backend derives the user from
  verified claims and filters by `auth.uid()`; a foreign session or report returns 404.
- Anonymous patient users carry the `authenticated` Postgres role. The backend never trusts
  the role alone.
- `sessions`, `consent_records`, `messages`, `reports` and `appointments` have no browser
  write path. Patient writes go through `chat-turn`; booking/review go through RPCs.
- Doctors read only through RLS and the doctor-scoped RPCs.

---

## 3. `chat-turn` request contract

**Endpoint:** `POST /functions/v1/chat-turn`
**Auth:** `Authorization: Bearer <user JWT>` (verify_jwt stays enabled)
**Content type:** `application/json`
**Actions:** exactly six, discriminated by `action`. Unknown actions and unknown top-level
keys are rejected with `400 invalid_request`.

| Action | Request body | Notes |
|---|---|---|
| `start_session` | `{ action, language?: "en" \| "hi" }` | creates a server-owned session; reserves one daily session slot; not deduplicated |
| `resume_session` | `{ action, session_id }` | restores current state; repairs an interrupted accept; never creates a session |
| `record_consent` | `{ action, session_id, consent: boolean, consent_version, language }` | consent is an on-screen Yes/No decision; never inferred from speech |
| `submit_turn` | `{ action, session_id, question_id, text?, audio_base64?, audio_format? }` | exactly one of `text` / `audio_base64`; `audio_format` required with audio |
| `correct_draft_report` | `{ action, session_id, report_id?, updates }` | `updates` is a partial map of the 10 allowlisted fields; draft only |
| `submit_report` | `{ action, session_id, report_id? }` | revalidates consent/completion; idempotent for a replay |

### 3.1 `report_id` is optional

A session owns exactly one report (`reports.session_id` is unique). `start_session`,
`resume_session` and `submit_turn` do not return a report row id, so the browser usually
cannot supply one. `submit_report` *does* return `submitted_report` (with its id) on success
and on an idempotent replay. The frontend omits a non-UUID value; the backend resolves the
report through `session_id` + verified owner. A supplied mismatched id becomes `not_found`.

### 3.2 `question_id`

- Core IDs: `greeting`, `name`, `age`, `gender`, `primary_concern`, `duration`, `severity`,
  `conditions`, `medications`, `allergies`, `other_symptoms`, `emergency_clarification`.
- Adaptive bank IDs: `GM-001` … `CARD-030` (150 questions).
- Runtime validation accepts both. `contract.ts`'s TypeScript `QuestionId` union lists only
  the core IDs — a **type-only drift**; the frontend type correctly includes bank IDs.
  Do not narrow the frontend type to match the stale mirror.

### 3.3 `submit_turn` rules

- `question_id` must equal the session's current question; otherwise `409 invalid_question_state`.
- Text ≤ 4000 characters.
- Audio base64 ≤ 2,000,000 characters; accepted formats: `audio/wav`, `audio/x-wav`,
  `audio/mpeg`, `audio/ogg`, `audio/flac`, `audio/aac`, `audio/mp4`.
- **`audio/webm` is rejected before any provider call.** The browser must encode WAV.
- An audio turn is transcribed but **not accepted**: the response contains
  `transcript_preview` and `turn_count` is unchanged. Confirming sends the same
  `question_id` with `text` (no audio). Only that accepted turn increments the counter.
- 15 accepted answers maximum. The 15th is saved; no provider call is made after it.

---

## 4. `chat-turn` response contract

One envelope for every action:

```ts
{
  session_id: string;
  session_status: "created" | "consented" | "declined" | "in_progress" | "emergency" | "ended" | "submitted";
  current_question?: {
    id: QuestionId;
    text: string;          // always English
    text_hi?: string;      // Hindi / Devanagari
    options?: string[];    // localized to the session language
    is_ambiguous_emergency?: boolean;
  };
  messages: ChatMessage[]; // { id, session_id, role, content, question_id?, created_at, turn_index }
  turn_count: number;      // accepted answer turns, 0..15
  max_turns: number;       // 15
  is_complete: boolean;
  is_cap_reached: boolean;
  can_submit: boolean;
  draft_report?: ReportDocumentV1;
  submitted_report?: ReportRow;
  emergency_triggered?: boolean;
  demo_busy?: boolean;
  transcript_preview?: { state: "transcript_preview"; text: string; question_id: QuestionId };
  error?: string;          // stable code, never prose
}
```

| Field | Meaning for the UI |
|---|---|
| `current_question.text` | English text; it is **not** localized by session language |
| `current_question.text_hi` | Hindi text; render this when the UI language is Hindi |
| `current_question.options` | Adaptive bank options are localized by the backend (Devanagari for `hi`). Core gender and Yes/No options are English labels; `ConversationView.getOptionsForQuestion` localizes them client-side. Do not assume every option array is localized. |
| `answer_type` | **Not sent by the backend.** The frontend type marks it optional. Infer Yes/No from the options and gender/emergency from `id` |
| `messages` | Conversation so far; assistant `turn_index` is 0 |
| `draft_report` | Present when a draft exists; review/correct only while draft |
| `submitted_report` | Present after submission; this is the row used for booking |
| `transcript_preview` | Present only for an unconfirmed audio turn; turn not counted |
| `error` | Stable code; expected domain states return HTTP 200 |

---

## 5. `speak` request and response contract

**Endpoint:** `POST /functions/v1/speak`
**Auth:** user JWT
**Request:** `{ "session_id": "<uuid>", "question_id": "<core id or bank id>" }`
**Client never sends text.** The server loads the session's current approved question.

| Condition | Response |
|---|---|
| Current question is adaptive (core adaptive or bank) and Timbre succeeds | audio bytes; provider content type (`audio/mpeg`); `Cache-Control: no-store` |
| Current question is a scripted/cached prompt (`greeting`, name, age, gender, primary concern) | `200 { "text": "<approved question>" }` — **no Timbre call** |
| Timbre capped / key missing / provider failure | `200 { "text": "<approved question>" }` — never a false success |
| Turn cap reached | `200 { "text": "..." }` — no provider call |
| Question is not the session's current question | `409` with `{ "text": "" }` |
| Session not owned / not found | `404` |
| Invalid body or id | `400` |
| No JWT | `401` |
| Session status not intake-active | `200 { text }` for the known question |

**Frontend transport requirement:** `speak` must use the direct authenticated `fetch` in
`src/lib/api.ts`, not `functions.invoke`. The SDK only decodes `application/octet-stream`
and `application/pdf` as Blob; it mangles `audio/mpeg`. The current implementation returns an
object URL from the audio bytes or `{ text }` and never claims audio when there is none.

---

## 6. Supabase client operation inventory

| # | Export | Backend operation | Real mode | Mock mode |
|---|---|---|---|---|
| 1 | `getAppMode` | none | returns `supabase` when env is configured | same |
| 2 | `setAppMode` | none | test/UI override | same |
| 3 | `setMockDailyCapExceeded` | none | mock-only cap switch | used by `startSession` |
| 4 | `startAnonymousSession` | `auth.signInAnonymously` + `start_session` | creates an identity **and** a session | local ids |
| 5 | `startSession` | `start_session` | reuses the current Auth session, signs in anonymously if absent, invokes once | in-memory state; honours `demo_busy` |
| 6 | `resumeSession` | `resume_session` | invoke | rebuilds local state; unknown id throws `not_found` |
| 7 | `recordConsent` | `record_consent` | invoke with `CONSENT_VERSION` | local state machine |
| 8 | `chatTurn` | `submit_turn` | invoke with exactly one of text/audio | local state machine; simulated transcript |
| 9 | `correctDraftReport` | `correct_draft_report` | invoke; omits a non-UUID `report_id` | local allowlist mirror |
| 10 | `submitReport` | `submit_report` | invoke; omits a non-UUID `report_id` | local state machine |
| 11 | `speak` | `speak` | direct authenticated `fetch`; object URL or text | no audio |
| 12 | `getAvailableSlots` | RPC `get_available_slots` | `p_report_id`, `p_days` | synthesised weekday slots |
| 13 | `bookAppointment` | RPC `book_appointment` | `p_report_id`, `p_slot_start` | in-memory booking |
| 14 | `markReportReviewed` | RPC `mark_report_reviewed` | `p_report_id` | local flag |
| 15 | `doctorLogin` | `auth.signInWithPassword` + `doctor_profiles` + `doctors`/`departments` | real Auth + RLS reads | seeded fictional doctor |
| 16 | `doctorLogout` | `auth.signOut` | real | no-op |
| 17 | `getDoctorReports` | PostgREST `reports` | `select('*')`, RLS-scoped | local filter with Emergency cross-visibility |
| 18 | `getDoctorReportDetail` | PostgREST `reports` | `eq('id')`, `maybeSingle` | local map |
| 19 | `getDoctorAppointments` | RPC `get_doctor_appointments` | caller-scoped derived rows | local filter |
| 20 | `getDoctorDashboardStats` | derived from #17 + #19 | client-side counts | same |
| 21 | `getDoctorMessages` | PostgREST `reports` + `messages` | RLS-scoped read of stored patient answers | seeded/session fixture rows |

Also exported: `FICTIONAL_DOCTORS` (mock display data) and `ApiError` (code/status).

> **Double-start trap:** `startAnonymousSession` both signs in and calls `start_session`.
> `startSession` also calls `start_session`. The UI calls only `startSession`; calling both
> would consume two session-cap slots. Do not compose them in a redesigned welcome flow.

**Direct Supabase calls currently made by `api.ts`:**

| Operation | Call |
|---|---|
| Anonymous auth | `client.auth.signInAnonymously()` |
| Doctor auth | `client.auth.signInWithPassword({ email, password })` |
| Read current session | `client.auth.getSession()` |
| Logout | `client.auth.signOut()` |
| Intake | `client.functions.invoke('chat-turn', { body })` |
| Speech | `fetch(`${SUPABASE_URL}/functions/v1/speak`, ...)` |
| Slots | `client.rpc('get_available_slots', { p_report_id, p_days })` |
| Booking | `client.rpc('book_appointment', { p_report_id, p_slot_start })` |
| Review | `client.rpc('mark_report_reviewed', { p_report_id })` |
| Doctor appointments | `client.rpc('get_doctor_appointments')` |
| Doctor profile link | `client.from('doctor_profiles').select('doctor_id').eq('user_id', ...)` |
| Doctor display data | `client.from('doctors')`, `client.from('departments')` |
| Doctor reports | `client.from('reports').select('*')` |

No client writes exist for `sessions`, `consent_records`, `messages`, `reports` or
`appointments`. The UI must not add any.

---

## 7. Session and consent behaviour

| Step | Behaviour |
|---|---|
| Start | `startSession(language)` signs in anonymously if needed and invokes `start_session`; one session row is created and one daily slot consumed |
| Start failure | `demo_busy` returns a 200 envelope with `demo_busy: true` and `error: "demo_busy"`; no session is created |
| Persist/resume | The UI stores `samvad_session_id` in `sessionStorage` and calls `resume_session` on mount. Same anonymous identity only; a lost browser identity loses the session |
| Consent | On-screen Yes/No. `record_consent` stores decision, exact wording, `CONSENT_VERSION = "2026-11-01.v1"` and a server timestamp |
| Consent version | Must match exactly; a mismatch is `400 invalid_request`. Never hard-code a different version |
| Decline | Session becomes `declined`; no health data, report, assignment or booking is created; the UI shows the declined screen |
| Consent replay | Replaying the same decision returns current state; a second consent row is not created |
| Active intake | `session_status: "in_progress"`; `current_question` drives the next answer |
| Turn cap | 15 accepted answers; 15th saved; if complete, submit remains available; if incomplete, End-only preview |
| Resume repair | Repairs an answer stored but not counted; never calls a provider; clears an expired pending transcript |
| End | `ended` / `declined` / `emergency` / `submitted` are terminal for the UI flow; a new intake requires a new session |

Consent copy is in `src/types/consent.ts` and must match the backend exactly. The consent
decision must never be inferred from speech or transcription.

---

## 8. Patient answer submission

Text path:

```
ConversationView (chip or text input)
  → PatientShell.handleSendAnswer(text)
  → api.chatTurn({ action: "submit_turn", session_id, question_id, text })
  → chat-turn submit_turn
  → ChatTurnResponse
```

Voice path:

```
ConversationView mic control
  → PatientShell.handleVoiceRecorded()
  → captureVoiceAnswer()            // MediaRecorder → 16 kHz mono WAV base64
  → api.chatTurn({ audio_base64, audio_format: "audio/wav", question_id })
  → chat-turn submit_turn (Prisma STT)
  → transcript_preview
  → WhatWeHeardView (editable text)
  → handleConfirmTranscript(text)
  → api.chatTurn({ text, question_id })   // accepted turn
```

- One question at a time; the UI sends the `current_question.id` it received.
- A stale question returns `409 invalid_question_state`; recover with `resume_session`.
- `provider_unavailable`, `transcript_empty`, `audio_in_progress`, `audio_superseded` are
  expected domain states; offer text or refresh, never a fabricated success.
- The UI must not send the locally simulated transcript in `ConversationView` as the real
  answer. It is currently an unused callback argument; `PatientShell` ignores it and records
  audio. See §11.4 for the trap.

---

## 9. Report review and submission

| Operation | Contract |
|---|---|
| Draft | `draft_report` in the response; private; correctable; never doctor-visible |
| Correct | `correct_draft_report` with one or more allowlisted fields; draft only; last write wins |
| Allowed fields | `patient.name`, `patient.age`, `patient.gender`, `primary_concern`, `clinical_details.duration`, `clinical_details.severity`, `clinical_details.conditions`, `clinical_details.medications`, `clinical_details.allergies`, `clinical_details.other_symptoms` |
| Declined values | Only gender may be `declined`; other fields rejected with `invalid_field_status` |
| Protected fields | routing, flags, status, reference, summary, ownership, timestamps, missing_information; rejected with `field_not_editable` |
| Submit | `submit_report`; backend revalidates consent, completion, draft state, emergency state; marks `submitted`, assigns the routed doctor |
| Idempotency | Replaying submit returns the stored submitted report |
| After submit | Clinical content, routing, flags, ownership, status and reference are immutable; only review columns change |
| `can_submit` | Only when the backend says true; never compute eligibility from UI state alone |
| Incomplete at cap | Review preview with **End session only**; no Submit, no report submission, no doctor visibility, no booking |
| Don't submit | Ends the session; no appointment; draft stays private |

Correction responses return the normal envelope without a report row id. `submit_report`
returns `submitted_report` (id, status, reference, report) on both the first call and an
idempotent replay; the UI uses it for the booking screen. The review screen must not require
`submitted_report.id` before submission.

---

## 10. Availability and booking

### 10.1 Availability

`api.getAvailableSlots(reportId, dateOrDays)` → `client.rpc('get_available_slots', { p_report_id, p_days: 14 })`

Response rows: `{ slot_start: ISO-8601, slot_end: ISO-8601 }` only.

- The frontend maps `slot_start` to the UI `AppointmentSlot.id`; this is the booking key.
- `doctor_id` is `''` by design; the server derives doctor/department from the report.
- Horizon: next 14 days, Asia/Kolkata, weekdays, 09:00–17:00, 30-minute slots, lunch
  13:00–14:00 excluded, last start 16:30.
- A date string passed by the UI is filtered client-side after the 14-day read.
- `42501` → review hold; `22023` → not bookable (draft, urgent, emergency, horizon);
  `P0002` → not found/not owned; `28000` → not authenticated.

### 10.2 Booking

`api.bookAppointment({ report_id, slot_start })` → `client.rpc('book_appointment', { p_report_id, p_slot_start })`

- Send the exact `slot_start` string returned by availability, unchanged (`+05:30`).
- Never send a doctor id, department or patient id as authority.
- Response row: `{ appointment_id, reference_code, slot_start, slot_end, doctor_id, already_booked }`.
- `23505` → slot taken/already booked; refresh availability and let the patient choose.
- `42501` → held pending review; `22023` → emergency/urgent permanently ineligible;
  `P0002` → not owned.
- Same report + same slot is idempotent (`already_booked: true`); a different slot is a
  conflict.
- "Not now" creates no appointment; the submitted report stays visible to the doctor.

The UI passes both `slot_id` and `slot_start` with the same value (dual mock/real support).
Keep that compatibility; in real mode only `slot_start` is sent.

---

## 11. Voice functionality dependency map

### 11.1 Controls and call chain

| Control | Component | Handler | Backend interface | Behaviour |
|---|---|---|---|---|
| Welcome "Start Talking" / "Type Instead" | `WelcomeView` | `PatientShell.handleStartIntake` | `chat-turn start_session` | Both start the same intake; no greeting audio is played |
| Consent "replay greeting" | `ConsentView` | `simulatePlayAudio` | **none** | A 3-second local timer; it does not call TTS or play a file |
| Circular mic button | `ConversationView` | `handleStartListening` → `handleStopListening` → `onVoiceTranscribed` | indirectly `chat-turn submit_turn` | Starts a UI listening state/countdown; on Done/Cancel calls the parent |
| Listening Done button | `ConversationView` | `handleStopListening` | `chat-turn submit_turn` | Parent records and submits audio |
| "Type instead" / "Use voice" | `ConversationView` | local mode toggle | `chat-turn submit_turn` (text) | Bypasses STT entirely |
| Quick-reply chips | `ConversationView` | `handleChipClick` → `onSendText` | `chat-turn submit_turn` (text) | Yes/No, gender, severity, adaptive options, emergency clarification |
| Replay question | `ConversationView` | `onReplayAudio` → `PatientShell.handleReplayAudio` | `speak` | Audio only for an adaptive current question; scripted prompts return text and no audio |
| What-we-heard confirm | `WhatWeHeardView` | `handleConfirmTranscript` → `handleSendAnswer` | `chat-turn submit_turn` (text) | Accepts the edited transcript; counts the turn |
| What-we-heard cancel | `WhatWeHeardView` | local | none | Returns to conversation; the pending preview expires server-side or is cleared by resume |

### 11.2 Provider calls

| Provider | Called by | Trigger | Frontend may call directly? |
|---|---|---|---|
| Gnani Prisma (STT) | `chat-turn` `submit_turn` with audio | mic flow, after WAV encoding | **No** |
| Gnani Timbre (TTS) | `speak` | replay of an adaptive current question | **No** |
| Groq | `chat-turn` | routing/extraction/adaptive selection | **No** |

The browser makes **zero** provider calls. No provider key exists in the frontend or Vite
environment.

### 11.3 Interfaces that must remain unchanged when the mic UI moves

1. `api.chatTurn()` request fields: `action`, `session_id`, `question_id`, and exactly one of
   `text` / `audio_base64`; `audio_format` stays `audio/wav` for the current encoder.
2. The `transcript_preview` handshake: audio → preview (no turn) → edited `text` → accepted
   turn. Do not skip the preview.
3. `api.speak(sessionId, questionId)` and its `{ audioUrl?, text? }` result. Keep the direct
   authenticated fetch; do not route audio through `functions.invoke`.
4. `current_question.id`, `text`, `text_hi`, `options` and the current-question check. A
   redesigned control must still send the ID it was shown.
5. The 15-turn cap and the "no provider call at cap" rule.
6. The approved audio formats and the WAV encoder (`src/lib/audio/voice.ts`). Do not send
   `audio/webm` to the backend.
7. The consent gate: no health audio before an explicit on-screen Yes.
8. `public/audio/` cached prompts, if added later, are static assets and must never call
   `speak`.

### 11.4 Current voice quirks the redesign must not "fix" accidentally

- `ConversationView` builds a simulated transcript and passes it to `onVoiceTranscribed`,
  but `PatientShell.handleVoiceRecorded` **ignores the argument** and records real audio.
  A redesign that forwards the argument as text will bypass STT. Change both components
  together only with owner approval.
- `isListening` is a UI state; recording does not start when the mic is tapped. It starts
  after Done/Cancel via `captureVoiceAnswer()`, which captures ~1.2 s (not the 30 s shown).
  Repositioning the control must preserve the completion callback.
- Replay for scripted prompts does nothing audible today: `speak` correctly returns
  `{ text }`, and the UI only plays `audioUrl`. Do not wire a "play greeting" Figma control
  to `speak` expecting audio.
- There are **no cached audio files** (`public/audio/`) in the frontend worktree. The
  greeting/opening prompts are documented as cached assets but are not present. Adding them
  is an asset/owner task, not a styling change.
- Cancelling "What we heard" does not send an API call; the server-side pending transcript
  remains until it expires or `resume_session` clears it.

---

## 12. Doctor authentication

```
doctorLogin(email, password)
  → auth.signInWithPassword
  → from('doctor_profiles').select('doctor_id').eq('user_id', authUser.id).maybeSingle()
  → from('doctors') + from('departments')
  → DoctorProfile { id (uuid), name, department_key, department_name, title, initials, email, routine_slots_enabled }
```

- A signed-in Auth user without a `doctor_profiles` row is **not a doctor**: the client signs
  out and throws `403 not_a_doctor`. Do not reintroduce an email-based fallback.
- Invalid credentials → `401 invalid_credentials`.
- `token` is the Auth access token.
- `doctorLogout` calls `auth.signOut()`.
- Credentials are never displayed in the UI; the login card says they are shared privately.
- RLS, not the UI, decides which reports are visible.

---

## 13. Doctor reports, appointments and conversation history

| Data | Call | Notes |
|---|---|---|
| Reports list | `from('reports').select('*').order('created_at', { ascending: false })` | RLS scopes to the mapped doctor plus the documented Emergency read. Drafts never match |
| Report detail | `from('reports').select('*').eq('id', reportId).maybeSingle()` | Returns null on RLS denial |
| Appointments | `rpc('get_doctor_appointments')` | `SECURITY DEFINER`, scoped to the caller's `doctor_profiles.doctor_id`; returns derived names and no `user_id` |
| Stats | derived from reports + appointments | `urgent`, `new_reports`, `booked`, `not_booked` |
| Patient responses | `getDoctorMessages(reportId)` → RLS-scoped `reports` then `messages` | read-only; generic `not_found` for draft/foreign/missing; patient rows only |
| Mark reviewed | `rpc('mark_report_reviewed', { p_report_id })` | see §14 |

**ReportRow** includes `user_id` (the anonymous patient identity). It is needed by policy
internals, not by the UI; do not render it.

**Conversation history (updated on `feat/doctor-conversation-reader`):**
`src/lib/api.ts` now exposes `getDoctorMessages(reportId)`. It resolves the report's
`session_id` through the doctor's RLS-scoped report read, then selects the stored patient
answer rows from `messages` (existing `SELECT` grant + `messages_doctor_read`). Draft,
foreign and missing reports produce the same generic `not_found`; no schema, RPC, Edge
Function or write permission was added. The rows contain patient answers only — no assistant
question text — so the UI labels core questions accurately and shows adaptive questions by
their stable id (`GM-002`) rather than inventing question wording. Voice answers expose
`original_text` and `input_mode`, and the UI distinguishes the raw transcript from the
confirmed answer.

**Emergency reports:** General Medicine and Emergency doctors may read Emergency-department
reports (read-only cross-visibility). Only the Emergency doctor may mark an
`urgent_partial` report reviewed. Do not add a client-side `department` filter that would
hide this cross-visibility.

---

## 14. Mark Reviewed

```
rpc('mark_report_reviewed', { p_report_id })
→ [ { report_id, reviewed_at, reviewed_by, already_reviewed } ]
```

- Only `reviewed_at` and `reviewed_by` change. Status, flags, content, routing and reference
  are untouched.
- Idempotent: the first timestamp is preserved; `already_reviewed: true`.
- Authorisation is from `auth.uid()` + `doctor_profiles`; the client never sends a doctor id.
- `42501` → not authorised; `22023` → draft/non-reviewable; `P0002` → not found.
- The UI must re-read the report after success; no optimistic local update.
- Reviewing does **not** make an emergency/`urgent_partial` report bookable. It releases the
  workflow hold only for a normal submitted report with `possible_urgent` or
  `needs_human_review`.
- The button is the only doctor write. It is not a clinical clearance and has no free-text
  note.

---

## 15. Error and loading states

### 15.1 Error transport

| Class | Examples | Handling |
|---|---|---|
| Expected domain state (HTTP 200, envelope `error`) | `demo_busy`, `turn_cap_reached`, `provider_unavailable`, `transcript_empty`, `audio_in_progress`, `audio_superseded` | Render the approved state; do not throw or show a generic failure |
| Transport/contract error (non-2xx) | `invalid_request` 400, `unauthorized` 401, `not_found` 404, `invalid_state` 409, `invalid_question_state` 409, `internal` 500 | `ApiError` carries `code` and `status`; map the code, not the message |
| PostgREST RPC error | `23505`, `42501`, `22023`, `P0002`, `28000` | Map to `slot_taken`, `review_hold`, `not_bookable`, `not_found`, `unauthorized` |

`ApiError` is thrown only for non-2xx responses or an empty body. `functions.invoke` errors
are unwrapped to preserve the backend code; do not replace this with a generic message.

### 15.2 UI states that must survive the redesign

| Screen/action | Required states |
|---|---|
| Start intake | loading, `demo_busy`, auth/network failure with retry |
| Consent | idle, submitting Yes, submitting No |
| Conversation | processing, listening, text mode, mic error, demo busy, quick replies, emergency Yes/No chips |
| Voice | recording/encoding, preview loading, preview error → type instead, cancel |
| Review | draft loading, correcting a field, submit in progress, End-only at incomplete cap |
| Booking | slots loading, empty, slot-taken alert + refresh, review-hold message, booking in progress, Not now |
| Confirmation | appointment reference, report-only (Not now) |
| Doctor login | loading, invalid credentials, not-a-doctor |
| Doctor dashboard | loading, empty, error without false zeros |
| Report detail | marking in progress, error, reviewed state |
| Appointments | Today/Upcoming/Past derived from slot time; empty state |

Never show success before backend confirmation. Disable send while a request is in flight.
After an uncertain response, call `resume_session` rather than replaying blindly.

**Current UI gaps to avoid compounding**

- `PatientShell.handleStartIntake` does not branch on a `demo_busy` envelope from
  `startSession`; it can open the consent screen with an empty session id. A redesign should
  render the approved demo-busy state instead. This is a UI fix, not a contract change.
- `BookingView` collapses a slot-read failure into an empty list; it pre-checks the review
  hold from the report but does not render `not_found`/`not_bookable` distinctly.
- `DoctorShell.loadData` logs a load failure and leaves zeroed stats; an empty dashboard must
  not be presented as "no reports" when the read failed.
- `DoctorReportDetail`'s "Verbatim Intake Conversation" panel is a three-field summary; see
  §13.

---

## 16. Mock / demo mode

### 16.1 Two different meanings

| Term | Meaning |
|---|---|
| **Mock mode** (frontend) | `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` absent or invalid; `api.ts` uses an in-memory simulation with the same exports |
| **Demo guardrails** (backend) | daily IST caps, provider stubs/fallbacks, synthetic data, deterministic emergency rules; the app still uses real Supabase |

### 16.2 Mock-mode behaviour

- Selected automatically at module load: `isSupabaseConfigured ? 'supabase' : 'mock'`.
- No network calls. Sessions, messages, reports and appointments live in module-level maps.
- `startSession` creates a local session; `startAnonymousSession` generates local ids.
- Audio turns return a **simulated transcript** based on the question, not real STT.
- Emergency phrases are matched by local rules; slots are synthesised weekdays; booking is
  in-memory.
- `doctorLogin` matches a seeded email; no password is checked.
- `setAppMode('mock' | 'supabase')` overrides the mode for tests.
- `setMockDailyCapExceeded(true)` exercises the `demo_busy` UI state.
- Mock doctor ids (`doc-gen-med-01`, `doc-emg-03`, …) are **not** real database UUIDs. The
  real path resolves names from `doctors`/`departments` after booking.
- `npm run build:mock` intentionally builds with empty Supabase variables; do not ship that
  build as the evaluator build unless mock mode is the desired demo.

### 16.3 Risks for the reconstruction

- There is no visible "mock mode" indicator. If the Vercel variables are missing, the app
  silently becomes an offline demo with simulated voice and no persistence.
- Mock mode returns `answer_type` and options that the real backend may not send; do not
  build layout logic that depends on `answer_type`.
- Mock session/report ids are not UUIDs; never send them to a real backend.

---

## 17. `EDUCATIONAL DEMO` occurrences

The literal uppercase string `EDUCATIONAL DEMO` does not occur in frontend source. The
case-insensitive occurrences are:

| File:line | Text / key | Classification | Guidance |
|---|---|---|---|
| `src/App.tsx:25` | `Educational Demo` badge in the global header | Branding / status label | May be restyled or repositioned; keep it visible and non-clinical |
| `src/App.tsx:101` | Footer: "Samvad HealthDesk AI — Educational demo. Synthetic patients, fictional doctors and schedules only. Not for clinical diagnosis or treatment." | Disclaimer | Keep the substance and visibility; do not shorten into a clinical claim |
| `src/i18n/en.ts:4` | `demoBadge: 'Educational Demo'` | Branding label (i18n) | Used by `WelcomeView`; keep the key or update both locales together |
| `src/i18n/en.ts:24` | `disclaimer: 'Educational demonstration only. Not for medical diagnosis or clinical treatment.'` | Disclaimer (i18n) | Used by `WelcomeView`; keep the warning, translate if the Hindi copy is added |
| `README.md`, `docs/**` | Multiple explanatory uses | Documentation | Not UI; update only if the product positioning changes |

There are no configuration labels named `EDUCATIONAL DEMO`. No Hindi counterpart of the
badge/disclaimer exists in `src/i18n/hi.ts`; if the redesign adds one, it must be a real
Devanagari translation, not a transliteration.

---

## 18. What the Figma rebuild may and may not change

**Safe to change**

- Layout, spacing, colour, typography, radii, shadows, animation and responsive behaviour.
- Component decomposition and file names under `src/features/**`.
- Positioning, size and visual treatment of the mic, replay, chips, mode toggle and
  navigation.
- Copy other than the versioned consent text and the safety disclaimers.
- Adding presentational state that does not alter API calls or state transitions.

**Must not change without an approved contract change**

- The six `chat-turn` action names and their fields.
- `ChatTurnResponse` fields, `transcript_preview`, `turn_count`, `can_submit`,
  `is_cap_reached`, `demo_busy`.
- `speak` request/response and its direct-fetch transport.
- The four RPC names/arguments and SQLSTATE mappings.
- The report schema `ReportDocumentV1` / `ReportRow`, statuses and gender-declined rule.
- `CONSENT_VERSION` and the exact consent wording.
- The 15-turn cap, incomplete-cap End-only rule, emergency no-slot rule and review hold.
- `src/lib/api.ts` remaining the only Supabase entry point.
- Any provider (Groq/Prisma/Timbre) call from the browser.
- The doctor read-only cross-visibility and the rule that drafts are never doctor-visible.

**Known gaps (do not silently "fix" during styling)**

1. Cached opening audio assets are absent; scripted replay is silent.
2. ~~No doctor conversation-message reader exists; the panel is a structured summary.~~
   Resolved on `feat/doctor-conversation-reader`: `getDoctorMessages(reportId)` reads the
   stored patient rows through existing RLS; no schema or backend change.
3. `ConversationView` passes a simulated transcript that the parent ignores.
4. The UI listening countdown is not an active recording.
5. `CurrentQuestion.answer_type` is not sent by the backend.
6. Mock mode is not visibly indicated.
7. The backend `contract.ts` `QuestionId` union omits bank IDs (runtime accepts them).

---

## 19. Exact branch integration recommendations

**Do not merge anything in this task.** Recommended sequence for the owner after the
reconstruction is accepted:

| Step | Source | Target | Action |
|---|---|---|---|
| 1 | `feat/frontend-figma-parity` | `feat/frontend` | Fast-forward or merge the reconstruction branch after visual acceptance and passing tests |
| 2 | `feat/frontend` | `release/samvad-rc1` | Merge/cherry-pick `bccbd83` + `7a28175` + the accepted reconstruction; `release/samvad-rc1` is currently 2 commits behind |
| 3 | `docs/frontend-backend-contract-map.md` | `feat/frontend` / release docs | Keep this map with the reconstructed frontend; it is currently committed only on `feat/frontend-figma-parity` |
| 4 | `feat/backend` | release | Only if the owner intends a combined release. `release/samvad-rc1` has no `supabase/` tree; backend deploys separately through the Supabase CLI |
| 5 | any branch | `main` | Owner approval only; never by an agent |

**Branch hygiene**

- Do not treat `release/rc-1` (`c38111e`) or `feat/frontend-integration` (`f309c53`) as
  current; they are older refs.
- `release/samvad-rc1` @ `318ab7b` is the current release branch, but it is not an
  integration of the latest frontend or backend.
- Update any handoff doc that still says frontend = `ed86b73` or integration = `d85ec56`.
  Use `7a28175` and `318ab7b`; use `e5d77e5` for backend.

**Before merging the reconstruction, run**

```bash
# frontend worktree
npm run test:mock          # 31/31 at baseline
npm run build              # tsc + vite
# with the local stack running:
npm run test:api           # 51/51 at baseline

# backend worktree
deno test --allow-read --allow-env supabase/functions/     # 181/181
deno check supabase/functions/chat-turn/index.ts supabase/functions/speak/index.ts
deno run --allow-read --allow-write --allow-env scripts/export-contract-fixtures.ts --check
```

Do not run live provider tests in CI. Do not change the database, migrations, seed, question
bank or Edge Functions as part of a visual rebuild.

---

## 20. Verification evidence for this freeze

| Check | Result |
|---|---|
| Backend Deno tests | **181 passed / 0 failed** |
| Backend entry-point type check | **pass** (`chat-turn`, `speak`) |
| Contract fixtures | **17 valid** |
| Frontend mock/contract suites | **32 passed / 0 failed** |
| Frontend real-stack API suite | **55 passed / 0 failed** (local Supabase, real Auth, PostgREST, RPCs, Edge Function HTTP) |
| Frontend production build | **pass** (`tsc && vite build`) |
| Branch merges | **none** |
| Database/schema/question-bank changes | **none** |
| Deployments | **none** |

The real-stack suite covers authentication, consent, text and audio intake, transcript
preview, adaptive bank and `speak`, corrections, submission, slots, booking conflict and
idempotency, doctor login/mapping, report visibility, appointments, Mark Reviewed, emergency
escalation/clarification, `demo_busy`, Not now and authorization denials.

---

## 21. Contract change control

Any proposed change to §3–§14 requires, in one owner-approved change:

1. an update to the backend contract (`contract.ts`, `validation.ts`, `errors.ts`) and
   `docs/integration-contract.md`;
2. a matching update to `src/types/api.ts` / `report.ts` and `src/lib/api.ts`;
3. a migration only if the database shape actually changes;
4. passing backend tests, frontend mock tests and the real-stack API suite;
5. an updated revision of this document.

A visual-only change must not be the reason for any of the above.
