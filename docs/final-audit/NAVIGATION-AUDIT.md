# Navigation Audit

Two snapshots are covered because the navigation system changed during the audit.

- **Base `6637841`** — measurement source: `evidence/audit-run.json` → `measurements.back-buttons`.
- **HEAD `3df09cd`** — measurement source: `evidence/head-3df09cd/delta-run.json` → `navigation`.

Measured with a DOM query for any visible `button` whose accessible name matches `/back/i`, then clicked and the resulting screen recorded.

## 1. Baseline result at the audit base commit

| Screen | Figma back arrow? | Back control in app | Position | Destination | Verdict |
|---|---|---|---|---|---|
| Patient Welcome | no (home) | none | — | — | correct |
| Patient Consent | no | **none** | — | — | acceptable vs Figma, fails the owner rule |
| Conversation | **yes** (`98:38`) | **none** (a dead arrow exists only in the `FIGMA_PARITY_P3_FIXTURE` debug branch, with no handler) | — | — | **missing** |
| Gender question | **yes** (`98:42`) | **none** | — | — | **missing** |
| What we heard | **yes** (`98:51`) | 1 (20 px chevron in the header) | ~24,26 | Conversation | present, icon not the Figma vector |
| Processing | **yes** (`98:55`) | screen does not exist | — | — | **missing** |
| Mic denied | **yes** (`98:59`) | screen does not exist | — | — | **missing** |
| Report review | **yes** | **none** | — | — | **missing** |
| Booking | **yes** | **none** | — | — | **missing** |
| No slots | **yes** | **none** (inline state) | — | — | **missing** |
| Slot taken | **yes** | **none** (inline state) | — | — | **missing** |
| Booking confirmation | **yes** | **none** | — | — | **missing** |
| Report sent | **yes** | **none** | — | — | **missing** |
| Emergency | **yes** | **none** | — | — | **missing** |
| Consent declined | no (has "Back to start") | none | — | — | correct |
| Session ended | frame does not exist | none | — | — | acceptable (terminal screen) |
| Doctor Login | no | **none visible** (only a 0×0 `opacity-0` link in `App.tsx:15-18`) | — | — | **missing** |
| Doctor Dashboard | yes (unusual for a home screen) | none | — | — | acceptable per owner rule |
| Reports list | **yes** | **none** | — | — | **missing** |
| Appointments | **yes** | **none** | — | — | **missing** |
| Urgent list | **yes** | **none** | — | — | **missing** |
| Report detail | **yes** | 1 ("Back to Reports") | 279,41 (36×36) | Reports | present |
| Urgent detail | **yes** | 1 ("Back to Triage Queue") | 279,41 (36×36) | Urgent list (labelled "Reports" in code) | present |

Automated probe result: `{welcome:0, consent:0, conversation:0, review:0, booking:0, confirm:0, emergency:0, heard:1}`.

**This is the single largest visual/behavioural divergence from the owner's requirement** ("Every non-home screen must have a visible back button"). It was **fixed by commit `6fb6c53` during this audit**.

## 2. HEAD result (commit `3df09cd`)

### Patient

| Screen | Present | Label | Position (px, 390×844) | Destination | Visual vs Figma |
|---|---|---|---|---|---|
| Welcome | no | — | — | home | correct |
| Consent | **yes** | "Go back" | 14, 54 (36×36 hit area, 25×25 glyph) | Welcome | Figma has no arrow here; added per owner rule |
| Conversation | **yes** | "Go back" | 14, 105 | Consent | Figma places it at 7, 80 — **~25 px lower** |
| What we heard | yes | "Go back" | 14, ~72 | Conversation | was already present; glyph now the Figma vector |
| Review | **yes** | "Go back" | 14, 72 | Conversation (history) | Figma ~7, 80 |
| Booking | **yes** | "Go back" | 14, 72 | Review | Figma ~7, 80 |
| Booking confirmation | **yes** | "Go back" | 14, 54 | Booking | Figma has it at the top too |
| Report sent | **yes** | "Go back" | 14, 54 | Booking | Figma has it |
| Emergency | **yes** | "Go back" | 14, 54 | **Conversation** | Figma has it |
| Consent declined | no | — | — | — | terminal |
| Session ended | no | — | — | — | terminal |

All patient arrows use one shared component (`src/features/common/BackButton.tsx`) with a **literal copy of the Figma `report/back-arrow` path** (25×25, stroke 1.8), so the icon is now exact. Position is the remaining deviation.

### Doctor

| Screen | Present | Label | Position | Destination |
|---|---|---|---|---|
| Login | **yes** | "Back to Patient Intake" (plus a hidden `<a>Patient Intake</a>`) | in the hero block | `/` |
| Dashboard | no | — | — | home (Figma still shows an arrow) |
| Reports | **yes** | "Back to Dashboard" | 273, 43 | Dashboard |
| Appointments | **yes** | "Back to Dashboard" | 273, 43 | Dashboard |
| Urgent | **yes** | "Back to Dashboard" | 273, 43 | Dashboard |
| Report detail | yes | "Back to Reports" | 273, 41 | Reports list |
| Urgent detail | yes | "Back to Urgent List" | 273, 41 | Urgent list (fixed from the old "Back to Reports" label) |

## 3. Fallback behaviour (direct URL / refresh)

The patient surface has **no per-screen routes** — `/` renders `PatientShell` and every screen is internal React state. Therefore:

- **Direct URL to a patient screen is impossible.** `#`, query strings and paths other than `/` do not select a screen (`App.tsx:22`, 404 route).
- **Refresh on any patient screen** returns to whatever the mount effect decides:
  - In **mock mode**: the in-memory session store is recreated empty, so `resumeSession` throws, `samvad_session_id` is removed, and the user lands on **Welcome with no message**. Verified: `evidence/audit-run-state.json` → `afterReload { onWelcome: true, storedSession: null }`.
  - In **Supabase mode**: `resume_session` would restore the session (backend supports it) — **not verified** (no local stack).
- **Language choice is not persisted** (`I18nProvider` holds `language` in React state only), so even a successful Supabase resume would silently revert a Hindi patient to English after refresh.
- **Doctor refresh always returns to Login**, because `currentDoctor` is React state; there is no session restore on mount. Acceptable, but it means an expired/invalid Supabase session is indistinguishable from a deliberate logout (`DoctorShell.tsx:73-78`).

The `FIGMA_PATIENT_VIEW` / `FIGMA_DOCTOR_VIEW` sessionStorage keys act as a *fixture router* and do survive refresh — one more reason they must not ship (D-08).

## 4. State preservation on back-navigation (HEAD)

| Flow | Expected | Actual | Verdict |
|---|---|---|---|
| Conversation → Back → Consent → agree again | Intake resumes where it was | **Question pointer restarts at "What is your full name?" and the turn counter drops from 1 to 0** while the previously stored answers remain on the server | **FAIL** (D-11) |
| What we heard → Back | Conversation with the same question | Conversation, same question, prior answers intact | PASS |
| Review → Back | Conversation, draft intact | Conversation, draft intact (turn counter kept) | PASS |
| Booking → Back | Review with the submitted report, no re-submit | Review shown but labelled **"DRAFT PREVIEW"**; only an "End session" action is offered | PARTIAL (misleading label, D-37) |
| Confirmation → Back | Read-only summary | **Fully bookable slot grid with a working "Book Appointment"** | **FAIL** (D-10) |
| Emergency → Back | Emergency guidance retained, no routine intake | **Routine conversation restored, 112 guidance gone**; the next answer fails with a session error because the backend rejects answers on an emergency session (`canAcceptAnswer` requires `in_progress`/`consented`) | **FAIL — safety** (D-02) |
| Doctor detail → Back → reopen | Search/filter preserved | **Search text is cleared and the tab resets** because `DoctorReportsList` unmounts (`DoctorShell.tsx:323-329`); verified: search "Rohan" → after back `search: ""`, rows 2 | **FAIL** (D-29) |
| Doctor detail → Back | Previous scroll position | Lost (the list remounts at the top) | PARTIAL |

## 5. Navigation loops / external navigation

- No navigation loop was found. `handleBack` pops a screen-history stack and falls back to a fixed predecessor map, so repeated Back presses terminate at Welcome.
- No control navigates off-site. `App.tsx` has no external links; the Supabase URL is only used for the `speak` fetch.
- The 404 route offers a link back to `/` and does not loop.

## 6. Recommendations

1. Keep the HEAD back buttons but **block Back out of terminal states**: `emergency`, `confirmed_booking`, `confirmed_report_only`, `session_ended`, `consent_declined`. Those states must be terminal for the session, per the owner rule "state cannot be incorrectly reset".
2. Move the conversation arrow from y=105 to y≈80 to match the Figma placement, and align the review/booking arrow to the same baseline.
3. Persist `language` and (Supabase mode) the doctor session so refresh does not silently downgrade or log out.
4. Lift report search/tab state into `DoctorShell` (or keep both views mounted) so it survives detail navigation.
5. Remove the invisible `App.tsx` nav links; the doctor login now has a real return control at HEAD.
