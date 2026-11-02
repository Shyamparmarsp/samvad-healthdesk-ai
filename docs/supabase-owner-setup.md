# Supabase Owner Setup

The Supabase-side configuration only the project owner can perform, in the order that keeps
the patient flow usable. Deployment ordering, verification and rollback live in
`docs/backend-deployment-runbook.md`; this file covers the project, Auth, doctor identities
and usage limits.

Nothing here has been executed by the agent. Replace every `<placeholder>`.

---

## 1. Project

| Item | Value |
|---|---|
| Project | one hosted Supabase project, owned by the participant |
| Region | closest to the demo audience; record it |
| Plan | free tier is sufficient for the demo |
| Realtime | not used by the application; do not build features on it |
| Storage | no bucket is used; no public bucket may be created |
| Extra schemas | none; `public` only |

Record the **project ref**, **project URL** and the **publishable/anon key**. The
secret/service-role key stays server-side and is never pasted into a browser variable,
README, screenshot or chat.

## 2. Authentication settings

Patient access is anonymous Supabase Auth behind the Welcome screen; there is no patient
signup form.

| Setting | Required value | Why |
|---|---|---|
| Anonymous sign-ins | **enabled** | `startAnonymousSession()` uses `signInAnonymously()` |
| Email provider | enabled | doctor email/password sign-in |
| Email confirmations | owner choice; users must be confirmed | an unconfirmed doctor cannot sign in |
| JWT expiry | default (3600 s locally) | bounds the residual token window when an account is banned |
| Patient signup | no UI, no form | the app never calls `signUp()` |

In the Dashboard the anonymous toggle is under **Authentication → Sign In / Providers**
(label varies by dashboard version); the local equivalent is
`enable_anonymous_sign_ins = true` in `supabase/config.toml`.

If anonymous sign-ins are disabled, every patient call fails with 401 even though the
function is healthy. That is a configuration fault, not a CORS fault.

## 3. Link and apply the database

```bash
supabase link --project-ref <project-ref>
```

Then follow `docs/backend-deployment-runbook.md` §3–§5 exactly:

1. back up first;
2. `supabase db push` applies the 11 timestamped migrations;
3. `supabase migration list` must show a remote counterpart for every local version;
4. apply `supabase/seed.sql` separately (`db push` does not run it);
5. verify 6 departments, 6 doctors, 25 schedule rows, 4 usage limits and Emergency
   `booking_enabled = false`.

Never apply migration files by hand in the SQL Editor: that leaves the ledger unrecorded and
makes the next `db push` unsafe. A named, one-off owner file
(`supabase/seed-doctor-profiles.sql`) is the only SQL applied outside the migration path.

## 4. Doctor Auth users and profile mapping

The demo has exactly two fictional doctors. Their credentials are shared privately with
evaluators; the login screen displays no password and says so.

### 4.1 Create the users

Supabase Dashboard → **Authentication → Users → Add user**:

| Department | Display name | Notes |
|---|---|---|
| General Medicine | Dr. Aditi Rao | confirm the email |
| Emergency | Dr. Neha Verma | confirm the email |

Never insert into `auth.users` with SQL — that bypasses GoTrue and produces identities the
API cannot authenticate. Copy each **UID**; never copy a password into the repository.

### 4.2 Map the profiles

Dry run first:

```bash
export LOCAL_URL=https://<project-ref>.supabase.co
export LOCAL_SERVICE_KEY=<secret key>       # server-side only, never a VITE_ variable
export DOCTOR_GM_UID=<aditi-uid>
export DOCTOR_EM_UID=<neha-uid>

deno run --allow-net --allow-env scripts/map-doctor-profiles.ts            # dry run
deno run --allow-net --allow-env scripts/map-doctor-profiles.ts --confirm  # apply
```

The utility validates both UIDs, requires exactly one doctor per department, refuses
conflicts, writes only `doctor_profiles(user_id, doctor_id)` and verifies the result. It
never prints credentials. See `docs/doctor-onboarding.md` for the full behaviour and the
equivalent named-SQL path.

Verify:

```sql
select dp.user_id, d.display_name, d.department_key
from public.doctor_profiles dp
join public.doctors d on d.id = dp.doctor_id
order by d.department_key;
```

Expected: exactly two rows — Dr. Aditi Rao → `general_medicine`, Dr. Neha Verma →
`emergency` — and no others. A third row gives a third account report visibility.

### 4.3 What the mapping grants

`doctor_profiles` is the doctor's authorisation scope. RLS shows a doctor only reports
assigned to the mapped `doctor_id`, plus the documented read-only Emergency-department
visibility. No mapping means an empty dashboard, not an error.

## 5. Function secrets

```bash
supabase secrets set GROQ_API_KEY=<groq-key>
supabase secrets set GNANI_API_KEY=<gnani-key>
supabase secrets set ALLOWED_ORIGINS=https://<exact-frontend-origin>
supabase secrets list
```

| Name | Used for | Fallback when absent |
|---|---|---|
| `GROQ_API_KEY` | department suggestion + adaptive question selection | deterministic scripted selection |
| `GNANI_API_KEY` | Prisma STT and Timbre TTS | editable text intake; text question |
| `ALLOWED_ORIGINS` | exact browser-origin allowlist | non-local origins refused; local origins still work |

Do not set `GROQ_BASE_URL`, `PRISMA_BASE_URL` or `TIMBRE_ENDPOINT` in production; they are
local-stub overrides only. Never place any of these values in a `VITE_` variable.
Full matrix: `docs/environment-variables.md`.

## 6. Daily usage limits

Four application guardrails live in `public.daily_usage_limits`, one row per counter:
`sessions`, `groq`, `prisma`, `timbre`. The approved defaults are 100 / 300 / 150 / 120 per
Asia/Kolkata day. They are application guardrails, not provider quotas.

The owner can change them in the SQL Editor without a redeploy:

```sql
select counter_name, daily_limit from public.daily_usage_limits order by counter_name;

update public.daily_usage_limits
   set daily_limit = 300
 where counter_name = 'prisma';       -- example only
```

Rules:

- Never reset, truncate or delete `daily_usage_counters` to "free" a cap; that destroys the
  audit trail and is not an approved operation.
- Never grant browser access to either usage table or to `reserve_daily_usage`; they are
  server-only.
- A session cap returns `demo_busy`; a single provider cap disables only that provider and
  keeps its text fallback.
- The manual cached-audio reservation is separate and must not touch the database. See
  `docs/operations-and-capacity.md`.

## 7. Verify the setup

```bash
# Functions reachable and JWT enforced
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<project-ref>.supabase.co/functions/v1/chat-turn" \
  -X POST -H "content-type: application/json" -d '{"action":"start_session"}'
# expect 401

# Configuration presence, no values printed
deno run --allow-read --allow-env --allow-net --allow-run --allow-write scripts/verify-deploy-config.ts
```

| Check | Expected |
|---|---|
| `supabase migration list` | all 11 local versions applied remotely |
| Reference counts | 6 departments, 6 doctors, 25 schedules, 4 limits |
| `doctor_profiles` | exactly 2 rows |
| Unauthenticated function POST | 401 |
| `supabase secrets list` | the three names, no values shown |
| Browser bundle | `grep -c sb_secret_ dist/assets/*.js` → 0 |

## 8. Credential and access policy

- Doctor passwords: private evaluator channel only. Never in README, source, Git history,
  Figma, screenshots, slides, video, logs or public posts.
- Secret/service-role key: server-side only; never in `VITE_*`, Vercel, the repository or a
  dump filename.
- Provider keys: Supabase Function Secrets only.
- No shared public password. If the submission form has no confidential evaluator field,
  ask the organisers for an approved private channel.
- After the demonstration, **disable** the two doctor accounts; do not delete them.
  Procedure: `docs/data-retention-and-backup.md` §4.

## 9. Owner sign-off

```
[ ] project created and ref recorded
[ ] anonymous sign-ins enabled
[ ] 11 migrations applied; ledger matches
[ ] seed applied; counts 6 / 6 / 25 / 4
[ ] two doctor users created and confirmed
[ ] doctor_profiles has exactly 2 rows (GM + Emergency)
[ ] three function secrets set (names only verified)
[ ] JWT probe returns 401
[ ] frontend variables set; bundle contains no secret
Date / operator: ______________________
```
