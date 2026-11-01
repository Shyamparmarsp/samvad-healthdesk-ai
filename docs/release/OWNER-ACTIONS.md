# Owner Actions — Final Launch

Every item is something only you can do. Each row is classified, and none of them was
performed by the agent.

Legend: **READY** = prepared and verified · **BLOCKED** = needs a credential/decision ·
**NOT TESTED** = cannot be verified until you act.

---

## A. Decisions you must make before deploying

| # | Decision | Why it matters | Class |
|---|---|---|---|
| A1 | **Acknowledge the third/fourth `SECURITY DEFINER` exception** (`get_doctor_appointments()`) | `AGENTS.md` names only two. Without this read RPC the doctor appointments screen and the Booked/Not-booked cards cannot work. Full evidence in `docs/release/SECURITY-FINDINGS.md` §F-1. | **BLOCKED** |
| A2 | **Accept the CORS reality** | The platform forces `Access-Control-Allow-Origin: *`. `ALLOWED_ORIGINS` is set for correctness but is not an authorization control. See §F-2. | **BLOCKED** |
| A3 | **Confirm OD-02, OD-03 and OD-09 stay as-is** | Clarification turns not counted; GM cannot review emergency reports; “No” never clears `needs_human_review`. All three are implemented and tested. | READY |
| A4 | **Confirm the demo usage quotas** (100 sessions / 300 Groq / 150 Prisma / 120 Timbre per IST day) | Application guardrails, not provider quotas. Change in `daily_usage_limits` if your provider credits differ. | READY |
| A5 | **Approve live provider testing** | No live Groq/Prisma/Timbre call has been made. | **NOT TESTED** |

---

## B. Supabase project

| # | Action | Where | Command / field | Expected | Class |
|---|---|---|---|---|---|
| B1 | Select the project | Supabase Dashboard | note the project ref | project URL available | BLOCKED |
| B2 | Link the CLI | terminal | `supabase link --project-ref <ref>` | “Linked project” | READY |
| B3 | Approve migrations | terminal | `supabase db push` | 10 migrations applied | BLOCKED |
| B4 | Verify migration ledger | terminal | `supabase migration list` | local = remote, no pending | READY |
| B5 | Apply reference seed | terminal / SQL editor | `psql "$SUPABASE_DB_URL" -f supabase/seed.sql` | 6 departments, 6 doctors, 4 limits | BLOCKED |
| B6 | Create 2 doctor Auth users | Dashboard → Authentication → Users | Dr. Aditi Rao, Dr. Neha Verma | 2 confirmed users | BLOCKED |
| B7 | Map doctor profiles | terminal | edit 2 UIDs in `supabase/seed-doctor-profiles.sql`, then `psql -f …` | exactly 2 `doctor_profiles` rows | BLOCKED |
| B8 | Verify mapping | SQL editor | `select dp.user_id, d.display_name, d.department_key from doctor_profiles dp join doctors d on d.id = dp.doctor_id;` | Aditi → general_medicine, Neha → emergency | READY |
| B9 | Set function secrets | terminal | `supabase secrets set GROQ_API_KEY=…`, `GNANI_API_KEY=…`, `ALLOWED_ORIGINS=…` | `supabase secrets list` shows 3 names | BLOCKED |
| B10 | Deploy functions | terminal | `supabase functions deploy chat-turn` and `speak` | 2 deployments succeed, JWT verification on | BLOCKED |
| B11 | Verify auth is enforced | terminal | POST to `…/functions/v1/chat-turn` without a token | **401** | READY |

---

## C. Frontend (Vercel)

| # | Action | Where | Field | Expected | Class |
|---|---|---|---|---|---|
| C1 | Set public env | Vercel → Settings → Environment Variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` (publishable/anon) | both present for Production | BLOCKED |
| C2 | Confirm build settings | Vercel | root `.`, build `npm run build`, output `dist` | build succeeds | READY |
| C3 | Confirm SPA rewrite | repository `vercel.json` | `/doctor` survives refresh | no 404 | READY |
| C4 | Deploy | Vercel | Deploy | build green | BLOCKED |
| C5 | Confirm no secret in bundle | terminal | `grep -c sb_secret_ dist/assets/*.js` | 0 matches | READY |

---

## D. Post-deployment verification (manual, ~10 minutes)

| # | Check | Expected | Class |
|---|---|---|---|
| D1 | Open `/`, choose language, Start Talking | greeting + on-screen consent | NOT TESTED |
| D2 | Consent **No** | intake ends, no health data | NOT TESTED |
| D3 | Consent **Yes**, answer by voice | transcript preview, editable | NOT TESTED |
| D4 | Complete 10 answers | review screen with your data | NOT TESTED |
| D5 | Correct one field, Submit | booking screen, no slots before submit | NOT TESTED |
| D6 | Book a slot | `APT-…` reference shown | NOT TESTED |
| D7 | Open `/doctor`, log in as Dr. Aditi Rao | report visible, Mark Reviewed works | NOT TESTED |
| D8 | Log in as Dr. Neha Verma | emergency report visible | NOT TESTED |
| D9 | Trigger “I cannot breathe” | 112 guidance, no slots | NOT TESTED |
| D10 | Trigger “chest pain”, answer No | intake continues, not treated as safe | NOT TESTED |
| D11 | Leave a report unbooked (“Not now”) | report still visible to the doctor | NOT TESTED |

## E. Provider activation

| # | Action | Expected | Class |
|---|---|---|---|
| E1 | Add `GROQ_API_KEY`, restart nothing (secrets are live) | adaptive questions are model-selected | **NOT TESTED** |
| E2 | Add `GNANI_API_KEY` | a voice turn returns a real transcript | **NOT TESTED** |
| E3 | Same key for Timbre | adaptive question returns audio bytes | **NOT TESTED** |
| E4 | Confirm fallbacks still work with a key removed | text intake and text questions, no error | READY |

## F. Rollback readiness

| # | Action | Command | Class |
|---|---|---|---|
| F1 | Take a backup before migrating | `supabase db dump -f backup.sql` | READY |
| F2 | Roll back a bad function deploy | redeploy the previous commit’s function | READY |
| F3 | Roll back a bad migration | restore the dump, re-apply known-good migrations | READY |

---

## G. Credential handling rules (non-negotiable)

- Doctor passwords: shared privately with reviewers only. Never in README, code, video,
  slides, screenshots, Git or public posts.
- `service_role` / `sb_secret_…`: server-side only. Never in a `VITE_` variable.
- `GROQ_API_KEY` / `GNANI_API_KEY`: Supabase Function Secrets only.
- If the submission form has an evaluator-access field, verify it is reviewer-only before
  using it; otherwise ask the organisers for an approved private channel.

---

## H. What is already done for you

| Item | Evidence |
|---|---|
| Migrations, seeds, RLS, constraints, RPCs | 32 SQL assertion blocks PASS |
| Edge Functions | 181 Deno tests, `deno check` clean, 81 HTTP scenarios PASS |
| API layer (20 exports) | 51 real-stack tests PASS, audit in `tests/api/README.md` |
| Real browser journeys | 26 checks PASS against real Auth/Functions/Postgres |
| UI interaction suite | 16 headless journeys PASS |
| Callable `speak` audio + WAV upload | `src/lib/audio/voice.ts`, `tests/api` |
| Contract fixtures | 17 valid |
| Question bank | 150 validated, bilingual |
| Preflight / smoke / reset safety | 16/16, 52+29, self-test PASS |
| Secret scan | clean |
| Release docs | `docs/release/*`, `docs/cors-verification.md`, `docs/frontend-integration-guide.md` |
