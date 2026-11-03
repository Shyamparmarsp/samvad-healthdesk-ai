# Backend Deployment Runbook

Ordered production deployment of the Supabase backend. **Every remote command in this file
is an owner action.** The agent has not linked a project, applied a migration, seeded a
database, set a secret or deployed a function.

Companion documents — follow the deepest applicable one instead of duplicating it:

| Topic | Document |
|---|---|
| Sign-in, doctor identities, caps | `docs/supabase-owner-setup.md` |
| Per-step owner fields and approval gates | `docs/final-owner-launch-checklist.md` |
| Local verification, SQL suites, CORS detail | `docs/release-runbook.md` |
| Backup, restore and failed-migration recovery | `docs/data-retention-and-backup.md`, `docs/backup-and-recovery.md` |
| Environment variable matrix | `docs/environment-variables.md` |
| Access model and open security items | `docs/security-and-access-review.md` |

---

## 0. What is deployed

| Artefact | Count | Source |
|---|---|---|
| Edge Functions | 2 | `supabase/functions/chat-turn`, `supabase/functions/speak` |
| Migrations | 11 | `supabase/migrations/20261101*` and `20261102*` |
| Reference seed | 1 file | `supabase/seed.sql` (never applied by `db push`) |
| Doctor mapping | 1 named file | `supabase/seed-doctor-profiles.sql` (owner fills 2 UIDs) |
| Function secrets | 3 required | `GROQ_API_KEY`, `GNANI_API_KEY`, `ALLOWED_ORIGINS` |
| Doctor Auth users | 2 | created in the Dashboard, never by SQL |
| Frontend | separate | Vercel; see `docs/environment-variables.md` |

`git push` does **not** deploy Supabase. The database and both functions deploy only through
the Supabase CLI or Dashboard, in the order below.

## 1. Preconditions and decisions

- [ ] Owner approval recorded for this exact deployment.
- [ ] Project ref, production frontend origin and the two doctor credentials are available
      privately.
- [ ] `GROQ_API_KEY` and `GNANI_API_KEY` are available (or the deployment accepts text-only
      fallback; that is supported).
- [ ] The additional `SECURITY DEFINER` read paths are acknowledged
      (`docs/security-and-access-review.md` §5).
- [ ] The owner accepts that CORS is not an authorisation control on this platform
      (`docs/cors-verification.md`).
- [ ] A pre-migration backup plan exists (§3).

**Stop** if any item is unresolved. Nothing in the application code is blocked on these
decisions; deployment is.

## 2. Verify the release locally before touching a project

```bash
git status --porcelain            # expect only known evidence artefacts
deno test --allow-read --allow-env supabase/functions/
deno check supabase/functions/chat-turn/index.ts supabase/functions/speak/index.ts
```

Full gate against the local stack:

```bash
npx supabase start
export LOCAL_SERVICE_KEY=$(npx supabase@latest status -o env | grep '^SERVICE_ROLE_KEY=' | cut -d'"' -f2)
deno run --allow-all scripts/release-check.ts
```

Expected reference result: **21 PASS, 0 FAIL, 0 BLOCKED, 1 NOT TESTED** (the frontend
type/build step is not requested by default; `--frontend` adds it). The same gate covers
181 Deno tests, 52 integration scenarios, 29 adaptive scenarios and 29 read-only database
checks. Current evidence is `release-check-result.json`; it is a local snapshot, not a
production result.

## 3. Back up before any schema change

Use the naming, manifest and storage convention in
`docs/data-retention-and-backup.md` §5. Minimum:

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
supabase db dump -f "samvad-<ref8>-prod-pre-migration-${STAMP}-schema.sql"
supabase db dump --data-only -f "samvad-<ref8>-prod-pre-migration-${STAMP}-data.sql"
```

Verify the files are non-empty and store them off-platform before continuing. Do not put a
dump in the repository.

## 4. Link the project

```bash
supabase link --project-ref <project-ref>
supabase projects list            # confirms the linked project
```

## 5. Apply migrations and seed

Apply exactly these 11 files, in this order (lexicographic on the timestamp):

| # | Migration | Adds |
|---|---|---|
| 1 | `20261101120000_enums_and_helpers.sql` | enums, `set_updated_at`, `ist_day_bucket` |
| 2 | `20261101120100_reference_tables.sql` | departments, doctors, doctor_profiles, doctor_schedules |
| 3 | `20261101120200_intake_tables.sql` | sessions, consent_records, messages, reports (+ RLS) |
| 4 | `20261101120300_appointments.sql` | appointments (no browser grant) |
| 5 | `20261101120400_usage_tables.sql` | daily usage tables, `reserve_daily_usage` |
| 6 | `20261102120000_mark_report_reviewed.sql` | `mark_report_reviewed()` |
| 7 | `20261102130000_availability_and_booking.sql` | `get_available_slots()`, `book_appointment()` |
| 8 | `20261102140000_ist_day_bucket.sql` | IST bucket hardening |
| 9 | `20261102150000_session_preliminary_department.sql` | `sessions.preliminary_department` |
| 10 | `20261102160000_doctor_appointment_reads.sql` | `get_doctor_appointments()` |
| 11 | `20261102170000_report_immutability.sql` | terminal-report immutability trigger |

```bash
supabase db push                  # applies 1–11 and records the ledger
supabase migration list           # every local version must show a remote counterpart
```

`db push` does **not** apply `supabase/seed.sql`. Apply it deliberately:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

Verify:

```sql
select count(*) from public.departments;        -- 6
select count(*) from public.doctors;            -- 6
select count(*) from public.doctor_schedules;   -- 25
select count(*) from public.daily_usage_limits; -- 4
select key, booking_enabled, is_emergency
from public.departments order by display_order; -- Emergency booking_enabled = false
```

If a migration fails: stop, do not re-run a partially applied file, and follow
`docs/backup-and-recovery.md` §3.

## 6. Create and map the two doctor identities

Follow `docs/supabase-owner-setup.md` §4 and `docs/doctor-onboarding.md`. In short:

1. Dashboard → Authentication → Users → Add user (email + password, confirmed):
   General Medicine / Dr. Aditi Rao; Emergency / Dr. Neha Verma.
2. Copy each UID; never insert into `auth.users` with SQL.
3. Map with the dry-run-first utility:

   ```bash
   export LOCAL_URL=https://<project-ref>.supabase.co
   export LOCAL_SERVICE_KEY=<secret key>
   export DOCTOR_GM_UID=<aditi-uid>
   export DOCTOR_EM_UID=<neha-uid>
   deno run --allow-net --allow-env scripts/map-doctor-profiles.ts            # dry run
   deno run --allow-net --allow-env scripts/map-doctor-profiles.ts --confirm  # apply
   ```

   Or fill the two UIDs in `supabase/seed-doctor-profiles.sql` and apply that one named file.

Expected: exactly two `doctor_profiles` rows, one per department. The mapping is what makes
the doctor dashboard show reports; without it RLS returns nothing.

## 7. Set function secrets

```bash
supabase secrets set GROQ_API_KEY=<groq-key>
supabase secrets set GNANI_API_KEY=<gnani-key>
supabase secrets set ALLOWED_ORIGINS=https://<exact-frontend-origin>
supabase secrets list      # names only; never paste values into a terminal log
```

Set `ALLOWED_ORIGINS` to the exact deployed origin, comma-separated if there are several,
no wildcard and no trailing slash. It is correctness hygiene; JWT, RLS and ownership are
the actual controls. Leave `GROQ_BASE_URL`, `PRISMA_BASE_URL` and `TIMBRE_ENDPOINT` unset in
production — they exist only for the local provider stub.

## 8. Deploy the two functions

```bash
supabase functions deploy chat-turn --import-map supabase/functions/deno.json
supabase functions deploy speak --import-map supabase/functions/deno.json
```

Both functions import the npm package `@supabase/server` through
`supabase/functions/deno.json`. CLI 2.122 does not pick that import map up automatically and
fails with `Relative import path "@supabase/server" not prefixed with / or ./ or ../`, so
pass `--import-map` explicitly. After deploying, confirm `functions list` reports
`verify_jwt: true` and a new version number for the function you meant to change.

Keep platform JWT verification enabled. Never pass `--no-verify-jwt`.

Verify enforcement:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<project-ref>.supabase.co/functions/v1/chat-turn" \
  -X POST -H "content-type: application/json" -d '{"action":"start_session"}'
# expect 401
```

A `200` here means JWT verification is off: redeploy immediately without the flag and
treat the window as a security incident.

## 9. Configure the frontend

Vercel → Project → Settings → Environment Variables:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_KEY=<publishable key or legacy anon key>
```

Build command `npm run build`, output `dist`, repository root, SPA rewrite for `/doctor`.
Redeploy after any environment change. Full rules: `docs/environment-variables.md`.

## 10. Post-deployment verification

| Check | Expected |
|---|---|
| `GET /` | patient welcome, Hindi/English toggle |
| Refresh `/doctor` | login screen, no 404 (SPA rewrite) |
| Consent **No** | session ends, no report, no health data |
| Consent **Yes** → text answers → review → Submit | report created and submitted |
| Doctor login (General Medicine) | report visible; Mark Reviewed succeeds |
| Booking | `APT-…` reference; same slot second time refused |
| “Not now” | no appointment, report still visible to the doctor |
| Clear emergency phrase | 112 guidance, no routine slots |
| Ambiguous emergency → **Yes** | urgent flow, no routine slots |
| Ambiguous emergency → **No** | only that candidate negated; not treated as safe |
| Browser console | no 401/CORS errors |

Database checks from the CLI are read-only and local-only. `scripts/verify-db-release.ts`
targets the Docker container `supabase_db_samvad-backend`; it is **not** a hosted-project
tool. For the hosted project use `supabase migration list` plus the SQL counts in §5 and
the mapping query in §6.

`scripts/verify-deploy-config.ts` checks configuration presence and never prints secrets;
its expected remote blockers are the project link, the three secrets and live provider mode
until the owner sets them.

## 11. Rollback

- **Function:** redeploy the previous known-good commit's function, then confirm the
  unauthenticated probe still returns 401.
- **Secret:** re-set the previous value; provider failures already degrade to text
  fallbacks and do not require a rollback to keep the demo usable.
- **Database:** migrations are additive and there are no down-migrations. Restore the
  pre-migration dump into a fresh project/database and re-apply known-good migrations
  (`docs/backup-and-recovery.md` §3). Never re-run a half-applied file.
- **Usage counters:** never reset during a demo day; adjust `daily_usage_limits` instead.
- **Emergency path:** independent of providers; text guidance must keep working.

## 12. Claim and evidence status

| Area | State |
|---|---|
| Local backend gate | 21 PASS / 0 FAIL / 0 BLOCKED / 1 NOT TESTED (frontend step not requested) |
| Deno tests | 181/181 PASS |
| Integration + adaptive HTTP | 52/52 and 29/29 PASS |
| Database readiness | 29/29 PASS (local, read-only) |
| Question-bank export validation | PASS (150 questions, bank-v2) |
| Hosted migrations / seed / functions | **NOT TESTED** — owner action |
| Hosted RLS and CORS behaviour | **NOT TESTED** — no deployment |
| Live Groq / Prisma / Timbre | **NOT TESTED** — no keys used |
| Doctor Auth users and mapping in production | **BLOCKED** — owner action |

Evidence files: `release-check-result.json`, `demo-smoke-result.json`,
`db-release-result.json`, `db-rehearsal-result.json`, `deploy-config-result.json`,
`provider-verification-result.json`, `question-bank-review-status.json`,
`retention-dry-run-result.json`.

## 13. What remains owner-only

1. Approve and run every remote command in §3–§8.
2. Create the two Auth users and approve the mapping.
3. Set the three secrets and the two Vercel variables.
4. Run the live provider verification and listen to both TTS clips.
5. Acknowledge the additional `SECURITY DEFINER` read functions.
6. Run the post-deployment acceptance journey.
7. Disable the doctor accounts and execute retention after the demo
   (`docs/data-retention-and-backup.md`).
