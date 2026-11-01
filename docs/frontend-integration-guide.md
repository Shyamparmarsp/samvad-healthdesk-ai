# Frontend Integration Guide (backend handoff)

**Audience:** the frontend owner (Antigravity) and the project owner.
**Source of truth for the wire contract:** `docs/integration-contract.md` and
`supabase/functions/_shared/contract.ts`.
**Source of truth for the frontend surface:** `src/lib/api.ts` (verified 2 November 2026
against backend HEAD).

Every browser call goes through `src/lib/api.ts`. No component may import the Supabase
client. The signatures below are the ones the app already uses; they are listed so the
backend and frontend cannot drift.

---

## 1. Environment

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_KEY=<local publishable key>
```

Never put a provider key or a secret/service key in a `VITE_` variable.

`src/lib/supabase.ts` exports one lazily created client (`getSupabaseClient()`), and
`setSupabaseClient()` exists for tests. `getAppMode()` returns `supabase` when both
variables are present, otherwise `mock`.

---

## 2. Authentication

| Identity | Call | Notes |
|---|---|---|
| Patient | `supabase.auth.signInAnonymously()` | Anonymous users carry the `authenticated` Postgres role; the backend never trusts the role, only `auth.uid()` |
| Doctor | `supabase.auth.signInWithPassword({ email, password })` | Must exist in `doctor_profiles`; otherwise `doctorLogin` signs the user out and fails |

A lost browser identity loses the session. There is no recovery by session id, name or
phone, and a foreign session always answers `404 not_found` (never `403`).

---

## 3. Exact API methods and signatures

All types are in `src/types/api.ts`, `src/types/report.ts`, `src/types/doctor.ts`.

### 3.1 Mode helpers (no network)

```ts
export type AppMode = 'mock' | 'supabase';
export function getAppMode(): AppMode;
export function setAppMode(mode: AppMode): void;
export function setMockDailyCapExceeded(exceeded: boolean): void; // mock only
```

### 3.2 Session and consent

```ts
export async function startAnonymousSession(
  language?: 'en' | 'hi',                       // default 'en'
): Promise<{ sessionId: string; userId: string }>;
// Real mode: signInAnonymously() + chat-turn start_session.
// Throws ApiError('demo_busy') instead of returning an empty session id.

export async function startSession(
  language?: 'en' | 'hi',                       // default 'en'
): Promise<ChatTurnResponse>;
// Reuses an existing Auth session, signs in anonymously only when there is none.

export async function resumeSession(sessionId: string): Promise<ChatTurnResponse>;
// Safe at any time. Repairs an interrupted accept, clears an expired transcript preview.
// Unknown or foreign session -> ApiError code 'not_found' (HTTP 404). It never starts a
// new session.

export async function recordConsent(
  sessionId: string,
  consent: boolean,
  language: 'en' | 'hi',
  consentVersion?: string,                      // default CONSENT_VERSION
): Promise<ChatTurnResponse>;
// Send the exact on-screen wording version from src/types/consent.ts.
// A mismatch is `invalid_request`; replaying on a non-`created` session is `invalid_state`.
```

### 3.3 Turns, corrections and submission

```ts
export async function chatTurn(action: SubmitTurnAction): Promise<ChatTurnResponse>;

interface SubmitTurnAction {
  action: 'submit_turn';
  session_id: string;
  question_id: QuestionId;      // core id OR adaptive bank id (GM-001 … CARD-030)
  text?: string;                // exactly one of text / audio_base64
  audio_base64?: string;
  audio_format?: string;        // audio/wav | audio/mpeg | audio/ogg | audio/flac |
                                // audio/aac | audio/mp4.  audio/webm is rejected.
}
```

`ChatTurnResponse` envelope: `session_id`, `session_status`, `current_question?`,
`messages`, `turn_count`, `max_turns` (always 15), `is_complete`, `is_cap_reached`,
`can_submit`, `draft_report?`, `submitted_report?`, `emergency_triggered?`, `demo_busy?`,
`transcript_preview?`, `error?` (a stable code, never prose).

```ts
export async function correctDraftReport(
  action: CorrectDraftReportAction,
): Promise<ChatTurnResponse>;

interface CorrectDraftReportAction {
  action: 'correct_draft_report';
  session_id: string;
  report_id: string;            // optional on the wire; omit it when unknown
  updates: Partial<Record<CorrectableField, {
    value: unknown;
    status: 'provided' | 'declined';
  }>>;
}
```

**`report_id` guidance.** A session owns exactly one report and no response exposes the
report row id, so a client that only knows `session_id` should send `report_id: undefined`.
`src/lib/api.ts` drops a non-uuid value for that reason. The backend resolves the report
from `session_id` + verified `auth.uid()` and only uses a supplied id to *narrow* the
lookup (a mismatch is `not_found`). Never invent an id.

```ts
export async function submitReport(action: SubmitReportAction): Promise<ChatTurnResponse>;

interface SubmitReportAction {
  action: 'submit_report';
  session_id: string;
  report_id: string;            // optional on the wire, same rule as above
}
```

Correction allowlist: `patient.name`, `patient.age`, `patient.gender`, `primary_concern`,
`clinical_details.{duration,severity,conditions,medications,allergies,other_symptoms}`.
`patient.gender: 'declined'` is allowed and is a handled answer. Declining any other
required field is `invalid_field_status`; touching routing/flags/status/summary/reference
is `field_not_editable`.

### 3.4 Speech

```ts
export async function speak(
  sessionId: string,
  questionId: string,
): Promise<{ audioUrl?: string; text?: string }>;
```

- Succeeds with **audio bytes** (`audio/mpeg`, …). `api.ts` fetches it directly and returns
  an object URL, because `functions.invoke` only decodes `application/octet-stream` and
  `application/pdf` as a Blob and corrupts `audio/mpeg` into text.
- On a cap or provider failure the backend answers `{ "text": "..." }` — show it, never
  claim audio.
- Only the session's **current** question may be requested. Cached scripted prompts are
  served from `public/audio/` and must never call `speak`. Adaptive bank ids are supported.

### 3.5 Booking

```ts
export async function getAvailableSlots(
  reportId: string,
  dateOrDays?: string | number,     // optional YYYY-MM-DD filter, or a horizon (max 14)
): Promise<AppointmentSlot[]>;

interface AppointmentSlot {
  id: string;            // the slot_start timestamp — pass it back unchanged
  doctor_id: string;     // '' (the RPC returns slot times only; the server owns routing)
  start_time: string;    // ISO-8601 timestamp
  end_time: string;
  date: string;          // YYYY-MM-DD
  time_display: string;
  is_available: boolean;
}

export async function bookAppointment(
  req: BookAppointmentRequest,
): Promise<BookAppointmentResponse>;

interface BookAppointmentRequest {
  report_id: string;
  slot_id?: string;        // must be the slot_start timestamp
  slot_start?: string;     // preferred; sent as p_slot_start
  doctor_id?: string;      // presentation only, never authority
  patient_name?: string;   // display only
}

interface BookAppointmentResponse {
  appointment: Appointment;
  reference_code: string;  // APT-YYYYMMDD-XXXXXX, generated server-side
  already_booked?: boolean;// true when the same report+slot was already confirmed
}
```

Doctor, department, ownership and eligibility are derived server-side from the report.
Never send a doctor or department id as authority. PostgREST serialises timestamps in UTC,
so pass back exactly what `get_available_slots` returned.

### 3.6 Doctor reads and Mark Reviewed

```ts
export async function doctorLogin(
  email: string,
  password?: string,
): Promise<DoctorLoginResponse>;   // { doctor: DoctorProfile; token: string }
// Throws ApiError('invalid_credentials') on a bad password and
// ApiError('not_a_doctor') after signing out when doctor_profiles has no row.

export async function doctorLogout(): Promise<void>;

export async function getDoctorReports(doctorId?: string): Promise<ReportRow[]>;
// RLS-scoped: assigned submitted/urgent_partial reports (+ Emergency cross-visibility for
// the General Medicine and Emergency demo doctors). Drafts never appear.

export async function getDoctorReportDetail(reportId: string): Promise<ReportRow | null>;

export async function getDoctorAppointments(doctorId?: string): Promise<Appointment[]>;
// Doctor-scoped read of confirmed appointments, enriched with doctor_name,
// department_name and patient_name. Throws on a denied read instead of returning [].

export async function getDoctorDashboardStats(
  doctorId?: string,
): Promise<DoctorDashboardStats>;  // { urgent, new_reports, booked, not_booked }

export async function markReportReviewed(
  reportId: string,
): Promise<MarkReportReviewedResponse>;
// { success, report_id, reviewed_at, reviewed_by, already_reviewed }
// The only doctor write. It never changes status, flags, content or routing, so an
// urgent_partial report stays permanently unbookable. Re-read the report afterwards; do
// not update local state optimistically.
```

### 3.7 Errors

```ts
export class ApiError extends Error {
  readonly code?: string;    // the backend's stable code
  readonly status?: number;  // HTTP status
}
```

Domain states that arrive with **HTTP 200** are *not* thrown — read them from the response
envelope: `demo_busy`, `turn_cap_reached`, `provider_unavailable`, `transcript_empty`,
`audio_in_progress`, `audio_superseded`. Everything else throws `ApiError` and the UI maps
`error.code` to copy.

| Code | Meaning | Recovery |
|---|---|---|
| `demo_busy` | daily session cap reached | show the approved demo-busy state, do not create a session |
| `turn_cap_reached` | 15 accepted answers | show the incomplete End-only preview when `can_submit` is false |
| `invalid_request` | malformed body, bad consent version, bad audio format/size | fix, do not blind-retry |
| `invalid_state` | action not allowed now (e.g. correcting a submitted report) | `resume_session` |
| `invalid_question_state` | answer for a question that is no longer current | `resume_session` |
| `not_found` | session/report not owned | do not retry, do not reveal why |
| `field_not_editable` / `invalid_field_status` | correction touched a protected field or declined a required one | client bug |
| `slot_taken` (`23505`) | slot taken or report already booked another slot | refresh availability |
| `review_hold` (`42501`) | booking held until a doctor reviews | show the approved hold copy |
| `not_bookable` (`22023`) | draft, urgent_partial or emergency department | no slots UI; emergency shows 112 guidance only |
| `forbidden` (`42501`) | not authorised to review this report | generic failure |
| `invalid_credentials` / `not_a_doctor` | doctor sign-in failure | show the login error, never a doctor portal |
| `internal` | unexpected server failure | retry state |

Because the platform adds no `Access-Control-Allow-Origin` to its own 401 (see
`docs/cors-verification.md`), a browser cannot read the body of a token failure. Treat
"non-2xx with no body" as an auth failure and re-authenticate.

---

## 4. Behaviour you can rely on

| Area | Contract |
|---|---|
| Response envelope | `ChatTurnResponse` (§3.3) |
| Turn limit | 15 accepted answers, counted server-side. The 15th is saved; if complete, review and submit continue; if incomplete, `can_submit: false` and the only action is End |
| Audio | an audio turn returns `transcript_preview` and does **not** increment `turn_count`; confirm by resending the same `submit_turn` with `text` |
| Adaptive questions | `current_question.id` may be a core id or a bank id (`GM-001` … `CARD-030`); at most 3 per session |
| Resume | repairs an interrupted accept and clears an expired preview; never calls a provider |
| Emergency | `emergency_triggered` + `session_status: "emergency"`; `urgent_partial` is never bookable, even after Mark Reviewed |
| Clarification | `current_question.id === "emergency_clarification"` with `["Yes","No"]`; "No" negates only that candidate (OD-09: it never clears `needs_human_review`) |
| Consent | explicit on-screen Yes/No only; never inferred from speech; stored with the versioned copy |

## 5. Common failures

| Symptom | Cause |
|---|---|
| 401 on every call | missing/expired JWT, or anonymous sign-in disabled |
| 404 on resume | session belongs to another identity |
| 400 on `record_consent` | consent version is not `2026-11-01.v1` |
| 400 on `submit_turn` | both text and audio sent, or `audio/webm` used |
| 409 `invalid_question_state` | answering a stale question; call `resume_session` |
| Empty doctor list | doctor not mapped in `doctor_profiles`, or the report is a draft |
| Empty appointments list | the report was never booked (the read itself now works) |
| `demo_busy` | daily session cap reached for the Asia/Kolkata day |

## 6. Mock vs real

`getAppMode()` selects the mode. Real mode must call Supabase only through
`src/lib/api.ts`. The mock keeps the same signatures and is used for offline UI work;
it is not evidence of backend behaviour. The real-stack evidence lives in the frontend
worktree at `tests/api/**`.

## 7. Local verification

```bash
npx supabase start
npx supabase functions serve --env-file supabase/functions/.env
deno run --allow-net supabase/tests/stub-providers.ts 8787
deno run --allow-net --allow-env --allow-read --allow-run scripts/demo-preflight.ts
deno run --allow-net --allow-env --allow-read --allow-write --allow-run scripts/demo-smoke.ts
```

`demo-preflight` now also compares the committed migration files with
`supabase_migrations.schema_migrations` (read-only) and probes the real CORS preflight for
both functions. `demo-smoke` isolates identities per run, deletes only the anonymous
identities it created, writes `demo-smoke-result.json` and exits non-zero on any failure.
