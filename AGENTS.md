# AGENTS.md — Hospital Intake MVP Rules

These are the always-on workspace instructions. Follow the four-milestone, step-by-step execution plan in `MILESTONES.md` and the owner actions in `HUMAN_ROADMAP.md`. These two files control sequencing, estimates, checkpoints and approval steps. This file remains the source of architecture, security and product invariants. Read the linked `docs/` file before implementing that area. Do not expand or replace the architecture silently.

## Project and MVP goal

Build an educational demo of an **AI-powered pre-visit patient intake and smart referral system** (product name in the UI: **Samvad HealthDesk AI**):

**Welcome → consent → voice/text intake → draft report → patient review and Submit → preliminary department/doctor mapping → doctor dashboard → patient-confirmed appointment or Not now.**

A submitted report remains visible to its assigned doctor even if the patient skips booking. A deterministic emergency demo trigger follows a separate urgent path and never offers routine slots.

This is not a clinical product. Use synthetic patients, fictional doctors and fictional schedules only. Never use real patient records or sensitive personal data.

## Execution plan and time control

- Do not use the former two-day Day 1/Day 2 sequence. Execute the numbered steps in `MILESTONES.md` in order, one approved step at a time. The owner uses `HUMAN_ROADMAP.md` for credentials, dashboard work, SQL approvals, testing and submission actions.
- Build and verify a secured text-first vertical slice before layering in voice, Groq and optional provider integrations. M2 and M3 may run in parallel only after the accepted M1 contract and doctor identities exist, using separate worktrees and strict directory ownership.
- The owner sets the milestone checkpoint and scope cuts in `MILESTONES.md`. For this plan, M3 has a mandatory progress/scope checkpoint by end of 4 November 2026; do not wait until 6 November to cut Tier C work if backend security or text workflow is behind.
- Manual end-to-end acceptance is sufficient; do not build a general-purpose test framework, production observability system or broad rate-limiting platform. However, focused tests for atomic daily-counter concurrency, 15-turn boundaries, IST date rollover, and atomic booking race/duplicate rejection are mandatory MVP tests because those are direct correctness/security controls.
- Never silently expand scope, replace the stack or skip approval gates. Do not continue to the next numbered step until the owner approves the current step.

**Defer:** `client_turn_id`/full idempotency, free-text doctor review notes, per-field source-message IDs, production-grade rate limiting beyond the minimal D5 daily caps, extensive automated suites, advanced retries/observability and nonessential UI. Do not defer JWT verification, owner checks, RLS, runtime validation, secret handling, server-side caps, atomic booking or the focused concurrency tests above.

## Backend session and spend limits

- Enforce at most **15 accepted patient answer turns per session**. The 15th answer may be accepted and saved. If normal completion criteria are satisfied by then, allow normal review and submission. If incomplete, return a partial-draft preview with **End session only**; no submit, doctor visibility, assignment or booking. Do not accept a 16th answer or make further provider calls for that session.
- Enforce project-wide daily caps in Asia/Kolkata using the owner-adjustable, server-only `daily_usage_limits` table and atomic `daily_usage_counters`. The proposed D5 application defaults are 100 session creations, 300 Groq calls, 150 Prisma calls and 120 Timbre calls per IST day; the owner confirms/adjusts after checking actual provider quotas and credits. These are application guardrails, not provider quotas and not a conversion of programme credits into calls.
- Daily limits are changed by the owner in Supabase Dashboard SQL Editor without redeploy. The app reads limits only server-side. No browser access or policies may expose or modify either usage table. Use a narrow internal `SECURITY INVOKER` PostgreSQL RPC (e.g. `reserve_daily_usage`) to reserve atomically: empty/fixed `search_path`, schema-qualified table references, fixed counter-name allowlist, server-derived IST date, no caller-supplied date/amount, revoke execute from `PUBLIC`/`anon`/`authenticated`, grant execute only to `service_role`. Edge Functions call it only through the elevated server-side client. It is not a third Edge Function or a `SECURITY DEFINER` helper. Reserve/increment before server-side app actions/provider attempts; a failed provider attempt still consumes one call. Never expose the function to the browser.
- If the session-creation cap is reached, return the `demo_busy` UI state and do not create another session. If an individual provider cap is reached, reject only that provider request and use its non-paid fallback (Prisma → text entry; Timbre → approved question as text; Groq → scripted question/deterministic summary); do not lock out unrelated functionality or providers. Do not trust a client-supplied date; derive the Asia/Kolkata date in the database helper. Test counter concurrency/date rollover in a local or isolated fixture; never reset or consume live demo counters merely to exercise cap tests.
- The one-time local cached-audio script must never connect to or write the usage database. Before running it, the owner checks the current Timbre counter and manually reserves its exact up-to-ten attempts by lowering the application Timbre limit by that amount for that IST day only if current usage is no greater than the reduced limit. Count each attempt (including failures), record counts privately, and keep the app limit reduced for the remainder of that IST day; restore it only on the next IST day. If the reservation cannot be made safely, mark cache generation BLOCKED and retain text fallback. No automatic retry.


## Fixed technology stack

- Frontend: React + Vite + TypeScript + Tailwind CSS; one static SPA, one deployment, two route groups: `/` (patient) and `/doctor` (doctor).
- Hosting: Vercel.
- Backend: Supabase Edge Functions (TypeScript/Deno).
- Database/auth: Supabase PostgreSQL + Supabase Auth; RLS for authorization.
- STT: Gnani Prisma (v2.5 only if enabled for this account).
- TTS: Gnani Timbre (v2.5 only if enabled for this account; verify the exact model ID because SDK defaults may differ, including v2.0).
- Reasoning: Groq API; verify a currently available model and structured-output support before selecting its ID.
- One GitHub repository. Development tools (Google Antigravity, OpenCode, VS Code) are not deployed services.

Do not add FastAPI, Python server, Render, Next.js, WhatsApp, telephone/IVR, Supabase Realtime, streaming TTS, WebSockets, another audio server, staff/admin dashboard, admin CRUD, a doctor Settings page, a notification bell, or another repository.

Verify provider endpoints, model IDs, keys, languages, audio formats and limits against current official docs/account. Never invent API details.

## Working with multiple coding agents

Two agents may work in the same repository at once. To avoid conflicts:

- Each agent works on its own git branch/worktree and only in its assigned directories. Backend: `supabase/`. Frontend: `src/`, `public/`, `index.html`, `vercel.json`. Shared files (`AGENTS.md`, `docs/`, `src/types/`) change only with owner approval.
- `src/types/` holds the shared contract: `chat-turn` request/response types and `api.ts` function signatures. Both sides build to it. The frontend may build against a mocked `api.ts` until the backend is ready.
- Never merge to `main`, push or deploy without owner approval. Report what changed and what was verified.

## Design source

The approved UI design is in Figma, with exported PNGs and tokens in `docs/design/` (one PNG per screen, named by screen, for example `P6-review.png`).

- Match the PNG for layout, spacing, colors, radii, fonts and component states. If the Figma MCP is available, read one screen link at a time (call limits are low); otherwise use the PNGs and tokens.
- After building a screen, compare a browser screenshot with the PNG and fix visible differences.
- Where a PNG conflicts with this file or `docs/`, this file and `docs/` win (for example doctor names, slot times, text typos). Do not copy typos or generated-image glitches.
- Fonts: Plus Jakarta Sans and Noto Sans Devanagari. Hindi text must render in Devanagari.

## Repository and frontend architecture

Use one repository: Vite app at root; backend assets under `supabase/`.

- `src/features/patient/`: welcome, consent, conversation, report review, booking, confirmation, emergency, consent-declined.
- `src/features/doctor/`: login, dashboard, reports list, report detail, appointments, urgent list.
- `src/lib/supabase.ts`: the single browser Supabase client.
- `src/lib/api.ts`: the **only** frontend module allowed to call Supabase Auth, `.from()`, `.rpc()` or `.functions.invoke()`.
- `src/lib/audio/`: microphone recording and audio playback.
- `src/i18n/`: UI translations only (patient side Hindi/English). Backend agent question bank is separate.
- `src/types/`: shared frontend/API types and generated DB types.
- `supabase/functions/chat-turn/`: all intake actions and orchestration.
- `supabase/functions/speak/`: Timbre REST orchestration.
- `supabase/functions/_shared/`: session, providers, schemas, questions, safety, conversation, report and routing logic.
- `supabase/migrations/`: timestamped SQL migrations; `supabase/seed.sql`: fictional data.
- `docs/`: report, demo safety rules, seed data, failure behaviour and design exports.

Components and hooks call exported functions from `src/lib/api.ts`; they never import the Supabase client directly. Keep Edge Function entry points thin. Create files only when needed; no empty placeholders.

## Patient flow, consent and API actions

1. Welcome screen: Hindi/English selection, prominent **Start Talking**, **Type Instead** alternative.
2. On click, create/restore Supabase anonymous Auth identity and create/restore an intake session. Request microphone permission for voice mode; denial offers text mode.
3. Play the pre-generated greeting. It explains AI-assistant purpose, not-a-doctor limitation, processing and report sharing.
4. **Consent is an on-screen Yes/No button in both voice and text modes. Never infer consent from speech/transcription.** Store decision, consent text/version, language and a server-generated timestamp. If No, stop; collect no health data and create/share no clinical report.
5. After Yes, ask fixed backend question IDs in order: **name, age, gender, primary concern**. Do not make these LLM-generated. Gender is answered with on-screen choices (Male, Female, Other, Prefer not to say) and may also be spoken or typed; "Prefer not to say" is stored with status `declined`. Ask other demographics only when an approved question requires them.
6. Voice is primary; text is fallback. Voice calls Prisma; text bypasses Prisma. Before sending a voice answer, show the transcript ("What we heard") so the patient can edit it, then send. Then run demo safety rules and Groq for adaptive extraction/question selection.
7. The conversation screen is a scrolling chat log with the current question, quick-reply chips where the question has fixed options, mic control (idle, listening with a 30 s countdown, processing), a type button and a replay-question control. It also renders backend-driven Yes/No chips for the approved ambiguous-emergency clarification, and a translated demo-busy message only when the backend returns the global-cap state; the browser does not detect emergencies or calculate usage limits.
8. When intake is complete, the patient reviews a generated draft report, can correct allowed patient-provided fields, and explicitly taps **Submit to hospital** (or **Don't submit**, which ends the session and keeps the draft private). At the 15-turn cap, if intake remains incomplete, show the partial preview with the End action only; do not expose a Submit control or create an appointment/report submission. No slots are shown before normal Submit.
9. After Submit, show available slots for the mapped doctor. Patient can book, see more dates or choose **Not now**. Not now creates no appointment; report stays submitted for the doctor. Confirmation shows a reference code and the doctor, date and time.
10. Deterministic emergency trigger: stop routine intake, show the demo 112 guidance as plain text (no tap-to-call link), save an `urgent_partial` report for the Emergency doctor dashboard, and suppress routine slots. Do not claim a real alert was sent.

Patients have no signup form or password. Use Supabase anonymous Auth behind the scenes. Resume only using the same persisted Auth identity. If browser identity is lost, do not recover by guessable session ID or phone number.

**Languages.** The patient interface has a Hindi/English toggle (all UI strings in `src/i18n/`). The doctor interface is English only. Reports are always written in English.

### `chat-turn` actions

Keep exactly two Edge Functions: `chat-turn` and `speak`. `chat-turn` accepts a validated discriminated `action`:

- `start_session`
- `resume_session`
- `record_consent`
- `submit_turn` (text or audio; audio invokes Prisma)
- `correct_draft_report` (allowlisted patient fields only; draft only)
- `submit_report` (revalidate consent/completion, mark submitted, assign doctor)

`correct_draft_report` and `submit_report` are actions inside `chat-turn`, not separate functions. The browser sends field updates, never a replacement report JSON. The patient cannot edit routing, warning flags, doctor assignment or report status.

`startAnonymousSession` in `api.ts` calls Supabase anonymous Auth; `startSession` invokes `chat-turn` to create the server-owned session. `resumeSession` restores the current Auth identity then invokes the resume action. `recordConsent`, `chatTurn`, `correctDraftReport` and `submitReport` invoke `chat-turn` with the corresponding action.

`speak` accepts session ID/question ID, verifies ownership and loads the server-known current adaptive question. Do not accept arbitrary client text for paid TTS calls.

`api.ts` must also expose `speak`, `getAvailableSlots`, `bookAppointment`, `markReportReviewed`, doctor login/logout, doctor report list/detail and doctor appointment reads. Slot, booking and mark-reviewed actions call PostgreSQL RPCs.

## Doctor dashboard

- Screens: login, dashboard (stat cards and recent reports), reports list (tabs All / Urgent / Booked / Not booked), report detail, appointments (tabs Today / Upcoming / Past), urgent list. No Settings page, no bell, no print.
- Appointment tabs and the Completed label are derived from the slot time. There is no "complete appointment" write.
- Stat definitions and report list rules are in `docs/report-design.md`.
- **Mark Reviewed** is the only doctor write: it records that the assigned doctor has reviewed a report. It is not a free-text note.
- Doctors see reports assigned to them. The General Medicine demo doctor and the Emergency doctor can also see reports in the Emergency department (read-only), so judges can see urgent reports when logged in as the demo doctor.

## Security and database ownership — mandatory

Use this explicit trust model:

- All user-facing Edge Function calls require a valid Supabase user JWT. Keep platform JWT verification enabled; derive user ID from verified claims, never from a client-supplied ID.
- `sessions`, `messages` and `reports` are **server-owned**. Browser roles have no direct INSERT/UPDATE/DELETE policies on these tables. Patient turns, draft corrections and report submission go through `chat-turn`.
- After verifying the JWT and proving the session/report belongs to the verified user, `chat-turn` uses a narrowly scoped elevated server-side Supabase client for server-owned writes. The elevated client bypasses RLS: every read/update must also filter by verified owner ID and relevant session/report ID. Never return its key or accept client-supplied assignment/status values.
- Use caller-scoped access for doctor reads. Doctor report queries are protected by RLS and match the doctor mapped to `auth.uid()` through `doctor_profiles`, plus the narrow read-only Emergency-report visibility described above. Draft (unsubmitted) reports are never readable by doctors, except `urgent_partial` reports.
- Use the current Supabase Edge Function authenticated-user pattern (for example `withSupabase({ auth: 'user' })` where supported; verify it exists in current docs): it provides a user/RLS-scoped client and a server-only admin client. Use the current provisioned secret-key mechanism; do not assume a legacy service-role environment variable if the project uses newer secret keys.
- Never expose any secret/service-role key in browser code, Vercel variables, README or Git. CORS is not authentication.
- `get_available_slots()` is an authenticated, limited read RPC.
- `book_appointment()` and `mark_report_reviewed()` are the only narrowly scoped `SECURITY DEFINER` exceptions, because browsers cannot write appointment, slot or report tables directly. For both: fixed safe `search_path`, schema-qualified names, no dynamic SQL, revoke from `PUBLIC`/`anon`, grant to `authenticated`.
  - `book_appointment()`: validate `auth.uid()` owns the submitted report/session, reject Emergency, validate doctor/slot match and future availability, lock/recheck and reserve in one transaction, enforce a unique booking per slot, generate the reference code server-side.
  - `mark_report_reviewed()`: validate `auth.uid()` maps to a doctor who may read that report; set only the reviewed timestamp and reviewing doctor; change nothing else.
- Booking hold: a submitted report with `possible_urgent` or unresolved `needs_human_review` cannot book until an authorized mapped doctor uses Mark Reviewed. That action releases the workflow hold only for a normal submitted non-emergency report. A deterministic emergency / `urgent_partial` report remains permanently ineligible for routine slots even after Mark Reviewed. Mark Reviewed is not medical clearance or proof the patient is safe.
- No direct browser writes to sessions, messages, reports or appointments. `speak` verifies JWT and session ownership. RLS must be enabled on exposed tables; no broad public access policies.

## AI, voice and credit rules

- Backend owns conversation state, approved question selection and completion criteria. Never trust Groq's completion flag by itself.
- **Completion criteria (backend-owned):** scripted fields (name, age, gender, primary concern) answered; adaptive fields **duration** and **severity** answered; **conditions**, **medications**, **allergies** and **other symptoms** each asked once (an answer of declined or unknown counts as handled). Each field ends with an information status from the report enum.
- The approved adaptive question bank lives in `supabase/functions/_shared/questions.ts`: one entry per field above plus the fixed emergency Yes/No clarification, each with a stable ID, English text, Hindi text and the report field it fills. The owner reviews the Hindi text before the demo.
- Groq may extract patient-reported facts, missing fields, one approved question ID, an allowlisted department suggestion and supplementary `possible_urgent`. It cannot diagnose, prescribe, book, execute SQL or write to the database.
- Validate requests and provider/model outputs at runtime (Zod or equivalent). Reject unknown question IDs, categories, fields and transitions; use an approved scripted fallback.
- Pre-generate/cache audio in `public/audio/` for each language: greeting, ask-name, ask-age, ask-gender and ask-primary-concern. Only adaptive follow-up questions call Timbre. Never call TTS for cached fixed prompts; never generate audio during Vercel build. A manual one-time `scripts/generate-opening-audio.ts` is optional.
- Use REST only. Do not assume browser WebM is accepted by Prisma; encode a documented supported format in the browser. Initial app recording cap: 30 seconds, subject to verifying the exact API limit.
- Verify Prisma/Timbre model IDs and language quality. Do not claim Hinglish quality until tested. Explicitly configure the verified Timbre model; do not rely on SDK defaults. Check whether Prisma `hi-IN` returns Devanagari or Roman text before finalizing emergency phrase matching.
- Preserve original transcript separately from corrections. Discard raw audio after processing by default.
- Enforce the 15-answer-turn cap server-side. Count provider calls during tests without logging health content.

## Report, safety, seed and failure references

Before implementing those areas, read:
- `docs/report-design.md` — doctor-facing report sections, JSON shape, missing-value states, draft correction, submission, dashboard definitions and Mark Reviewed.
- `docs/demo-emergency-rules.md` — bilingual **demo-only, not clinically validated** starter phrases, negation caution, 112 message and urgent workflow.
- `docs/demo-seed-data.md` — six fictional departments/doctors, non-emergency slot schedule and judge doctor login provisioning.
- `docs/failure-modes.md` — MVP retry/fallback behaviour.
- `docs/architecture-decisions.md` — short list of settled decisions.

Key safety invariants: never diagnose, estimate disease probability, prescribe, recommend treatment or invent facts/history/vitals. Missing values stay explicit (`not_provided`, `unknown`, `declined`, `unclear`, `not_asked`). Deterministic demo rules are primary; Groq `possible_urgent` is supplementary and never proves safety. A rule match stops normal intake and displays 112 guidance. Emergency never gets routine slots. The demo does not call 112, notify a real doctor or dispatch help. Synthetic data only.

## Seed data and evaluator access

Seed the exact six fictional doctors and departments specified in `docs/demo-seed-data.md`; schedules are Asia/Kolkata and Emergency has no routine slots. After M1-S7, the owner creates two Supabase Auth users through the Dashboard: General Medicine / Dr. Aditi Rao and Emergency / Dr. Neha Verma. Never insert into Supabase-managed `auth.users` with SQL. During M1-S8, the agent prepares a reviewed mapping SQL file for `doctor_profiles`; the owner supplies only each account email and Auth UID (never passwords) and approves/applies that named mapping file. This makes both identities available before M3 security testing.

**Credential policy:** do not put working passwords in README, Figma, UI screenshots, source, Git history, logs, public posts or this documentation. The doctor login card must say: “Evaluator access” / “Credentials are shared privately with reviewers.” / “Not displayed in public project materials.” The registration terms mention a participant workspace, but the current programme page FAQ and challenge blog say the submission form is emailed and there is no participant dashboard. The owner follows the actual current email instructions received for this registration and inspects the submitted form for a confidential evaluator-access field; do not assume one exists. If absent, ask the organisers through an official channel for an approved private evaluator-access method. A public shared password would expose doctor reports and workflow controls to anyone who discovers it.

M4-S3 verifies the two Auth identities and profile mappings created in M1-S8; it does not create new users. The owner manually tests login/logout for both; agents must never request or see passwords.


## Environment, Git and deployment

Use one browser variable name everywhere: `VITE_SUPABASE_KEY`. Its value is the project's public client key (publishable key or legacy anon key shown in the dashboard), never a secret/service-role key. Also use `VITE_SUPABASE_URL`.

Frontend `.env.local` / Vercel variables:
```env
VITE_SUPABASE_URL=
VITE_SUPABASE_KEY=
```

Supabase Function Secrets: `GNANI_API_KEY`, `GROQ_API_KEY`, plus other verified provider credentials only. `.env.example` has names/placeholders only. `.gitignore` excludes `.env*` except `.env.example`, local Supabase state, build output and secrets.

Use one private GitHub repository. Use timestamped SQL migrations created through Supabase CLI; do not invent timestamps or rewrite applied history. Apply seed data deliberately; do not assume remote `db push` automatically applies `seed.sql`. Vercel uses repository root, `npm run build`, output `dist`; configure SPA rewrite for `/doctor` refresh. Vercel deploys frontend; Supabase CLI deploys functions/migrations separately. Git push alone does not deploy Supabase backend. Never deploy/push or expose credentials without owner approval.

## Coding rules

Follow the MILESTONES.md execution sequence and the HUMAN_ROADMAP.md owner checklist. Make sensible file/component decisions without pausing for approval on routine work. Do not ask the owner to repeat documented decisions. No unnecessary abstractions, empty placeholders, dependencies or scope additions. Preserve existing work. Use strict TypeScript; no `any` unless justified. Keep provider HTTP calls in `_shared/prisma.ts`, `_shared/groq.ts`, `_shared/timbre.ts`; keep UI API calls in `src/lib/api.ts`. Never invent provider endpoints, IDs, payloads, credentials or limits. Show loading/error/retry states; claim success only after backend confirmation. Run `npm run build`; report what was implemented and manually verified.

## Manual MVP acceptance path

1. Open welcome; choose language; click Start Talking.
2. Hear cached greeting; verify on-screen Yes/No consent. No must collect no health data/report.
3. Consent Yes; answer name, age, gender, concern and one adaptive question by voice; verify the editable transcript and text fallback.
4. Confirm fixed questions use cached audio (no Timbre call) and adaptive speech uses Timbre; count API calls; confirm the 15-turn cap, incomplete End-only private preview, and global `demo_busy` fallback. Confirm no provider call occurs after the 15th accepted answer turn.
5. Review/correct draft; test Don't submit (draft stays private); then submit.
6. Log in with the privately provisioned General Medicine demo doctor; refresh dashboard and confirm the report and conversation appear; use Mark Reviewed. Verify Emergency doctor identity separately. No password is published in README.
7. View slots; book one; verify confirmation and reference code. Test Not now creates no appointment but leaves report visible.
8. Trigger a clear emergency phrase and an ambiguous emergency phrase; verify 112 guidance for the clear trigger, Yes/No clarification chips for ambiguity, Yes enters urgent flow, No only negates that candidate (never a safety clearance), unclear remains `needs_human_review`, no routine slots for emergency, and urgent report visibility for both mapped doctors according to RLS.
9. Run production build and confirm no secrets in browser bundle or Git.

**Highest-priority invariant:** preserve patient-friendly voice-first intake, explicit consent, truthful structured report, preliminary routing, doctor visibility, patient-controlled booking and visible urgent guidance with the smallest reliable implementation.
