# OpenCode ↔ Antigravity integration contract

**Branch:** `fix/opencode-audit-frontend` (base `3df09cd`)
**Audit:** `audit/final-ui-logic-figma-review` @ `ab4ba5b`
**Purpose:** hand-over of the OpenCode-owned behaviour corrections so the Antigravity
visual work can be layered on without re-implementing, or silently reverting, the
data, safety and authentication logic.

Only OpenCode-owned files are touched in this branch. Nothing is merged, pushed or
deployed. Antigravity's worktree (`../samvad-frontend`) is untouched.

---

## 1. Surface ownership

| Area | Owner | Notes |
|---|---|---|
| Report data interpretation (warning flags, information statuses, missing information, source chip, reviewer label) | **OpenCode** | `src/lib/report-presentation.ts`, `src/features/doctor/WarningFlags.tsx` |
| Appointment date/time formatting and slot↔timestamp contract | **OpenCode** | `src/lib/booking-time.ts`, `src/lib/api.ts` |
| Patient state machine, terminal screens, Back semantics | **OpenCode** | `src/lib/navigation.ts`, `src/features/patient/PatientShell.tsx` |
| Consent/`demo_busy`/session-restore/error states | **OpenCode** | `PatientShell.tsx`, `WelcomeView.tsx`, `ConsentView.tsx` |
| Audio prompt resolution + replay caching | **OpenCode** (interface), **Owner** (assets) | `src/lib/audio/prompt-audio.ts`, `public/audio/README.md` |
| Production/mock authentication boundary | **OpenCode** | `DoctorShell.tsx`, `DoctorLogin.tsx` (unchanged contract) |
| Layout, spacing, colour, radii, typography, icon artwork, Figma screen rebuilds | **Antigravity** | see §9 |

Rule: Antigravity may restyle any element listed above, but must not replace the
*logic*, the *data source*, or the *state transitions* that feed it.

---

## 2. Protected API contracts (must not change)

`src/lib/api.ts` is the only module allowed to touch Supabase. These signatures and
wire shapes are frozen for this release:

```ts
startSession(language): Promise<ChatTurnResponse>          // may resolve with demo_busy
resumeSession(sessionId): Promise<ChatTurnResponse>
recordConsent(sessionId, consent, language, version): Promise<ChatTurnResponse>
chatTurn({ action:'submit_turn', session_id, question_id, text?, audio_base64?, audio_format? })
correctDraftReport({ action:'correct_draft_report', session_id, report_id?, updates })
submitReport({ action:'submit_report', session_id, report_id? })
speak(sessionId, questionId): Promise<{ audioUrl?: string; text?: string }>
getAvailableSlots(reportId, dateKey?): Promise<AppointmentSlot[]>
bookAppointment({ report_id, slot_id?, slot_start, doctor_id?, patient_name? }): Promise<{ appointment, reference_code }>
markReportReviewed(reportId)
getDoctorReports / getDoctorReportDetail / getDoctorMessages / getDoctorAppointments / getDoctorDashboardStats
getDoctorDisplayName(doctorId): Promise<string | null>      // new, additive
```

- `ChatTurnResponse.demo_busy` and `ChatTurnResponse.error === 'demo_busy'` are
  documented domain states returned with HTTP 200 and **must be handled**, never
  swallowed.
- `BookAppointmentRequest.slot_start` is an **ISO timestamp**, never a slot id.
  `slot_id` is a separate, optional field used only for mock duplicate detection.
- `BookAppointmentRequest` rejects an unparseable `slot_start` with
  `ApiError(code='invalid_slot', status=400)`.
- A second booking for the same report rejects with
  `ApiError(code='already_booked', status=409)` in mock mode; the database RPC
  (`23505`) remains the authority in Supabase mode.
- New error code surfaced to UI: `already_booked` (booking screen shows
  “already has a confirmed appointment”, not “slot taken”).

---

## 3. Emergency-state behaviour (D-02) — must be preserved

- `emergency` is a **terminal** screen. There is no Back control, and
  `resolveBackNavigation()` returns `blocked` for it even if history exists.
- `EmergencyView` no longer accepts an `onBack` prop. Do **not** re-add a Back
  affordance that leaves the screen; if Figma requires the arrow, render it disabled
  and document the deviation.
- The 112 number stays plain selectable text (no `tel:` link) and the Hindi body copy
  comes from `t.emergency.guidance`.
- An emergency session never accepts another answer (`handleSendAnswer` and
  `handleVoiceRecorded` short-circuit to the emergency screen) and never reaches
  booking.

Antigravity may restyle the card, the typography and the 112 block. It must not
remove `t.emergency.guidance`, the notice line, or the terminal behaviour.

---

## 4. Booking data contract (D-03, D-21)

- `BookingView` calls `onBookAppointment(slot.id, slot.start_time)`.
- `PatientShell` forwards both to `bookAppointment`; the confirmation reads
  `appointment.slot_start` from the server response.
- All display formatting goes through `src/lib/booking-time.ts`
  (`formatIstTime`, `formatIstDate`, `formatIstDateTime`, `formatAppointmentWhen`).
  These use an explicit `timeZone: 'Asia/Kolkata'`; never reintroduce
  `getHours()`/`toISOString()` for display.
- `formatAppointmentWhen()` returns `{ text, valid }`; when the stored value is not a
  real instant the UI shows “Date and time unavailable”, never “Invalid Date”.
- Terminal confirmations (`confirmed_booking`, `confirmed_report_only`) have no Back
  control, and Back from `booking` is blocked when an appointment already exists.
- Returning from booking to `review` renders the **read-only submitted summary**
  (`ReportReviewView mode="submitted"`), not the draft editor.

---

## 5. `demo_busy` behaviour (D-04)

- `start_session` may resolve with `{ demo_busy: true, session_id: '' }`.
  `PatientShell` stays on Welcome, shows `t.welcome.demoBusyTitle/message` plus a retry
  control, and does not navigate to Consent.
- Consent buttons are disabled when there is no session id or while a request is in
  flight, and the screen states `t.consent.sessionUnavailable` instead of doing
  nothing.
- Double-clicking Start does not create two sessions (`isProcessing` guard).
- Antigravity may move/restyle the busy notice; it must keep the retry action and the
  “no navigation to Consent” rule.

---

## 6. Warning-flag source of truth (P0 D-01)

- Flags are read **only** from the report row: `possible_urgent`,
  `needs_human_review`, `emergency_rule_id`.
- `describeWarningFlags(row)` returns `state: 'available' | 'malformed' | 'unavailable'`
  plus the readable flags.
- `WarningFlags` renders:
  - flags when present;
  - “None” **only** when all three fields are present and false/null;
  - “Warning flags unavailable …” when the row or the warning data is missing;
  - “Some warning data could not be interpreted” when a value is malformed.
- Never hardcode `None`, a doctor name, a rule id or fixture text in the component.
- Antigravity may restyle the chips/heading; the three states and their copy must
  survive.

---

## 7. Consent audio interface and caching (D-06)

- Fixed prompts (greeting, name, age, gender, primary concern) **must** resolve from
  `public/audio/{en,hi}/{greeting,ask-name,ask-age,ask-gender,ask-primary-concern}.mp3`
  via `cachedPromptUrl()`. They must **never** call `speak`.
- Adaptive questions call `speak` **at most once per (language, question)** per page
  session; `createPromptAudioCache()` owns that cache. Replay reuses the object URL.
- Missing assets produce an honest message (`t.chat.audioUnavailable`) and no paid
  fallback. Assets are an **owner action** (see `public/audio/README.md`), not an
  Antigravity task.
- Antigravity keeps the replay control on Consent and the conversation; it must call
  the provided handlers (`playGreeting`, `onReplayAudio`) rather than implementing
  playback.

---

## 8. Production versus mock authentication (D-08)

- The doctor portal starts **logged out** in every build. There is no fixture router,
  no `FIGMA_*` sessionStorage key, no synthetic report row and no credential-free
  auto-open path in any shipped component.
- `tests/remediation.test.ts` fails CI if a `FIGMA_PATIENT_VIEW`,
  `FIGMA_DOCTOR_VIEW` or `FIGMA_PARITY*` reference reappears under `src/`.
- Parity fixtures now belong in a test harness (Playwright/CDP script or
  `tests/`), never in `src/`.
- **Action for Antigravity:** the parity capture scripts that set
  `sessionStorage.FIGMA_*` no longer have a consumer. Move those screens to a
  test-only harness or drive them with real mock-mode data. Do not reintroduce the
  keys to make a screenshot easier.
- RLS/JWT authority is unchanged: doctor reads are RLS-scoped, writes go through
  `chat-turn` and the two `SECURITY DEFINER` RPCs.

---

## 9. UI states Antigravity must render (logic already implemented)

| Screen | State to style | Provided by |
|---|---|---|
| Welcome | `demoBusy` notice + retry; disabled start while starting | `WelcomeView` props `demoBusy`, `isStarting` |
| Consent | disabled buttons + `disabledMessage`; audio status `idle/playing/unavailable/blocked` | `ConsentView` props |
| Conversation | mic-denied panel (text field + Try microphone again); dead-end panel with End session | `ConversationView` props `onEndSession` |
| Review | read-only submitted mode (`mode="submitted"`); in-flight disabled submit | `ReportReviewView` props |
| Booking | load-error state with Retry; “More dates”; “Try another date” moves to the next date with free slots; time in the CTA | `BookingView` |
| Confirmation | “Date and time unavailable” fallback | `formatAppointmentWhen` |
| Doctor detail | warning flags (3 states), missing information from the report, real source chip/reviewer/gender | `WarningFlags`, `report-presentation.ts` |
| Doctor urgent detail | same warning flags; fail-closed review authority | `DoctorUrgentDetail` |
| Doctor shell | load-error banner with Retry; preserved reports tab/search | `DoctorShell` |

Still Antigravity-owned visual gaps (unchanged by OpenCode):
D-09 (processing screen), D-16 (booking layout), D-26 (remaining hardcoded English on
patient screens), D-27 (password reveal), D-30 (owner decision), D-31 (review row
layout), D-34 (owner decision), D-43/D-44 (avatars), D-45 (brand plus), D-47 (reports
list), D-48 (no-slots/slot-taken screens), D-49 (confirmation layout), D-50 (severity
chip selection).

---

## 10. Regression tests Antigravity must preserve

Additive; do not delete or weaken:

- `tests/remediation.test.ts` — warning flags (4 data states), terminal navigation,
  booking datetime/timezone/duplicate, `demo_busy`, prompt-audio caching, fixture
  isolation, information statuses, missing information, source chip, reviewer label,
  appointment headers.
- `tests/back-navigation.test.ts` — updated so `EmergencyView` is asserted **terminal**
  (no Back control, 112 present). Keep that assertion.
- `tests/patient-flow.test.ts`, `tests/doctor-flow.test.ts` — booking calls now pass
  `slot_start`; keep the ISO timestamp in the request.
- `tests/verify-interactions.mjs` — clears storage before a fresh mock flow and no
  longer depends on the removed hidden labels ("Clinical Desk", "Clinical Intake
  Summary"); waits on visible text instead.

Commands: `npx tsc --noEmit`, `npm run test:mock`, `npm run test:supabase`,
`npm run test:e2e`, `npm run test:visual`, `npm run build`.

---

## 11. Files changed in this branch and expected merge conflicts

| File | Change | Conflict risk with Antigravity |
|---|---|---|
| `src/lib/report-presentation.ts` | **new** | none |
| `src/lib/booking-time.ts` | **new** | none |
| `src/lib/navigation.ts` | **new** | low |
| `src/lib/audio/prompt-audio.ts` | **new** | none |
| `src/features/doctor/WarningFlags.tsx` | **new** | low |
| `src/features/patient/PatientShell.tsx` | rewritten state/navigation/booking/audio | **high** (Antigravity also edits shell) |
| `src/features/patient/ConversationView.tsx` | mic-denied state, dead-end panel, fixture removal | **high** (visual work) |
| `src/features/patient/BookingView.tsx` | IST dates, load error, more dates, try another date | **high** |
| `src/features/patient/ReportReviewView.tsx` | other-symptoms row, statuses, read-only mode | **high** |
| `src/features/patient/ConsentView.tsx` | real cached audio, disabled states | medium |
| `src/features/patient/WelcomeView.tsx` | demo-busy notice | medium |
| `src/features/patient/EmergencyView.tsx` | terminal (no Back), i18n guidance | medium |
| `src/features/patient/WhatWeHeardView.tsx` | replay wiring, in-flight disable | medium |
| `src/features/patient/ConfirmationView.tsx` | IST formatting + guard | low |
| `src/features/doctor/DoctorReportDetail.tsx` | warning flags, real report fields | **high** |
| `src/features/doctor/DoctorUrgentDetail.tsx` | warning flags, real report fields, fail-closed | **high** |
| `src/features/doctor/DoctorShell.tsx` | auth boundary, load/error, preserved filters | **high** |
| `src/features/doctor/DoctorReportsList.tsx` | controlled tab/search, IST time, gender label | medium |
| `src/features/doctor/DoctorAppointmentsView.tsx` | headers/cells, default tab, IST | medium |
| `src/features/doctor/DoctorDashboardView.tsx` | fixture removal | medium |
| `src/App.tsx` | hidden links out of tab order | low |
| `src/i18n/{en,hi}.ts` | additive keys | medium (copy) |
| `src/i18n/index.tsx` | language persistence | low |
| `src/lib/api.ts` | booking/slot contract, display-name helper | medium |
| `tests/*`, `package.json` | new/updated tests | medium |
| `public/audio/README.md` | owner action | none |

**Merge order:** rebase OpenCode's branch onto the latest frontend HEAD, then
re-apply Antigravity's visual changes on top, resolving the patient/doctor screen
files by keeping OpenCode's handlers/props and Antigravity's markup. Do not re-implement
the logic in Antigravity's copy.
