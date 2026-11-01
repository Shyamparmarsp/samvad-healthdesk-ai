# API integration audit and real-stack test suite (M4-S16-B)

Two things live here:

1. The audit of all 20 exported functions in `src/lib/api.ts` against the backend contract
   (`supabase/functions/_shared/contract.ts`, `validation.ts`, `errors.ts`, and
   `docs/integration-contract.md`).
2. The independent test suite that exercises those functions against the **real local
   Supabase stack** — no backend mock.

---

## 1. How to run

```bash
# 1. local stack (from the backend worktree)
npx supabase@latest start

# 2. real Edge Functions with the provider stub endpoints
npx supabase@latest functions serve --env-file supabase/functions/.env

# 3. local provider stub — the only stub in this suite
deno run --allow-net supabase/tests/stub-providers.ts 8787

# 4. the suite (from this worktree)
npm run test:api
```

The harness resolves `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` and `LOCAL_SERVICE_KEY`
from `npx supabase status -o env`, trying the current directory and then a sibling
`samvad-backend` worktree. Override with `SUPABASE_DIR`, or export the three variables
yourself.

Doctor identities are the documented local ones (`doctor-gm@rls.test`,
`doctor-em@rls.test`, password `local-test-password`, mapped in `doctor_profiles`).
Override with `API_TEST_GM_EMAIL`, `API_TEST_EM_EMAIL`, `API_TEST_DOCTOR_PASSWORD`.

Safety rails:

- the base URL must resolve to `127.0.0.1` or `localhost`, otherwise the suite refuses to run;
- cleanup deletes only the anonymous identities the process created (a `cascade` on
  `auth.users` removes their own sessions, messages, reports and appointments);
- the only database mutation outside test data is raising the local `sessions` daily
  limit when it is already exhausted, restored in `after()`. That is what makes
  `demo_busy` testable without resetting live counters.

| Script | What it covers |
|---|---|
| `npm run test:api:journey` | auth → consent → intake → draft → correction → submit → slots → booking → doctor review |
| `npm run test:api:safety` | consent denial, emergency escalation, clarification Yes/No/unresolved, audio preview, adaptive bank + `speak`, `demo_busy`, Not now |
| `npm run test:api:contract` | raw HTTP contract violations, JWT requirements, RLS, review authority, OD-03 |
| `npm run test:mock` | existing offline mock suites (unchanged) |
| `npm run test` | everything above |

`tests/local-supabase-journey.test.ts` (from M4-S8) is a **simulated** in-memory backend.
It is kept intact as a contract regression, but it proves nothing about the real stack;
`tests/api/**` is the authoritative integration evidence.

---

## 2. Audit of the 20 exported functions

Legend: **Real** = the Supabase-mode path, **Mock** = the in-memory demo path.
"Fixed" means the behaviour was changed in this milestone.

| # | Function | Backend operation | Real Supabase implementation | Mock implementation | Auth and ownership | Error handling | Covered by | Defect / missing behaviour |
|---|---|---|---|---|---|---|---|---|
| 1 | `getAppMode` | none (local state) | selects `supabase` when `VITE_SUPABASE_URL`/`KEY` are set | same | n/a | n/a | indirect | — |
| 2 | `setAppMode` | none | test/UI override only | same | n/a | n/a | all suites | — |
| 3 | `setMockDailyCapExceeded` | none | mock-only switch emulating the global cap | used by `startSession` | n/a | n/a | `patient-flow` | correctly not reachable in real mode |
| 4 | `startAnonymousSession` | `chat-turn` `start_session` | `auth.signInAnonymously()` then invoke | generates a local session id | anonymous Supabase user; server derives `user_id` from claims | **Fixed**: throws `ApiError('demo_busy')` instead of returning an empty session id | `patient-journey` | it also created a *second* session when a caller used it before `startSession`; the UI only calls `startSession`, so it is kept as a pure auth+create helper |
| 5 | `startSession` | `chat-turn` `start_session` | reuses the current session, signs in anonymously if absent, invokes | creates local state, honours `demo_busy` | anonymous user; one session row per call | **Fixed**: domain states return the envelope (`demo_busy`), transport failures throw `ApiError` with the backend code | `patient-journey`, `safety` (`demo_busy`) | — |
| 6 | `resumeSession` | `chat-turn` `resume_session` | invoke, server repairs an interrupted accept | rebuilds the current question locally | 404 for a foreign session | **Fixed**: mock no longer silently starts a *new* session on an unknown id; real 404 becomes `ApiError('not_found')` | `patient-journey`, `safety`, `contract` | — |
| 7 | `recordConsent` | `chat-turn` `record_consent` | invoke with `CONSENT_VERSION` | local state machine | session must be `created` | `invalid_request` on a version mismatch, `invalid_state` on replay | `patient-journey`, `safety` | — |
| 8 | `chatTurn` | `chat-turn` `submit_turn` | invoke with exactly one of text / audio | simulated transcript + local state machine | session must belong to the JWT; `409 invalid_question_state` for a stale question | **Fixed**: 4xx/5xx now surface `ApiError.code` instead of "non-2xx status code" | all three API suites | — |
| 9 | `correctDraftReport` | `chat-turn` `correct_draft_report` | invoke with the allowlisted `updates` | local allowlist mirror | draft only, owner only | `invalid_field_status`, `field_not_editable`, `invalid_state` | `patient-journey` | **Fixed**: the real UI can only know `session_id`, so a non-uuid `report_id` is dropped and the backend resolves the session's single report; mock no longer reports `is_complete: true` unconditionally |
| 10 | `submitReport` | `chat-turn` `submit_report` | invoke | local state machine | server revalidates consent + completion + ownership | `invalid_state` | `patient-journey`, `safety` | **Fixed**: same optional-`report_id` normalisation as #9 |
| 11 | `speak` | `speak` | **direct authenticated `fetch`**, returns an object URL from the audio bytes or the `{ text }` fallback | returns no audio (UI falls back to text) | JWT + session ownership + current question only | 409/404/400 collapse to "no audio", never a false success | `safety` | **Fixed (two defects)**: `functions.invoke` decodes only `application/octet-stream`/`application/pdf` as Blob, so `audio/mpeg` was mangled into text and adaptive audio never played; and the backend rejected every adaptive **bank** id (see backend note below) |
| 12 | `getAvailableSlots` | RPC `get_available_slots(p_report_id, p_days)` | real RPC, 14-day horizon | synthesised weekday slots | `SECURITY DEFINER`, ownership + eligibility proven inside | **Fixed**: SQLSTATE → `ApiError.code` (`review_hold`, `not_bookable`, `not_found`, `unauthorized`) instead of prose only | `patient-journey`, `safety` | `doctor_id` is `''` because the RPC returns only slot times by design; `slot.id` is the `slot_start` the booking RPC requires |
| 13 | `bookAppointment` | RPC `book_appointment(p_report_id, p_slot_start)` | real RPC, sends `slot_start` (never a doctor id) | in-memory booking | ownership + review hold + emergency exclusion inside the RPC | **Fixed**: `slot_taken` on `23505`, `review_hold` on `42501`, `not_bookable` on `22023`, `not_found` on `P0002` | `patient-journey` | **Fixed**: doctor/department display names were looked up in `FICTIONAL_DOCTORS` by a *demo* id, so every confirmation named Dr. Aditi Rao; they are now resolved from `doctors`/`departments` by the returned uuid |
| 14 | `markReportReviewed` | RPC `mark_report_reviewed(p_report_id)` | real RPC, re-read after success | local flag | mapped doctor who may read the report; Emergency cross-visibility is read-only (OD-03) | `forbidden` / `invalid_state` / `not_found` | `patient-journey`, `contract` | — |
| 15 | `doctorLogin` | `auth.signInWithPassword` + `doctor_profiles` + `doctors` | real Auth, real profile read | seeded fictional doctor | **Fixed**: an Auth user without a `doctor_profiles` row is rejected and signed out | **Fixed**: `invalid_credentials` (401) / `not_a_doctor` (403) instead of a generic Error | `patient-journey`, `contract` | **Fixed security defect**: a seeded-email fallback returned a full doctor profile for any authenticated account using a demo address, bypassing the mapping entirely |
| 16 | `doctorLogout` | `auth.signOut` | real | no-op | n/a | n/a | `patient-journey` | — |
| 17 | `getDoctorReports` | PostgREST `reports` | real, RLS-scoped | local filter with the Emergency cross-visibility | caller-scoped RLS (`reports_doctor_read`); drafts never match | **Fixed**: throws `ApiError` with the PostgREST code instead of a bare Error | `patient-journey`, `contract` | — |
| 18 | `getDoctorReportDetail` | PostgREST `reports` | real, `maybeSingle` | local map | same policy | same | `patient-journey`, `safety`, `contract` | — |
| 19 | `getDoctorAppointments` | PostgREST `appointments` | real read (new policy) + enrichment from `doctors`/`departments`/`reports` | local filter | caller-scoped: a doctor reads only appointments matching their own `doctor_profiles` row | **Fixed**: throws instead of returning `[]`, which previously made a denied read look like "nothing booked" | `patient-journey`, `contract` | **Fixed (blocking)**: `appointments` had no browser `SELECT` grant or policy, so the real dashboard could never show a booking, "Booked" was always 0 and the Today/Upcoming/Past tabs were always empty. Migration `20261102160000_doctor_appointment_reads.sql` adds a read-only, doctor-scoped policy + grant. Rows were also missing `doctor_name`, `department_name` and `patient_name`; they are now enriched from the reference tables and the visible report. |
| 20 | `getDoctorDashboardStats` | derived from #17 + #19 | client-side count over the doctor's visible rows | same | inherits both reads | inherits | `patient-journey` | definition follows `docs/report-design.md` §15; it now inherits the corrected appointment read instead of silently counting everything as "Not booked" |

### Cross-cutting contract checks confirmed

- Six `chat-turn` actions, exact action names and field names; unknown actions and unknown
  top-level keys are `400 invalid_request`.
- `transcript_preview` is the single audio-confirmation field; `turn_count` does not move
  until the patient confirms with `text`.
- Domain error codes are surfaced to the UI (`ApiError.code`), never SQL or provider text.
- Anonymous identity is the only patient identity; a lost browser identity loses the
  session, and a foreign session returns `404 not_found` (never `403`).

---

## 3. Backend changes this milestone depended on

These are in the backend worktree (`feat/backend`) and are documented in
`docs/integration-contract.md`:

1. `report_id` is optional on `correct_draft_report` / `submit_report`. A session owns
   exactly one report, and no response ever exposes the report row id to the browser, so
   the client could not have supplied it. Ownership is still proven from `session_id` +
   verified `auth.uid()`.
2. `speak` accepts adaptive bank question ids (`GM-001` … `CARD-030`). They are the only
   questions that need Timbre, and it previously returned `400` for every one of them.
3. `20261102160000_doctor_appointment_reads.sql` adds the read-only doctor-scoped
   appointment policy and grant.

## 4. Outstanding frontend (Antigravity-owned) dependency

`src/features/patient/PatientShell.tsx` sends `report_id: 'draft'` for corrections and
submission. The API layer now normalises that and the backend accepts the omission, so
the flow works, but the value is a placeholder rather than a real id. When Antigravity
touches that file, drop the `report_id` field entirely (both actions accept its absence).
No other frontend file needs changing for these fixes.
