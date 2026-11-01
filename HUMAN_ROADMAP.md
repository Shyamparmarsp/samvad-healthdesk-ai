# Samvad HealthDesk AI — HUMAN_ROADMAP.md (v4)

**For:** you, the project owner. This is the single human checklist paired with `MILESTONES.md`; coding agents follow the exact step prompts in `MILESTONES.md`.
**Replaces:** `HUMAN_MANUAL_CHECKLIST.md` (superseded; do not keep two active human checklists).
**Last updated:** 1 November 2026 (v4 review). **Deadline:** 10 Nov 2026, 11:59 PM IST. Aim to submit on 9 Nov.

> Never write a password, API key, token or Supabase secret into this file, into chat, or into any file that is committed to Git. This file is a checklist only.

> Dashboard menu names and CLI flags change. Wherever a menu or flag is named below, treat it as a pointer and confirm it in the current official docs or with `--help`.

---

## 1. How the whole thing works (read once)

1. `MILESTONES.md` holds the steps and the exact prompt for each. You give a step to an agent. The agent does that one step, shows evidence and stops.
2. You read the evidence, then reply with an approval phrase. Nothing moves without it.
3. Approve the final handoff step for each milestone first. Only after every step in that milestone is approved, reply `ACCEPT M<n>`; that causes the agent to create the local acceptance tag.
4. Progress is the sum of approved step weights (total 100). Keep the log in Section 12.

**What to type to start any step:**

```text
Read AGENTS.md and MILESTONES.md. Follow Global Rules G1-G12. Execute only M1-S0, using the exact prompt for that step in MILESTONES.md. Do not start another step. Report evidence and stop for my review.
```

(Change `M1-S0` to the step you want.)

**Approval phrases (copy exactly):**

| You want to | Type |
|---|---|
| Approve a finished step | `APPROVE M2-S3` |
| Approve several untagged steps at once (optional) | `APPROVE M2-S1..S3` |
| Accept a whole milestone | `ACCEPT M2` |
| Let the agent merge a branch locally into `main` | `APPROVE MERGE <branch> INTO main` (use separate approvals for `feat/foundation`, `feat/frontend` and `feat/backend`) |
| Let the agent push a branch | `APPROVE PUSH feat/frontend` |
| Let the agent apply migrations | `APPROVE APPLY <project name> <exact migration filenames and/or named seed files>` |
| Let the agent deploy | `APPROVE DEPLOY <target>` (for example `Vercel production`) |

Approving a step or accepting a milestone is never permission to merge, push, apply migrations or deploy. Each action needs its own exact phrase. A local merge does not authorize a push. Use a separate approval for each branch, project/migration list or deployment target.

---

## 2. Rules for you

- Keep all keys in a private password manager. Type them into the dashboard or a local terminal prompt yourself. Never paste them into the agent chat.
- If an agent asks you to paste a key, answer: "Tell me the exact secure mechanism; I will enter it myself."
- Do not approve a step until you have seen real evidence: command output, a diff, a screenshot, or something you tried yourself.
- Do not approve the deletion, moving or rewriting of existing project docs (`AGENTS.md`, `M.md`, `README.md`, `docs/`). `MILESTONES.md` and `HUMAN_ROADMAP.md` are the current runbooks; preserve prior runbooks as historical unless you explicitly approve archiving them.
- Use synthetic data only. Never test with a real patient's voice or health details.
- Only one agent edits a given worktree at a time.
- Never let an agent post, nominate, submit, change repository visibility, merge, push, apply migrations or deploy without the exact separate approval phrase.
- Confirm D5 caps before M3-S3. Proposed application guardrails per Asia/Kolkata day: 100 session creations, 300 Groq calls, 150 Prisma calls and 120 Timbre calls. These are not provider quotas and do not translate the 5,000 programme credits into a fixed number of calls. Check actual balances/quotas and expected acceptance-test usage before confirming. You can raise/lower values in `daily_usage_limits` through Supabase Dashboard SQL Editor without redeploying; the browser must have no access to change them. If the session-creation cap is reached, new sessions show the demo-busy message. If one provider's cap is reached, only that provider is disabled for the day and its text/scripted fallback remains available; do not lock the whole app. Reserve meaningful capacity for judge traffic on 9–10 Nov and verify counters before recording and public submission. Record M1-S5 probes separately because runtime counters do not yet exist. Cached audio generation uses a manual 10-call reservation, not database access from the local script (M3-S7).

---

## 3. Phase 0 — Before M1 (today, about 1 hour)

### 3.1 Folder and backup
- [ ] Create one folder, for example `samvad-healthdesk-ai`.
- [ ] Keep the existing project layout. Confirm `AGENTS.md`, `README.md`, `MILESTONES.md` and `HUMAN_ROADMAP.md` are at the repository root, and the specialized project docs are in their existing `docs/` locations.
- [ ] Do not move `M.md` or any existing file merely to match this example; M1-S0 records the actual layout. Preserve all existing docs and design exports.
- [ ] Make a backup copy of the whole folder (zip or cloud) before any agent touches it.

### 3.2 Git
- [ ] Open a terminal in the folder and run `git init` only if the folder is not already a repository. Check with `git status` first.
- [ ] If no suitable GitHub repository already exists for this project, create **one private** repository (do not initialise it with a README if your local folder already has one). If one already exists, reuse it; do not create a second repository.
- [ ] Add `origin` only if it is not already configured: `git remote add origin <your-repo-url>`. If `origin` exists, inspect it and confirm it points to the intended repository before changing anything.
- [ ] Before staging, check `git status --short`, confirm `.gitignore` exists or manually exclude local secrets, and inspect the file list.
- [ ] Stage only the explicit existing project-document paths you intend to commit (for example `AGENTS.md`, `README.md`, `MILESTONES.md`, `HUMAN_ROADMAP.md` and the named `docs/*.md` files). Do **not** use `git add .` or `git add -A` for this documentation-only commit.
- [ ] Review `git diff --cached --name-only` and `git diff --cached` for unexpected files, `.env*`, keys, tokens, passwords or personal data. Commit only after the staged list is correct: `git commit -m "Add project docs"`.
- [ ] Check `git status` and confirm there is no second repository inside the folder. Do not push without a separate approval.

### 3.3 Tools
- [ ] Install Node.js (an LTS version) and confirm `node -v` and `npm -v` work.
- [ ] Install Git, and confirm `git --version`.
- [ ] Install the Supabase CLI using the method in the official Supabase docs for your system. Confirm `supabase --version`.
- [ ] Open the project folder in Antigravity. Open OpenCode separately for the backend work later.
- [ ] Make sure both tools can read `AGENTS.md`. M1-S0 will tell you which filename each tool really reads.

### 3.4 Accounts and challenge registration
- [ ] Supabase account.
- [ ] Vercel account (sign in with GitHub).
- [ ] Groq account (console.groq.com).
- [ ] Gnani account and access to the API products enabled for your account (Prisma STT and/or Timbre TTS); verify exact versions rather than assuming one.
- [ ] Figma file `Samvad HealthDesk AI — V2 Screens` open, with Dev Mode access.
- [ ] Complete the official challenge registration if you have not already. Save the participant access/submission email in your private notes.
- [ ] Official challenge materials are not fully consistent about submission mechanics: the registration terms refer to a participant workspace, but the current programme page FAQ and challenge blog say there is no participant dashboard and the submission form is sent to the registered email. Save the programme email and follow the actual current link/instructions for your registration; do not assume a persistent workspace or a confidential evaluator-access field. Prepare the project title, problem statement, intended users, Gnani model/API plan and each member's contribution. The public official page currently says each registration receives 5,000 programme credits; confirm the balance and access details in your own account. Credits are not a call-count guarantee.

### 3.5 Decisions
Read Section 4 of `MILESTONES.md` and record your decision for D1–D9 before the relevant step. D8 and D9 are safeguards/copy defaults as well as implementation requirements:
- D1: availability is computed from schedule rules and confirmed bookings.
- D2: one Supabase project for dev/demo, synthetic data only.
- D4: approve the English booking-blocked copy and its owner-reviewed Hindi translation.
- D5: approve or adjust the starting daily caps after checking provider credits/quotas: 100 session creations, 300 Groq calls, 150 Prisma calls and 120 Timbre calls per Asia/Kolkata calendar day.
- D6: keep GitHub private unless the official portal/terms explicitly require public source code.
- D8: keep working doctor passwords private; inspect the actual submission route for a confirmed private evaluator-access method.
- D9: review and approve the Hindi translations for demo-busy, incomplete-at-cap preview and ambiguous-emergency clarification before M2 acceptance. Public demo posts are still required.

---

## 4. Setup guides (do these when a step says so)

### 4.1 Branch merges and two agent worktrees
Do this only after M1 is accepted.

1. Review the `feat/foundation` diff. When satisfied, tell the agent exactly: `APPROVE MERGE feat/foundation INTO main`. This authorizes a local merge only, not a push.
2. Confirm `main` now contains the accepted M1 foundation and the worktree is clean.
3. Create both worktrees from that updated `main`:
```bash
git worktree add ../samvad-frontend -b feat/frontend main
git worktree add ../samvad-backend -b feat/backend main
```
4. Open `../samvad-frontend` in Antigravity and `../samvad-backend` in OpenCode.
5. Frontend owns `src/`, `public/`, `index.html`, `vercel.json`; backend owns `supabase/` and `scripts/`. Shared files (`AGENTS.md`, `docs/`, `src/types/`) change only with your approval. Never have both agents edit the same physical worktree at the same time.
6. Review branch diffs with `git diff --stat main...feat/frontend` and `git diff --stat main...feat/backend` (and inspect the actual diff before approval).
7. After M2 and M3 are both accepted, merge each with its own explicit phrase: `APPROVE MERGE feat/frontend INTO main`, then `APPROVE MERGE feat/backend INTO main`. Resolve conflicts only after reviewing them; do not overwrite either branch's changes. Start M4 from the resulting `main`.

### 4.2 Supabase project
- [ ] In the Supabase dashboard, create (or choose) one project for this demo. Do not create a second one unless you decide to.
- [ ] Write down the project name and **project reference** in your private notes.
- [ ] Choose a database password and store it in your password manager.
- [ ] In the dashboard's Authentication settings, enable anonymous sign-ins (look for "Allow anonymous sign-ins"). Patients need this because there is no signup.
- [ ] In a terminal, run `supabase login` yourself (it opens a browser). The agent runs `supabase link` later, after you confirm the project reference.
- [ ] Note which public key the dashboard shows: the "publishable" key or the legacy "anon" key. This is the **only** key that goes in the frontend (`VITE_SUPABASE_KEY`).

### 4.3 Groq key
- [ ] In the Groq console, create an API key and store it in your password manager.
- [ ] Do not choose a model yourself. M1-S5 verifies which current model supports structured output.

### 4.4 Gnani access
- [ ] From the Gnani account or the challenge page, get the credentials for Prisma and Timbre.
- [ ] Check which versions are actually enabled for your account. Do not assume v2.5.
- [ ] Note the programme credits available in your account (the official programme page currently states 5,000 credits per registration); check the actual balance and keep it in private notes. Do not assume provider-specific pricing or convert credits into API calls without evidence.
- [ ] Ask Gnani support or read the docs for: audio formats Prisma accepts, maximum recording length, and whether `hi-IN` returns Devanagari or Roman letters. M1-S5 tests this too.

### 4.5 How to put secrets in safely
Server-side keys for the provider integrations actually used (for example `GNANI_API_KEY` and `GROQ_API_KEY`, only if those are the verified names) go into **Supabase Function Secrets**, never into `VITE_` variables. The agent must confirm exact required secret names from the implementation and current provider docs; do not invent names.

1. For M1-S5 local provider smoke tests, create a local file inside `supabase/` named `.env.functions` (or export the same variables in your own terminal session). Its name starts with `.env`, so `.gitignore` excludes it.
2. Confirm the exact variable names from the current provider documentation and the agent's evidence; examples such as `GNANI_API_KEY` and `GROQ_API_KEY` are not assumed until verified. Write the values yourself, one per line as `NAME=value`.
3. The agent may run a smoke-test script that loads the ignored local environment file or inherited process environment, but must not display, log, inspect or copy secret values. Do not run `cat`, `printenv`, `env`, shell tracing (`set -x`) or screenshots of the secret file.
4. Before deploying Edge Functions, upload the verified server-side variables to Supabase Function Secrets. Ask the agent for the exact CLI command and check flags with `supabase secrets set --help`; run the command yourself. M1-S5 tests do not require a deployment.
5. Run `git status` and confirm `.env.functions` does not appear.
6. Never print the file, paste secrets into agent chat, commit the file or put provider keys into `VITE_` variables. If a value leaks, rotate it in the provider dashboard.

Frontend `.env.local` (also ignored by Git) holds only:
```text
VITE_SUPABASE_URL=
VITE_SUPABASE_KEY=
```

### 4.6 Vercel (only at M4-S12)
- [ ] Add New Project, import the GitHub repo.
- [ ] Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`. Root directory: the repo root.
- [ ] Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (public key only).
- [ ] Do not add the Gnani or Groq keys to Vercel.
- [ ] After deploy, open `<your-url>/doctor` and refresh the page. It must still load (the rewrite in `vercel.json` handles this).

---

## 5. Milestone 1 — Foundation (target 1–2 Nov, weight 15)

| Step | Your action | How you check | You reply |
|---|---|---|---|
| S0 Audit | Start the step. Read the agent's inventory. | It found your repo and all docs, and did not edit anything. It says which instruction files Antigravity and OpenCode read. | `APPROVE M1-S0` |
| S1 Repo | Decide: use the existing repo. Confirm GitHub repo is private. | `git status` shows one repo, no nested `.git`, docs unchanged, and the foundation branch is identified. | `APPROVE M1-S1` |
| S2 Toolchain | Run `npm install` and `npm run build` yourself. Run `npm run dev`. | Open `http://localhost:5173/` and `/doctor`. Both load. `vercel.json` exists. | `APPROVE M1-S2` |
| S3 Design handoff | Confirm Figma exports and the updated doctor login card. Provide Figma Dev Mode access. | Agent lists tokens/fonts and missing design states; the evaluator-access card contains no credentials. | `APPROVE M1-S3` |
| S4 Supabase link | Give the project reference (not a password). Confirm project identity and enable anonymous sign-ins (Section 4.2). | Correct project linked; no key printed. | `APPROVE M1-S4` |
| S5 Provider spike | Put Groq and Gnani keys in securely (Section 4.5). Record two short synthetic clips if asked. | `docs/provider-notes.md` lists verified models, audio format and Hindi script; missing checks are BLOCKED. | `APPROVE M1-S5` |
| S6 Schema (authored) | Read the full schema and both usage tables. Confirm RLS/grants and that only the SQL Editor/owner can change `daily_usage_limits`. | Nothing was applied yet; no browser access to either usage table. | `APPROVE M1-S6` |
| S7 Apply + seed | Review the exact seed.sql diff, migrations, counts and target project. Name every artifact in the apply phrase. | Only named migrations and `supabase/seed.sql` applied; schedule/doctor seed is correct. | `APPROVE APPLY <project> <migration-1> <migration-2> supabase/seed.sql` then `APPROVE M1-S7` |
| S8 Doctor identities | Create two Auth users in Dashboard: Dr. Aditi Rao (General Medicine) and Dr. Neha Verma (Emergency). Store passwords privately. Give agent only emails and Auth UIDs; review its exact `doctor_profiles` mapping SQL and execute only after approval. | Two Auth users and two matching profile mappings exist. Do not run SQL against `auth.users`; do not give passwords to agent. | `APPROVE APPLY <project> supabase/seed-doctor-profiles.sql` then `APPROVE M1-S8` |
| S9 Contract | Approve edits to `src/types/`. Read the summary. | One definition per type; six exact `chat-turn` action names; frontend and backend can type-check against it. | `APPROVE M1-S9` |
| S10 Handoff | Read the report. Run `npm run build` yourself. | Docs intact, no secrets, one repo, both doctor accounts mapped, handoff evidence complete. | `APPROVE M1-S10`, then `ACCEPT M1` |


After `ACCEPT M1`: verify the local `m1-accepted` tag and `git log --oneline`. Then review and explicitly approve the local foundation merge: `APPROVE MERGE feat/foundation INTO main`. Do not push unless separately approved.

---

## 6. Milestone 2 — Frontend (target 3–5 Nov, weight 25)

You work with Antigravity in `samvad-frontend`. M3 runs at the same time with OpenCode, so plan to check both.

| Step | Your action | How you check | You reply |
|---|---|---|---|
| S0 Audit | Provide missing Figma exports. Confirm D3 and approve D4's English copy plus the meaning of its Hindi translation. Review D9 English/Hindi drafts for demo-busy, partial-cap preview and emergency Yes/No clarification. | Gap list is specific; Hindi wording is approved before implementation; Figma's Don't submit destination is known. | `APPROVE M2-S0` |
| S1 Tokens | Open the component preview. Compare colours and fonts against Figma. | Buttons are at least 48px high, text is Plus Jakarta Sans, Devanagari renders. | `APPROVE M2-S1` |
| S2 Shell + i18n | Switch English and Hindi on `/`. | Language changes without losing your place. Hindi strings are marked DRAFT. | `APPROVE M2-S2` |
| S3 Consent | Click Yes. Run it again and click No. | No reaches "No problem. We have not saved any health information." and nothing is stored. | `APPROVE M2-S3` |
| S4 Conversation | Test mic-denied text mode, edit "What we heard", and step through name/age/gender/concern. Trigger backend demo-busy fixture and ambiguous-emergency fixture. | Demo busy appears only on backend response; ambiguous phrase shows the approved Yes/No chips; all copy works in English and owner-approved Hindi. | `APPROVE M2-S4` |
| S5 Report | Edit an allowed field; try to edit routing; test normal Don't submit. Open the incomplete 15-turn-cap fixture. | Partial preview states it may be incomplete, has only End session, cannot submit/book and stays private. Normal Don't submit also stays private. | `APPROVE M2-S5` |
| S6 Booking | Click through slot taken, no slots, confirmation, Not now. | States look different. Mock bookings are not described as real. | `APPROVE M2-S6` |
| S7 Emergency | Open the emergency fixture. | Large plain "112", no call button, no slots, no claim that help was alerted. | `APPROVE M2-S7` |
| S8 Doctor shell | Open `/doctor` and inspect the evaluator-access card. | It says credentials are shared privately and not displayed in public project materials; no actual password or placeholder password. | `APPROVE M2-S8` |
| S9 Doctor views | Click each tab. Open a report and an urgent report. Expand the conversation. | Conversation starts collapsed. Urgent report has no booking action. | `APPROVE M2-S9` |
| S10 Regression | **Read every Hindi string yourself** and correct wording. Compare screenshots with Figma at 390x844 and 1280x820. | No text overflow, no broken Devanagari. | `APPROVE M2-S10` |
| S11 Handoff | Read the list of mocked behaviours. Run build. | Everything goes through `src/lib/api.ts`. | `APPROVE M2-S11`, then `ACCEPT M2` |

---

## 7. Milestone 3 — Backend, AI, voice (target 3–5 Nov, weight 30)

You work with OpenCode in `samvad-backend`. Only `supabase/` and `scripts/` should change. M3 is estimated at about 16 focused hours; review progress by end of **4 Nov** and cut Tier C immediately if the text slice, security, doctor-role or counter-concurrency work is behind.

| Step | Your action | How you check | You reply |
|---|---|---|---|
| S0 Audit | Nothing special. | It knows which migrations are applied. | `APPROVE M3-S0` |
| S1 Shared modules + questions | **Read every Hindi question** and edit the wording. | Four fixed questions (name, age, gender, concern) are in order and cannot be skipped. | `APPROVE M3-S1` |
| S2 Session + consent | Afterwards, in the Supabase dashboard open Authentication, Users. | Anonymous users appear. Consent "No" stores no health data. | `APPROVE M3-S2` |
| S3 Text intake + caps | Confirm D5 starting limits: 100 sessions/day, 300 Groq calls/day, 150 Prisma calls/day, 120 Timbre calls/day (adjust after checking account quotas/balances). Read both usage tables' migrations. | Counters are atomic/server-only; owner can change limits via SQL Editor without redeploy; 15-turn incomplete preview is End-only/private; demo busy state works. | `APPROVE APPLY <project> <exact migration filenames>` if required, then `APPROVE M3-S3` |
| S4 Emergency rules | Read the phrase list against `docs/demo-emergency-rules.md`. Try one positive phrase, one negated phrase, and ambiguous cases answered Yes, No and unclear. | Positive/Yes enters urgent path; negated/No does not trigger that candidate (but is not described as medical clearance); unclear remains needs_human_review and blocks routine booking. | `APPROVE M3-S4` |
| S5 Report | Read the report JSON for a synthetic patient. Test Don't submit. | Missing values retain exact statuses; summary only repeats what was said; patient cannot change doctor or status; a private draft remains inaccessible to doctors and no appointment is created. | `APPROVE M3-S5` |
| S6 Prisma | Provide the synthetic audio clip. | Transcript returned. If the format is not accepted, the step says BLOCKED and text still works. | `APPROVE M3-S6` |
| S7 Timbre + cached audio | For adaptive app calls, confirm atomic counter reservation. For the local one-time audio script, check current Timbre usage, then reduce the app's Timbre limit by 10 (or by the exact missing-file attempt count) for that IST day using the Dashboard SQL Editor, only if current usage does not already exceed the reduced limit; manually reserve/count exactly that amount. Run the script locally with the provider key only; never give it Supabase credentials. Keep the app limit reduced for the rest of that IST day; restore it no earlier than the next IST day. **Listen to all generated files**. | The script has no DB access, no retries, and never exceeds reserved attempts; each attempt is counted in a private log; app cap remains reduced for the rest of the IST day. Greeting matches consent text. | `APPROVE M3-S7` |
| S8 Groq | Try a normal and an odd answer. | Invalid output falls back to a scripted question. Groq never decides "intake complete". | `APPROVE M3-S8` |
| S9 Security matrix | Read the PASS/FAIL table; confirm tests use both doctor identities created at M1-S8. | Draft invisibility, assigned visibility, Emergency cross-visibility and concurrent cap tests have evidence. | `APPROVE M3-S9` |
| S10 Handoff | Read the report. | Exactly two functions: `chat-turn` and `speak`; at least one Gnani API is actually used by the app; any other blocked integration is recorded honestly. | `APPROVE M3-S10`, then `ACCEPT M3` |

---

## 8. Milestone 4 — Integration, release, submission (target 6–9 Nov, weight 30)

You work with Antigravity as lead. After M2 and M3 are accepted, inspect each branch diff and approve each local merge separately using `APPROVE MERGE feat/frontend INTO main` and `APPROVE MERGE feat/backend INTO main`. Start M4 only after both accepted branches are merged and the integration base is clean. These are local merges only; pushes require separate approval.

| Step | Your action | How you check | You reply |
|---|---|---|---|
| S0 Audit | Read the integration map. | It lists every remaining mock. | `APPROVE M4-S0` |
| S1 Patient text path | Run the patient flow on the real backend. | Failed calls show an error, never success. | `APPROVE M4-S1` |
| S2 Voice | Allow the microphone in your browser. Speak a synthetic sentence. | If Prisma works, transcript appears and is editable; otherwise the text-entry fallback works and voice is marked BLOCKED. Cached prompts/adaptive speech are used only if Timbre is verified. | `APPROVE M4-S2` |
| S3 Doctor logins | Do not create new users. Verify the two accounts and mappings created in M1-S8. Test login/logout for both; never show passwords to agent. | Both identities still map to the intended fictional doctors; bad credentials show generic error; no credential is in project files. | `APPROVE M4-S3` |
| S4 Doctor reads | Log in as General Medicine after submitting a test report; test the Emergency account separately using synthetic fixtures. | Assigned reports are visible; drafts are not; the Emergency cross-visibility exception works only for the documented urgent report scope. | `APPROVE M4-S4` |
| S5 Availability SQL | **Read the SQL and RLS/column grants** (Section 9). Test using an anonymous patient JWT and a non-authenticated caller. | No Emergency slots; only schedule rules and minimal occupied-slot metadata are readable; no appointment/patient details leak; RPC is invoker, not SECURITY DEFINER. | `APPROVE APPLY <project> <exact migration filenames and/or named seed files>` then `APPROVE M4-S5` |
| S6 Booking SQL | **Read the SQL** (Section 9). Test pending review, reviewed routine report, and emergency even after review, plus duplicate slot. | Pending review blocks; review can unblock only a normal submitted non-emergency report; emergency/urgent_partial stays blocked; second slot attempt fails. | `APPROVE APPLY <project> <exact migration filenames and/or named seed files>` then `APPROVE M4-S6` |
| S7 Mark Reviewed SQL | **Read the SQL** (Section 9). | Only two fields change; only mapped doctors authorized for the report can perform it. | `APPROVE APPLY <project> <exact migration filenames and/or named seed files>` then `APPROVE M4-S7` |
| S8 Booking UI | Book, then run a second patient with Not now. | Confirmation shows a server reference. Not now leaves no appointment but the doctor still sees the report. | `APPROVE M4-S8` |
| S9 Demo environment | Decide whether sample synthetic reports are useful. Review `supabase/seed-demo-reports.sql`, project and row counts. | Only named seed file applied after approval; all rows clearly synthetic. | `APPROVE APPLY <project> supabase/seed-demo-reports.sql` then `APPROVE M4-S9` |
| S10 Acceptance | **Do the full path yourself**, in English and Hindi, plus once on a real phone. Use both General Medicine and Emergency doctor accounts for read-visibility checks. | Matrix has no unresolved FAIL; pending review, post-review routine booking and permanent emergency booking block are distinguished. | `APPROVE M4-S10` |
| S11 Build + secret scan | Open the built files and search for key names yourself if you want a second check. | No `GNANI`, `GROQ` or service key text in `dist/` or Git. | `APPROVE M4-S11` |
| S12 Deploy | Create the Vercel project (Section 4.6). Give each approval phrase separately. Open the live site, `/` and `/doctor`. | `/doctor` works after refresh. A live patient flow completes. | `APPROVE DEPLOY Supabase`, `APPROVE DEPLOY Vercel production`, then `APPROVE M4-S12` |
| S13 Handoff | Read the final matrix and demo-access instructions. Never place a password in README, code, screenshots or Git. Keep credentials private and share them with evaluators only through an approved separate channel if needed. | You can follow the demo sequence; handoff records real deployment state, limitations and exact verified provider models. | `APPROVE M4-S13` |
| S14 Submission | Follow the actual current submission instructions received from Gnani. The registration terms refer to a participant workspace, but the current programme page FAQ and challenge blog state that there is no participant dashboard and the submission form is sent to the registered email. Use the current email instructions for your registration and verify the link. Inspect whether the actual submission route has a confidential evaluator-access field; do not assume it does. Verify project details, written explanation, public video, tagged posts and nominated links. Keep GitHub private unless the actual form/terms require otherwise. | Form's credential visibility is confirmed; if no secure access field exists, you have asked organisers for an accepted private method; project details and nominated links are complete. | `APPROVE M4-S14`, then `ACCEPT M4` |

---

## 9. What to look for when reviewing SQL and code (plain-language list)

**Schema and RLS (M1-S6, M1-S7)**
- [ ] Both usage tables have RLS enabled and no `anon`/`authenticated` grants or policies. `service_role` has only `SELECT` on limits and `SELECT`/`INSERT`/`UPDATE` on counters.
- [ ] `reserve_daily_usage` is `SECURITY INVOKER`, callable only by `service_role`, uses a fixed/empty `search_path` and schema-qualified table names, accepts only an allowlisted counter name, and derives the IST date inside SQL. No browser can call it.
- [ ] Counter-concurrency and IST-rollover tests use a local/isolated fixture; no one resets or exhausts real demo counters just to test the cap.
- [ ] Every table the browser can see has RLS turned on.
- [ ] There is no policy that lets a patient INSERT, UPDATE or DELETE on sessions, messages or reports.
- [ ] Doctor policies check the doctor mapping (`doctor_profiles`), not just "is logged in". Anonymous patients are also "logged in".
- [ ] Drafts are not readable by doctors, except `urgent_partial` reports.
- [ ] Appointments have a rule that stops two bookings of the same doctor and slot time.

**Availability, booking and review functions (M4-S5 to S7)**
- [ ] `get_available_slots()` runs as `SECURITY INVOKER`, not SECURITY DEFINER.
- [ ] Patients can read schedule rules and only minimal confirmed-slot occupancy fields (doctor/slot start); no appointment report ID, patient UID, name or other details.
- [ ] RLS and column grants are tested with both an authenticated anonymous-patient JWT and an unauthenticated `anon` request.
- [ ] `book_appointment()` checks `auth.uid()` owns the submitted report, not an ID the browser merely supplies.
- [ ] Pending `possible_urgent`/`needs_human_review` reports cannot book; after Mark Reviewed, only eligible normal submitted reports may book.
- [ ] `urgent_partial` and deterministic emergency reports can never book, even after Mark Reviewed.
- [ ] The slot is re-checked inside the same transaction that reserves it; duplicate booking is blocked.
- [ ] The reference number is generated by the database.
- [ ] Mark Reviewed changes only reviewed timestamp and reviewing doctor; it is not medical clearance.
- [ ] Only `book_appointment()` and `mark_report_reviewed()` use SECURITY DEFINER, with fixed safe search path, schema-qualified objects, no dynamic SQL, and no PUBLIC/anon execute grants.

**Frontend**
- [ ] No component calls Supabase directly. Only `src/lib/api.ts` does.
- [ ] No success screen appears unless the server confirmed.
- [ ] No Settings, bell, print, signup, staff or admin screens.

**Everything**
- [ ] Nothing says the app diagnoses, treats, or triages clinically.
- [ ] Nothing says a real doctor or emergency service was contacted.
- [ ] No keys in code, README, screenshots or Git history.

---

## 10. When things go wrong

| Problem | What to do |
|---|---|
| Agent starts the next step without approval | Tell it: "Stop. You exceeded the step scope." Run `git status`. Use `git stash` to set its changes aside (do not delete them). Ask for a report of what it changed. |
| Agent says "done" without evidence | Reply: "Show the command output, diff or screenshot that proves it." Do not approve. |
| Agent wants to paste or print a key | Refuse. Ask for the secure mechanism. If a key leaked into chat, a file or Git, rotate that key in the provider's dashboard. |
| Two agents edited the same file | Stop both. Run `git status` in each worktree. Keep each agent to its own folders. |
| A branch merge conflicts or contains unexpected files | Stop. Do not resolve by choosing one side wholesale. Inspect the exact diff, preserve both approved scopes, and ask the agent for a conflict plan before any merge approval. |
| Agent asks to lower/raise global caps without evidence | Do not accept silently. Check the provider balance/quotas and update D5 deliberately; keep atomic server-side enforcement. |
| A provider detail (model, format, endpoint) is unknown | Accept "BLOCKED" with the text fallback. Do not let the agent guess. |
| Behind schedule | Use the tiers in Section 5 of `MILESTONES.md`. Cut Tier C first. Never cut consent, the emergency path, ownership checks or the secret scan. |
| Migration already applied but wrong | Do not edit it. Ask for a new additive migration. |
| Dashboard or CLI differs from this file | Follow the current official docs, then note the change here. |

---

## 11. Challenge submission and demo day

Checked against the official Gnani programme, registration/submission and challenge announcement pages on **1 November 2026**; recheck before acting. They currently state a final deadline of **10 November 2026, 11:59 PM IST**. They describe the required submission as participant/project details (including project title, problem, intended users, Gnani models/APIs and member contributions), a working application using at least one Gnani AI model/API, a public demo video, a written project explanation, the exact model/API names, and nominated public LinkedIn/X post link(s). The social post must identify the build and Gnani technology, tag Gnani AI, and include `#GnaniAI` and `#GreatIndianAIInternshipChallenge`. **Posting/tagging alone is not submission: nominate the post link in the participant submission.** Recheck the official page and participant portal on submission day because requirements can change.

Official pages to re-check:
- Programme overview: https://www.gnani.ai/internship
- Registration/submission information: https://www.gnani.ai/great-indian-ai-internship-registration-form
- Challenge announcement/details: https://www.gnani.ai/resources/blogs/great-indian-ai-internship-challenge-2026

**By 8 Nov**
- [ ] Confirm the application is deployed and the patient `/` and doctor `/doctor` routes work.
- [ ] Confirm at least one Gnani AI model/API is genuinely called by the running app; keep evidence and the exact model/API name. A blocked provider or isolated smoke test does not count as app integration.
- [ ] Confirm the database contains only synthetic records.
- [ ] Before recording, inspect `daily_usage_limits` and `daily_usage_counters` in the Supabase SQL Editor. Confirm enough available calls for recording and reserve at least 40% of each daily cap for evaluator traffic; if insufficient, raise the limits after checking actual provider quotas. Check again before opening the demo for 9–10 Nov judging. These changes do not require redeployment.
- [ ] Confirm cached audio works if Timbre audio is part of the submitted flow; otherwise disclose the text fallback accurately.
- [ ] Complete the project-detail fields in the actual submission route (email link or participant workspace, as directed for your registration): project title, problem statement, intended users, Gnani models/APIs used, and each member's contribution.
- [ ] Keep demo credentials private. Do not put a working password in README, code, screenshots, Git or public posts. Inspect the actual submission route for a confidential reviewer-access field; if it has one, confirm it is private/reviewer-only. If it does not, contact Gnani organisers through an official channel for an accepted private evaluator-access method. Never assume the form has such a field.

**9 Nov — aim to finish submission today**
- [ ] Re-check official rules, final deadline and participant submission form.
- [ ] Record a clear video of the working application. Our planned walkthrough is about 3 minutes; the official requirements do not prescribe that duration. A separate 60-second cutdown is optional if you want to target the special 60-second demo award.
- [ ] Show welcome, explicit consent, scripted intake, edited transcript or text fallback, English report review, submit, doctor report view, Mark Reviewed, booking, Not now and the emergency screen as a safety demo only. Use only synthetic patient answers and clearly disclose any fallback or unavailable provider.
- [ ] Post the demo publicly on LinkedIn, X or both. Explain what you built and the Gnani technology used, tag Gnani AI's official account and include both `#GnaniAI` and `#GreatIndianAIInternshipChallenge`.
- [ ] Copy one public post URL for each platform you use. Nominate those links in the participant submission; do not stop after posting.
- [ ] Submit the video/demo, written explanation, exact Gnani model/API list, and nominated post links through the official participant submission page before **10 Nov 2026, 11:59 PM IST**.
- [ ] Confirm the public post/video links work while logged out. Confirm the private code repository is not accidentally exposed. The official pages checked on 1 November 2026 do not list a public GitHub repository as a deliverable; keep it private unless the current participant portal or written terms explicitly require public source code.

**Demo-day habits**
- [ ] Use only the fictional doctor accounts and clearly synthetic patient answers.
- [ ] Test the microphone in the room first. Keep typing ready as the fallback.
- [ ] Have one normal journey and one demo emergency phrase prepared.
- [ ] Never describe the app as diagnosing, treating, clinically triaging, calling 112 or notifying a real doctor.
- [ ] Do not use purchased engagement, bots, paid promotion or engagement exchanges; follow the current official challenge rules.

---

## 12. Progress log (update after each approval)

| Milestone | Steps approved (weights) | Progress | Accepted (date) |
|---|---|---|---|
| M1 | | 0 / 15 | |
| M2 | | 0 / 25 | |
| M3 | | 0 / 30 | |
| M4 | | 0 / 30 | |
| **Total** | | **0 / 100** | |

Weights per step are in `MILESTONES.md`. Remember: approve the final step first, then `ACCEPT M<n>`. M4 cannot be accepted until M4-S14 is approved.
