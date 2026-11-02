# Hosted Supabase setup — owner procedure

**Candidate:** `release-candidate/samvad-final`
**Scope:** one hosted Supabase project for the Samvad HealthDesk AI demo
**Status:** procedure verified against the release candidate; **no hosted project was created, linked, migrated or deployed by the agent**

Every command below is exact. Run them from the repository root of the release
candidate. `npx supabase@latest` is used so nothing is installed machine-wide.

> **Never** run these steps against a project that already holds real data. This demo is
> synthetic-data-only (`AGENTS.md`). Never insert into `auth.users` with SQL.

---

## 0. What you are deploying

| Object | Count | Path |
|---|---|---|
| Migrations | 11 | `supabase/migrations/2026110*.sql` (strictly increasing timestamps) |
| Seed (reference data) | 1 file | `supabase/seed.sql` (idempotent, fictional only) |
| Doctor mapping | 1 file + 1 script | `supabase/seed-doctor-profiles.sql`, `scripts/map-doctor-profiles.ts` |
| Edge Functions | 2 | `supabase/functions/chat-turn`, `supabase/functions/speak` |
| Storage buckets | 0 | Prompt audio is static under `public/audio/` and ships with the frontend |
| Browser env vars | 2 | `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` |
| Function secrets | 3 | `GROQ_API_KEY`, `GNANI_API_KEY`, `ALLOWED_ORIGINS` |

Preflight (already green locally, 17 PASS / 0 FAIL / 5 owner-blocked):

```bash
deno run --allow-read --allow-env --allow-net --allow-run --allow-write \
  scripts/verify-deploy-config.ts
```

---

## 1. Create the hosted project

Creation is a Dashboard action: <https://supabase.com/dashboard> → **New project**.

- Organisation: the owner's workshop organisation.
- Name: `samvad-healthdesk-demo`.
- Region: the closest to the demo audience (e.g. `ap-south-1`).
- Database password: generate and store it in the owner's password manager. It is not
  used by the application and must never be committed.
- Plan: the free tier is sufficient for a scripted demo.

Do not paste the database password, service key or provider keys into any file in this
repository.

## 2. Record the project URL and reference

Dashboard → **Project Settings → API**:

| Value | Where it goes |
|---|---|
| Project URL (`https://<ref>.supabase.co`) | `VITE_SUPABASE_URL` in Vercel |
| Publishable key (`sb_publishable_…`) or legacy anon key | `VITE_SUPABASE_KEY` in Vercel |
| Project ref (`<ref>`) | `supabase link --project-ref <ref>` |

The **secret key** / `service_role` key is server-only. It is used by the Edge Functions
runtime automatically and must never appear in Vercel, the browser bundle, a README, a
screenshot or Git.

## 3. Apply all migrations in order

```bash
npx supabase@latest login                     # opens the browser; owner action
npx supabase@latest link --project-ref <ref>
npx supabase@latest migration list            # confirm 11 local migrations
npx supabase@latest db push                   # applies them in timestamp order
npx supabase@latest migration list            # local and remote must match
```

`db push` applies the timestamped files; it does **not** apply `seed.sql`.

Rollback if a migration fails: stop, do not edit applied history, and restore the
pre-migration backup taken in step 5 of §5 below.

## 4. Load the approved synthetic seed

```bash
# Connection string from Dashboard → Project Settings → Database → Connection string (URI)
export DATABASE_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

Expected reference rows after seeding:

```sql
select count(*) from public.departments;        -- 6
select count(*) from public.doctors;            -- 6
select count(*) from public.doctor_schedules;   -- 25
select count(*) from public.daily_usage_limits;  -- 4
```

Verify the daily caps match the owner-approved defaults (100 sessions, 300 Groq, 150
Prisma, 120 Timbre). Change them in the SQL Editor at any time; no redeploy is needed.

## 5. Create the two demo doctor Auth accounts

Dashboard → **Authentication → Users → Add user** (create, do not invite):

| Email | Department | Doctor record |
|---|---|---|
| the owner's chosen address | General Medicine | Dr. Aditi Rao |
| the owner's chosen address | Emergency | Dr. Neha Verma |

- Set **Auto Confirm User**.
- Use a strong password that is shared privately with reviewers only.
- Copy each **Auth UID** (UUID) from the user list.

Never create these with SQL and never insert into `auth.users`.

## 6. Map the doctor identities to profiles

Dry run first (prints the plan, changes nothing):

```bash
SUPABASE_URL="https://<ref>.supabase.co" \
SUPABASE_SECRET_KEY="<secret key>" \
DOCTOR_GM_UID="<general medicine auth uid>" \
DOCTOR_EM_UID="<emergency auth uid>" \
deno run --allow-net --allow-env scripts/map-doctor-profiles.ts
```

Apply:

```bash
# same variables, plus:
... deno run --allow-net --allow-env scripts/map-doctor-profiles.ts --confirm
```

The script refuses to proceed if a department does not resolve to exactly one doctor,
never touches `auth.users`, and is safe to re-run.

Verify exactly two mappings:

```sql
select dp.user_id, d.display_name, d.department_key
  from public.doctor_profiles dp join public.doctors d on d.id = dp.doctor_id
 order by d.department_key;   -- 2 rows: emergency, general_medicine
```

## 7. Configure the server-side secrets

```bash
npx supabase@latest secrets set \
  GROQ_API_KEY="<groq key>" \
  GNANI_API_KEY="<gnani key>" \
  ALLOWED_ORIGINS="https://<vercel-production-origin>"

npx supabase@latest secrets list      # names only, values are never printed
```

- `ALLOWED_ORIGINS` is an exact, comma-separated allowlist (no wildcards, no trailing
  slash). Add the Vercel production origin **and** any preview origin you will actually
  use, e.g. `https://samvad.vercel.app,https://samvad-git-main-team.vercel.app`.
- Do not set `GROQ_BASE_URL`, `PRISMA_BASE_URL` or `TIMBRE_ENDPOINT` in production; they
  are local-stub overrides only. The production preflight fails if they are present.
- Never set `LOCAL_SERVICE_KEY` or `LOCAL_ANON_KEY` in a deployed function.

## 8. Deploy `chat-turn`

```bash
npx supabase@latest functions deploy chat-turn
```

JWT verification is enabled by the platform default; `supabase/config.toml` contains no
`verify_jwt = false` override, so it cannot be disabled by accident. Confirm:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://<ref>.supabase.co/functions/v1/chat-turn" \
  -H "content-type: application/json" -d '{}'
# expected: 401 (no JWT)
```

## 9. Deploy `speak`

```bash
npx supabase@latest functions deploy speak
```

Same JWT check as above with `/functions/v1/speak`. `speak` only synthesises the
session's **current adaptive** question; cached fixed prompts never reach it.

## 10. Confirm JWT verification and authorization

| Check | Expected |
|---|---|
| `chat-turn` with no `Authorization` header | `401` |
| `chat-turn` with a patient JWT and another patient's `session_id` | `404`/`not_found`, never data |
| doctor read with a patient JWT | empty (RLS) |
| Auth user with no `doctor_profiles` row calling `doctorLogin` | `not_a_doctor`, signed out |
| Browser direct insert into `sessions`/`reports` | denied by RLS |

The full authorization matrix is already proven against the local stack
(`npm run test:api` 55/55 and the eight SQL suites); re-run the two highest-value checks
above after the hosted deploy.

## 11. Configure CORS for the Vercel origin

`supabase/functions/_shared/cors.ts` allows only exact origins: the local development
origins plus whatever is listed in `ALLOWED_ORIGINS`. Unknown origins receive no
`Access-Control-Allow-Origin` header (fail closed). After setting the secret, restart the
functions by re-deploying (secrets are read at boot):

```bash
npx supabase@latest functions deploy chat-turn
npx supabase@latest functions deploy speak
```

Preflight from the deployed origin:

```bash
curl -s -D - -o /dev/null -X OPTIONS \
  "https://<ref>.supabase.co/functions/v1/chat-turn" \
  -H "Origin: https://<vercel-production-origin>" \
  -H "Access-Control-Request-Method: POST"
# expected: access-control-allow-origin: https://<vercel-production-origin>
```

A different origin must **not** receive that header.

## 12. Execute the hosted smoke test (owner, in a browser)

1. Open the Vercel production URL, choose Hindi, click **Start Talking**.
2. Accept consent; answer name, age, gender, primary concern by text.
3. Confirm the transcript step appears for a voice answer (microphone allowed).
4. Review the draft, submit, and book a slot; confirm the date is a real IST date/time.
5. Open `/doctor`, log in with the General Medicine account; the report and the stored
   conversation must appear; use **Mark Reviewed**.
6. Log in with the Emergency account; confirm the same urgent report is visible.
7. Trigger the emergency phrase from `docs/demo-emergency-rules.md`; confirm 112 guidance
   and no slots.
8. Confirm the greeting plays (after the owner-generated audio exists) and that no paid
   TTS call happens for the fixed prompts.

Record the result in the release checklist. A hosted run is not implied by the local
suites.

## 13. Verify RLS and doctor access on the hosted project

Using the two doctor logins in the browser and, if desired, the SQL Editor with
`set role authenticated` + a `request.jwt.claims` claim:

- General Medicine sees its own reports **and** Emergency reports (read-only).
- Emergency sees Emergency reports and can acknowledge them.
- Neither sees another department's reports.
- Draft (unsubmitted) reports are invisible to both.
- `doctor_profiles` returns only the caller's own row.

## 14. Verify report and appointment workflows

- Submitted report visible to the assigned doctor; `urgent_partial` visible to both
  demo doctors.
- Mark Reviewed writes only `reviewed_at`/`reviewed_by`.
- Booking creates one appointment per report; a second booking is refused; the slot is
  unique.
- A `possible_urgent`/`needs_human_review` report cannot be booked before review.
- An emergency report can never be booked.

---

## Rollback

| Situation | Action |
|---|---|
| A migration fails mid-apply | Stop. Restore the pre-migration backup, fix forward in a new timestamped migration. Never edit applied history. |
| A function is broken after deploy | Redeploy the previous candidate's `chat-turn`/`speak`; the database is unchanged. |
| The demo must be paused | Disable the two doctor accounts (Dashboard → Authentication → Users → Ban) and/or pause the Vercel deployment. |
| Full teardown after the demo | Follow `docs/data-retention-and-backup.md`; delete the project only after the owner records the backup deletion. |

## What remains owner-only

1. Project creation, `supabase login`/`link`, and choosing the project ref.
2. The two Auth users and their passwords.
3. The three secrets.
4. The hosted smoke run and the recording of its result.
5. The owner listening pass for prompt audio.
