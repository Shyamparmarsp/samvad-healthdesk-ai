# Samvad HealthDesk AI — MILESTONES.md (v4)

**Last updated:** 1 November 2026 (v4 review)
**Replaces:** `MILESTONE_1_FOUNDATION.md`, `MILESTONE_2_FRONTEND.md`, `MILESTONE_3_BACKEND_AI.md`, `MILESTONE_4_INTEGRATION_BOOKING_DEPLOYMENT.md`.
**Companion file:** `HUMAN_ROADMAP.md` (the single owner-only checklist and manual-action guide). `HUMAN_MANUAL_CHECKLIST.md` is superseded; do not maintain two active human checklists.
**Hard deadline:** 10 Nov 2026, 11:59 PM IST. Plan to submit on 9 Nov; 10 Nov is buffer only.

How to use: give the agent this file, one step ID and its prompt. The agent runs that step only, reports evidence and stops. You reply `APPROVE M<n>-S<k>`. Progress = sum of approved step weights. Approve the handoff step first; use `ACCEPT M<n>` only after every step in that milestone (including its final handoff/submission step) is approved.

---

## 1. Progress tracker

| Milestone | Weight | Est. effort | Target (proposed) | Owner agent | Approved weight | Accepted |
|---|---|---|---|---|---|---|
| M1 Foundation | 15 | ~7 h | 1–2 Nov | Antigravity (lead) | 0 / 15 | [ ] |
| M2 Frontend (mock API) | 25 | ~10 h | 3–5 Nov | Antigravity | 0 / 25 | [ ] |
| M3 Backend, AI, voice | 30 | ~16 h | 3–5 Nov (parallel with M2); checkpoint 4 Nov | OpenCode, own worktree | 0 / 30 | [ ] |
| M4 Integration, booking, release, submission | 30 | ~10 h | 6–9 Nov | Antigravity (lead) | 0 / 30 | [ ] |
| **Total** | **100** | **~43 h** | | | **0 / 100** | |

Dates assume roughly 5–6 focused working hours a day and are planning estimates, not guarantees. Weights represent progress allocation; hours represent effort and need not be proportional. M3 has expanded scope, so reserve about 16 focused hours and conduct its scope checkpoint by end of **4 Nov**. Keep 10 Nov as a submission buffer only.

---

## 2. Roles and parallel work

- M2 (frontend, mock API) and M3 (backend) only need the M1 contract, so they run in parallel in separate worktrees. This is why two tools are available.
- Antigravity owns `src/`, `public/`, `index.html`, `vercel.json`. OpenCode owns `supabase/` (and `scripts/` for provider scripts). Shared files (`AGENTS.md`, `docs/`, `src/types/`) change only with owner approval.
- SQL-only steps M4-S5 to M4-S7 may be pulled forward into the backend worktree once M1 is accepted.
- M1 work is isolated on `feat/foundation` (unless the audit finds an existing equivalent feature branch, in which case stop and ask the owner before changing branch strategy). After `ACCEPT M1`, merge `feat/foundation` into `main` only with the explicit G12 merge approval.
- After that merge, create `../samvad-frontend` on `feat/frontend` and `../samvad-backend` on `feat/backend`, both based on the updated `main`. Each agent works in its own git worktree and assigned directories. Both read the same `AGENTS.md` and `docs/`.

---

## 3. Global rules (apply to every step)

**G1 Precedence.** `AGENTS.md` > specialized `docs/*` > this file (sequencing) > `README.md` > `M.md` (historical). Figma V2 is the visual source; written requirements override visual artefacts. If two sources conflict, stop and report with file/line references.

**G2 Fixed architecture.** React + Vite + TypeScript + Tailwind SPA (`/` patient, `/doctor` doctor). Vercel frontend. Supabase Postgres, Auth, RLS, Edge Functions (Deno). Exactly two Edge Functions: `chat-turn` and `speak`. Booking, availability and Mark Reviewed are Postgres RPCs. Gnani Prisma (STT), Gnani Timbre (TTS), Groq (reasoning). One repository. `src/lib/api.ts` is the only browser module calling Supabase Auth, `.from()`, `.rpc()` or `.functions.invoke()`.
Do not add: Next.js, FastAPI/Python, Render, WhatsApp, telephony, Realtime, WebSockets, streaming TTS, extra audio server, staff/admin UI, doctor Settings, notification bell, print, patient signup, or a second repository.

**G3 Safety and privacy.** Educational demo; synthetic patients, fictional doctors and schedules only. No diagnosis, probabilities, prescriptions, treatment advice or invented facts. Keep patient-reported facts, AI-organized text and missing/unclear information distinct. Reports are English; patient UI is Hindi/English; doctor UI is English. Emergency handling is deterministic and demo-only: plain-text 112 guidance, no tap-to-call, no claim of any alert, call or dispatch. Do not log transcripts, audio, tokens or secrets.

**G4 One step per run.** State the intended files and commands first. If scope grows, stop and explain. Never continue to the next step without approval. Preserve existing work and documents; never delete, rename or regenerate them without approval.

**G5 No fabrication.** Never invent endpoints, model IDs, SDK methods, env var names, credentials, test results or deployment status. Unverified provider detail → mark UNVERIFIED and keep the text fallback. Anything blocked → mark BLOCKED, not passed.

**G6 Git.** Work only on your assigned branch/worktree. After an `APPROVE`, you may commit to that branch with the message `M<n>-S<k>: <summary>`; never commit secrets. A step approval does not authorize a merge, push, migration apply or deployment. Each requires its own explicit G12 phrase. Merge only after the owner has inspected the branch diff. On `ACCEPT M<n>` (after all steps in that milestone are approved), create a local tag `m<n>-accepted`. The git log is the progress record.

**G7 Step report.** Every step ends with: Changed, Not changed, Commands/checks run, Results (PASS / FAIL / NOT TESTED / BLOCKED), Security notes, Unverified items, Provider call counts (no content), Human action needed. Then `READY FOR HUMAN REVIEW`.

**G8 Evidence.** A checked box needs command output, a diff reference, a screenshot or a reproducible test. "It should work" is not evidence.

**G9 Time box.** If a step passes about 1.5× its share of the estimate, stop and propose a cut using Section 5.

**G10 Step tags.** `[SECURITY]`, `[PROVIDER]`, `[DEPLOY]` and `[DECISION]` steps always get their own approval. Untagged consecutive steps may be bundled by the owner (`APPROVE M2-S1..S3`) to save round trips. Bundling is optional.

**G11 Optional audit steps.** Each milestone's S0 audit may be merged into S1 when the previous handoff report is less than a day old.

**G12 Approval phrases.** `APPROVE M<n>-S<k>` (step), `ACCEPT M<n>` (milestone after every step is approved), `APPROVE MERGE <branch> INTO main` (local branch merge), `APPROVE PUSH <branch>` (push), `APPROVE APPLY <project> <artifact list>` (apply only the exact migration filenames and/or named seed files supplied in the approved plan, such as `supabase/seed.sql` or `supabase/seed-demo-reports.sql`), and `APPROVE DEPLOY <target>` (deploy). Each phrase must identify the exact project/branch/target; apply approvals must list every migration and every seed file being run. Use one exact phrase per action/target. Step approval and milestone acceptance never imply merge, push, apply or deploy. A local merge does not authorize a push.

**Step prompt preamble (prepend to every prompt below):**
```text
Follow Global Rules G1–G12 in MILESTONES.md and read AGENTS.md and the docs/ files relevant to this step. AGENTS.md and specialized docs have higher precedence for architecture/safety; when stale sequencing or old demo-password instructions conflict, stop and report until the owner-approved v4 copies are installed. Never publish credentials.
```

---

## 4. Owner decisions (recommended defaults; reply to confirm or change)

| ID | Decision | Recommended default | Why |
|---|---|---|---|
| D1 | How slots exist | **Compute availability inside `get_available_slots()` from schedule rules, minus confirmed appointments.** Seed only schedule rules, not pre-generated slot rows. | A seed-time generated 14-day window expires. Judges may open the demo after 10 Nov and find no slots. |
| D2 | Supabase projects | One project serves dev and demo (synthetic data only). Migrations are applied in M1-S7 and later, not first in M4. | M3 needs a live database to test JWT/RLS. The old plan applied migrations only in M4-S9. |
| D3 | Name and age question screens | Reuse the ConversationView layout; no new Figma design. Age is a whole number of years. | Required by docs; absent from Figma V2. |
| D4 | Patient state when routine booking is blocked pending human review | Recommended copy: **“Your report has been submitted. Routine appointment booking is paused until a doctor reviews it.”** Owner must approve the English text and its Hindi translation before M2-S6. | Makes the workflow state clear without implying diagnosis, emergency dispatch or medical clearance. |
| D5 | Spend protection | Use project-wide Asia/Kolkata daily counters with **adjustable limits stored in a server-only `daily_usage_limits` table** and atomically consumed `daily_usage_counters`. Proposed starting limits: **100 session creations, 300 Groq calls, 150 Prisma calls and 120 Timbre calls per IST day**. These are application guardrails, not provider quotas or a conversion of programme credits into calls. Owner verifies provider balances/quotas, adjusts the limits before M3-S3, and keeps judge/recording headroom. Limits can be changed through the Supabase Dashboard SQL Editor without redeploying; never expose them for browser editing. Cached-audio generation uses the manual 10-call reservation procedure in M3-S7 and does not receive database write credentials. Every attempted app-provider request counts, including provider errors. A narrow `SECURITY INVOKER` SQL RPC named `reserve_daily_usage` is permitted as an internal helper: it derives the IST date inside SQL, accepts only an allowlisted counter name (never a caller-supplied date), performs the atomic limit check/upsert, uses an empty/fixed `search_path` and schema-qualified table names, revokes execute from `PUBLIC`, `anon` and `authenticated`, and grants execute only to `service_role`. The Edge Functions call it only through the elevated server-side client. It is not a third Edge Function, not `SECURITY DEFINER`, and never browser-callable. | The earlier 25-session/60-Prisma values risk exhausting the demo during acceptance and judging. Configurable server-side limits allow capacity to be adjusted without a frontend/backend redeploy, while atomic counters prevent concurrent requests from exceeding the configured cap. The M1-S5 setup probes occur before counters exist; record them separately and check remaining provider balances. |
| D6 | Repository visibility | Keep the code repository private unless the current official participant form or written terms explicitly require public source code. Public demo video/social posts must still be public. Never publish working doctor passwords. | Official pages checked on 1 Nov 2026 list a working app, public demo video, written explanation, model/API names and nominated LinkedIn/X post links; they do not list a public GitHub repository or public password. The registration terms refer to a participant workspace, but the current programme FAQ and challenge blog state that there is no participant dashboard and that the submission form is emailed. Follow the current email instructions for your registration and recheck the official pages; do not assume a private evaluator-credential field exists. |
| D7 | Commits | Agents commit to their own branch after each approved step (G6). | Gives rollback points and a measurable progress record. |
| D8 | Doctor demo credentials | **Keep working passwords private.** Create the General Medicine and Emergency doctor Auth users for internal tests after M1-S7. Public README/Figma/screenshots/social posts must say evaluator credentials are shared privately, not display them. Share a restricted evaluator account only through a channel explicitly approved by the challenge organisers; check the current submission route/instructions. If no secure field exists, ask organisers for an accepted private access method. | A public shared doctor password would expose reports and doctor controls to anyone who discovers it, including people submitting content through the public patient site. |
| D9 | Required UI state copy | Use the exact English copy and Hindi draft in Section 4. Owner reviews and approves the Hindi wording before M2-S4/S5 acceptance. | The cap and ambiguous-emergency outcomes must be visible and testable in both patient languages; backend-only states are not sufficient. |

**D9 UI copy (English source; Hindi is a draft requiring owner review):**

- **Demo busy (global daily cap):** EN: “This demo has reached today’s usage limit. Please try again later.” HI draft: “यह डेमो आज की उपयोग सीमा तक पहुँच गया है। कृपया बाद में फिर कोशिश करें।”
- **Incomplete preview at the 15-answer-turn cap:** EN: “We’ve reached the demo conversation limit. This summary may be incomplete. You can review it, then end this session. It will not be sent to the hospital.” Button: “End session”. HI draft: “डेमो बातचीत की सीमा पूरी हो गई है। यह सारांश अधूरा हो सकता है। आप इसे देख सकते हैं और फिर यह सत्र समाप्त कर सकते हैं। इसे अस्पताल नहीं भेजा जाएगा।” Button: “सत्र समाप्त करें”. This preview has no Submit button, booking, doctor visibility or later submission flow.
- **Ambiguous emergency clarification:** EN: “Is this happening to you right now?” Buttons: “Yes” / “No”. HI draft: “क्या यह अभी आपके साथ हो रहा है?” Buttons: “हाँ” / “नहीं”. The backend presents this only after an ambiguous phrase match; the browser never detects emergencies. “Yes” confirms the demo trigger and enters the urgent path. “No” negates that specific candidate only; it is not a general safety clearance. Continue routine intake only if no other rule or review flag remains. An unclear/free-text answer or no reliable answer remains `needs_human_review` and blocks routine booking.
- **Private evaluator login card:** Title “Evaluator access”; line 1 “Credentials are shared privately with reviewers.”; line 2 “Not displayed in public project materials.” Do not replace these with a real password.

---

## 5. Scope tiers (what to cut if behind)

- **Tier A, must be in the submitted demo:** explicit consent, scripted intake (text or voice), draft report with patient review and submit, doctor login and report view, booking and Not now, deterministic emergency path, deployed URL, **at least one Gnani AI model/API working in the actual application flow and named accurately**, public demo video, written explanation and the required nominated public post link(s).
- **Tier B, should be:** the second Gnani integration (Prisma and Timbre together if both are enabled and stable), Groq adaptive question selection, Mark Reviewed, seeded sample reports, Hindi UI polish.
- **Tier C, cut first:** Romanized Hindi emergency variants (only needed if Prisma returns Roman text), `More dates` beyond the default window, Appointments "Past" tab polish, session-resume UI, extra accessibility polish.

At the **end of 4 Nov**, run the M3 checkpoint. If M3 is materially behind, immediately drop Tier C, then replace Groq adaptive selection with the fixed approved question order, then ship text-primary with voice as demonstrated-where-working. Do not wait until 6 Nov to make this scope decision. At least one verified Gnani model/API must still be genuinely used in the running application for challenge eligibility; if neither Prisma nor Timbre works in the app, do not describe the project as challenge-ready. Never cut explicit consent, the emergency path, ownership checks or the secret scan. A provider marked BLOCKED is not counted as integrated.

---

## 6. Milestone 1 — Foundation (weight 15)

**Owner:** Antigravity lead; OpenCode optional read-only reviewer.
**Outcome:** one preserved repo; reproducible toolchain with `/` and `/doctor` routes and Vercel SPA rewrite; design handoff; linked Supabase project; **provider facts verified early**; the full data model with RLS applied to the dev project and fictional seed data; the shared contract. M1 changes from v1: provider verification and schema application are earlier, and the schema covers all tables (booking tables included, booking RPCs excluded).

### M1-S0 — Read-only audit · w1 · [ ] approved
```text
Execute only M1-S0. Read AGENTS.md, README.md, M.md and all docs/. Inspect the repo, git status, package files, folder tree, supabase/, docs/design and the current build status if safely runnable. From the current official docs of Antigravity and OpenCode, report which workspace instruction filename each reads. Do not edit anything. Return: inventory, missing prerequisites, contradictions with source locations, any existing migrations/functions/deployments, and the exact recommended M1-S1 scope.
```
**Gate:** no files changed; instruction-file behaviour verified or marked unverified; baseline known; current repo branch and working-tree state recorded.

### M1-S1 — Protect work and settle the single repository · w1 · [DECISION] · [ ] approved
```text
Execute only M1-S1. Based on the audit, ensure exactly one Git repository. Preserve any existing repo; never create a nested one; never discard uncommitted work. If none exists, ask before git init. Do not create a GitHub repo, change visibility, commit, push or merge without approval. Verify all existing docs are unchanged. If the current branch is `main`, the worktree is clean and no conflicting `feat/foundation` branch exists, create or switch to `feat/foundation` from `main`. If the worktree is dirty, the branch already exists with unexpected history, or the current branch is not `main`, do not switch, reset or overwrite anything; report the exact state and ask the owner for the branch plan. Report repository state and required human action.
```
**Gate:** one repo; no nested repo; docs and uncommitted work preserved; `feat/foundation` is created from a clean `main` or the step is BLOCKED pending owner branch instructions; no remote action taken.

### M1-S2 — Toolchain, SPA shell, deployment config · w2 · [ ] approved
```text
Execute only M1-S2. Reuse the existing toolchain if sound; otherwise scaffold React + Vite + TypeScript + Tailwind without replacing existing files. Add only: routes for `/` and `/doctor` (minimal shells, no real screens), `vercel.json` with the SPA rewrite so `/doctor` survives refresh, `.gitignore` (excludes .env* except .env.example, Supabase local state, build output), and `.env.example` containing only VITE_SUPABASE_URL and VITE_SUPABASE_KEY with empty values. No unrelated dependency upgrades. Run the install/build and record exact versions.
```
**Gate:** reproducible install and build; both routes resolve; rewrite file present; no secrets or unnecessary dependencies.

### M1-S3 — Design handoff and design gaps · w1 · [ ] approved
```text
Execute only M1-S3. Inspect Figma V2 via Dev Mode/MCP if available (read one screen per call; limits are low). Extract only verified tokens, fonts, dimensions and assets, and export or list the PNGs for docs/design (one per screen, named like P6-review.png) without overwriting existing exports. Confirm Plus Jakarta Sans and Noto Sans Devanagari asset availability and whether the Figma file contains any Hindi screens. List screens and states required by the docs but missing in Figma (at least: name and age question states, the booking-blocked/review-pending state, post-"Don't submit" destination, Hindi layouts). Do not invent CSS values or recreate screens from memory. If access is unavailable, list the exact exports the owner must provide and stop.
```
**Gate:** traceable tokens/assets, or a precise export checklist; design gaps listed.

### M1-S4 — Link Supabase safely · w1 · [SECURITY] · [ ] approved
```text
Execute only M1-S4. Inspect Supabase config and CLI. Using the owner-provided project reference, confirm the project identity with the owner before linking. Do not create another project. Do not apply migrations, seed or deploy. Do not print tokens or keys. Report CLI version and linked project identity in non-secret form. Remind the owner to enable anonymous sign-ins in Auth settings (do not change settings yourself) and report whether they are enabled.
```
**Gate:** correct project linked; no secret in output or files; anonymous sign-in status known.

### M1-S5 — Provider verification spike · w2 · [PROVIDER] · [ ] approved
```text
Execute only M1-S5. Use only secrets the owner has configured securely (never ask for them in chat; never print them). Run these minimal non-clinical synthetic checks against current official docs and record results with source links and date in docs/provider-notes.md (shared doc: ask approval to create it):
(a) Groq: a currently available model, structured-output support, one JSON-schema call.
(b) Gnani Prisma: enabled model/version, endpoint, auth, accepted audio codec/container, size/duration limit, language codes; transcribe one synthetic English and one synthetic Hindi clip in the audio format the browser can actually produce. Record whether WebM/Opus is accepted and whether hi-IN returns Devanagari or Roman text.
(c) Gnani Timbre: exact model ID, endpoint, languages, output format; synthesize one short non-clinical sentence in English and Hindi.
Do not commit test scripts without approval. Report provider call counts. Anything unavailable is BLOCKED with the exact missing items.
```
**Gate:** each check has evidence or is BLOCKED; no secrets or health content; audio format and Hindi script are known before M2/M3 depend on them.

### M1-S6 — Author schema and RLS migrations (not applied) · w2 · [SECURITY] · [ ] approved
```text
Execute only M1-S6. Read report-design.md, architecture-decisions.md, demo-seed-data.md and AGENTS.md; inspect existing migrations. Author timestamped, additive migrations for the whole data model: sessions, consent records (decision, text/version, language, server timestamp), messages (original and corrected transcript kept separately), reports (relational columns + versioned JSONB per report-design.md, intake reference, status, review fields), departments, doctors, doctor_profiles, doctor_schedules (rule rows: weekday, start, end, break, slot minutes, timezone), appointments (unique constraint: one confirmed booking per doctor and slot start; one confirmed appointment per report), plus a server-only `daily_usage_limits` table (counter name, configurable positive daily limit, updated timestamp) and a server-only `daily_usage_counters` table keyed by Asia/Kolkata calendar date and counter name (`sessions`, `groq`, `prisma`, `timbre`) with an atomic count/upsert strategy for D5. `daily_usage_limits` must be editable by the project owner through Supabase Dashboard SQL Editor without redeploying; read it only from trusted server-side code. Both tables must have RLS enabled and no anon/authenticated grants or policies. Grant `service_role` only the minimum needed: `SELECT` on `daily_usage_limits`, and `SELECT`/`INSERT`/`UPDATE` on `daily_usage_counters`; do not grant browser roles any access. The internal `reserve_daily_usage` function's `EXECUTE` grant is service_role-only. The local cached-audio script must not access the database; its manual reservation process is defined in M3-S7. Do not add a third Edge Function or a broadly executable SECURITY DEFINER helper. No availability/booking/mark-reviewed RPCs (those are M4). Enable RLS on every exposed table. No browser INSERT/UPDATE/DELETE on server-owned tables. Doctor read policies must require a doctor_profiles mapping for auth.uid() plus the documented read-only Emergency exception; drafts hidden except urgent_partial. Policies must never rely on the `authenticated` role alone, because anonymous patient sessions also have it. Explain each migration's security effect. Do not apply anything.
```
**Gate:** additive migrations match the docs; both usage tables are server-only and owner-adjustable via Dashboard SQL Editor; RLS everywhere; no broad policy; no client write path; anonymous-vs-doctor distinction explicit.

### M1-S7 — Apply to dev project and seed fictional data · w1 · [SECURITY] · [ ] approved
```text
Execute only M1-S7. First show the exact pending migration list and target project identity. Author `supabase/seed.sql` locally with six departments and doctors using the exact fictional names from `docs/demo-seed-data.md`, plus schedule rule rows (Asia/Kolkata, weekdays, 09:00–17:00, 30-minute slots, lunch 13:00–14:00, last start 16:30). Emergency has no schedule rows. Before applying anything, show the complete seed diff, every migration filename, and expected row counts; wait for the owner's single exact approval phrase naming the project, every migration and `supabase/seed.sql` (for example `APPROVE APPLY <project> <migration-1> <migration-2> supabase/seed.sql`). Apply only those named artifacts, in order; do not apply anything merely because it is pending. Do not insert `doctor_profiles` rows or touch `auth.users` in this step; two Auth identities are created manually and mapped in M1-S8. Report migration versions and actual row counts. Run an anonymous-user JWT check proving it cannot read doctor tables or write server-owned tables.
```
**Gate:** only the exact owner-approved migrations and `supabase/seed.sql` are applied in order to the named project; seed counts reported; anonymous-access check has evidence; both usage tables are server-only.

### M1-S8 — Create both doctor Auth identities and profile mappings · w1 · [SECURITY] · [ ] approved
```text
Execute only M1-S8. The owner creates two users through Supabase Dashboard → Authentication (never SQL into `auth.users`): (1) General Medicine / Dr. Aditi Rao and (2) Emergency / Dr. Neha Verma. Ask the owner for each account's email and Auth UID only; never request or handle passwords. Prepare an exact, reviewed mapping SQL file named `supabase/seed-doctor-profiles.sql` (or the owner-approved project-specific equivalent) that inserts/upserts only the two `doctor_profiles` mappings using the existing doctor IDs and provided Auth UIDs. Do not place passwords or auth tokens in this file. Show the complete SQL, project identity and expected two rows, then stop for a separate `APPROVE APPLY <project> supabase/seed-doctor-profiles.sql` before the owner runs it in the Supabase SQL Editor. Do not run it yourself, do not change `auth.users`, do not add a public credential, and do not grant browser writes. Verify both rows map to the correct fictional doctor records after the owner confirms the SQL execution. This step exists before M3 so M3-S9 can test doctor visibility and draft invisibility with real mapped identities.
```
**Gate:** two dashboard-created Auth users exist; both `doctor_profiles` mappings are owner-approved and verified; only email/UID were shared with the agent; passwords remain private; no `auth.users` SQL or browser write path.

### M1-S9 — Shared contract in `src/types/` and `api.ts` · w2 · [DECISION] · [ ] approved
```text
Execute only M1-S9; get owner approval before editing src/types/. Define: the chat-turn discriminated request/response types with the exact actions start_session, resume_session, record_consent, submit_turn, correct_draft_report, submit_report; the report types and information-status enum from report-design.md; warning-flag types; department keys; the consent text version constant; the approved-question-ID type fed from a single shared list; appointment and slot types; and the api.ts function signatures listed in AGENTS.md. Add a typed mock implementation of api.ts behind one documented switch, with synthetic data whose dates are relative to today. No Supabase calls outside api.ts. Report the contract summary and the build/type-check result.
```
**Gate:** one definition per type, no duplicates; both agents can build to it; mock is isolated and replaceable.

### M1-S10 — M1 handoff · w1 · [ ] approved
```text
Execute only M1-S10. Review the M1 diff, confirm existing docs are intact, run build/type checks, scan for secrets and duplicate repos, and list blockers. Produce the handoff: step IDs, evidence, changed files, limitations, human actions, and the start conditions for M2 and M3 (which can run in parallel; M3 security tests must find both M1-created doctor identities). Do not push, merge or deploy.
```
**Gate:** owner replies `APPROVE M1-S10`. After all M1 steps are approved, the owner separately replies `ACCEPT M1`; only then create the local `m1-accepted` tag. Merge `feat/foundation` into `main` only after the owner gives `APPROVE MERGE feat/foundation INTO main`.

**M1 done when:** [ ] one repo, docs intact · [ ] build passes, `/` and `/doctor` work with rewrite · [ ] design handoff or export list · [ ] Supabase linked, anonymous sign-in enabled · [ ] provider notes recorded or BLOCKED · [ ] migrations applied with RLS evidence · [ ] fictional seed applied · [ ] both doctor identities and profile mappings provisioned · [ ] shared contract approved · [ ] `ACCEPT M1`.

---

## 7. Milestone 2 — Frontend on a mock API (weight 25)

**Owner:** Antigravity; OpenCode may review diffs from a separate worktree, never co-edit.
**Start:** M1 accepted and `feat/foundation` merged into `main` with explicit owner approval. Create the frontend worktree from that updated `main`. **Outcome:** Figma V2 implemented in the SPA against the typed mock API, so M4 only swaps the adapter.
**M2 rules:** Figma V2 is visual truth; do not redesign or invent screens; fonts Plus Jakarta Sans + Noto Sans Devanagari; patient Hindi/English, doctor English; exact Figma copy where it exists; mock data isolated and dated relative to today; no fake success presented as real; no browser emergency detection.

### M2-S0 — Frontend readiness audit · w1 · [ ] approved
```text
Execute only M2-S0. Read the M1 handoff and docs/design. Compare the current code to the 22-frame Figma V2 inventory. Do not edit. Return gaps grouped by patient flow, doctor flow, shared components, language/accessibility, backend assumptions; list missing Figma exports; list required-but-undesigned states (name and age questions, booking-blocked state, post-"Don't submit" destination, Hindi layouts) and what Figma's prototype does on "Don't submit". Recommend the smallest M2-S1 scope.
```
**Gate:** no edits; evidence-based gap list.

### M2-S1 — Design tokens and primitives · w2 · [ ] approved
```text
Execute only M2-S1. Implement only verified Figma V2 tokens and the primitives later screens need (typography, colours, radii, frosted surfaces, buttons ≥48px, inputs, cards, chips, status chips, dialog). Use actual font assets. No full screens. Run the build and show one component preview.
```
**Gate:** tokens traceable to Figma; fonts load including Devanagari; keyboard/focus works; build passes.

### M2-S2 — Patient shell, i18n, mock API wiring · w2 · [ ] approved
```text
Execute only M2-S2. Implement the patient route shell, a screen-state machine matching the approved flow, language toggle and src/i18n/en.ts and hi.ts. Mark all Hindi strings DRAFT for owner review; do not invent medical terms. Wire the shell to the typed mock API from M1-S9 only through src/lib/api.ts. Do not change consent semantics.
```
**Gate:** `/` loads; language switch keeps state; layout matches 390×844; no direct Supabase calls in components.

### M2-S3 — Welcome, consent and consent-declined · w2 · [ ] approved
```text
Execute only M2-S3. Implement P1 Welcome, P2 Consent and P11 Consent declined with exact Figma copy. Consent is only the on-screen Yes/No button. No stores health content. "No" collects nothing and creates no report. Test both paths.
```
**Gate:** Yes and No reach distinct states; no data collected on No.

### M2-S4 — Conversation, scripted questions and voice/text states · w4 · [ ] approved
```text
Execute only M2-S4. Implement P3, P3b, P4, P4b and P5: scrolling chat log, current question, quick-reply chips (severity, gender), mic idle/listening/processing with 30 s countdown, Type and Done controls, replay question, editable "What we heard" step before sending a voice answer, processing state, and mic-denied text mode. Add the scripted name and age question states using the ConversationView layout (age is a whole number of years). Also implement the backend-driven ambiguous-emergency clarification state with Yes/No chips and the exact D9 copy in English and the owner-reviewed Hindi copy. Add the session-creation-cap `demo_busy` fallback state using the D9 English/Hindi copy; render it only when the backend returns that specific response, never infer the cap in the browser. Provider-specific cap responses use their own text/scripted fallbacks, not the global demo-busy screen. Do not pretend a mock transcribed speech. Keep audio handling inside src/lib/audio/ behind the API boundary. Test all these states with synthetic fixtures.
```
**Gate:** all states render; transcript editable before send; text fallback fully usable; name/age/gender/concern order matches AGENTS.md; backend-driven ambiguous-emergency Yes/No chips and global demo-busy message render correctly in English and owner-approved Hindi; no client-side emergency or usage-limit detection.

### M2-S5 — Report review, correction, submit / don't submit · w3 · [ ] approved
```text
Execute only M2-S5. Implement P6 per report-design.md and Figma. Show patient-reported values, the department chip with "Preliminary suggestion, not a diagnosis", and missing values as "Not provided". Only allowlisted patient fields are editable; routing, flags, doctor and status are not. Provide "Submit to hospital" and "Don't submit" for a normally completed intake. On "Don't submit", end the session without submitting, creating an appointment or exposing the saved draft to doctors; keep any saved draft private under the existing session behaviour. No slots appear. Also implement the incomplete-at-15-answer-turn preview using D9 copy: show the partial values and clear incomplete disclaimer, with only the "End session" action. This cap preview must not display Submit, correction-to-submit, booking or any path that creates a submitted report; it remains private to the same patient session and is not visible to doctors. If the backend says completion was already satisfied at the cap, render the normal report-review/submit flow instead. Destination after ordinary "Don't submit" follows the verified M2-S0 Figma finding without inventing new copy. No slots before successful normal submit. Typed mock only.
```
**Gate:** only allowlisted edits; distinct submit/don't-submit paths; incomplete cap preview has exactly one End action and cannot submit/book/be read by doctors; normal completed-at-cap flow follows standard submission; no slots pre-submit.

### M2-S6 — Booking, slot problems, confirmation, report-only · w3 · [ ] approved
```text
Execute only M2-S6. Implement P7, P8a, P8b, P9a, P9b: doctor line, date chips, slot chips, "More dates", "Not now", no-slots card (no alternative grid), slot-taken banner above a slot grid, confirmation with reference code, and report-only confirmation. Add the booking-blocked state using the exact owner-approved D4 English copy and owner-reviewed Hindi translation. This is a workflow hold for a submitted report with `possible_urgent` or `needs_human_review`; do not imply diagnosis or medical clearance. If D4 is not approved, stop this step before inventing or shipping copy. Never show Emergency slots. Keep components ready for server-controlled availability. Do not label mock bookings as real.
```
**Gate:** all booking states distinct; Emergency never shows slots; Not now creates no appointment in the mock.

### M2-S7 — Emergency screen · w1 · [ ] approved
```text
Execute only M2-S7. Implement P10 with the exact approved text, large plain "112", no call button, no slots, no claim of an alert. The screen is entered only from a backend-provided state; implement no detection logic in the browser. Test with a fixture.
```
**Gate:** no route back into booking; no tap-to-call or false alert.

### M2-S8 — Doctor shell, login, dashboard · w2 · [ ] approved
```text
Execute only M2-S8. Implement the English-only `/doctor` shell, D1 login with the exact private evaluator-access card copy from D8 (title “Evaluator access”; “Credentials are shared privately with reviewers.”; “Not displayed in public project materials.”). Do not show placeholders that imply a password will be published later, and never show actual working credentials. Implement D2 dashboard with Urgent/New/Booked/Not booked cards defined in report-design.md and recent reports. Four-item sidebar only, with AR profile and Log out. No Settings, bell, print or signup. Synthetic mock data; no drafts shown.
```
**Gate:** `/doctor` independent; stat definitions followed; login card matches the updated Figma wording; no password or public credential field/card; forbidden elements absent.

### M2-S9 — Doctor reports, detail, appointments, urgent · w3 · [ ] approved
```text
Execute only M2-S9. Implement D3 tabs All/Urgent/Booked/Not booked, D4 normal detail, D5 urgent detail (no booking action), D6 appointments (Today/Upcoming/Past derived from slot time), D7 urgent review list. The full-conversation panel starts collapsed. Add only the Mark Reviewed action, shown as success only after the API call resolves. Apply the read-only Emergency visibility rules. Isolated synthetic data.
```
**Gate:** views and filters work with fixtures; Mark Reviewed is the only doctor write; conversation collapsed by default.

### M2-S10 — Visual, responsive and accessibility regression · w1 · [ ] approved
```text
Execute only M2-S10. Compare implemented screens to Figma V2 exports at 390×844 and 1280×820, including key empty/error/listening/processing/emergency states. Fix only evidenced deviations. Check overflow, keyboard navigation, focus, labels, contrast and Hindi/Devanagari rendering and wrapping. Run build and type/lint checks. No redesign, no new features. Produce screenshots and a deviations list.
```
**Gate:** build passes; no major overflow or Devanagari defect; owner has reviewed the Hindi strings.

### M2-S11 — M2 handoff · w1 · [ ] approved
```text
Execute only M2-S11. Review the full M2 diff. Confirm all screen data goes through src/lib/api.ts, mocks are isolated, no secrets or real data, no extra frameworks. Report step IDs, changed files, screenshots, mocked behaviours awaiting backend, known defects and M4 integration needs. Do not push, merge or deploy.
```
**Gate:** owner replies `APPROVE M2-S11`. After all M2 steps are approved, the owner separately replies `ACCEPT M2`; only then create the local `m2-accepted` tag.

**M2 done when:** [ ] patient flow EN/HI incl. name/age · [ ] consent paths · [ ] transcript edit and text fallback · [ ] report review/submit · [ ] booking, emergency, declined states · [ ] doctor views EN · [ ] no forbidden features · [ ] build and visual evidence · [ ] `ACCEPT M2`.

---

## 8. Milestone 3 — Backend, intake AI, voice (weight 30)

**Owner:** OpenCode in its own worktree on `supabase/` (otherwise Antigravity).
**Start:** M1 accepted and `feat/foundation` merged into `main` with explicit owner approval (M2 not required). Create the backend worktree from that updated `main`. **Outcome:** a secured text-first intake workflow with consent, deterministic emergency path and report submission, then each available Gnani integration and optional Groq reasoning layered on only after verification, with safe fallbacks for anything unavailable. Revised effort estimate: about 16 focused hours; do a hard progress/scope checkpoint by end of 4 Nov.
**M3 rules:**
- Every user-facing call verifies the Supabase JWT; derive the user from claims, never from a client UID. Verify session/report ownership on every read and write.
- After verification, use the narrow elevated server client for `sessions`/`messages`/`reports` writes; filter by verified owner and resource IDs. Never expose secrets.
- Runtime-validate every request and every provider output; reject unknown actions, fields, question IDs, transitions and department keys.
- Groq may extract patient-reported facts, name missing fields, pick one approved question ID, suggest an allowlisted routine department, and flag supplementary `possible_urgent`. It may not diagnose, prescribe, book, write SQL, write to the database, or decide completion.
- Backend owns completion: name, age, gender, primary concern answered; duration and severity answered; conditions, medications, allergies and other symptoms each asked once.
- Use only formats and model IDs verified in `docs/provider-notes.md`. Raw audio is discarded after processing. Never generate TTS during Vercel build.
- Server-side cap: 15 patient answer turns per session.

### M3-S0 — Backend baseline audit · w1 · [ ] approved
```text
Execute only M3-S0. Read the backend docs, M1 handoff and docs/provider-notes.md. Inspect migrations (and which are applied), functions, _shared modules, seed, RLS and contracts. Do not edit. Report what exists, what is missing, security risks, provider status and the smallest M3-S1 scope.
```
**Gate:** evidence-based audit; applied-migration state known.

### M3-S1 — Shared modules and bilingual question bank · w3 · [ ] approved
```text
Execute only M3-S1. Implement in supabase/functions/_shared/: runtime request validation (discriminated union), verified-caller and session-ownership helpers, the conversation state machine, safe fallback logic, and questions.ts: one entry per field with stable ID, English text, Hindi text, target report field, input type and conditions, plus the fixed emergency Yes/No clarification question. Fixed questions stay scripted in order: name, age, gender, primary concern. Mark all Hindi strings needs_owner_review. Allowlist all IDs, fields, statuses and department keys. Do not change shared frontend types without approval. Add focused tests with synthetic fixtures.
```
**Gate:** unknown values rejected; fixed questions cannot be skipped or rewritten; tests pass; owner reviews Hindi text before M3 acceptance.

### M3-S2 — Session, resume and consent · w3 · [SECURITY] · [ ] approved
```text
Execute only M3-S2. Implement chat-turn actions start_session, resume_session, record_consent. Use the anonymous Supabase identity; verify ownership on resume. Store the explicit Yes/No decision, consent text/version, language and server timestamp. Never infer consent from speech. A "No" stops all health-data collection and creates no clinical report. Add focused synthetic tests.
```
**Gate:** valid JWT and owner checks; consent persisted; declined path collects nothing; resume only for the same identity.

### M3-S3 — Text-first scripted intake, turn cap, global cap · w3 · [SECURITY] · [ ] approved
```text
Execute only M3-S3. Implement `submit_turn` for text. Enforce fixed order and completion rules; keep original answers; never invent missing values. Use two server-only tables authored in M1-S6: `daily_usage_limits` (one configurable per-IST-day limit per counter name) and `daily_usage_counters` (one atomic consumption count per IST calendar date and counter name). If the M1 audit finds either missing, author an additive migration and wait for the exact apply approval. The application must read limits server-side for each reservation; the owner can change limits through Supabase Dashboard SQL Editor without a redeploy. Neither table has browser read/write policies or client grants. Store the Asia/Kolkata date bucket on the server; never accept a client-supplied date. Enforce the 15-answer-turn-per-session limit server-side: accept at most 15 patient answer turns; the 15th answer may be accepted and saved, but once count reaches 15 make no further provider calls for that session. If backend completion rules are already satisfied by the 15th answer, allow the normal patient review and submit flow. If intake is incomplete, return a partial-draft preview state for the UI and provide only an End action; no Submit button, no bypass of completion validation, no `submitted` status, doctor assignment/visibility, or appointment. Persist it only as a private draft under the same authenticated session if existing retention behaviour supports that; otherwise keep it in-memory and discard it when the session ends. Do not invent a new report status or later submission flow. Global default limits (owner-adjustable before acceptance tests): 100 session creations, 300 Groq calls, 150 Prisma calls and 120 Timbre calls per IST day. They are project guardrails, not provider quotas or conversions from the 5,000 programme credits. The owner must check actual balances/quotas, expected acceptance-test use and judge headroom, then confirm/adjust D5 before applying. Implement the atomic reservation through a narrowly scoped PostgreSQL RPC such as `public.reserve_daily_usage(counter_name)`, with `SECURITY INVOKER`, an empty/fixed `search_path`, fully schema-qualified references, and execute permission granted only to `service_role` (revoke from `PUBLIC`, `anon` and `authenticated`). The function accepts only one of `sessions`, `groq`, `prisma`, `timbre`; it derives the current Asia/Kolkata date inside SQL and never accepts a client-supplied date or amount. It reads the current limit and uses one atomic `INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit RETURNING` operation (or a demonstrably equivalent transaction-safe implementation); a missing/invalid limit fails closed. The Edge Functions call this helper through the elevated server-only client before performing the reserved action. Do not create a broadly callable `SECURITY DEFINER` helper or expose this RPC to the browser. Make counter consumption atomic so simultaneous requests cannot exceed a cap; every attempted outbound app-provider call counts even when the provider errors. For session creation and every provider request, reserve/increment before performing the action. At the session-creation cap, return the backend `demo_busy` state and do not create another session. At an individual provider cap, reject only that provider request and use its non-paid fallback (Prisma → text entry; Timbre → the same approved question as text; Groq → scripted question/deterministic summary). Do not turn a single provider-specific cap into a global application lockout, and do not retry that capped provider until the next IST day or until the owner deliberately adjusts the limit. Limits must remain editable by the owner in the SQL Editor without a code change or deploy. The local cached-audio generation script is not allowed to connect to or write the usage database; its separate manual 10-call reservation is specified in M3-S7. No Groq or voice integration in this step. Add focused tests for atomic counter concurrency, cap boundaries, IST date rollover, session creation, provider attempts, and the incomplete-at-turn-cap state. Run counter-concurrency/date tests against a local or isolated test database/fixture; do not consume or reset the shared demo project's real daily counters just to test the cap. If no safe isolated test target is available, mark that test BLOCKED and request an owner decision rather than deleting or resetting live usage rows.
```
**Gate:** scripted text intake works end to end at backend level; the two usage tables are server-only; limits are adjustable through Dashboard SQL Editor without redeploy; 15-turn and global caps are atomic/server-enforced with focused concurrency and IST rollover tests; the incomplete-at-cap path cannot submit or expose the partial draft; session-cap `demo_busy` and provider-specific fallbacks behave correctly; owner-approved numeric limits are documented.

### M3-S4 — Deterministic demo emergency rules · w3 · [SECURITY] · [ ] approved
```text
Execute only M3-S4. Implement docs/demo-emergency-rules.md on the patient's current answer only: handle negation, quoted text and question text; ambiguous answers get the fixed Yes/No clarification; “Yes” confirms the current demo trigger and enters the urgent path; “No” negates only that candidate and is not a safety clearance; unclear/no reliable answer is flagged `needs_human_review` and blocks routine booking. A clear positive match stops intake, saves an urgent_partial report with the rule ID and patient statement, assigns the Emergency doctor and suppresses all routine slots. Include Romanized variants only if docs/provider-notes.md shows Prisma can return Roman Hindi. Groq possible_urgent stays supplementary. Never claim an alert, call or dispatch. Add tests: positive, negated, quoted, ambiguous, Hindi.
```
**Gate:** deterministic and bounded to the current answer; ambiguity never silently safe; urgent path blocks booking.

### M3-S5 — Report draft, correction, submission (no AI dependency) · w4 · [SECURITY] · [ ] approved
```text
Execute only M3-S5. Implement draft generation, correct_draft_report and submit_report inside chat-turn per report-design.md: information-status enum on every field, patient-reported facts separate from the summary and missing fields, a deterministic template summary (Groq enhances it later in M3-S8), server-generated intake reference, server-side routing allowlist with General Medicine fallback. Accept only allowlisted field updates, never a replacement JSON; reject edits to routing, flags, doctor, status. Revalidate consent, ownership and the normal completion rules on `submit_report`. A saved draft may remain private to the same authenticated session. "Don't submit" ends the session without submitting the report, creating an appointment or exposing the draft to any doctor; it does not mean the draft never existed. Do not invent a partial-submission status. An incomplete draft remains private. Add tests for private draft visibility, declined submission and completion validation.
```
**Gate:** report matches the contract; allowlisted edits only; draft and submitted states distinct; Don't submit leaves no doctor-visible report and no appointment. This completes the text-only backend slice.

### M3-S6 — Gnani Prisma speech-to-text · w3 · [PROVIDER] · [ ] approved
```text
Execute only M3-S6. Using the verified facts in `docs/provider-notes.md`, add audio handling inside `submit_turn` only for the verified codec/container, size and duration limits. Before a Prisma request, reject if the session already has 15 accepted patient answer turns and atomically reserve one Prisma call against the D5 IST-day counter; if the Prisma daily cap is reached, do not call Prisma and offer text entry. Count attempted calls even if the provider errors. Keep the original transcript separate from the patient-edited one. Discard raw audio. On unsupported format, empty transcript, timeout or rate limit, preserve the text fallback. Do not log audio or transcripts. Test with synthetic audio and report call counts. If any requirement is unverified, mark BLOCKED and stop.
```
**Gate:** a synthetic clip transcribes in the verified format, or BLOCKED with safe fallback; no content logging.

### M3-S7 — Timbre `speak` and cached opening audio · w2 · [PROVIDER] · [ ] approved
```text
Execute only M3-S7. Implement only the `speak` function: require a valid JWT, verify session ownership, accept session ID and the current approved question ID, load the text from server state, never accept client text. Configure the verified Timbre model explicitly. Before each adaptive TTS request, confirm the session has fewer than 15 accepted answer turns, then atomically reserve one Timbre call against the D5 IST-day counter. If the 15-answer-turn cap is reached, make no further provider calls and use the incomplete End-only preview when required. If only the Timbre daily cap is reached, make no Timbre request and show the same approved question as text; other non-Timbre functionality remains available. Use TTS only for adaptive questions; on failure return text immediately. Write `scripts/generate-opening-audio.ts` (manual, one-time, reads only the Gnani provider key from the owner's local environment, never reads Supabase secrets, never connects to the database, and never runs in the Vercel build) to produce exactly ten opening audio files: greeting, ask-name, ask-age, ask-gender and ask-primary-concern in English and Hindi under `public/audio/`. **Manual reservation fallback:** before running the script, the owner checks current Timbre usage and reduces the configured app Timbre limit in `daily_usage_limits` for that IST day by 10 (or by the exact number of generation attempts being reserved) using Supabase Dashboard SQL Editor only if the existing counter is no greater than the reduced limit; this leaves those calls reserved for the local script without giving it database write access. The owner records the 10-call reservation and every attempt in a private usage log / `docs/provider-notes.md` count-only entry. Keep the app Timbre limit reduced by the reserved amount for the remainder of that IST day; restore the normal limit only on the next IST day (or account for the actual used count before any same-day adjustment). The script makes at most 10 requests, counts failed attempts, and never auto-retries. If fewer than 10 calls are needed due to already-existing valid files, generate only the missing files and reserve only that exact number. If the owner cannot safely reserve/track the attempts or the adjusted app limit cannot be confirmed, stop before making calls and mark the cache-generation subtask BLOCKED; retain the text fallback. The greeting audio text must equal the on-screen consent text. Report call counts only. If the account/model is unavailable or the verified API fails, do not invent an endpoint or model: keep the `speak` text fallback, mark the Timbre portion BLOCKED and continue only if another verified Gnani model/API is integrated in the running app.
```
**Gate:** `speak` is bound to server-approved questions; adaptive calls use atomic app counters; the local cache script has no database access and makes no more than the manually reserved calls; the owner listens to all generated files; any unreserved/unverified attempt is BLOCKED and never claimed as integrated.

### M3-S8 — Groq extraction, adaptive selection, AI summary · w4 · [PROVIDER] · [ ] approved
```text
Execute only M3-S8. If Groq is enabled and a suitable model with the required structured-output behaviour was verified in `docs/provider-notes.md`, integrate it after the text slice and emergency rules are stable. Before each Groq request, confirm the session has not already reached 15 accepted answer turns, then atomically reserve one Groq call against the D5 IST-day counter; if either cap is reached, do not call Groq and use the deterministic/scripted fallback or incomplete End-only state. Count attempted calls even if the provider errors. Request structured JSON only; validate at runtime; reject invented facts, unknown fields, unapproved question IDs and unknown department keys. On timeout or invalid output keep the last valid state and use the scripted fallback question. Add a constrained English `ai_summary` that uses only patient answers (fallback: the deterministic template). The backend decides completion and all writes. Track call counts without logging content. Add tests with synthetic inputs. If no verified suitable model/access exists, mark Groq BLOCKED/omitted under Tier B and leave the scripted question bank and deterministic summary working; do not fabricate a model or endpoint.
```
**Gate:** if Groq is enabled, valid outputs are schema-checked and invalid/timeout falls back safely; if unavailable, it is explicitly BLOCKED/omitted with the scripted fallback verified; no AI-controlled writes or completion.

### M3-S9 — Security and failure verification · w3 · [SECURITY] · [ ] approved
```text
Execute only M3-S9. Verify with synthetic fixtures and report PASS/FAIL/NOT TESTED with evidence. Run concurrency and cap-exhaustion tests in a local/isolated test database or dedicated fixture; never reset or deliberately exhaust the shared demo project's real daily counters. Cover: missing/invalid JWT; wrong session owner; wrong report owner; an anonymous patient JWT calling doctor-only tables or RPCs; draft invisibility using both mapped doctor identities; General Medicine/Emergency role visibility; consent declined; unknown action/field/question/department; Groq timeout and invalid JSON; Prisma and Timbre failure where enabled; ambiguous emergency; 15-turn cap; each global IST-day cap; concurrent session/provider attempts at a cap; owner-adjusted limit changes without redeploy; DB write failure with no false success; no secrets or content in logs. Fix only M3-scope defects. No elaborate framework.
```
**Gate:** all security, ownership, consent, draft-privacy, emergency and no-false-success cases PASS with evidence. Provider-specific cases PASS when enabled or are marked BLOCKED with the working fallback demonstrated. Any NOT TESTED item has a reason and owner; a critical security/safety case that is NOT TESTED blocks M3 acceptance. No unresolved FAIL or leakage.

### M3-S10 — M3 handoff · w1 · [ ] approved
```text
Execute only M3-S10. Review the M3 diff. Confirm exactly two functions (chat-turn, speak), no booking RPCs added, no secrets committed, no real data. Record verified provider versions and model IDs with source links. Report steps, files, tests, blockers, frontend integration notes and the M4 start condition. Do not push, merge, apply to a shared project or deploy.
```
**Gate:** owner replies `APPROVE M3-S10`. After all M3 steps are approved, the owner separately replies `ACCEPT M3`; only then create the local `m3-accepted` tag.

**M3 checkpoint:** by end of **4 Nov**, owner reviews the M3 step report and accepted-weight progress. If the text slice, privacy checks, doctor-role tests or cap concurrency tests are materially behind, cut Tier C immediately; do not wait for 6 Nov.

**M3 done when:** [ ] session, resume, consent · [ ] text slice complete · [ ] 15-turn and owner-approved global caps · [ ] emergency rules · [ ] report draft/correct/submit and private Don't submit path · [ ] at least one Gnani model/API is verified and genuinely invoked by the running app · [ ] the second Gnani integration is verified or explicitly BLOCKED with fallback · [ ] Groq validated with fallback or safely omitted per Tier B · [ ] security matrix with evidence · [ ] exactly two functions · [ ] `ACCEPT M3`. A provider test spike alone does not count as an integration.

---

## 9. Milestone 4 — Integration, booking, release, submission (weight 30)

**Owner:** Antigravity (lead integration); backend/frontend edits only in their own directories.
**Start:** M2 and M3 accepted. **Outcome:** real end-to-end demo, secured doctor workflow, atomic booking, verified acceptance, human-approved deployment, and the challenge submission package.
**M4 rules:**
- Doctors are exactly: General Medicine Dr. Aditi Rao; Orthopedics Dr. Kabir Mehta; Emergency Dr. Neha Verma (no routine slots); General Surgery Dr. Ishaan Patel; Dermatology Dr. Sara Khan; Cardiology Dr. Arjun Nair.
- Schedule (Asia/Kolkata): weekdays 09:00–17:00, 30-minute slots, last start 16:30, lunch 13:00–14:00, next 14 days; slots are computed from schedule rules (D1).
- `get_available_slots()` is an authenticated, limited-read RPC and must run as `SECURITY INVOKER` (the default invoker privilege model), not `SECURITY DEFINER`. Revoke its EXECUTE privilege from `PUBLIC` and `anon`, grant it to `authenticated`, and reject calls without a valid `auth.uid()`. Schema-qualify referenced objects and avoid unsafe caller-controlled search paths. Grant only the minimum schedule-read and occupied-slot metadata needed to calculate availability. RLS/column grants must allow an authenticated anonymous patient to see schedule rules and only confirmed-slot occupancy fields (for example doctor and slot start), while hiding `report_id`, patient/user identifiers and all other appointment details. Do not grant broad appointment-table reads. If the schema cannot safely support that design, stop and present a safer alternative for owner approval before coding.
- `book_appointment()` and `mark_report_reviewed()` are the only SECURITY DEFINER exceptions: fixed safe `search_path`, schema-qualified objects, no dynamic SQL, revoke EXECUTE from `PUBLIC`/`anon`, grant to `authenticated`. Because anonymous patients are also `authenticated`, every RPC must check the caller's UID and report ownership or doctor mapping explicitly. `get_available_slots()` must also reject unauthenticated `anon` callers and return only available slot data. Schema-qualify referenced objects and avoid unsafe caller-controlled search paths; do not add a broadly executable helper or another user-facing Edge Function to work around RLS.
- Report-state rule: normal submitted reports may book. A submitted report with `possible_urgent` or unresolved `needs_human_review` is blocked from routine booking until an authorized doctor uses Mark Reviewed. After Mark Reviewed, routine booking may resume only if the report is a normal `submitted` report and has no deterministic emergency condition. A deterministic emergency / `urgent_partial` report is permanently ineligible for routine slots, even after Mark Reviewed. Mark Reviewed is a workflow acknowledgement, not medical clearance or proof the patient is safe.
- Never apply, push, merge or deploy without the relevant G12 phrase. Never claim success before tool output proves it.

### M4-S0 — Integration readiness audit · w1 · [ ] approved
```text
Execute only M4-S0. Read the M1–M3 handoffs. Trace the patient and doctor flows across api.ts, Edge Functions, tables, RLS and mocks. Do not edit. List every mock still in use, missing wiring, verify that both M1-created doctor Auth users/profile mappings exist, migration status and deployment prerequisites, and the safest integration order.
```
**Gate:** integration map and blockers; no edits.

### M4-S1 — Connect the patient text path · w3 · [ ] approved
```text
Execute only M4-S1. Replace the patient mocks with real api.ts calls: anonymous session start/resume, consent, chat turns (text), draft correction, report submission. Preserve UI, loading/error/retry states and the M1 contract; no Supabase calls in components. A failed backend call never shows success. Test with synthetic data against the dev project. Do not touch booking yet.
```
**Gate:** welcome-to-submitted-report path runs against the real backend; error paths show no false success.

### M4-S2 — Connect voice and audio · w3 · [PROVIDER] · [ ] approved
```text
Execute only M4-S2. Connect the mic and "What we heard" flow to the Prisma-backed path using the verified audio format, connect replay and adaptive audio to speak, and play the cached opening audio for fixed prompts (no Timbre call for them). Keep the editable transcript and text fallback on any permission, network, format or provider failure. Confirm no raw audio retention and no browser-side provider calls. If voice is unverified, keep text working and mark voice BLOCKED.
```
**Gate:** Prisma-backed speech input works or the text-entry fallback is clearly verified and voice is marked BLOCKED; fixed-prompt audio uses cached files only when available (never call Timbre for fixed prompts); adaptive TTS works or falls back to text; secrets remain server-side.

### M4-S3 — Provision and verify the demo doctor login · w1 · [SECURITY] · [ ] approved
```text
Execute only M4-S3. Do not create or remap users. Verify the two Auth users and `doctor_profiles` mappings created during M1-S8: General Medicine / Dr. Aditi Rao and Emergency / Dr. Neha Verma. Ask the owner to test login/logout for each identity in person; never request or view either password. Verify generic errors for bad credentials and ensure no working password appears in UI, README, screenshots, code, Git or logs. If an account/mapping is missing, stop and refer the owner to the M1-S8 recovery procedure; do not create an unapproved identity here.
```
**Gate:** both previously provisioned Auth users map to the correct fictional profiles; owner-tested login/logout for both; passwords remain private; no new account or mapping is created in M4.

### M4-S4 — Connect doctor reads under RLS · w3 · [SECURITY] · [ ] approved
```text
Execute only M4-S4. Replace doctor mocks with caller-scoped reads for dashboard stats, recent reports, tabs, report detail and conversation, and appointments. Doctors read assigned reports only, plus the documented read-only Emergency visibility for the General Medicine and Emergency doctors. Drafts are hidden except urgent_partial. No client-side privileged queries or broad policies. Test with synthetic doctor accounts and reports, and with an anonymous patient JWT.
```
**Gate:** unauthorized reads fail; visibility matches policy.

### M4-S5 — Availability RPC · w2 · [SECURITY] · [ ] approved
```text
Execute only M4-S5. Implement `get_available_slots()` as an authenticated `SECURITY INVOKER` limited-read RPC. It computes future slots from `doctor_schedules` and confirmed appointment occupancy, in Asia/Kolkata, for the next 14 days. It never returns Emergency slots and creates nothing. Before implementing, document the exact grants, column privileges and RLS policies: authenticated patients may read only non-sensitive schedule rules and the minimum confirmed-slot occupancy fields needed (doctor key/ID and slot start); they must not read appointment report IDs, patient/user IDs, names or other appointment details. Keep appointment details hidden. Do not solve this with SECURITY DEFINER or a broad appointments SELECT policy. If a safe invoker design is not possible with the actual schema, stop and ask the owner to approve an alternative. Test with both an authenticated anonymous-patient JWT and a non-authenticated anon request, plus empty dates, invalid doctor and Emergency queries. Show the migration before applying (G12).
```
**Gate:** slots follow schedule exactly; invoker-only permission design is documented and tested; no patient/appointment details leak; unauthenticated anon and Emergency queries are rejected/empty as specified; no booking occurs.

### M4-S6 — Atomic booking RPC · w3 · [SECURITY] · [ ] approved
```text
Execute only M4-S6. Implement `book_appointment()` per the M4 rules: verify `auth.uid()` owns the submitted report; reject Emergency department, deterministic emergency, `urgent_partial`, reports with an unreviewed `possible_urgent`/`needs_human_review` flag, and already-booked reports; allow a reviewed non-emergency submitted report to proceed if all other checks pass. Validate doctor/slot match and future time, lock and recheck availability in one transaction, rely on the unique constraint, and generate the reference code server-side. Mark Reviewed is not medical clearance; it only clears the workflow hold for eligible non-emergency submitted reports. Test wrong owner, pending review, reviewed routine report, deterministic emergency after review, duplicate and simultaneous attempts as far as the MVP allows, without building a framework. Show the migration before applying.
```
**Gate:** only report owner can book; pending human-review blocks; review can unblock only eligible non-emergency submitted reports; urgent/emergency never book; no double booking; server-generated reference; no privilege leak.

### M4-S7 — Mark Reviewed RPC and UI · w2 · [SECURITY] · [ ] approved
```text
Execute only M4-S7. Implement mark_report_reviewed(): verify the caller is a doctor mapped in doctor_profiles who may read that report; set only the reviewed timestamp and reviewing doctor. Connect the UI and show success only after the RPC succeeds. Test unauthorized callers (including an anonymous patient JWT) and repeat calls.
```
**Gate:** only the two review fields change; unauthorized calls fail; no false success.

### M4-S8 — Connect booking, Not now, confirmation, urgent handling · w3 · [ ] approved
```text
Execute only M4-S8. Connect the post-submit UI to `get_available_slots()` and `book_appointment()`. Not now creates no appointment and the submitted report stays visible to its assigned doctor. After a slot-taken response refresh slots; show confirmation only after RPC success and only the server reference. Suppress routine booking for deterministic emergency/`urgent_partial` reports permanently, and for submitted reports with `possible_urgent` or `needs_human_review` until an authorized doctor uses Mark Reviewed. After review, allow routine booking only for a non-emergency `submitted` report. Use the owner-approved D4 copy and owner-reviewed Hindi translation. Emergency shows plain 112 guidance only. Test no slots, slot taken, success, Not now, pending review, post-review ordinary report, and emergency before/after Mark Reviewed.
```
**Gate:** confirmation only after server success; Not now leaves no appointment; pending review blocks; reviewing a normal submitted report can release the workflow hold; urgent/emergency never gets routine slots even after review.

### M4-S9 — Demo environment finalization · w1 · [DECISION] · [ ] approved
```text
Execute only M4-S9. Verify migration parity between the repo and the target project (show pending items; apply only with APPROVE APPLY). Confirm the seed and doctor_profiles. If the owner approves, author a named `supabase/seed-demo-reports.sql` file with a few clearly synthetic submitted reports including one `urgent_partial` so the doctor dashboard is not empty on a judge's first login. Show the full file, target project and expected row counts, then wait for `APPROVE APPLY <project> supabase/seed-demo-reports.sql`. Apply only that named seed after approval. Report counts without secrets.
```
**Gate:** target verified; only explicitly named migrations and seed files applied; seed is fictional only; no real patient details or passwords.

### M4-S10 — Full manual acceptance · w3 · [ ] approved
```text
Execute only M4-S10 using synthetic patients and both provisioned demo doctor identities (General Medicine and Emergency). Test and mark PASS/FAIL/NOT TESTED with reproducible evidence: (1) language choice; (2) consent No ends with no health report; (3) consent Yes and fixed questions; (4) voice transcript edit or text fallback; (5) adaptive question and 15-turn cap; (6) incomplete-at-cap private draft path; (7) draft correction; (8) Don't submit leaves the draft private and creates no appointment; (9) submit and doctor visibility; (10) assigned-doctor visibility; (11) Emergency report read-only cross-visibility to General Medicine and Emergency doctors; (12) Mark Reviewed changes only the two approved fields; (13) pending model/ambiguous review flag blocks booking; (14) review of a normal submitted flagged report permits booking; (15) deterministic emergency remains blocked after Mark Reviewed; (16) slots, book and server reference; (17) Not now leaves no appointment; (18) wrong-user and anonymous-JWT access attempts; (19) minimal availability occupancy access leaks no patient/appointment details; (20) the session-creation cap returns `demo_busy`, while each provider-specific cap blocks only that provider and preserves its own safe fallback; (21) Hindi path end to end; (22) one pass on a real phone-sized browser; (23) no secrets in bundle or Git. Fix only in-scope blockers and rerun the affected case.
```
**Gate:** all critical security, consent, privacy, emergency, booking-state and no-false-success cases PASS with evidence. A provider-specific case may be BLOCKED only when the provider is unavailable and its fallback is demonstrated. Any other NOT TESTED item needs a reason and owner; a critical case marked NOT TESTED blocks M4 acceptance. No unresolved FAIL may be represented as accepted.

### M4-S11 — Production build and secret scan · w1 · [ ] approved
```text
Execute only M4-S11. Run npm run build and type/lint checks. Inspect the built bundle and Git for Gnani/Groq/service-role keys. Verify the Vercel SPA rewrite for /doctor, that frontend variables are only VITE_SUPABASE_URL and VITE_SUPABASE_KEY, and that server secrets live only in Supabase Function Secrets. Produce a deployment checklist and blockers. Do not push or deploy.
```
**Gate:** build passes; no server secret in bundle or Git; deploy steps documented.

### M4-S12 — Approved deployment and live smoke test · w2 · [DEPLOY] · [ ] approved
```text
Execute only M4-S12, and only the targets the owner approved with APPROVE DEPLOY. Deploy the approved Supabase functions/migrations and the Vercel frontend with the documented commands. Do not change targets or variables unapproved. Verify real output, then smoke-test with synthetic data: patient route, doctor route, chat-turn, speak (if enabled), report read, booking. On failure stop and report the exact error; do not retry destructive operations. No push or merge unless separately approved.
```
**Gate:** only approved targets deployed; both routes load live; key path smoke-tested.

### M4-S13 — Final handoff and freeze · w1 · [ ] approved
```text
Execute only M4-S13. Add no features. Produce: deployed URLs (if verified), branch/commit state, migration and function status, how to retrieve the demo login (never print the password), the tested acceptance matrix, known limitations, verified provider models, and a 3-minute judge demo sequence. Confirm no real data, secrets or unsupported clinical claims. Do not push, merge or deploy.
```
**Gate:** owner replies `APPROVE M4-S13`. Do not accept M4 yet; M4-S14 is still required.

### M4-S14 — Submission package · w1 · [DECISION] · [ ] approved
```text
Execute only M4-S14. Re-read the current official challenge page, registration/submission page and terms; record the access date and source URLs. Official challenge materials are not fully consistent about submission mechanics: the registration terms refer to a participant workspace, but the current programme page FAQ and challenge blog say there is no participant dashboard and the submission form is sent to the registered email. Treat the current programme FAQ/email instructions as the working route, then verify the actual link received for this registration. Do not assume the form has a confidential evaluator-credential field. Confirm the current deadline and required deliverables. At the time of this revision, the official programme page lists: participant/project details (title, problem, intended users, Gnani models/APIs and each member's contribution), a working application using at least one Gnani AI model/API, a public demo video, a written project explanation, exact model/API names, and one nominated public LinkedIn or X post link per platform used. The public post must explain the build, identify Gnani technology, tag Gnani AI and include #GnaniAI and #GreatIndianAIInternshipChallenge. Tagging alone is not submission; the post link must be nominated in the participant submission. The listed deliverables do not require a public GitHub repository; keep it private unless the current official portal/terms explicitly say otherwise. Verify all of this again rather than treating this prompt as permanent truth. Draft (do not post): project description, architecture summary, safety/limitations statement, exact verified Gnani model/API list, member contribution, a concise 3-minute walkthrough script (duration is our choice, not a stated universal requirement), and social post copy. Optionally draft a separate 60-second cutdown only if the owner wants to target the special 60-second demo award. Polish README setup/architecture/evaluator-access instructions. Keep working passwords out of README, code, screenshots, Git and public posts. The pages checked do not confirm whether the current submission route has a confidential evaluator-credential field: the owner must inspect the actual form. If it has an access field, verify that it is private/reviewer-only before sharing; if not, ask Gnani organisers through an official channel for an accepted private evaluator-access method. Do not assume such a field exists. Do not publish anything, submit anything or change repository visibility.
```
**Gate:** current official requirements verified with date/source URLs; all written drafts are ready; no unsupported model claims; no password in repository; owner has a final checklist for public post and nomination. The owner records/posts/nominates/submits; the agent does not.

**M4 done when:** [ ] real patient and doctor flows · [ ] at least one Gnani model/API genuinely used in the running app · [ ] any second provider blocked status disclosed honestly · [ ] both doctor identities verified · [ ] RLS and Emergency visibility proven · [ ] availability and atomic booking proven · [ ] Mark Reviewed limited to two fields · [ ] pending review blocks and post-review routine booking behaves correctly · [ ] deterministic emergency remains blocked · [ ] Not now leaves report visible, no appointment · [ ] acceptance matrix recorded · [ ] build clean, no secrets · [ ] deployment approved and verified · [ ] official submission package ready · [ ] `APPROVE M4-S14` · [ ] `ACCEPT M4`.

---

## 10. Owner checklist authority

`HUMAN_ROADMAP.md` is the single authoritative owner checklist paired with this file. It contains all manual actions, credential handling, approval phrases, SQL review checks, doctor-account setup, deployment steps and challenge-submission actions. Do not maintain or update `HUMAN_MANUAL_CHECKLIST.md` as a second active checklist. If an agent step changes a human action, update both this runbook and `HUMAN_ROADMAP.md` in the same approved change, and report the cross-file consistency check.

---

## 11. Project done

All of the following, each with evidence:

- [ ] M1–M4 accepted, tracker at 100.
- [ ] Acceptance matrix from M4-S10 recorded.
- [ ] Deployed patient `/` and doctor `/doctor` verified.
- [ ] No secret in browser bundle or Git; no real patient data anywhere.
- [ ] No claim of diagnosis, clinical triage, real alerts, real calls or real doctor notification.
- [ ] Demo video published and the submission completed before the deadline.
