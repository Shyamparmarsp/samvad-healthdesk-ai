# Recommended Corrections — Priority List

Each defect appears in **exactly one** category. Effort is a rough engineering estimate (S ≤ 1 h, M ≤ half a day, L > half a day) and assumes no backend change unless stated.

Sequencing rationale: correctness and safety first (so the integration is not hardened around broken behaviour), then deployment hygiene, then visual parity (which is reversible and can be reviewed screen by screen), then polish.

---

## 1. Must fix before integration (16 defects)

These affect correctness, safety, data truthfulness or test isolation. Integrating before fixing them risks the backend work being validated against wrong UI behaviour.

| Order | ID | Sev | Fix | Effort |
|---|---|---|---|---|
| 1 | D-01 | P0 | Render real warning flags in the doctor detail instead of the hardcoded "None". | S |
| 2 | D-08 | P1 | Delete or `import.meta.env.DEV`-gate every fixture/sessionStorage override, and never let a fixture value override data read from the report. Remove the credential-free doctor auto-open. Fix the fixture dashboard/list mismatch (D-17) at the same time. | M |
| 3 | D-02 | P1 | Make `emergency` (and `session_ended`, `consent_declined`) terminal for back navigation. | S |
| 4 | D-10 | P1 | Make `confirmed_booking` / `confirmed_report_only` terminal, or return to a read-only summary. Map "report already has an appointment" (23505) to its own message. | S |
| 5 | D-11 | P1 | Do not re-issue `record_consent` when going back; restore the previous `chatState` from history. Treat `invalid_state` from `record_consent` as "already consented". | M |
| 6 | D-03 | P1 | Send the real `slot_start` (ISO) with the slot id; add a date-formatting guard. | S |
| 7 | D-04 | P1 | Handle `demo_busy` at session creation and disable the consent actions when `sessionId` is empty. | S |
| 8 | D-14 | P2 | Map all six `InfoStatus` values to their own labels on the patient review and the doctor detail. | M |
| 9 | D-15 | P2 | Render `report.missing_information` with humanised labels instead of recomputing. | S |
| 10 | D-18 | P2 | Fix the appointments table so headers match cells (join age/gender/concern from the report, or relabel). | M (may need one backend read change) |
| 11 | D-12 | P1 | Add the "Other symptoms" correction row. | S |
| 12 | D-05 | P1 | Turn the mic-denied fixture into a real state with text fallback + retry + back. | M |
| 13 | D-07 | P1 | Use `t.emergency.guidance` for the emergency body. | S |
| 14 | D-39 | P2 | Add an explicit terminal state when the backend returns an incomplete session with no next question. | S |
| 15 | D-24 | P2 | Remove the invisible focusable nav links from `App.tsx`. | S |
| 16 | D-25 | P2 | Add loading/error/retry to doctor data loading; stop swallowing errors. | M |

**Integration gate:** after 1-16, re-run `test:mock`, `test:e2e`, `tsc`, `build`, and this audit's probe script. Then run the real local-Supabase `test:api` suite (currently blocked) before merging.

---

## 2. Must fix before hosted deployment (10 defects)

These would be visible or costly to an evaluator using a hosted link.

| Order | ID | Sev | Fix | Effort |
|---|---|---|---|---|
| 1 | D-06 | P1 | Add the cached greeting and the four cached fixed prompts; play them on entry; only call `speak` for adaptive prompts; delete or wire the fake consent control. | M |
| 2 | D-13 | P2 | Implement "Try another date" (advance to the next date with availability). | S |
| 3 | D-26 | P2 | Move all hardcoded patient-facing English into `src/i18n` (the list is in the register). | M |
| 4 | D-21 | P2 | Format slot times and date keys in Asia/Kolkata explicitly. | S |
| 5 | D-22 | P2 | Distinguish a slot-load error from an empty result and add retry. | S |
| 6 | D-28 | P3 | Disable Submit/Book while a request is in flight. | S |
| 7 | D-38 | P3 | Persist the language choice. | S |
| 8 | D-23 | P2 | Show a "could not restore session" message in mock mode; document that mock mode is not reload-safe. | S |
| 9 | D-41 | P3 | Await the transcript submission before navigating. | S |
| 10 | D-40 | P3 | Remove the silent 1.2 s microphone re-capture in the string fallback path. | S |

**Deployment gate:** production build inspected for secrets, `.env` excluded, `public/audio` present, and a full scripted run at 360/390/1280 with Hindi enabled.

---

## 3. Should fix before owner acceptance (21 defects)

Visual parity and the two decisions the owner must take. These are the items that determine whether the app "matches the Figma design".

### 3a. Owner decisions needed first (block the work below)

| ID | Decision |
|---|---|
| D-30 | Urgent-report review authority: does the General Medicine demo doctor get "Mark Reviewed" (Figma D5) or read-only (current UI + demo-emergency-rules §)? Pick one and apply it to the UI **and** `mark_report_reviewed`. |
| D-34 | Consent bubble copy: keep the formal versioned consent text (current) or show the Figma greeting above it? |
| D-17/RD-15 | Should the Urgent queue include `needs_human_review` reports (Figma D7 shows one)? |
| — | Is search on the Reports list wanted, given Figma D3 has none? |

### 3b. Screen rebuilds (largest visual gaps)

| Order | ID | Screen | Fix | Effort |
|---|---|---|---|---|
| 1 | D-16 | P9 Booking | 3 dates + "More dates", paginated slots, time in the CTA + calendar icon, drop the doctor card | L |
| 2 | D-47 | D3 Reports list | Convert the table to the Figma list row layout | M |
| 3 | D-48 | P10/P11 | Dedicated no-slots and slot-taken screens | M |
| 4 | D-31 | P8 Review | 3-column rows (label/value/pencil), frosted "Don't submit", remove the draft badge | M |
| 5 | D-49 | P12/P13 | Centred reference lines, 92 px check circle, add the "report sent to Dr X" note | S |
| 6 | D-09 | P6 Processing | Real processing screen driven by `isProcessing` | S |
| 7 | D-50 | P3 severity chips | Selection-driven styling | S |

### 3c. Icon and asset parity (owner-flagged)

| Order | ID | Fix | Effort |
|---|---|---|---|
| 8 | D-43 | Assistant avatar: paste the Figma robot path, remove the container | S |
| 9 | D-44 | Patient avatar: paste the Figma person path, remove the container | S |
| — | (register I-04, I-10, I-11, I-13, I-12) | Replace the keyboard/pencil/calendar icons with the exported vectors and restore the send paper-plane and edit pencils | M |

### 3d. Behavioural parity

| Order | ID | Fix | Effort |
|---|---|---|---|
| 10 | D-19 | Wire "Play question again" to the replay handler | S |
| 11 | D-20 | Add the "More dates" control | S |
| 12 | D-29 | Preserve reports search/tab state | S |
| 13 | D-32 | Show the real reviewer name | S (needs `reviewed_by` → name) |
| 14 | D-33 | Derive the source chip from the report | S |
| 15 | D-35 | Replace hardcoded urgent-detail routing/missing-info/appointment | S |
| 16 | D-37 | Read-only summary when returning from booking after submit | S |
| 17 | D-27 | Password visibility toggle | S |
| 18 | D-42 | Default the Appointments tab to Upcoming | S |

---

## 4. Optional future polish (3 defects)

| ID | Fix | Why optional |
|---|---|---|
| D-36 | Make `canReview` deny by default when `currentDoctor` is missing | Unreachable today (the shell always passes the doctor); worth doing as defensive hygiene |
| D-45 | Match the brand plus glyph metrics | Cosmetic |
| D-46 | Capitalise the gender value in doctor views | Cosmetic |

---

## 5. Verification checklist after fixes

1. `npx tsc --noEmit`, `npm run build`, `npm run test:mock`, `npm run test:e2e`, `npm run test:visual`.
2. Re-run `node docs/final-audit/scripts/audit-capture.mjs` — the 9 currently failing probes must pass (expect `CONSENT-AUDIO-01`, `MIC-DENIED-01`, `BOOK-TRYANOTHER-01`, `EMERGENCY-HI-01`, `HEARD-REPLAY-01`, `LOGIN-EYE-01`, `DETAIL-WARNFLAGS-01`, `APPT-COLUMNS-01`, `NAV-BACK-MATRIX-01`).
3. Re-run the HEAD delta script — the 3 failing checks (`BACK-P3 state`, `BACK-P12 confirmed booking`, `BACK-P14 emergency state`) must pass.
4. Confirm at 360 px that the shell no longer clips (or that the layout is genuinely responsive).
5. Confirm the Hindi run shows no English on any patient screen.
6. Confirm `public/audio/` assets exist and that the greeting plays without a network call to `speak`.
7. Confirm no `FIGMA_*` sessionStorage key has any effect in a production build.
8. Only then run the real local-Supabase API suite and a hosted smoke pass.

## 6. What not to change

- Do not weaken the server-side protections to make the UI simpler: `submit_report`'s emergency guard, the booking-hold checks, one-appointment-per-report enforcement, RLS, and the RPC grants are all correct.
- Do not replace the doctor conversation reader with Figma's fabricated "AI/Patient" lines — the docs forbid inventing assistant text.
- Do not remove the 30-turn timer, the transcript-confirmation step, the negation-aware emergency matcher, or the plain-text 112 display.
