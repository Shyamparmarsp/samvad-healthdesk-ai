# Source File Inventory and Review Coverage

Base: commit `6637841` (audit worktree). File list from `git ls-files` — **202 tracked files** (36 under `src/`, 19 under `tests/`, 126 under `docs/`, 8 config files, 13 root documents/assets).

Coverage legend:
- **Full** — read line by line and reasoned about.
- **Part** — read the relevant sections / grepped the specific behaviour; not read end to end.
- **Classified** — identified, purpose known, intentionally not reviewed (generated, binary, or out of scope), with the reason given.

## 1. Classification of the repository

| # | Category | Files | Examples |
|---|---|---|---|
| 1 | Patient frontend | 12 | `src/features/patient/*` |
| 2 | Doctor frontend | 8 | `src/features/doctor/*` |
| 3 | Shared UI components | 1 | `PatientHeader.tsx` (no shared component library at base) |
| 4 | Navigation / routing | 3 | `App.tsx`, `main.tsx`, `vercel.json` |
| 5 | State management | 2 | `PatientShell.tsx`, `DoctorShell.tsx` (local React state; no store library) |
| 6 | API / Supabase integration | 3 | `lib/api.ts` (2 221 lines), `lib/supabase.ts`, `lib/mock-adaptive-bank.ts` |
| 7 | Audio recording / speech | 2 | `lib/audio/index.ts`, `lib/audio/voice.ts` |
| 8 | Backend Edge Functions | 0 in this repo | lives in the backend worktree (`../samvad-backend/supabase/functions/*`) |
| 9 | DB schema / migrations | 0 in this repo | lives in the backend worktree |
| 10 | Authentication / authorisation | 2 | `lib/supabase.ts`, `lib/api.ts` (doctor login / session) |
| 11 | Configuration / environment | 8 | `vite.config.ts`, `tsconfig*.json`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `.env.example`, `package.json` |
| 12 | Automated tests | 19 | `tests/*.test.ts`, `tests/api/*`, `tests/verify-interactions.mjs`, `tests/visual-qa.mjs` |
| 13 | Design assets / icons | 0 | **no `public/` directory**; every icon is inline SVG |
| 14 | Documentation / scripts | 139 | `docs/**` (126), `scripts/*.mjs` (3), root docs (7), `AGENTS.md` |

Binary assets (101 PNGs under `docs/design`, `docs/design-parity`, `docs/screenshots`) were inspected only as *secondary* evidence and are not treated as the Figma source of truth.

## 2. Production source — review coverage

| File | Lines | Purpose | Coverage | Notes |
|---|---|---|---|---|
| `src/App.tsx` | 60 | Routes, i18n, 404 | **Full** | Hidden focusable nav links (D-24) |
| `src/main.tsx` | 10 | React root | **Full** | — |
| `src/index.css` | 83 | Tokens, frosted/glow utilities, focus ring, wave animations | **Full** | Focus ring defined globally |
| `src/features/patient/PatientShell.tsx` | 699 | Patient state machine, API orchestration, fixtures | **Full** | 68-line fixture block `64-131`; `146-278` session/resume fixtures |
| `src/features/patient/PatientHeader.tsx` | 87 | Brand + language + progress | **Full** | `onBack` exists but unused at base |
| `src/features/patient/WelcomeView.tsx` | 109 | Welcome | **Full** | Fixed 390×844 |
| `src/features/patient/ConsentView.tsx` | 100 | Consent | **Full** | Fake audio control `15-20`, `53-63` |
| `src/features/patient/ConsentDeclinedView.tsx` | 48 | Decline confirmation | **Full** | Hardcoded English `23-36` |
| `src/features/patient/ConversationView.tsx` | 790 | Chat, chips, recorder, fixtures | **Full** | Fixture branches `145-243`; recorder `267-407` |
| `src/features/patient/WhatWeHeardView.tsx` | 97 | Transcript confirmation | **Full** | Play-again wired to `onCancel` `79-87` |
| `src/features/patient/ReportReviewView.tsx` | 364 | Draft review/correction | **Full** | 9 rows, no `other_symptoms`; text "Edit" buttons |
| `src/features/patient/BookingView.tsx` | 331 | Slot selection | **Full** | Dead "Try another date" `304`; swallowed errors `82-86` |
| `src/features/patient/ConfirmationView.tsx` | 114 | Booking / report-only success | **Full** | Hardcoded English `42-44`, `102` |
| `src/features/patient/EmergencyView.tsx` | 54 | 112 guidance | **Full** | English body `25-27` |
| `src/features/patient/SessionEndedView.tsx` | 67 | Private end | **Full** | Hardcoded English `30-44` |
| `src/features/doctor/DoctorShell.tsx` | 365 | Doctor state machine, sidebar, fixtures | **Full** | Fixture auto-login `73-96`; errors swallowed `107-118` |
| `src/features/doctor/DoctorLogin.tsx` | 186 | Login | **Full** | No eye toggle; no return nav at base |
| `src/features/doctor/DoctorDashboardView.tsx` | 520 | Dashboard + `FIGMA_REFERENCE_REPORTS` | **Full** | 257 lines of fixtures `14-270` |
| `src/features/doctor/DoctorReportsList.tsx` | 236 | Tabbed table + search | **Full** | Filter logic `11-34` |
| `src/features/doctor/DoctorReportDetail.tsx` | 459 | Report detail, reader, Mark Reviewed | **Full** | Warning flags `275-282`; hardcoded summary `320-323`; "Dr. Aditi Rao" `442` |
| `src/features/doctor/DoctorUrgentDetail.tsx` | 234 | Urgent detail | **Full** | Fail-open `canReview` `33`; hardcoded routing `167-179` |
| `src/features/doctor/DoctorUrgentList.tsx` | 134 | Urgent queue | **Full** | — |
| `src/features/doctor/DoctorAppointmentsView.tsx` | 170 | Appointments table | **Full** | Header/cell mismatch `95-137` |
| `src/lib/api.ts` | 2 221 | Mock backend + Supabase client adapter | **Full** | Largest risk surface; see `LOGIC-AND-INTEGRATION-AUDIT.md` |
| `src/lib/supabase.ts` | 60 | Single client factory | **Full** | `VITE_SUPABASE_KEY` only |
| `src/lib/audio/index.ts` | 187 | `MediaRecorder` wrapper | **Full** | Stops exactly once; track cleanup |
| `src/lib/audio/voice.ts` | 178 | webm → 16 kHz WAV, synthetic fallback | **Full** | Synthetic tone fallback is intentional |
| `src/lib/mock-adaptive-bank.ts` | 200+ | 17-question representative bank | **Part** | Read the header and question shapes; did not audit bank clinical content (backend owns the real bank) |
| `src/i18n/en.ts` | 126 | English strings | **Full** | — |
| `src/i18n/hi.ts` | 132 | Hindi strings | **Full** | Several keys exist that the UI never uses (e.g. `emergency.guidance`) |
| `src/i18n/index.tsx` | 33 | Provider | **Full** | Not persisted |
| `src/types/api.ts` | 183 | Wire types | **Full** | Mirrors backend `contract.ts` |
| `src/types/report.ts` | 167 | Report v1.2 types | **Full** | Include `other_symptoms` |
| `src/types/doctor.ts` | 52 | Doctor/appointment types | **Full** | `Appointment` has no age/gender/concern |
| `src/types/consent.ts` | 20 | Versioned consent copy | **Full** | Differs from Figma bubble copy |
| `src/types/index.ts` | 4 | Barrel | **Full** | — |

## 3. Configuration and environment

| File | Coverage | Notes |
|---|---|---|
| `vite.config.ts` | **Full** | Manual vendor chunk for supabase; no proxy |
| `tsconfig.json`, `tsconfig.node.json` | **Full** | `strict` enabled |
| `tailwind.config.js` | **Full** | Tokens match the Figma palette; `minHeight.btn-touch: 48px` is defined but rarely used |
| `postcss.config.js` | Classified | Standard tailwind/autoprefixer |
| `index.html` | **Full** | Google Fonts link for Plus Jakarta Sans + Noto Sans Devanagari (fonts *are* loaded) |
| `vercel.json` | **Full** | SPA rewrite to `/index.html` (covers `/doctor` refresh) |
| `.env.example` | **Full** | Names/placeholders only — no secrets |
| `package.json` | **Full** | Scripts map; no Playwright dependency (tests drive Chrome over CDP) |
| `.gitignore` | **Full** | `.env*`, `dist`, local Supabase state excluded |

## 4. Tests — coverage as evidence

| File | Coverage | Why |
|---|---|---|
| `tests/patient-flow.test.ts` | **Part** | Read the journey titles and the cap/emergency assertions; used as evidence for flows I could not reach in the browser |
| `tests/recording-lifecycle.test.ts` | **Part** | Read cases 1-12 |
| `tests/contract-regression.test.ts` | Classified | Exists in the suite; not individually reviewed |
| `tests/doctor-flow.test.ts` | Classified | not individually reviewed |
| `tests/browser-speech-playback.test.ts` | Classified | not individually reviewed |
| `tests/supabase-mode.test.ts` | **Part** | Read the RPC-wiring cases |
| `tests/local-supabase-journey.test.ts` | **Part** | Confirmed it is an **in-memory harness**, not a real Supabase |
| `tests/api/*` (10 files) | Classified | Cannot execute without a local stack; `harness.ts:92` read for the failure reason |
| `tests/verify-interactions.mjs` | **Part** | Read the CDP driver and the claimed checks |
| `tests/visual-qa.mjs` | **Part** | Read the overflow assertion that produces the false "zero overflow" claim |
| `scripts/generate-*.mjs` | Classified | Previously generated parity evidence; explicitly not used as proof (Phase 13 rule 4) |

## 5. Backend files inspected (separate worktree `../samvad-backend`, read-only)

| File | Coverage | Purpose |
|---|---|---|
| `supabase/functions/_shared/contract.ts` | **Full** | Wire contract mirror; compared field-by-field with `src/types/api.ts` |
| `supabase/functions/_shared/validation.ts` | **Part** | Allowed keys/actions for the six actions |
| `supabase/functions/_shared/conversation.ts` | **Part** | `canAcceptAnswer` (turn cap + allowed statuses) |
| `supabase/functions/chat-turn/index.ts` | **Part** | `demo_busy` at `start_session:444-456`; `submit_report` emergency guard `888`; `record_consent` state guard `548` |
| `supabase/functions/speak/index.ts` | **Part** | Request validation and `{text}` fallback |
| `supabase/migrations/20261102130000_availability_and_booking.sql` | **Part** | RPC signatures, hold/eligibility rules, idempotency, unique violation |
| `supabase/migrations/20261102120000_mark_report_reviewed.sql` | **Part** | Signature and ownership check |
| `supabase/migrations/20261102160000_doctor_appointment_reads.sql` | **Part** | Returned columns compared with `api.ts` mapping |
| `supabase/migrations/20261101120100_reference_tables.sql` | **Part** | `doctor_profiles(user_id, doctor_id)` |

## 6. Deliberate exclusions

| Excluded | Reason |
|---|---|
| `docs/design-parity/*.png` (43 files), `docs/design/*.png` (23), `docs/screenshots/*.png` (22) | Previously generated comparison artefacts. Phase 13 rule 4 forbids using them as proof of parity; the audit regenerated its own evidence from the original Figma file. |
| `docs/design-parity/*.pdf` | Generated report |
| `node_modules/`, `dist/`, `.audit-venv`, CDP temp profiles | Dependencies / build output / tooling |
| `supabase/` | Does not exist in the frontend repo (single repository rule puts it on the backend branch) |
| `docs/hindi-ui-review.csv` | Owner review artefact; not a UI surface |
| 13 root policy documents (`AGENTS.md`, `MILESTONES.md`, `HUMAN_ROADMAP.md`, …) | Read selectively where they define a UI contract (report design, emergency rules, seed data, failure modes, architecture decisions) |

## 7. Honesty statement

30 files were read in full, 14 in part, and the remainder classified. No claim of "every file reviewed" is made. The file count (202) is a repository inventory, not a review count.
