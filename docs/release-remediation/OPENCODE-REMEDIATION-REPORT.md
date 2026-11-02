# OpenCode remediation report — P0/P1 audit defects

**Remediation branch:** `fix/opencode-audit-frontend`
**Base:** `3df09cd` (`feat/frontend-figma-parity`, latest reported frontend HEAD)
**Remediation commit:** `d7a3248`
**Audit:** `audit/final-ui-logic-figma-review` @ `ab4ba5b` (base `6637841`, delta verified at `3df09cd`)
**Backend baseline:** `feat/backend` @ `e5d77e5` — **no backend change required** (see §6)
**Date:** 2 November 2026
**Status:** remediation complete on an isolated branch. Nothing merged, pushed or deployed.

---

## 1. What was verified before changing anything

| Check | Result |
|---|---|
| Branch/worktree heads | `feat/frontend-figma-parity` = `3df09cd`, `feat/backend` = `e5d77e5`, audit = `ab4ba5b` |
| Working trees | clean before worktrees were created |
| Audit documents read | all 13 files in `docs/final-audit/` (executive report, full 50-defect register, logic/integration, button matrix, navigation, icon asset, test results, recommended corrections, visual parity, inventories) |
| Audit findings re-checked against `3df09cd` | each P0/P1 and each data-integrity P2 was re-verified in the current source, not assumed |
| Isolated worktrees | `../samvad-opencode-audit-frontend` (this branch) only. Antigravity's `../samvad-frontend` was not modified |
| Backend worktree | not created; nothing in `supabase/` needed to change (see §6) |

The two post-audit commits `6fb6c53` (back navigation) and `3df09cd` (avatar vector) are
both present at the base, so the remediation starts from the audit's "current HEAD"
snapshot rather than the older base.

---

## 2. P0 defect

### D-01 — doctor "Warning flags" hardcoded to `None`

- **Root cause:** `DoctorReportDetail.tsx` rendered a literal `<p>None</p>`; the report
  row's `possible_urgent`, `needs_human_review` and `emergency_rule_id` were never read.
  `DoctorUrgentDetail.tsx` substituted `'severe_chest_pain'` when the rule id was absent.
- **Fix:** `src/lib/report-presentation.ts#describeWarningFlags()` reads the three fields
  and classifies the row as `available`, `malformed` or `unavailable`;
  `src/features/doctor/WarningFlags.tsx` renders exactly one of: the flags, `None`
  (only when all three fields are present and false/null), an explicit
  "Warning flags unavailable" warning, or a "some warning data could not be
  interpreted" note alongside any flags that could be read. Used by both doctor detail
  screens. No clinical text is invented and no flag is suppressed.
- **Regression tests:** `tests/remediation.test.ts` — multiple flags, single flag,
  genuine none, missing data (`undefined`/`null`/`{}`), partially missing data, invalid
  types, mixed valid/invalid data, loading state, and full component render
  (asserts `Possible urgent` / `Needs human review` appear and `>None<` does not).
- **Evidence:** `tests/remediation.test.ts` §D-01, 11 assertions.

---

## 3. P1 defects

| ID | Status | Correction | Test evidence |
|---|---|---|---|
| **D-02** emergency + Back | FIXED BY OPENCODE | `emergency` is terminal in `resolveBackNavigation()`; `EmergencyView` no longer accepts/renders a Back control (no `onBack ?? onEndDemo` fallback); answer handlers short-circuit to the emergency screen. 112 and the guidance remain plain text. | `remediation.test.ts` terminal-state suite; `back-navigation.test.ts` updated to assert **no** Back control and that 112 is present |
| **D-03** `Invalid Date · Invalid Date` | FIXED BY OPENCODE | `BookingView` sends `(slot.id, slot.start_time)`; `bookAppointment` now rejects an unparseable `slot_start` (`invalid_slot`), derives `slot_end = start + 30 min`, and enforces one confirmed appointment per report (`already_booked`); confirmation formats through `formatAppointmentWhen()` with an explicit "Date and time unavailable" fallback. | booking contract tests (ISO preserved, end = start + 30 min, slot id rejected, duplicate refused); e2e full-flow booking run |
| **D-04** `demo_busy` ignored | FIXED BY OPENCODE | `handleStartIntake` checks `res.demo_busy || !res.session_id`, stays on Welcome, shows the translated busy message with a retry control, and never navigates to Consent. Consent buttons are disabled with an explicit message when there is no session id. Double-start is blocked by `isProcessing`. | `demo_busy` envelope test + empty-session consent rejection |
| **D-05** mic denied | JOINT FIX REQUIRED | Real `micDenied` state with a text field, "Try microphone again" (re-requests permission) and the standard back control replaces the inline-only banner. Visual treatment still needs the Figma P7 pass (Antigravity). | e2e text-mode/consent path; static render of the denied panel is available via the component |
| **D-06** consent audio / paid replays | FIXED BY OPENCODE + OWNER ACTION | Fixed prompts resolve from `public/audio/{en,hi}/…` and never call `speak`; the fake 2.5 s timer is gone; consent autoplays the cached greeting and reports `unavailable`/`blocked` honestly; adaptive prompts are cached per (language, question) for the page session so replay does not buy the same audio twice. **Assets do not exist yet** — generation needs provisioned Timbre credentials and a reserved daily budget, so it is documented as an owner action in `public/audio/README.md`. | prompt-audio tests (static path, zero provider calls for cached prompts, one call per language for adaptive, cache hit on replay, honest `missing`) |
| **D-07** Hindi emergency body | FIXED BY OPENCODE | Body uses `t.emergency.guidance`; the demo-safety notice is rendered from `t.emergency.notice`. | e2e Hindi journey renders Devanagari with no English emergency body |
| **D-08** production fixtures / credential-free doctor | FIXED BY OPENCODE | Every `FIGMA_*` sessionStorage bypass, synthetic report row and fixture screen router is **deleted** from `src/`; `DoctorShell` always starts logged out; dashboard figures derive only from loaded data; report detail no longer substitutes fixture summary/source/appointment values. A source-scan test fails if a `FIGMA_*` key returns. | fixture-scan test; unauthenticated `DoctorShell` render test (login screen even with fixture keys set); production bundle grep = 0 matches for `FIGMA_*`, `INT-2026-0042`, `Aarav Sharma`, `Vikram Kumar` |
| **D-11** Back → consent resets intake | FIXED BY OPENCODE | Shell restores the existing conversation instead of re-issuing `record_consent`; `invalid_state` is treated as "already consented"; the mock `recordConsent` is idempotent and returns the current state. | idempotent-consent path exercised by every mock flow test; navigation tests keep the conversation state |
| **D-12** `other_symptoms` not correctable | FIXED BY OPENCODE | Review screen renders an "Other Symptoms" row with the same multi-value editor; the field is allow-listed and stored. | review render test asserts the row and its value |

---

## 4. P2/P3 findings corrected (data, safety, auth, contract)

| ID | Status | Correction |
|---|---|---|
| D-13 | FIXED | "Try another date" advances through the remaining dates, loads each, and selects the next one with a free slot; if none exist it says so. |
| D-14 | FIXED | Six distinct information statuses on the patient review (`Declined`, `Unknown`, `Unclear`, `Not asked`, `Not provided`, `Unavailable`); doctor views use the same helper. |
| D-15 | FIXED | Doctor detail renders `report.missing_information` (humanised) instead of recomputing from falsy values. |
| D-17 | FIXED | Fixture data set removed, so the dashboard, list and badges all come from one runtime data source; badge counts are computed. |
| D-18 | FIXED | Appointment columns relabelled to match their cells (`Department`, `Reference`) rather than printing the wrong data under `Age / Gender` and `Concern`. |
| D-19 | FIXED | "Play question again" calls the replay handler instead of navigating away. |
| D-20 | FIXED | Explicit "More dates" control extends the visible date range to the full 14-day window. |
| D-21 | FIXED | Slot times, date keys and appointment rows are formatted with an explicit `Asia/Kolkata` zone; the UTC `toISOString()` day and `getHours()` are gone. |
| D-22 | FIXED | A slot-load failure is a distinct state with a retry action, not an empty "no slots" list. |
| D-23 | FIXED | A failed restore shows "We could not restore your previous session" before clearing the stored id. |
| D-24 | FIXED | The two hidden nav links are removed from the tab order (`tabIndex={-1}`, `aria-hidden`), so the first Tab stop is a visible control. |
| D-25 | FIXED | Doctor data loading has explicit loading/error states, a retry control, and keeps the last good data on failure. |
| D-28 | FIXED | Submit / Book / corrections are disabled while a request is in flight (handlers keep their own guards). |
| D-29 | FIXED | Reports tab and search are owned by `DoctorShell`, so opening a report and pressing Back preserves them. |
| D-32 | FIXED | Reviewer label resolves `reviewed_by` → doctor display name, falling back to a neutral "Reviewed"; the hardcoded "Dr. Aditi Rao" is gone. |
| D-33 | FIXED | Source chip derives from `report.patient.language` and stored message input modes; it never claims "Voice" without data. |
| D-35 | FIXED | Urgent detail uses `report.missing_information`, `routing_snapshot`, the stored emergency statement and an explicit "no routine booking" statement. |
| D-36 | FIXED | Urgent review authority fails closed when the doctor is unknown. |
| D-37 | FIXED | Returning from booking renders the read-only submitted summary (`mode="submitted"`), not the draft editor; `confirmed_*` are terminal. |
| D-38 | FIXED | Language choice persists (`localStorage` + `documentElement.lang`), so a Hindi patient stays in Hindi across reloads. |
| D-39 | FIXED | An incomplete session with no next question renders an explicit "This session cannot continue" panel with an End action. |
| D-40 | FIXED | The string fallback no longer re-opens the microphone; the failure is reported instead. |
| D-41 | FIXED | The transcript screen navigates only after the answer is accepted. |
| D-42 | FIXED | Appointments default to the Upcoming tab. |
| D-46 | FIXED | Gender is capitalised/mapped on all doctor surfaces (`Male`, `Female`, `Other`, `Prefer not to say`). |

---

## 5. Assigned to Antigravity (not modified here)

No visual layout, spacing, colour, radius, typography or icon artwork was changed.

| ID | Defect | Why it is Antigravity-owned |
|---|---|---|
| D-09 | Processing screen (P6) | New visual screen driven by an existing `isProcessing` flag |
| D-16 | Booking screen layout (P9) | Frame rebuild (3 dates + More dates already wired, slot pagination, CTA time + calendar icon) |
| D-26 | Remaining hardcoded English on patient screens | Copy sweep across 9 components (the emergency body is already fixed) |
| D-27 | Password visibility toggle | Pure control/visual addition |
| D-31 | Review row layout (P8) | 3-column row grid, frosted "Don't submit", draft badge |
| D-43 / D-44 | Assistant and patient avatars | Icon artwork |
| D-45 | Brand plus glyph metrics | Icon/typography |
| D-47 | Reports list layout (D3) | Frame rebuild from table to list rows |
| D-48 | No-slots / slot-taken screens (P10/P11) | Screen structure; the underlying states and retry already exist |
| D-49 | Confirmation layout (P12/P13) | Centred lines, 92 px check circle, "report sent to Dr X" note |
| D-50 | Severity chip selection styling | Selection-driven visual state (behaviour already sends the chosen chip) |

**Owner decisions still open:** D-30 (urgent review authority: current behaviour is
fail-closed — Emergency doctor only), D-34 (consent bubble copy), D-06 asset generation,
and whether the urgent queue should include `needs_human_review` reports.

---

## 6. Backend: no change required

`feat/backend` @ `e5d77e5` already provides everything the corrected frontend needs:

| Requirement | Backend evidence |
|---|---|
| `possible_urgent`, `needs_human_review`, `emergency_rule_id` on the report row | `20261101120200_intake_tables.sql:177-179`, read by the doctor RLS policy |
| `demo_busy` envelope on `start_session` | `chat-turn/index.ts:444-456` |
| Booking hold + emergency ineligibility + one appointment per report | `20261102130000_availability_and_booking.sql:74,158-167` |
| Appointment reads with display names | `20261102160000_doctor_appointment_reads.sql:29-44` |
| Doctor login mapping (`doctor_profiles`), no credential bypass | `doctor_profiles_read_self` + `doctorLogin()` sign-out path |

The appointment table could gain age/gender/concern by joining the report, but that
would be a schema/RPC change; D-18 is corrected at the presentation layer instead, as
the audit permits.

Backend Deno suite (mock providers, no network): **181 passed / 0 failed**.

---

## 7. Test evidence (all providers mocked)

| Suite | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **PASS** (strict, no output) |
| Mock unit/integration | `npm run test:mock` | **121 passed / 0 failed** (19 suites) incl. 44 new remediation cases |
| Simulated Supabase contract | `npm run test:supabase` | **7 passed / 0 failed** |
| Browser E2E (headless Chrome, CDP) | `npm run test:e2e` | **16/16 checks PASS** |
| Visual/QA capture | `npm run test:visual` | **PASS** — 7 viewports, zero overflow, 13 screenshots refreshed |
| Production build | `npm run build:mock` | **PASS** (111 modules; 0 fixture strings, 0 secrets in bundle) |
| Backend Deno | `deno test _shared/` | **181 passed / 0 failed** |
| Local Supabase `test:api` | `npm run test:api` | **BLOCKED** — needs a local Supabase stack (Supabase CLI and Docker project are not provisioned). Not a product failure; no hosted access was used |
| Live provider calls (Groq/Prisma/Timbre) | — | **NOT RUN** by design |

Not claimed: real RLS/JWT enforcement, hosted Supabase behaviour, provider audio quality,
or a 15-turn cap run in the browser (unreachable in mock mode; covered by unit tests).

---

## 8. Files changed

New:
`src/lib/report-presentation.ts`, `src/lib/booking-time.ts`, `src/lib/navigation.ts`,
`src/lib/audio/prompt-audio.ts`, `src/features/doctor/WarningFlags.tsx`,
`tests/remediation.test.ts`, `public/audio/README.md`,
`docs/release-remediation/OPENCODE-ANTIGRAVITY-INTEGRATION-CONTRACT.md`,
this report.

Modified: the patient feature set (`PatientShell`, `WelcomeView`, `ConsentView`,
`ConversationView`, `WhatWeHeardView`, `ReportReviewView`, `BookingView`,
`ConfirmationView`, `EmergencyView`), the doctor feature set (`DoctorShell`,
`DoctorReportsList`, `DoctorReportDetail`, `DoctorUrgentDetail`,
`DoctorAppointmentsView`, `DoctorDashboardView`), `src/App.tsx`, `src/lib/api.ts`,
`src/i18n/{en,hi}.ts`, `src/i18n/index.tsx`, `package.json`, and four existing test
harnesses (booking calls now pass `slot_start`; e2e/visual harnesses no longer rely on
removed hidden labels and clear storage before a fresh mock flow).

---

## 9. Repository state

- Branch `fix/opencode-audit-frontend` at `d7a3248`, based on `3df09cd`.
- `feat/frontend-figma-parity`, `feat/backend` and every other branch are unchanged.
- Antigravity's worktree is untouched. No merge, push, deploy, hosted Supabase or
  provider call was made.
- Next gate: the owner confirms Antigravity's corrections, then the combined
  validation (Phases 9–13) runs in a disposable worktree.
