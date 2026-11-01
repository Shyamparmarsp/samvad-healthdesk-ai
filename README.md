# Samvad HealthDesk AI — AI-Powered Patient Intake & Smart Referral

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646cff.svg)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.x-38b2ac.svg)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%7C%20Postgres%20%7C%20Edge%20Functions-3ecf8e.svg)](https://supabase.com/)

**Samvad HealthDesk AI** is an educational demonstration of a bilingual (English / Hindi), voice-first and text-accessible pre-visit hospital intake and clinical referral system.

It bridges the pre-registration gap by gathering structured patient history, adapting follow-up clarifications, synthesizing clinical summaries for physicians, and facilitating atomic appointment booking—while strictly enforcing non-diagnostic boundaries and deterministic emergency triaging.

> [!IMPORTANT]
> **Educational Demonstration Only.** This software is an educational prototype and technology demonstration. It uses synthetic patient records and fictional doctor profiles only. It **never diagnoses illnesses, calculates disease probabilities, prescribes medications, or suggests treatments**. All emergency presentations route to plain-text 112 guidance with permanent outpatient slot suppression.

---

## Architecture & System Flow

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

# Start local development server (Default: Mock Mode)
npm run dev
```

### Environment Configuration
Copy `.env.example` to `.env.local` to configure connection parameters:
```env
# Public Supabase Client Keys (Safe for browser)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-supabase-publishable-or-anon-key

# Provider secrets (GNANI_API_KEY, GROQ_API_KEY, SERVICE_ROLE_KEY)
# MUST ONLY be set in Supabase Function Secrets — NEVER in the frontend!
```

### Production Environment & Deployment
1. **Frontend Hosting (Vercel):**
   - Connect repository to Vercel.
   - Configure Environment Variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (public anon/publishable key only).
   - Build Command: `npm run build`
   - Output Directory: `dist`
2. **Backend & Database (Supabase Cloud):**
   - Apply timestamped migrations in `supabase/migrations/` and seed data from `supabase/seed.sql`.
   - Set Function Secrets using Supabase CLI:
     ```bash
     supabase secrets set GROQ_API_KEY=... GNANI_API_KEY=...
     ```
   - Deploy Edge Functions:
     ```bash
     supabase functions deploy chat-turn
     supabase functions deploy speak
     ```
   - Provision Doctor Auth accounts in Supabase Dashboard and apply profile mappings via [`docs/final-owner-setup.md`](docs/final-owner-setup.md).

---

## Known Limitations & Clinical Governance

> [!CAUTION]
> **Prototype & Non-Clinical Disclaimers:**
> - **Synthetic Personas Only:** Utilizes fictional doctor identities and synthetic patient inputs. Real patient PHI must never be entered.
> - **Non-Diagnostic:** Strictly provides intake synthesis and departmental referral routing; never diagnoses illnesses, assesses clinical probability, or prescribes treatment.
> - **Illustrative Emergency Rules:** Keyword emergency triggers are demonstration safety filters and not clinically certified medical triage algorithms.
> - **No Emergency Dispatch:** Displaying plain-text 112 advice does not summon emergency services or dial 112 automatically.
> - **Linguistic Certification Pending:** Hindi translations are approved for educational demo purposes and require clinical review by qualified medical linguists before healthcare use.

---

## Test Suites & Quality Verification

The repository includes a comprehensive 5-layer test pyramid:

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
