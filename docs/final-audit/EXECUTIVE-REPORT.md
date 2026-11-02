# Samvad HealthDesk AI — Final UI, Interaction & Application-Logic Audit

**Audit branch:** `audit/final-ui-logic-figma-review`
**Audit worktree:** `../samvad-final-audit`
**Primary audit base:** `6637841420d33f0345f8ac192d3bf0e7e9a07d75` (`feat/frontend-figma-parity`, branch HEAD when the audit started)
**Post-audit delta verification:** `3df09cd466fb01e496b499f05118af323326b6bd` (branch HEAD after the Antigravity agent committed further work mid-audit)
**Figma source:** *Samvad HealthDesk AI — V2 Screens*, file key `PIIKHDaviWGq9EV9yBZcnc` — inspected directly through the Figma MCP (metadata + native-resolution renders + exported SVG vectors), not from previously generated screenshots.
**Date:** 2 November 2026

---

## 1. How to read this audit

Two implementation snapshots are in scope, because the frontend branch moved while the audit was running:

| Snapshot | Commit | Role in this audit |
|---|---|---|
| **A — audit base** | `6637841` | The exact latest committed frontend when the audit began. All 22 Figma comparisons, the full patient and doctor journeys, the button matrix, the regression suites and the defect register refer to this commit unless stated otherwise. |
| **B — post-audit HEAD** | `3df09cd` | Contains two commits created by the Antigravity agent *during* this audit: `6fb6c53` (application-wide back navigation) and `3df09cd` (patient-avatar vector alignment). Verified only for the delta (navigation, avatar parity, state-reset risk) in `evidence/head-3df09cd/`. |

Evidence for A is in `docs/final-audit/evidence/` (`implementation/`, `doctor/`, `states/`, `responsive/`, `interaction/`, `comparison/`, `figma/`, `figma-icons/`, `audit-run*.json`).
Evidence for B is in `docs/final-audit/evidence/head-3df09cd/`.

Where an item was fixed between A and B it is marked **FIXED AT HEAD** and excluded from the open-defect counts. Nothing was modified in either worktree's application source.

---

## 2. Overall assessment

**The application is a credible, well-engineered demo of the documented flow, and it is not yet a faithful reproduction of the owner's Figma file.**

The patient journey works end to end in mock mode: welcome, language toggle, consent (Yes/No), text intake, voice recording with the visible 30-second timer, transcript confirmation, draft review with per-field correction, submit, slot selection, booking, confirmation, report-only path, emergency trigger with plain 112 guidance, and consent decline. The doctor portal works: login, dashboard, report list with tabs and search, report detail with a real stored-answer reader, Mark Reviewed, appointments, urgent queue, logout. TypeScript, the production build, the mock unit suite (44 tests), the simulated Supabase contract suite (7 tests) and the interaction/visual suites all pass. Uptime of the whole journey was stable; no uncaught page exceptions occurred in any automated run.

Against the Figma file, the picture is more mixed. The dashboard, welcome screen, consent-declined screen and the conversation structure are close. **Booking, no-slots, slot-taken, the doctor reports list, the appointments table and the urgent queue are materially different from their Figma frames.** Two Figma screens (Processing, Mic denied) exist only as unreachable debug fixtures. Several visible controls are decorative rather than functional (the consent greeting "play" control, "Play question again", "Try another date"), and the booking confirmation in mock mode prints **"Invalid Date • Invalid Date"**. In Hindi, the emergency screen keeps Figma's English body copy, and the conversation screen leaks "Turn 0 of 15", "Type" and "Done" in English.

The most serious issues are not visual:

1. The doctor report detail states **"Warning flags: None"** for every report, including reports carrying `possible_urgent` / `needs_human_review`. (P0)
2. At HEAD, pressing **Back on the emergency screen returns the patient to routine intake and removes the 112 guidance.** (P1, borderline P0)
3. In mock/demo mode the **booking confirmation shows an invalid date and time**, caused by passing a slot id as `slot_start`. (P1)
4. When the daily session cap is reached, the app **silently drops into an unusable consent screen** whose buttons do nothing. (P1)
5. The Figma **Mic denied screen is not implemented**; a denied microphone leaves the patient on voice-only controls with no "Try microphone again". (P1)
6. **No pre-generated/cached audio exists**, the consent greeting never plays, and every question "Replay audio" is a live Timbre call. (P1)

**Readiness:** suitable for an internal end-to-end demonstration with a scripted operator; **not ready for owner acceptance sign-off or hosted deployment** until the must-fix list is complete.

**Open defects: P0 = 1 · P1 = 10 · P2 = 29 · P3 = 10 (50 total).**

---

## 3. Measured coverage (what was actually done)

| Dimension | Count | Notes |
|---|---|---|
| Figma pages inspected | 1 | Single page `Samvad HealthDesk AI — V2 Screens` (`0:1`) |
| Figma frames inspected and compared | **22 / 22** | Every top-level frame rendered at native size from Figma and compared with a running-app screenshot |
| Figma nodes in document | 937 | 364 frames, 413 text, 88 rounded-rectangles, 23 lines, 48 ellipses |
| Figma components / variants | **0** | The file contains no `COMPONENT`, `COMPONENT_SET` or `INSTANCE` nodes — it is a flat mockup file |
| Exported Figma SVG vectors compared | 16 | Mic, keyboard/type, done, back arrow, assistant avatar, patient avatar, waveform, welcome pencil, welcome calendar, edit pencil, send, and 5 doctor sidebar icons |
| React components inspected | 21 | 12 patient, 8 doctor, `App` |
| Library/config modules inspected | 13 | `api.ts`, `supabase.ts`, `audio/*` (2), `i18n/*` (3), `mock-adaptive-bank.ts`, the shared `types/*` (5) — see `SOURCE-FILE-INVENTORY.md` |
| Source files read in full | 30 | Enumerated in `SOURCE-FILE-INVENTORY.md` |
| Source files read in part / grepped | 14 | Enumerated in `SOURCE-FILE-INVENTORY.md` |
| Backend files inspected (separate worktree) | 7 | `contract.ts`, `validation.ts`, `conversation.ts`, `chat-turn/index.ts`, `speak/index.ts`, 4 migrations |
| Interactive controls in the button matrix | 72 | `BUTTON-ACTION-MATRIX.md` |
| Automated interaction probes executed | 39 | 28 at base + 11 delta at HEAD; `evidence/audit-run.json`, `evidence/head-3df09cd/delta-run.json` |
| Probes that failed | 9 (base) + 3 (HEAD) | All 12 are real product defects, not harness errors — see `TEST-RESULTS.md` |
| Browser viewports exercised | 7 | 360×800, 390×844, 430×932, 768×1024, 1024×768, 1280×820, 1440×900 |
| Evidence produced | 123 PNG + 16 SVG | 22 original-Figma renders, 76 running-app captures, 22 per-frame comparison sheets, 3 contact sheets, 16 exported Figma vectors |

**Visual parity summary (per-frame classification, not a pixel-diff percentage):**

| Verdict | Count | Frames |
|---|---|---|
| High-fidelity match (minor polish only) | **3** | P1 Welcome, P15 Consent declined, D2 Dashboard |
| Partial match (structure right, notable deviations) | **11** | P2 Consent, P3 Conversation, P4 Gender, P5 What we heard, P8 Review, P12 Booking confirmation, P13 Report sent, P14 Emergency, D1 Login, D4 Report detail, D5 Urgent detail |
| Material mismatch (different layout/content/flow) | **6** | P9 Booking, P10 No slots, P11 Slot taken, D3 Reports list, D6 Appointments, D7 Urgent / Review |
| Not implemented as a real screen | **2** | P6 Processing, P7 Mic denied |

I do not report a single "parity percentage": 22 static frames do not support a defensible numeric score, and a pixel-diff of a static mockup against a data-driven app would be misleading.

---

## 4. Major strengths

- **Security posture is genuinely good and is server-side.** Trust boundaries live in the backend: JWT-derived identity, RLS-scoped doctor reads, `SECURITY DEFINER` only for `book_appointment` / `mark_report_reviewed` / `get_doctor_appointments`, emergency sessions rejected on `submit_report` (`chat-turn/index.ts:888`), and duplicate bookings rejected by the RPC (`availability_and_booking.sql:158-167`). The frontend never writes to `sessions`/`messages`/`reports` directly — every mutation goes through `chat-turn`, and `api.ts` is the only module touching Supabase.
- **`api.ts` maps backend error codes to user-facing copy properly** (`ApiError` with `code`/`status`; 42501 → review hold, 23505 → slot taken, 22023 → not bookable, P0002 → not found, 28000 → unauthenticated). This is better than most demos.
- **Voice lifecycle is correct where it matters most:** recording starts only after `getUserMedia` succeeds, the timer is wall-clock based (not a decrementing counter, so pauses don't drift), it hard-stops at exactly 30 s, `stop()` is idempotent, tracks are released, and the recorded webm is re-encoded to 16 kHz mono WAV before upload because the backend rejects webm. 12 unit tests cover this and all pass.
- **The doctor conversation reader is real.** `getDoctorMessages` reads the `messages` table through RLS, shows `original_text` vs `final_text` separately, labels the input mode, and never fabricates assistant turns — matching the docs' "stored patient answers only" rule, and deliberately diverging from the static Figma "Show full conversation" mock because the assistant text is not stored.
- **The emergency matcher is bilingual and is negation-aware** (English + Devanagari patterns, `isNegated` guard), and the 112 number is rendered as plain selectable text with no `tel:` link — exactly as the demo-safety docs require.
- **Deterministic fixtures and explicit test hooks** made the app testable across the whole flow; the trade-off is discussed as a defect below.
- **The design tokens match the Figma palette closely** (`#1f2a44`, `#1d2433`, `#4a5470`, `#dde3ee`, 9px blur, 0.55 white cards) and the mic glyph, waveform, and back-arrow are literal Figma vector matches.

---

## 5. Critical defects (must be fixed before integration)

Full detail and line references are in `DEFECT-REGISTER.md`.

| ID | Sev | Defect |
|---|---|---|
| D-01 | **P0** | Doctor report detail hardcodes **"Warning flags: None"** for every report, including `possible_urgent` / `needs_human_review` reports. |
| D-02 | **P1** | At HEAD, **Back on the emergency screen** restores the routine conversation and hides the 112 guidance; the next answer then fails with a session error. |
| D-03 | **P1** | Mock-mode **booking confirmation shows "Invalid Date • Invalid Date"** (`slot_start` is sent as the slot id). |
| D-04 | **P1** | `start_session` `demo_busy` is ignored: the patient lands on Consent with an empty session id and **both consent buttons silently do nothing**. |
| D-05 | **P1** | The Figma **Mic denied** screen is not implemented; a denied microphone gives an inline banner, no text-mode switch, no retry. |
| D-06 | **P1** | **No cached audio and no automatic greeting**; the consent "play" control is a 2.5 s fake and every replay is a live Timbre call. |
| D-07 | **P1** | **Hindi emergency guidance** shows the English body copy (title/112 are translated, paragraph is not). |
| D-08 | **P1** | **Fixture data is embedded in production components** and can override real patient data (e.g. a real report's AI summary is replaced by another patient's fixture summary when the fixture key is set); fixture mode also auto-opens the doctor portal without credentials. |
| D-10 | **P1** | At HEAD, **Back from "Appointment confirmed"** re-opens a fully bookable slot grid; a second booking attempt fails server-side with a misleading "That slot was just taken" message. |
| D-11 | **P1** | At HEAD, **Back from Conversation to Consent and agreeing again restarts the question pointer** (Turn 1 → Turn 0 in mock mode; `invalid_state` against the real backend). |
| D-12 | **P1** | The patient **"other symptoms" field cannot be corrected** on the review screen although the backend allow-lists it. |

---

## 6. Readiness assessment

| Gate | Verdict | Rationale |
|---|---|---|
| Internal scripted demo (mock mode) | **Conditional pass** | Full journey works; avoid the no-slots path and the booking confirmation date, or fix D-03 first. |
| Owner acceptance / visual sign-off | **Fail** | 6 of 22 frames materially mismatched, 2 not implemented, avatars/icons still approximate. |
| Frontend↔backend integration | **Conditional** | Static contract review found the wire shapes compatible; live integration was **not** executed (no local Supabase stack, no hosted access). |
| Hosted deployment | **Fail** | P0 + 10 P1 defects open; also no cached audio assets and Hindi copy gaps. |
| Security review | **Pass with notes** | Server-side protections verified by reading migrations/functions; frontend fixture bypass and the fail-open `canReview` default should be removed. |

---

## 7. What was not verified (explicit limitations)

- **No live provider calls.** Prisma, Timbre and Groq were not contacted (no keys used, no hosted access). Voice transcription in this audit is the deterministic mock transcript; "Modify" / "Try microphone again" behaviour against the real provider is untested.
- **No hosted Supabase or Vercel access.** All Supabase-mode behaviour is verified by reading the backend source and by the repository's *simulated* contract suite, not by a real round trip.
- **`npm run test:api` could not run** — it requires a local Supabase stack (`tests/api/harness.ts:92`); 3 suites failed to load for that reason, not because of product failures.
- **RLS enforcement, JWT expiry, and doctor-account provisioning** were not exercised. `smoke`/`api:browser` suites need a local stack and were not run.
- **Real mobile devices / Safari / Firefox** were not used; all browser evidence is headless Chrome at emulated viewports.
- **The 15-turn cap UI** could not be reached in mock mode (the mock completes in at most 13 turns), so the incomplete-at-cap preview is verified only by unit tests and code reading.
- **Accessibility** was checked for keyboard reachability, focus visibility, touch-target size and contrast by inspection — no screen-reader (NVDA/VoiceOver) run and no automated axe scan.

---

## 8. Constraints respected

No production source file in either worktree was modified. No branch was merged, pushed or deployed. No secret, credential or hosted service was accessed. Only audit documentation, captured screenshots and audit-only scripts were added, on `audit/final-ui-logic-figma-review` only.

Continue with `DEFECT-REGISTER.md` for the actionable list, and `RECOMMENDED-CORRECTIONS.md` for sequencing.
