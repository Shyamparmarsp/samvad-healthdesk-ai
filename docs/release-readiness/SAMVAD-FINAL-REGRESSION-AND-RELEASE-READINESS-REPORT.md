# Samvad HealthDesk AI — Final Regression and Release-Readiness Report

**Document:** `SAMVAD-FINAL-REGRESSION-AND-RELEASE-READINESS-REPORT`
**Date:** 3 November 2026
**Audit of record:** `audit/final-ui-logic-figma-review` @ `ab4ba5b`
**Validation branch:** `validation/samvad-combined-release-audit` (disposable rehearsal)
**Status:** remediation and combined validation complete; **release not approved** — owner gate pending

---

## 1. Executive summary

The P0 defect and every OpenCode-owned P1 defect from the 50-item audit have been
corrected on an isolated branch, and the corrected code has been combined with
Antigravity's visual pass in a disposable validation worktree for a full regression run.

**Result: all executable suites pass on the combined candidate.**

- `npx tsc --noEmit`: clean.
- Mock unit/integration suite: **121 passed / 0 failed** (was 44; 44 new remediation
  cases added, plus the corrected navigation/booking expectations).
- Simulated Supabase contract suite: **7 passed / 0 failed**.
- Headless Chrome end-to-end: **16/16 checks pass**, including the emergency flow, the
  bilingual journey, the full intake→booking→doctor-review journey, and the three new
  assertions added for this report (cached greeting playback, valid IST booking date,
  data-driven warning flags).
- Visual/QA: 7 viewports, zero overflow, 23 screenshots captured.
- Production build: succeeds; the bundle contains **zero** fixture keys, fixture patient
  names or service-role strings.
- Backend Deno suite (unchanged baseline `e5d77e5`): **181 passed / 0 failed**.

**Three findings remain material and are NOT fixed:**

1. **D-06 audio assets are placeholders.** Eleven files exist in `public/audio`, but all
   eleven are byte-identical 1-second, 8 kHz WAVs. They are not spoken prompts. The
   application correctly serves cached assets and never buys the greeting from Timbre,
   but the greeting is silent until the owner generates real audio. **Owner action.**
2. **Twelve findings remain Antigravity-owned visual gaps** (processing screen, booking
   layout, reports-list layout, no-slots/slot-taken screens, avatar containers, brand
   plus, remaining English copy, urgent-queue scope). Several were partially closed by
   the combined visual pass; none affect data, safety or authentication.
3. **Two owner decisions are open** (urgent-report review authority D-30, consent bubble
   copy D-34), and the combined candidate could not be tested against a real local
   Supabase stack, so RLS/JWT enforcement remains statically verified only.

**Recommendation:** suitable for an internal scripted demonstration; **not** for hosted
evaluator access until real prompt audio is generated, the owner decisions are recorded,
and the candidate is exercised once against a real local Supabase stack.

---

## 2. Exact commit identity

| Role | Ref | Commit |
|---|---|---|
| Audit of record | `audit/final-ui-logic-figma-review` | `ab4ba5b` |
| Frontend base (Antigravity) | `feat/frontend-figma-parity` | `3df09cd` |
| Design-owner visual work | `feat/frontend-figma-parity` | `78b68c2` (src diff sha256 `ffd2fd28…b137e8`, verified identical to the validated snapshot) |
| OpenCode remediation | `fix/opencode-audit-frontend` | `c12df34` (code `d7a3248`, report `77c9cc5`) |
| Backend baseline | `feat/backend` | `e5d77e5` |
| **Combined validation candidate** | `validation/samvad-combined-release-audit` | **`938126a`** |

The validation branch is disposable. Nothing was merged into `feat/frontend-figma-parity`,
`feat/backend`, `release/*` or `main`, and nothing was pushed or deployed.

**Process note (N-03, resolved during validation):** the design corrections were
uncommitted when the candidate was assembled. They were committed as `78b68c2` during
the validation run; the committed `src/` diff is byte-identical to the snapshot that was
merged and tested (sha256 `ffd2fd28…b137e8`), so no re-validation was required. The
candidate is therefore reproducible from two commits (`938126a` + `78b68c2`).

---

## 3. Integration-validation scope

In scope and executed: TypeScript, mock-backend unit/integration, simulated Supabase
contract tests, real headless-Chrome E2E against the built mock bundle, visual capture at
7 viewports, production build inspection, bundle secret/fixture scan, backend Deno unit
tests, and static verification of RLS/RPC contracts.

Out of scope / not executed: hosted Supabase, hosted Vercel, real provider calls (Groq,
Gnani Prisma, Gnani Timbre), real RLS/JWT enforcement, physical mobile devices, Safari and
Firefox, screen-reader passes, and the 15-turn cap in the browser (unreachable in mock
mode; covered by unit tests).

---

## 4. Original Figma comparison coverage

The audit compared **22/22 Figma frames** at native resolution against the running app and
produced 22 comparison sheets plus 16 exported vectors. That comparison remains the
authoritative visual baseline; this validation re-uses it and adds fresh captures of the
corrected screens. This report does not claim a new per-frame parity score: the frames
the audit rated "material mismatch" (P9 booking, P10/P11 slot states, D3 reports list, D6
appointments, D7 urgent) are still materially different, and D-09 (processing) is still not
a real screen.

Screens re-captured in this validation (see §17): welcome ×7 viewports, Hindi welcome,
consent, conversation, emergency, patient intake desktop, doctor login, dashboard
(desktop + mobile), reports list, report detail, urgent detail with warning flags,
conversation history, appointments, and a booking confirmation showing a real IST date.

---

## 5. Patient UI verification

| Behaviour | Expected | Verified |
|---|---|---|
| Welcome | Language toggle, Start Talking, Type Instead | ✅ render + interaction |
| Consent | On-screen Yes/No, versioned copy, cached greeting | ✅ buttons work; greeting playback **attempted from a cached asset** (`/audio/en/greeting.mp3` → fallback `/audio/greeting_en.wav`), no provider call. Headless Chrome blocks autoplay before a gesture, and the screen says so with a tap-to-play control |
| Consent decline | No health data kept, no report shared | ✅ (existing suite + render) |
| Intake | Fixed questions in order, chips, text and voice paths | ✅ full journey |
| Transcript confirmation | Editable, sends only after confirmation | ✅ and now navigates only after acceptance (D-41) |
| Review | All allow-listed fields correctable incl. other symptoms | ✅ render + corrections in unit tests |
| Submit | Explicit action, then routing + slots | ✅ full journey |
| Booking | Real slots, IST times, book / not now / more dates / try another date | ✅ book path; error and no-slot states unit-tested |
| Confirmation | Reference, doctor, department, real date/time | ✅ “Wed, 04 Nov 2026 · 9:00 AM” captured (D-03) |
| Emergency | 112 plain text, intake stopped, no booking, no Back | ✅ E2E + explicit no-Back assertion |
| Hindi | Devanagari throughout the journey | ✅ bilingual E2E; “Turn 0 of 15” still contains an English word (D-26) |

---

## 6. Doctor portal verification

| Behaviour | Expected | Verified |
|---|---|---|
| Login | Requires Supabase session; unmapped users rejected | ✅ E2E login; unit test proves the login screen renders even with legacy fixture keys set |
| Fixture auto-open | Must not exist | ✅ removed; source-scan test enforces it |
| Dashboard | Stats + recent reports from loaded data | ✅ render |
| Reports list | Tabs, search, status | ✅ render + interaction |
| Report detail | Real fields, **real warning flags**, missing info, source chip, reviewer | ✅ unit tests; urgent detail capture shows `Possible urgent` + `Emergency rule: severe_chest_pain` |
| Urgent detail | Rule from the report, fail-closed review authority | ✅ capture + unit test |
| Mark Reviewed | Only authorised doctor; writes reviewed timestamp | ✅ (RPC unchanged) |
| Conversation reader | Stored patient answers only | ✅ capture |
| Appointments | Headers match cells, Upcoming default, IST formatting | ✅ unit test |
| Logout | Returns to login | ✅ interaction |

---

## 7. Interactive button and action verification

The repository's control-inventory pass reports 6 audited controls, 0 unlabelled, 0 dead
links, 100% accessible names. The audit's own 72-control matrix remains the broader
reference. Controls specifically re-verified in this run: Start Talking / Type Instead,
consent Yes/No, question chips, text send, mic, Done, transcript send / speak again /
play question again, every review edit control, Submit, Don’t submit, date chips, More
dates, slot chips, Book, Not now, End demo, doctor login submit, password reveal, sidebar
navigation, report rows, tabs, search, Mark Reviewed, triage acknowledge, logout.

Controls that were previously decorative and now behave: consent greeting, Play question
again, Try another date, More dates. Controls that previously did nothing and now report
honestly: consent when no session exists, slot load failure, session restore failure.

---

## 8. Navigation verification

| Transition | Result |
|---|---|
| Welcome → Consent → Conversation → Review → Booking → Confirmation | ✅ |
| Back from Conversation / What we heard / Review / Booking | ✅ allowed, state preserved |
| Back from Emergency | ⛔ blocked; no control rendered (D-02) |
| Back from Confirmations | ⛔ blocked (D-10); submitted report re-renders read-only (D-37) |
| Back from Session ended / Consent declined | ⛔ blocked |
| Doctor list → detail → Back | ✅ search and tab preserved (D-29) |
| Doctor login → patient side | ✅ visible control |
| Direct URL `/doctor` when logged out | ✅ login screen only |

---

## 9. Avatar, icon and asset audit

Adopted from Antigravity's pass: Figma sidebar icon paths (dashboard, reports,
appointments, urgent), assistant and patient line-art vector paths (30×30 / 28×28),
edit pencil on review rows, paper-plane send icon, 92 px confirmation check circle.
Still open: avatar **containers** (the audit's D-43/D-44 require removing the white
circle), the brand plus typography (D-45), and several remaining rounded-square icon
treatments (register I-04/I-10/I-11/I-13). No image asset was invented or replaced with a
different glyph in this validation.

---

## 10. Emergency behaviour verification

- Clear trigger ("severe crushing chest pain …") stops routine intake, renders the
  emergency card with **plain-text 112** (no `tel:` link) and the translated guidance, and
  suppresses booking.
- The emergency screen has **no Back affordance**; an E2E assertion enforces it.
- The urgent report is created with `urgent_partial`, `emergency_rule_id`, a null summary,
  and appears in the doctor's urgent queue for both mapped doctors.
- The General Medicine doctor sees read-only cross-visibility; only the Emergency doctor
  can acknowledge (fail-closed).

---

## 11. Appointment and booking verification

- The confirmation renders `Wed, 04 Nov 2026 · 9:00 AM` (captured). No “Invalid Date”.
- `slot_start` is the slot's ISO instant; a slot id is rejected with `invalid_slot`.
- Mock and database both enforce one confirmed appointment per report; the UI maps that to
  its own message instead of “slot taken”.
- Appointment rows and tabs are derived in Asia/Kolkata; the table headers now match their
  cells (Department / Reference).
- Booking hold for flagged reports, emergency ineligibility and the unique-slot constraint
  are unchanged in the backend.

---

## 12. Consent audio verification

| Check | Result |
|---|---|
| Greeting resolved from a cached asset | ✅ attempts `/audio/en/greeting.mp3`, falls back to `/audio/greeting_en.wav` |
| Provider call for the cached greeting | ✅ none (assertion forbids `speak`/Timbre URLs) |
| Fake 2.5 s “Playing…” timer | ✅ removed |
| Failure reporting | ✅ distinguishes “audio unavailable” (asset missing/undecodable) from “browser blocked playback” (recoverable with a tap); the headless run correctly reports the blocked state |
| Adaptive replay caching | ✅ one provider call per language+question per page session; replay reuses the cache |
| Actual speech in the shipped assets | ❌ **eleven 1-second byte-identical placeholder WAVs** — owner action |

---

## 13. Provider integration status

| Provider | Status |
|---|---|
| Groq | Not called. Server-side only; unchanged. Live model/structured-output verification still owner-gated. |
| Gnani Prisma (STT) | Not called. Browser posts WAV to `chat-turn`; contract unchanged. |
| Gnani Timbre (TTS) | Not called in this validation. `speak` path unchanged; fixed prompts never call it. |
| Supabase | Not contacted. Contract wiring validated against the simulated suite only. |

---

## 14. Security and RLS results

Statically verified (unchanged by this work): JWT-derived identity, RLS on
sessions/messages/reports, doctor reads scoped to `doctor_profiles`, draft reports never
visible, `SECURITY DEFINER` limited to `book_appointment`, `mark_report_reviewed` and
`get_doctor_appointments` with fixed `search_path`, emergency rejected by `submit_report`,
and one-appointment-per-report uniqueness.

Verified dynamically: the doctor portal cannot be entered without authentication, no
fixture bypass survives in the bundle, and the client never writes to protected tables
(all mutations go through `chat-turn` or the two RPCs).

Not verified dynamically: real RLS enforcement, JWT expiry, and RLS under a hostile
client (no local Supabase stack).

**Corrections during validation:** Antigravity's uncommitted branch contained two
fabrication risks that were rejected at merge: a name→age/gender/concern lookup in the
appointments table, and a hardcoded fallback date in the confirmation. Both would have
presented invented clinical data as fact (new finding N-01, fixed in the candidate).

---

## 15. Complete defect register status

Legend: **F** fixed · **V** verified already fixed · **A** Antigravity · **J** joint ·
**O** owner action · **D** deferred · **X** open.

| ID | Sev | Status | Evidence |
|---|---|---|---|
| D-01 | P0 | **F** | `report-presentation.ts` + `WarningFlags.tsx`; 11 tests; urgent-detail capture |
| D-02 | P1 | **F** | tested navigation guard; no Back control; E2E assertion |
| D-03 | P1 | **F** | ISO `slot_start`, IST formatter; confirmation capture; 4 tests |
| D-04 | P1 | **F** | busy state on Welcome, disabled consent, retry; 2 tests |
| D-05 | P1 | **F** | real mic-denied screen with text fallback + retry (Antigravity layout) |
| D-06 | P1 | **O** | caching/playback fixed and asserted; assets are placeholders |
| D-07 | P1 | **F** | `t.emergency.guidance`; Hindi E2E |
| D-08 | P1 | **F** | all fixtures deleted; scan test; bundle scan |
| D-09 | P2 | **A** | processing screen still not a real state |
| D-10 | P1 | **F** | terminal confirmations; duplicate booking refused |
| D-11 | P1 | **F** | idempotent consent; state restored |
| D-12 | P1 | **F** | other-symptoms row + editor |
| D-13 | P2 | **F** | next-available-date search |
| D-14 | P2 | **F** | six distinct status labels |
| D-15 | P2 | **F** | `missing_information` from report |
| D-16 | P2 | **A** | booking layout not rebuilt |
| D-17 | P2 | **F** | single data source; computed badges |
| D-18 | P2 | **F** | headers match cells (relabelled) |
| D-19 | P2 | **F** | replay wired, no navigation |
| D-20 | P2 | **F** | More dates control |
| D-21 | P2 | **F** | explicit Asia/Kolkata formatting |
| D-22 | P2 | **F** | dedicated load-error state + retry |
| D-23 | P2 | **F** | restore-failure message |
| D-24 | P2 | **F** | hidden links out of tab order |
| D-25 | P2 | **F** | loading/error/retry, last good data kept |
| D-26 | P2 | **J** | Hindi labels adopted; “Turn 0 of 15” and others remain |
| D-27 | P3 | **F** | password reveal added (Antigravity) |
| D-28 | P3 | **F** | in-flight disabling |
| D-29 | P2 | **F** | tab/search lifted to shell |
| D-30 | P2 | **O** | authority decision still open (fail-closed today) |
| D-31 | P2 | **J** | pencil icon adopted; 3-column row layout not rebuilt |
| D-32 | P2 | **F** | reviewer resolved from data |
| D-33 | P2 | **F** | source chip derived |
| D-34 | P2 | **O** | consent copy decision open |
| D-35 | P2 | **F** | urgent detail uses report data |
| D-36 | P3 | **F** | review authority fails closed |
| D-37 | P2 | **F** | read-only submitted summary |
| D-38 | P3 | **F** | persistence + `documentElement.lang` |
| D-39 | P2 | **F** | explicit dead-end panel + End |
| D-40 | P3 | **F** | no silent mic re-capture |
| D-41 | P3 | **F** | navigate after acceptance |
| D-42 | P3 | **F** | Upcoming default |
| D-43 | P2 | **J** | vector path adopted; container still present |
| D-44 | P2 | **J** | vector path adopted; container still present |
| D-45 | P3 | **A** | brand plus metrics unchanged |
| D-46 | P3 | **F** | capitalised/mapped gender |
| D-47 | P2 | **A** | reports list still a table |
| D-48 | P2 | **A** | no dedicated slot-state screens |
| D-49 | P2 | **F** | confirmation note + 92 px circle (Antigravity) |
| D-50 | P3 | **F** | selection-driven chip styling |

**New findings**

| ID | Sev | Finding | Status |
|---|---|---|---|
| N-01 | P1 | Antigravity's working tree fabricated patient demographics by name in the appointments table and returned a hardcoded date when the slot timestamp was unparseable | **F** (rejected at merge; data-driven behaviour retained) |
| N-02 | P1 | The eleven shipped prompt-audio files are byte-identical 1-second placeholders, not spoken prompts | **O** |
| N-03 | P2 | Design corrections existed only as uncommitted working-tree changes | **V** — committed as `78b68c2`; src diff byte-identical to the validated snapshot |

**Totals (53 findings):** P0 1 · P1 12 · P2 29 · P3 11.
Status: fixed or verified **41**, joint/partial **4**, Antigravity **5**, owner action **3**.

---

## 16. Full automated test results

| Suite | Command | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|---|
| TypeScript | `npx tsc --noEmit` | — | 0 | 0 | strict |
| Mock unit/integration | `npm run test:mock` | **121** | 0 | 0 | 19 suites |
| Supabase contract (simulated) | `npm run test:supabase` | **7** | 0 | 0 | not a real round trip |
| Browser E2E | `npm run test:e2e` | **16/16** | 0 | 0 | headless Chrome 141 |
| Visual/QA | `npm run test:visual` | **7 viewports** | 0 | 0 | 23 screenshots |
| Production build | `npm run build:mock` | ✅ | 0 | 0 | 111 modules |
| Backend Deno | `deno test _shared/` | **181** | 0 | 0 | mocked providers |
| Local Supabase API | `npm run test:api` | 0 | 3 (load) | 0 | **blocked**: no local stack |

New assertions added for this report: cached-greeting playback from a static asset,
no-provider-call for cached prompts, real IST booking date/time on the confirmation (and
no “Invalid Date”), data-driven warning-flag chip on the urgent detail, and no Back
control on the emergency screen.

---

## 17. Failed, skipped and blocked

- **Blocked:** `npm run test:api` (3 files) — requires a local Supabase stack; Supabase
  CLI is not installed and Docker is present but no project is provisioned. No hosted
  access was used as a substitute.
- **Not run by design:** live Groq / Prisma / Timbre calls; hosted Supabase/Vercel;
  device/browser matrix; screen-reader and axe passes.
- **No test failures** in any executed suite.
- Known harness blind spots inherited from the repository suites: `test:visual` asserts
  document overflow rather than shell clipping, and the control inventory audits a small
  fixed list. Both were treated as supporting evidence only; the audit's own probe results
  remain the record for those areas.

---

## 18. Known limitations

1. Prompt audio is placeholder silence (N-02).
2. RLS/JWT behaviour is statically verified only.
3. The mock backend completes in ≤13 turns, so the 15-turn cap UI is not exercised in the
   browser.
4. The doctor portal has no session-restore on refresh (deliberate; refresh returns to
   login).
5. Visual parity is unchanged for the five frames the audit rated as material mismatches.
6. The candidate is a disposable rehearsal of two branches; it is not itself a release branch.
7. Hindi copy is improved but not complete (D-26).

---

## 19. Remaining owner actions

1. **Generate real prompt audio** for the ten documented files (or replace the placeholders),
   reserving the Timbre budget for that IST day first. Do not ship the placeholders.
2. **Record the two open decisions:** D-30 (urgent review authority — the candidate is
   fail-closed: Emergency doctor only) and D-34 (consent bubble copy).
3. Merge order: rebase `fix/opencode-audit-frontend` onto `78b68c2` (or re-apply the visual
   changes on top of the remediation), resolving the shared screen files as documented in the
   integration contract.
4. **Provision a local Supabase stack** and run `npm run test:api`, or accept the static
   security verification explicitly.
5. Decide whether the urgent queue should include `needs_human_review` reports.
6. Approve permanent integration only after items 1–4.

---

## 20. Deployability assessment

| Gate | Verdict |
|---|---|
| Internal scripted demo (mock mode) | **Pass** |
| Owner visual acceptance | **Fail** — 5 visual findings still assigned to Antigravity |
| Frontend↔backend integration | **Conditional** — contract-tested, not stack-tested |
| Security review | **Pass with notes** — static verification, fixture bypass removed |
| Hosted evaluator access | **Not yet** — placeholder audio + open decisions |
| Permanent branch integration | **Blocked pending owner approval** |

---

## 21. Evidence index

- Validation worktree: `../samvad-final-release-validation` (branch
  `validation/samvad-combined-release-audit` @ `938126a`, report commit follows).
- Design-owner commit: `feat/frontend-figma-parity` @ `78b68c2` (src diff verified identical
  to the validated snapshot).
- Screenshots: `docs/screenshots/` (23 files, including
  `doctor-urgent-warning-flags-1280x820.png` and
  `booking-confirmation-390x844.png`).
- OpenCode per-defect handoff: `docs/release-remediation/OPENCODE-REMEDIATION-REPORT.md`.
- Integration contract: `docs/release-remediation/OPENCODE-ANTIGRAVITY-INTEGRATION-CONTRACT.md`.
- Audit corpus: `docs/final-audit/` on `audit/final-ui-logic-figma-review`.
- This report: `docs/release-readiness/` (Markdown + PDF).

**No secrets, keys or real patient data appear in this report.** All patient and doctor
identities referenced by the application are synthetic demo data.
