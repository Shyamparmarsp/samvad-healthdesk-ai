# Samvad HealthDesk AI — Educational Demo

AI-powered pre-visit patient intake and smart referral demonstration.

## Stack

- React + Vite + TypeScript + Tailwind
- Supabase Auth, PostgreSQL, RLS and Edge Functions
- Gnani Prisma for speech-to-text
- Gnani Timbre for text-to-speech
- Groq for constrained reasoning and structured extraction
- Vercel for the frontend

## Scope

Welcome and consent → voice/text intake → structured report → patient review and submit → doctor dashboard → optional patient-confirmed booking. Emergency demo rules use a separate 112 guidance path. The patient interface is Hindi/English; the doctor interface is English. This is not a clinical product; synthetic data only.

One website: patients use `/`, doctors log in at `/doctor`.

See `AGENTS.md` for workspace rules and `docs/` for report, demo safety, seed data, failure behaviour and design exports.

## Local development

```bash
npm install
npm run dev      # start the frontend
npm run build    # production build
```

Copy `.env.example` to `.env.local` and fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (the public key only). Server-side provider keys belong in Supabase Function Secrets under the exact variable names verified from the current provider documentation and implementation. Never place provider secrets in `VITE_` variables or commit them.

Backend (Supabase CLI): migrations and Edge Functions are deployed separately from the frontend; `git push` alone does not deploy them. Seed data is applied deliberately, not automatically.

## Evaluator access

The doctor dashboard is restricted. Working evaluator credentials are **not published** in this repository, this README, screenshots, Figma, source code or public posts. The doctor login card explains that credentials are shared privately with reviewers.

The registration terms refer to a participant workspace, but the current programme page FAQ and challenge blog say there is no participant dashboard and the submission form is sent to the registered email. The project owner will follow the current email instructions and inspect the actual link received for this registration. Evaluator access will be provided only through a field explicitly confirmed as private/reviewer-only or another private method approved by the challenge organisers. Do not assume such a field exists. Never commit a working password.

Two synthetic doctor identities are provisioned for testing: General Medicine (Dr. Aditi Rao) and Emergency (Dr. Neha Verma). Their passwords are held privately by the project owner; Auth users are created through Supabase Dashboard, never inserted into `auth.users` with SQL. The public app is an educational demo: use synthetic patient inputs only.
