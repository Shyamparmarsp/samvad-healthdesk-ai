# Test Results

Environment: macOS (darwin), Node.js v26.12.0, `npm` workspace `samvad-final-audit`, Google Chrome 141 (headless, CDP). Date: 2 November 2026. All commands run from the audit worktree root.

## 1. Repository suites

| # | Command | Result | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|---|---|
| 1 | `npx tsc --noEmit` | **PASS** | — | 0 | 0 | `strict` mode, no output |
| 2 | `npm run build:mock` | **PASS** | — | 0 | 0 | 105 modules; `dist/index.html` 0.87 kB, CSS 37.33 kB, DoctorShell chunk 63.07 kB, vendor-supabase 227.08 kB, index 314.27 kB |
| 3 | `npm run build` | **PASS** | — | 0 | 0 | Production build with env vars injected at build time (empty → mock mode) |
| 4 | `npm run test:mock` | **PASS** | **44** | 0 | 0 | 5 suites: contract regression, patient flow (11 journeys), doctor flow, browser speech/playback, recording lifecycle (12 cases) |
| 5 | `npm run test:supabase` | **PASS** | **7** | 0 | 0 | **Simulated** — `local-supabase-journey.test.ts` is an in-memory harness (`tests/local-supabase-journey.test.ts:26-40`). This is a contract test, **not** a real Supabase round trip. |
| 6 | `npm run test:api` | **BLOCKED BY ENVIRONMENT** | 0 | 3 (load) | 0 | Every file throws before running: `Error: Local Supabase configuration is missing` (`tests/api/harness.ts:92`). No local Supabase stack / Docker was available and hosted access is out of scope. This is an environment limitation, **not** a product failure. |
| 7 | `npm run test:e2e` | **PASS** | 16/16 checks | 0 | 0 | `tests/verify-interactions.mjs` over CDP; see §3 for the caveat about its claims |
| 8 | `npm run test:visual` | **PASS** | 7/7 viewports | 0 | 0 | Captures 7 viewports and asserts "zero overflow" — see §3, that assertion is a false negative |

Command output for 1-8 is reproducible from the worktree; the key lines are quoted in §3.

## 2. Audit-specific browser probes (beyond the repository suites)

Executed by `docs/final-audit/scripts/audit-capture.mjs` (28 probes), `audit-capture-voice.mjs`, `audit-capture-state.mjs`, `measure-clipping-json.mjs`, and `audit-capture-head.mjs` (11 probes against the post-audit HEAD):

```
AUDIT_APP_ROOT=../samvad-final-audit-head node docs/final-audit/scripts/audit-capture-head.mjs
``` Raw results: `evidence/audit-run.json`, `evidence/audit-run-voice.json`, `evidence/audit-run-state.json`, `evidence/head-3df09cd/delta-run.json`.

### Base commit `6637841` — 28 probes, 19 pass / 9 fail

| Probe | Expected | Result | Verdict |
|---|---|---|---|
| CONSENT-AUDIO-01 | Greeting audio plays | `media.play()` calls = 0, `<audio>` = 0, label toggles to "Playing..." | **FAIL** (D-06) |
| CONSENT-DECLINE-01 | Decline shows the no-data screen | shown | PASS |
| MIC-DENIED-01 | Figma MicDenied screen | absent; inline banner only; no retry | **FAIL** (D-05) |
| REC-TIMER-01 | Timer advances | `00:00` → `00:02` over ~2 s | PASS |
| REC-AUTOSTOP-01 | Stops at 30 s and hands off | transcript screen shown | PASS |
| REC-REUSE-01 | Mic usable again | `disabled=false` | PASS |
| REVIEW-EDIT-01 | Field editor opens | modal + overlay + prefilled "Aarav Sharma" | PASS |
| BOOK-01 | Booking creates a confirmation | confirmation + reference shown | PASS |
| BOOK-NOTNOW-01 | Report-only confirmation | shown | PASS |
| BOOK-TRYANOTHER-01 | Loads another date | **screen unchanged** | **FAIL** (D-13) |
| EMERGENCY-01 | Chest-pain phrase → 112 | guidance + 112, no slots | PASS |
| EMERGENCY-HI-01 | Hindi guidance | title Hindi, 112 shown, **body English** | **FAIL** (D-07) |
| HEARD-REPLAY-01 | Replays audio | 0 play calls, navigates away | **FAIL** (D-19) |
| LOGIN-EYE-01 | Password reveal | 0 buttons | **FAIL** (D-27) |
| LOGIN-BACK-01 | Return to patient side | invisible link only | PASS-with-caveat (D-24) |
| LOGIN-INVALID-01 | Error on bad credentials | "Invalid credentials" | PASS |
| LOGIN-VALID-01 | Dashboard after login | shown | PASS |
| REPORTS-TABS-01 | Tabs filter | All 2 / Urgent 1 / Booked 0 / Not booked 1 | PASS |
| REPORTS-SEARCH-01 | Search filters | "Rohan" → 1 row | PASS |
| DETAIL-WARNFLAGS-01 | Flags shown for a flagged report | **"Warning flags: None"** | **FAIL** (D-01) |
| DETAIL-CONV-01 | Reader expands | disclosure works | PASS |
| DETAIL-REVIEW-01 | Mark Reviewed writes state | Reviewed shown | PASS |
| APPT-COLUMNS-01 | Headers match cells | Age/Gender cell = "General Medicine" | **FAIL** (D-18) |
| URGENT-REVIEW-AUTH-01 | GM read-only | read-only shown | PASS |
| AUTH-01 | Nav + logout | dashboard reachable, login after logout | PASS |
| NAV-DOCTOR-BACK-01 | Detail back from direct URL | returns to list | PASS |
| NAV-BACK-MATRIX-01 | Back on every non-home screen | `{welcome:0, consent:0, conversation:0, review:0, booking:0, confirm:0, emergency:0, heard:1}` | **FAIL** (fixed at HEAD) |
| A11Y-FOCUS-01 | Keyboard focus visible | outline solid, but first stops are the invisible links | PASS-with-caveat (D-24) |

Additional measurements captured (not pass/fail): responsive layout at 7 viewports (`measurements.welcome-*`), touch targets under 44×44 (12 on the review screen: language segments 57×30, nine "Edit" buttons 39×24, "Don't submit" h=40), and the shell metrics that prove the fixed-width clipping (`shell 390×844` at 360/390/430/768/1024/1280/1440).

### HEAD `3df09cd` — 11 checks, 8 pass / 3 fail

| Check | Result | Verdict |
|---|---|---|
| BACK-P2 consent present + destination | 36×36 "Go back" → Welcome | PASS |
| BACK-P3 conversation present + destination | 36×36 at 14,105 → Consent | PASS |
| BACK-P3 state | Turn 1 → **Turn 0** after re-consent | **FAIL** (D-11) |
| BACK-P8 review destination | returns to the conversation | PASS |
| BACK-P9 booking destination | returns to review (labelled "Draft preview") | PASS with note (D-37) |
| BACK-P12 confirmed booking | **bookable grid returns** | **FAIL** (D-10) |
| BACK-P14 emergency present | 36×36 present | PASS |
| BACK-P14 emergency state | **routine intake restored, 112 gone** | **FAIL** (D-02) |
| BACK-D1 login | visible "Back to Patient Intake" | PASS |
| Doctor back buttons (5 screens) | present with correct labels/destinations | PASS |
| Conversation avatar snapshot | redrawn person glyph (container still present) | PASS with note (D-44) |

## 3. Caveats about the repository suites

These are important because passing suites are often used as proof of completion.

1. **`test:visual` asserts the wrong thing.** It checks `document.documentElement.scrollWidth > window.innerWidth`. The patient shell is a 390 px flex child inside a centring container with `overflow-hidden`, so the *document* never overflows even when the shell is clipped. Measured truth: at a 360 px viewport the shell is **390 px wide at x = −15**, i.e. 15 px cut off on each side (`evidence/clipping.json`; shell 390 px at x = −15 with 15 px clipped on each side at a 360 px viewport; see `responsive/welcome-360x800.png`). The suite's "100% responsive compliance, zero overflow across all 7 viewports" claim is therefore a false negative.
2. **`test:e2e` claims "0 dead links" and "100% Devanagari copy".** Both are contradicted by this audit: "Try another date" is a no-op button (not an `<a>`, so the check skips it), and the Hindi emergency body is English. The interaction inventory audits a small fixed list (6 controls).
3. **`test:supabase` is a simulation.** It exercises `api.ts` against an in-memory class that "faithfully simulates" the schema/RLS/RPCs. It proves the client shapes the calls correctly; it does **not** prove RLS, JWT handling, or the SQL.
4. **No suite exercises** the daily cap start path, the mic-denied screen, the consent audio, "Play question again", the no-slots CTA, the booking confirmation date, the warning-flag section, the appointments column mapping, or back-navigation state resets. All of those were found by this audit and are covered by the probe tables above.

## 4. Tests not run

| Suite / check | Reason |
|---|---|
| `npm run test:api` (3 files) | Requires a local Supabase stack (not available) |
| `npm run test:api:browser`, `api:browser:extras` | Require a local stack + service key |
| `npm run test:supabase` against a real stack | Same |
| Live Prisma / Timbre / Groq smoke tests | No provider keys; out of scope by instruction |
| Screen-reader pass (VoiceOver/NVDA) | Not available in this environment |
| Automated axe/contrast scan | Not installed in the project; contrast judged by inspection |
| Physical iOS/Android devices, Safari, Firefox | Not available |
| 15-turn cap, ambiguous emergency, booking race, RLS/JWT expiry | Not reachable without the real backend |

## 5. What the results support

- The build is healthy: no TypeScript errors, no uncaught page exceptions in any run, no uncaught page exceptions in any run (the single logged error is the deliberate `NotAllowedError` from the mic-denial probe).
- The **happy-path patient journey and the doctor read/review journey work** in mock mode.
- The nine failing base probes and three failing HEAD checks are **reproducible product defects**, each with a screenshot and a code reference in `DEFECT-REGISTER.md`.
- No claim of end-to-end integration, provider verification, or full interaction coverage is made.
