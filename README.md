# Samvad HealthDesk AI — Educational Demo
# Samvad HealthDesk AI — AI-Powered Patient Intake & Smart Referral

AI-powered pre-visit patient intake and smart referral demonstration.
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646cff.svg)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.x-38b2ac.svg)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%7C%20Postgres%20%7C%20Edge%20Functions-3ecf8e.svg)](https://supabase.com/)

## Stack
**Samvad HealthDesk AI** is an educational demonstration of a bilingual (English / Hindi), voice-first and text-accessible pre-visit hospital intake and clinical referral system.

- React + Vite + TypeScript + Tailwind
- Supabase Auth, PostgreSQL, RLS and Edge Functions
- Gnani Prisma for speech-to-text
- Gnani Timbre for text-to-speech
- Groq for constrained reasoning and structured extraction
- Vercel for the frontend
It bridges the pre-registration gap by gathering structured patient history, adapting follow-up clarifications, synthesizing clinical summaries for physicians, and facilitating atomic appointment booking—while strictly enforcing non-diagnostic boundaries and deterministic emergency triaging.

## Scope
> [!IMPORTANT]
> **Educational Demonstration Only.** This software is an educational prototype and technology demonstration. It uses synthetic patient records and fictional doctor profiles only. It **never diagnoses illnesses, calculates disease probabilities, prescribes medications, or suggests treatments**. All emergency presentations route to plain-text 112 guidance with permanent outpatient slot suppression.

Welcome and consent → voice/text intake → structured report → patient review and submit → doctor dashboard → optional patient-confirmed booking. Emergency demo rules use a separate 112 guidance path. The patient interface is Hindi/English; the doctor interface is English. This is not a clinical product; synthetic data only.
---

One website: patients use `/`, doctors log in at `/doctor`.
## Architecture & System Flow

See `AGENTS.md` for workspace rules and `docs/` for report, demo safety, seed data, failure behaviour and design exports.
```
                                      +------------------------------------+
                                      |         Patient Interface          |
                                      |      Route: / (Bilingual EN/HI)     |
                                      +-----------------+------------------+
                                                        |
                                                        v
                                      +------------------------------------+
                                      |        Welcome & Explicit          |
                                      |        On-Screen Consent           |
                                      +-----------------+------------------+
                                                        |
                                     (Consent Accepted) | (Declined -> Immediate Teardown)
                                                        v
                                      +------------------------------------+
                                      |     Scripted Opening Demographics  |
                                      |      (Name, Age, Gender, Concern)  |
                                      +-----------------+------------------+
                                                        |
                                                        v
       +-------------------------+    +------------------------------------+
       |  Gnani Prisma STT REST  |<-->| Voice ("What we heard" edit) or    |
       |  Gnani Timbre TTS REST  |<-->| Direct Text Entry Fallback         |
       +-------------------------+    +-----------------+------------------+
                                                        |
                                                        v
       +-------------------------+    +------------------------------------+
       |  Groq Structured JSON   |<-->| Adaptive Follow-up Engine          |
       |  Canonical 150-Q Bank   |    | (Max 3 adaptive Qs; 15-turn cap)   |
       +-------------------------+    +-----------------+------------------+
                                                        |
                       +--------------------------------+--------------------------------+
                       | (Acute Emergency Triggered)                                     | (Normal Complete)
                       v                                                                 v
+---------------------------------------------+               +---------------------------------------------+
|          Deterministic Emergency            |               |             Draft Report Review             |
|   - Plain-text 112 Advisory                 |               |   - Patient corrects personal details       |
|   - Permanent slot suppression              |               |   - Clinical fields read-only               |
|   - urgent_partial report to Emergency      |               |   - "Submit to hospital" vs "Don't submit"  |
+----------------------+----------------------+               +----------------------+----------------------+
                       |                                                             |
                       v                                                             v
+---------------------------------------------+               +---------------------------------------------+
|          Emergency Doctor Triage            |               |           Assigned Doctor Queue             |
|          Dr. Neha Verma (ER)                |               |           Dr. Aditi Rao (General Med)       |
+---------------------------------------------+               +----------------------+----------------------+
                                                                                     |
                                                                                     v
                                                              +---------------------------------------------+
                                                              |            Atomic Slot Booking              |
                                                              |   - Confirmed slot or "Not now"             |
                                                              |   - Atomic book_appointment() RPC           |
                                                              +---------------------------------------------+
```

## Local development
---

## Key Capabilities & Safety Invariants

1. **Bilingual Accessibility (EN / HI):** Full support for English and Hindi in Devanagari script (`Noto Sans Devanagari`), including dynamic switching without state loss.
2. **Explicit Consent Gate:** Consent is strictly an on-screen button press; it is never inferred from speech. Declining consent terminates the session instantly with zero data retention.
3. **Voice-First with Editable Transcript:** Patients can speak via microphone (processed through Gnani Prisma STT); an editable *"What we heard"* transcript chip allows correction before submission.
4. **Governed Adaptive Intake:** Backend-driven selection of up to 3 follow-up clarifications from a canonical 150-question bank, capped at 15 total answer turns per session.
5. **Project-Wide Spend Caps:** Server-side atomic counter reservations in Asia/Kolkata timezone protect daily provider usage.
6. **Deterministic Emergency Triage:** High-risk symptom phrases immediately halt routine intake, present plain-text 112 guidance, generate an `urgent_partial` report, and bar routine slot booking.
7. **Doctor Clinical Governance:** Single-write `"Mark Reviewed"` audit stamp records physician review and releases booking holds on conditional cases.
8. **Concurrency-Safe Booking:** Atomic PostgreSQL RPC with `FOR UPDATE` row locking prevents double-booking race conditions.

---

## Technology Stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons
- **Backend / Database:** Supabase PostgreSQL, Row-Level Security (RLS), Supabase Auth (Anonymous + Email/Password)
- **Serverless API:** Supabase Edge Functions (`chat-turn`, `speak`)
- **Speech Technologies:** Gnani Prisma v2.5 (STT), Gnani Timbre v2.5 (TTS)
- **Constrained Extraction:** Groq API (Structured JSON output schema)
- **Hosting:** Vercel (Frontend SPA) + Supabase Cloud (Backend & Functions)

---

## Local Development & Setup

### Prerequisites
- Node.js 18+ and `npm`
- Modern browser (Chromium recommended for full Web Audio API support)
- *(Optional)* Supabase CLI for local database and Edge Functions

### Installation
```bash
# Clone repository
git clone https://github.com/shyamparmar/samvad-healthdesk-ai.git
cd samvad-healthdesk-ai

# Install dependencies
npm install
npm run dev      # start the frontend
npm run build    # production build

# Start local development server (Default: Mock Mode)
npm run dev
```

Copy `.env.example` to `.env.local` and fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (the public key only). Server-side provider keys belong in Supabase Function Secrets under the exact variable names verified from the current provider documentation and implementation. Never place provider secrets in `VITE_` variables or commit them.
### Environment Configuration
Copy `.env.example` to `.env.local` to configure connection parameters:
```env
# Public Supabase Client Keys (Safe for browser)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-supabase-publishable-or-anon-key

Backend (Supabase CLI): migrations and Edge Functions are deployed separately from the frontend; `git push` alone does not deploy them. Seed data is applied deliberately, not automatically.
# Provider secrets (GNANI_API_KEY, GROQ_API_KEY, SERVICE_ROLE_KEY)
# MUST ONLY be set in Supabase Function Secrets — NEVER in the frontend!
```

## Evaluator access
---

The doctor dashboard is restricted. Working evaluator credentials are **not published** in this repository, this README, screenshots, Figma, source code or public posts. The doctor login card explains that credentials are shared privately with reviewers.
## Test Suites & Quality Verification

The registration terms refer to a participant workspace, but the current programme page FAQ and challenge blog say there is no participant dashboard and the submission form is sent to the registered email. The project owner will follow the current email instructions and inspect the actual link received for this registration. Evaluator access will be provided only through a field explicitly confirmed as private/reviewer-only or another private method approved by the challenge organisers. Do not assume such a field exists. Never commit a working password.
The repository includes a comprehensive 5-layer test pyramid:

Two synthetic doctor identities are provisioned for testing: General Medicine (Dr. Aditi Rao) and Emergency (Dr. Neha Verma). Their passwords are held privately by the project owner; Auth users are created through Supabase Dashboard, never inserted into `auth.users` with SQL. The public app is an educational demo: use synthetic patient inputs only.
| Suite | Command | Coverage |
| :--- | :--- | :--- |
| **Unit & Integration** | `npm test` | 84 tests (26 Mock, 7 Supabase RPC, 51 API integration) |
| **End-to-End Interactions** | `npm run test:e2e` | 16 complete patient, doctor, and bilingual journeys |
| **Real Browser Supabase** | `npm run test:api:browser` | 17 real browser-to-database journeys |
| **Edge Cases & Safety** | `npm run test:api:browser:extras` | 9 emergency, Hindi, and ambiguous clarification journeys |
| **Responsive Visual QA** | `npm run test:visual` | 7 viewports (360px to 1440px) with zero overflow validation |
| **Production Build** | `npm run build` | Full TypeScript validation (`tsc --noEmit`) and Vite asset bundling |

---

## Documentation Index

- [`docs/evaluator-demo-guide.md`](docs/evaluator-demo-guide.md) — Step-by-step 5–7 minute walkthrough script for evaluators and judges.
- [`docs/feature-matrix.md`](docs/feature-matrix.md) — Comprehensive status and readiness matrix for all product features.
- [`docs/final-owner-setup.md`](docs/final-owner-setup.md) — Deployment instructions, secrets configuration, and SQL migration checklist.
- [`docs/hindi-ui-review.csv`](docs/hindi-ui-review.csv) — Bilingual translation audit of 22 key UI strings with clinical review status.
- [`docs/demo-emergency-rules.md`](docs/demo-emergency-rules.md) — Deterministic emergency phrase triggers and 112 guidance protocol.
- [`docs/report-design.md`](docs/report-design.md) — Detailed clinical report schema, field definitions, and information states.
- [`docs/demo-seed-data.md`](docs/demo-seed-data.md) — Fictional departments, doctor profiles, and appointment schedules.

---

## Evaluator Access Protocol

Doctor dashboard access (`/doctor`) is secured with Supabase Auth. Working evaluator credentials are **not published** in public repositories, commit histories, Figma files, or documentation.

Credentials for the two synthetic doctor profiles:
1. **General Medicine:** Dr. Aditi Rao (`dr.aditi.rao@hospital.demo`)
2. **Emergency Medicine:** Dr. Neha Verma (`dr.neha.verma@hospital.demo`)

are provided confidentially via the competition submission form to maintain system security.

---

## License & Attribution

Developed for educational demonstration purposes. Built with Google Antigravity & OpenCode.
