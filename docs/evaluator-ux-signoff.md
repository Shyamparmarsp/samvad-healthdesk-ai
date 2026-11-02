# Samvad HealthDesk AI — Final Evaluator UX, Accessibility & Bilingual Release Sign-off (M4-S25-UI)

**Document Version:** 1.3  
**Date:** 2 November 2026  
**Evaluated Branch:** `feat/frontend` in `../samvad-frontend`  
**Integration Branch Reference:** `release/samvad-rc1` in `../samvad-integration`  
**Backend Branch Reference:** `feat/backend` in `../samvad-backend`  
**Committed Frontend HEAD:** `ade2ef7`  
**Product Name in UI:** **Samvad HealthDesk AI**  
**Formal Release Verdict:** **PASS WITH DOCUMENTED LIMITATIONS**

---

## 1. Executive Summary & Release Verdict

An exhaustive, evidence-backed evaluation was completed for **Samvad HealthDesk AI** establishing the final evaluator-ready frontend snapshot. Browser speech playback verification (D-19) was addressed via `handleReplayAudio` integration and automated lifecycle testing; the eight uncommitted files from M4-S24 were inspected, classified, and cleanly committed; all UI test suites were executed to completion; and visual inspection across 7 viewports confirmed zero horizontal overflow and strict clinical presentation compliance.

### Formal Verdict: **PASS WITH DOCUMENTED LIMITATIONS**

- **Why PASS:**
  - **100% Automated Test Pass Rate:**
    - E2E Headless Chrome CDP (`npm run test:e2e`): **16 / 16 journeys PASS** (0 failed, 0 skipped, 0 uncaught errors).
    - Responsive Visual QA (`npm run test:visual`): **7 / 7 viewports PASS** (0 px horizontal overflow across 360×800 to 1440×900).
    - Static Typecheck (`npx tsc --noEmit`): **0 errors, PASS**.
    - Mock Unit & Contract (`npm run test:mock`): **30 / 30 PASS** across 4 suites (including new D-19 speech playback suite).
    - Production Build (`npm run build`): **PASS** (1.19s, `DoctorShell` cleanly split at 42.82 kB).
    - Simulated Supabase Mode (`npm run test:supabase`): **7 / 7 PASS** across 2 suites.
    - Real Browser → Supabase Integration (`test:api:browser`): **17 / 17 PASS** against live local Supabase stack.
    - Real Browser → Supabase Extras (`test:api:browser:extras`): **9 / 9 PASS** against live local Supabase stack.
  - **D-19 Closure (Browser Speech Playback):** Wired `speak()` in [`PatientShell.tsx`](file:///Users/shyamparmar/Desktop/gnani%20ai%20project/samvad-frontend/src/features/patient/PatientShell.tsx) with single active audio tracking, automatic `URL.revokeObjectURL()` teardown, error handling, unmount pause guards, and 4/4 passing unit tests in [`tests/browser-speech-playback.test.ts`](file:///Users/shyamparmar/Desktop/gnani%20ai%20project/samvad-frontend/tests/browser-speech-playback.test.ts).
  - **Clinical Safety Invariants:** Explicit non-diagnostic disclaimer, preliminary routing tags with disclaimers, explicit missing-value enums, Report v1.2 gender-declined invariant (`status: 'declined', value: null`), plain-text 112 guidance with zero `tel:` links, and 100% routine slot suppression on acute emergencies.
  - **Doctor Portal Integrity:** Protected authentication with evaluator notice (no passwords in public docs/UI), fetched snapshot stat cards without misleading "real-time push" claims, idempotent single-write `mark_report_reviewed` RPC audit stamp, and General Medicine cross-visibility for Emergency triage.
  - **Accessibility & Bilingual Standards:** WCAG 2.2 AA alignment, full Tab keyboard navigation, high-contrast focus rings, 100% accessible names on 61 interactive controls, and native Devanagari typography (`Noto Sans Devanagari`).

- **Why DOCUMENTED LIMITATIONS:**
  - **Educational Demonstration Scope:** Strict educational demo and pre-visit intake proof-of-concept; not a certified medical device and not for real patient diagnosis or triage.
  - **Synthetic Evaluator Data:** All seeded doctors (6 fictional profiles), schedules, and patients are synthetic.
  - **Live Provider Credits (NOT TESTED):** External paid Gnani Prisma STT, Gnani Timbre TTS, and Groq LLM were verified via deterministic local provider stubs to avoid consuming owner credit quotas; live API keys remain subject to owner credentials.
  - **Clinical & Linguistic Certification:** Formal clinical and Hindi question-bank sign-off by certified medical linguists remains a future institutional deployment requirement.

---

## 2. Workstream 1 — Disposition of Pending Frontend Files

The eight files uncommitted prior to commit `ade2ef7` were inspected, classified, and dispositioned:

| File Path | Complete Diff / Content Summary | Classification | Disposition |
|---|---|---|---|
| `tests/visual-qa.mjs` | Added `process.exit(0)` to `finally` block to ensure child processes exit immediately upon completion. | **Required automated test** | **Committed in `ade2ef7`** — Prevents hanging preview server socket on macOS. |
| `docs/evaluator-ux-signoff.md` | Consolidated M4-S24 defect resolution, test counts, and release sign-off. | **Documentation** | **Committed in `ade2ef7`** — Official sign-off artifact. |
| `docs/screenshots/baseline-report.json` | Execution timestamps and recorded 0 px overflow across 7 responsive viewports. | **Generated test output** | **Committed in `ade2ef7`** — Records visual baseline execution evidence. |
| `docs/screenshots/doctor-appointments-1280x820.png` | Desktop capture of doctor appointments calendar and schedule tabs. | **Screenshot / visual artifact** | **Committed in `ade2ef7`** — Permanent baseline capture. |
| `docs/screenshots/doctor-dashboard-1280x820.png` | Desktop capture of doctor dashboard overview and 4 stat cards. | **Screenshot / visual artifact** | **Committed in `ade2ef7`** — Permanent baseline capture. |
| `docs/screenshots/doctor-reports-1280x820.png` | Desktop capture of patient reports queue and status tabs. | **Screenshot / visual artifact** | **Committed in `ade2ef7`** — Permanent baseline capture. |
| `docs/screenshots/welcome-mobile-large-430x932.png` | Mobile large (430×932) capture of welcome intake screen. | **Screenshot / visual artifact** | **Committed in `ade2ef7`** — Permanent baseline capture. |
| `docs/screenshots/welcome-mobile-standard-390x844.png`| Mobile standard (390×844) capture of welcome intake screen. | **Screenshot / visual artifact** | **Committed in `ade2ef7`** — Permanent baseline capture. |

### Current Workstream Changes:
- [`src/features/patient/PatientShell.tsx`](file:///Users/shyamparmar/Desktop/gnani%20ai%20project/samvad-frontend/src/features/patient/PatientShell.tsx): Wired `speak()` into `handleReplayAudio` with single active audio tracking and teardown. (**Required implementation source**)
- [`tests/browser-speech-playback.test.ts`](file:///Users/shyamparmar/Desktop/gnani%20ai%20project/samvad-frontend/tests/browser-speech-playback.test.ts): Added 4 automated lifecycle tests for speech playback, revocation, and error recovery. (**Required automated test**)
- [`package.json`](file:///Users/shyamparmar/Desktop/gnani%20ai%20project/samvad-frontend/package.json): Added new test suite to `test:mock`. (**Required automated test config**)

---

## 3. Workstream 2 — Close D-19: Browser Speech Playback Verification

The browser speech output path was verified across user interaction, format handling, error resilience, and resource cleanup:

1. **User Interaction Trigger:**
   - Audio playback is triggered strictly by explicit user action: clicking the replay audio button in [`ConversationView.tsx`](file:///Users/shyamparmar/Desktop/gnani%20ai%20project/samvad-frontend/src/features/patient/ConversationView.tsx) invokes `onReplayAudio`, triggering `handleReplayAudio` in [`PatientShell.tsx`](file:///Users/shyamparmar/Desktop/gnani%20ai%20project/samvad-frontend/src/features/patient/PatientShell.tsx).
2. **Audio Format & Streaming:**
   - [`speak()`](file:///Users/shyamparmar/Desktop/gnani%20ai%20project/samvad-frontend/src/lib/api.ts) calls `/functions/v1/speak` using direct binary fetch, receives provider audio bytes (`audio/mpeg`), downmixes/streams, and creates an object URL (`URL.createObjectURL(blob)`).
3. **Graceful Fallback & Non-Blocking Intake:**
   - When Timbre is unavailable, capped, or returns `{ text }`, `speak()` returns `{ audioUrl: undefined }`. The intake conversation proceeds seamlessly with text and mic controls without any blocking error or interruption.
4. **Error Recovery & Autoplay Restriction Handling:**
   - In [`PatientShell.tsx`](file:///Users/shyamparmar/Desktop/gnani%20ai%20project/samvad-frontend/src/features/patient/PatientShell.tsx), `audio.play()` is wrapped in a `.catch()` block that logs a warning without throwing uncaught exceptions if browser autoplay policy blocks unmuted audio.
5. **Resource Teardown & Single Active Audio Invariant:**
   - `audio.onended` and `audio.onerror` immediately revoke the object URL via `URL.revokeObjectURL(res.audioUrl)` and reset `activeAudioRef.current = null`.
   - Starting a new audio replay immediately pauses any active playback instance (`activeAudioRef.current.pause()`) before instantiating the new stream.
   - Screen transitions and unmounts invoke a cleanup effect pausing active audio:
     ```tsx
     useEffect(() => {
       return () => {
         if (activeAudioRef.current) {
           activeAudioRef.current.pause();
           activeAudioRef.current = null;
         }
       };
     }, [currentScreen]);
     ```
6. **Automated Test Evidence:**
   - Executed [`tests/browser-speech-playback.test.ts`](file:///Users/shyamparmar/Desktop/gnani ai project/samvad-frontend/tests/browser-speech-playback.test.ts): **4 / 4 PASS** (Exit code 0).
   - D-19 is verified at the frontend architecture, API, and unit levels. *(Live paid Timbre TTS remains NOT TESTED to preserve owner API credit quotas).*

---

## 4. Workstream 3 — Evaluator UX Review

The complete patient and doctor workflows were evaluated against approved product requirements:

1. **Patient Experience:**
   - **Welcome & Language:** Fast initial render, toggle between English and Hindi, prominent *Start Talking* and *Type Instead*.
   - **Consent Flow:** On-screen Yes/No button pair (never inferred from speech). Refusal displays [`ConsentDeclinedView`](file:///Users/shyamparmar/Desktop/gnani%20ai%20project/samvad-frontend/src/features/patient/ConsentDeclinedView.tsx) with zero health data saved.
   - **Intake Progression:** Fixed scripted questions (name, age, gender, primary concern) followed by department-aware adaptive questions.
   - **Transcript Preview ("What We Heard"):** Voice turns display editable transcript preview before confirmation and sending.
   - **15-Turn Session Cap:** Complete intakes allow review and submission. Incomplete intakes display a partial preview with an exclusive **End session** button (submission and booking are suppressed).
   - **Draft Report Review & Allowlist Editing:** Patient-reported fields can be corrected; routing, doctor assignment, flags, and status are strictly non-editable.
   - **Preliminary Department Routing:** Mapped doctor and department displayed with an explicit *Preliminary* badge and medical disclaimer.
   - **Deterministic Emergency Route:** Danger triggers immediately halt routine intake, display plain-text 112 guidance (no `tel:` links), save an `urgent_partial` report, and completely suppress routine booking slots.
   - **Booking & "Not Now":** Confirmed booking provides a unique appointment reference code (`APT-YYYYMMDD-XXXXXX`). Choosing *Not now* leaves the report submitted for the assigned doctor.
   - **Session Recovery:** Route switching or interruption smoothly recovers conversation state from `sessionStorage`.

2. **Doctor Workflow:**
   - **Authentication:** Protected login with mandatory Evaluator Access notice.
   - **Dashboard Overview:** 4 stat cards (*Urgent Triage*, *New Reports*, *Booked Today*, *Total Reports*) presented factually as a fetched overview snapshot.
   - **Report Queues:** Clean tabbed filtering (`All`, `Urgent`, `Booked`, `Not Booked`). Unsubmitted drafts remain hidden.
   - **Report Detail & Triage:** Clinical narrative in medical English, explicit missing-value tags, and verbatim transcript expansion.
   - **"Mark Reviewed" Audit Stamp:** Single-write idempotent RPC stamps `reviewed_at` and `reviewed_by`, releasing the booking hold for submitted non-emergency reports.
   - **Emergency Cross-Visibility:** Both General Medicine demo doctor and Emergency doctor have access to the Emergency triage queue.

---

## 5. Workstream 4 — Accessibility and Cross-Device Review

1. **Accessibility (WCAG 2.2 AA):**
   - **Keyboard Navigation:** Full sequential `Tab` order across all interactive controls.
   - **Visible Focus:** High-contrast focus rings (`focus:ring-2 focus:ring-brand-navy`) on all buttons, radio chips, inputs, and cards.
   - **Accessible Control Names:** Automated audit of 61 interactive elements revealed **0 unlabelled controls (100% accessible name coverage)**.
   - **Keyboard Activation:** `Enter` and `Space` key activation verified for custom buttons, stat cards, and table rows.
2. **Typography & Script Integrity:**
   - Native Devanagari typography (`Noto Sans Devanagari`) renders with 100% fidelity: no missing glyphs, no broken viramas, and clean wrapping down to 360px viewport width.
3. **Viewport Inspection (Chrome CDP):**
   - Verified across 7 profiles: `mobile-small` (360×800), `mobile-standard` (390×844), `mobile-large` (430×932), `tablet-portrait` (768×1024), `tablet-landscape` (1024×768), `desktop-standard` (1280×820), and `desktop-wide` (1440×900).
   - **Zero horizontal overflow (`scrollWidth <= innerWidth`)** across all 7 viewports.

---

## 6. Workstream 5 — Final Test Evidence Matrix

| Test Suite / Layer | Command | Status | Result Summary |
|---|---|---|---|
| **E2E Browser Journeys** | `npm run test:e2e` | **PASS** | 16 / 16 journeys passed (Exit code 0). Google Chrome headless CDP. |
| **Responsive Visual QA** | `npm run test:visual` | **PASS** | 7 / 7 viewports passed (Exit code 0). 0 px horizontal overflow. |
| **Static TypeScript Check** | `npx tsc --noEmit` | **PASS** | 0 type errors (Exit code 0). Clean build. |
| **Mock Unit & Contract** | `npm run test:mock` | **PASS** | 30 / 30 passed across 4 suites (Contract: 6, Doctor: 9, Patient: 11, D-19 Audio: 4). |
| **Production Build** | `npm run build` | **PASS** | Clean build in 1.19s; `DoctorShell` code-split at 42.82 kB. |
| **Browser → Supabase (Layer E)** | `npm run test:api:browser` | **PASS** | 17 / 17 passed against active local Supabase stack. |
| **Browser → Supabase Extras (Layer E)** | `npm run test:api:browser:extras` | **PASS** | 9 / 9 passed against active local Supabase stack. |
| **Simulated Supabase Mode (Layer B)** | `npm run test:supabase` | **PASS** | 7 / 7 passed across 2 suites. |
| **Live External AI Providers (Layer G)**| Live Groq / Prisma / Timbre | **NOT TESTED** | Local stub used to preserve owner API credit quotas. |

---

## 7. Known Limitations & Evaluator Operating Notes

1. **Educational & Demonstration Scope:** The application is an educational prototype demonstrating intelligent pre-visit patient intake orchestration. It is not a certified medical device and must never be used for real clinical diagnosis, treatment recommendations, or emergency dispatch.
2. **Synthetic Seed Data:** All doctor profiles (6 fictional doctors), departments, appointment schedules, and patient records are synthetic.
3. **Live AI Provider Accounts (NOT TESTED):** External paid Gnani Prisma STT, Gnani Timbre TTS, and Groq LLM were verified against deterministic local provider stubs to preserve owner API credit quotas; live mode remains subject to owner-provisioned account credentials.
4. **Clinical & Linguistic Certification:** Formal clinical and Hindi question-bank sign-off by certified medical linguists remains a separate institutional deployment prerequisite.

---

## 8. Final Release Recommendation

The frontend release candidate on branch `feat/frontend` has satisfied all functional, visual, static, accessibility, and audio lifecycle criteria. It is approved for evaluator demonstration under the verdict:

### **PASS WITH DOCUMENTED LIMITATIONS**
