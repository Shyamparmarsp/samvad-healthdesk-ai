# Production Deployment Checklist

Everything here is executed by the **owner**. No step in this document was performed by
the agent: no remote migration, seed, deployment or provider call was run.

Replace every `<placeholder>` yourself. No project reference, URL or origin in this file
is real.

---

## 0. Preconditions

| Item | Why |
|---|---|
| Supabase project created and owned by you | all backend state lives there |
| Vercel project connected to the repository | frontend hosting |
| Two doctor Auth users created by you | the mapping step needs their UIDs |
| `GROQ_API_KEY` and `GNANI_API_KEY` available privately | provider activation |
| Production frontend origin known | `ALLOWED_ORIGINS` |

**Do not** put any key in a `VITE_` variable. **Do not** publish doctor passwords.

---

## 1. Environment templates

Backend names (template: `supabase/.env.example` in this repo):

```
GROQ_API_KEY=
GNANI_API_KEY=
ALLOWED_ORIGINS=
```

Frontend (template `.env.example`):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_KEY=
```

`VITE_SUPABASE_KEY` is the **publishable** key (`sb_publishable_…`) or the legacy anon
key. Never the secret/service-role key.

---

## 2. Database migration order

Apply in exactly this order (lexicographic on the timestamp):

| # | Migration | Adds |
|---|---|---|
| 1 | `20261101120000_enums_and_helpers.sql` | enums, `set_updated_at`, `ist_day_bucket` |
| 2 | `20261101120100_reference_tables.sql` | departments, doctors, doctor_profiles, doctor_schedules |
| 3 | `20261101120200_intake_tables.sql` | sessions, consent_records, messages, reports (+ RLS) |
| 4 | `20261101120300_appointments.sql` | appointments (no browser grant) |
| 5 | `20261101120400_usage_tables.sql` | daily_usage_limits/counters, `reserve_daily_usage` |
| 6 | `20261102120000_mark_report_reviewed.sql` | `mark_report_reviewed()` |
| 7 | `20261102130000_availability_and_booking.sql` | `get_available_slots()`, `book_appointment()` |
| 8 | `20261102140000_ist_day_bucket.sql` | IST bucket hardening |
| 9 | `20261102150000_session_preliminary_department.sql` | `sessions.preliminary_department` |
| 10 | `20261102160000_doctor_appointment_reads.sql` | `get_doctor_appointments()` |

```bash
supabase link --project-ref <project-ref>
supabase db push            # applies 1–10 in order
supabase migration list     # verify every version shows local + remote
```

`db push` does **not** apply `supabase/seed.sql`. That is a separate, deliberate step
(§3).

**Expected:** ten versions listed as applied, no pending local migrations.
**Failure:** a version already recorded but the object missing → stop and restore a backup
rather than re-running the migration (see §10).

---

## 3. Reference seed (owner approval required)

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

The seed is idempotent (`on conflict do update` / `do nothing`) and safe to re-run.

Verify:

```sql
select count(*) from public.departments;   -- expect 6
select count(*) from public.doctors;       -- expect 6
select key, booking_enabled, is_emergency from public.departments order by display_order;
select count(*) from public.daily_usage_limits;  -- expect 4
```

Expected: exactly 6 departments, 6 fictional doctors, Emergency `booking_enabled = false`.

---

## 4. Doctor identities and profile mapping (owner approval required)

1. Supabase Dashboard → Authentication → Users → create two users with email + password:
   - General Medicine — Dr. Aditi Rao
   - Emergency — Dr. Neha Verma
2. Never insert into `auth.users` with SQL.
3. Copy each **UID**.
4. Edit only the two placeholder UIDs in `supabase/seed-doctor-profiles.sql`.
5. Apply that named file:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed-doctor-profiles.sql
```

Verify (expect exactly 2 rows, one per department):

```sql
select dp.user_id, d.display_name, d.department_key
from public.doctor_profiles dp join public.doctors d on d.id = dp.doctor_id
order by d.department_key;
```

Credentials are handed to evaluators privately. The login screen says so and displays no
password.

---

## 5. Edge Function secrets

```bash
supabase secrets set GROQ_API_KEY=<groq-key>
supabase secrets set GNANI_API_KEY=<gnani-key>
supabase secrets set ALLOWED_ORIGINS=https://<your-frontend-domain>
supabase secrets list          # names only, never values
```

`ALLOWED_ORIGINS` is a comma-separated exact-origin list with no wildcard and no trailing
slash. Local origins are always allowed by `_shared/cors.ts`.

> CORS reality check: the platform overwrites the origin with `*`
> (`docs/cors-verification.md`). Set `ALLOWED_ORIGINS` correctly, but do not rely on it as
> an authorization control — JWT verification, RLS and ownership are the controls.

---

## 6. Deploy the backend functions

```bash
supabase functions deploy chat-turn
supabase functions deploy speak
```

Keep JWT verification enabled (the default; do not pass `--no-verify-jwt`).

Verify: an unauthenticated call returns 401, not 200.

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<project-ref>.supabase.co/functions/v1/chat-turn" -X POST \
  -H "content-type: application/json" -d '{"action":"start_session"}'
# expect 401
```

---

## 7. Frontend deployment (Vercel)

| Setting | Value |
|---|---|
| Root directory | repository root |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` |
| SPA routing | `vercel.json` rewrites so `/doctor` survives a refresh |

Redeploy after changing any `VITE_` variable — they are baked at build time.

Verify the bundle contains no secret:

```bash
grep -c "sb_secret_" dist/assets/*.js   # expect 0 matches (grep exits 1)
```

---

## 8. Post-deployment smoke verification

| Check | Expected |
|---|---|
| `GET /` | patient welcome screen, Hindi/English toggle |
| `GET /doctor` then refresh | doctor login screen (SPA rewrite works) |
| Start intake → consent → 3 answers | real questions from `chat-turn` |
| Submit a full intake | draft report renders |
| Doctor login | dashboard shows the submitted report |
| Mark Reviewed | confirmation, no error |
| Book a slot | `APT-YYYYMMDD-XXXXXX` reference |
| Browser console | no CORS or 401 errors |

---

## 9. Provider activation

| Provider | Secret | Verification |
|---|---|---|
| Groq | `GROQ_API_KEY` | adaptive question is model-selected; department routing is not always fallback |
| Prisma (STT) | `GNANI_API_KEY` | an audio turn returns a real transcript preview |
| Timbre (TTS) | `GNANI_API_KEY` | an adaptive question returns audio, not `{ text }` |

If a key is absent the app still works: text intake, deterministic adaptive selection and
text questions. That is the approved fallback, not a failure.

Do not run live checks from CI. `scripts/provider-verification` (or
`supabase/tests/provider-verification.ts`) requires an explicit opt-in and synthetic input.

---

## 10. Backup and rollback

**Before** any migration on a real project:

```bash
supabase db dump -f backup-schema-$(date +%Y%m%d).sql
supabase db dump --data-only -f backup-data-$(date +%Y%m%d).sql
```

Rollback for a failed or interrupted migration:

1. Stop the deployment; do not re-run a partially applied file.
2. Inspect `supabase_migration_status`.
3. Restore the pre-migration dump into a fresh project or database.
4. Re-apply only the migrations that are known good, in order.
5. Re-run the RLS/constraint suites before reopening the demo.

There are no down-migrations. Recovery is restore-based by design.

Rollback for a bad function deployment: redeploy the previous commit's function
(`supabase functions deploy chat-turn --project-ref <ref>` from the last good tag). The
database contract is unchanged by a function rollback.

---

## 11. Owner approval gates

| Gate | Approval needed |
|---|---|
| Apply migrations remotely | yes |
| Apply `seed.sql` remotely | yes |
| Apply `seed-doctor-profiles.sql` | yes |
| Create doctor Auth users | yes |
| Set function secrets | yes |
| Deploy functions | yes |
| Deploy frontend | yes |
| Acknowledge the third `SECURITY DEFINER` exception (F-1) | yes |
| Enable live providers | yes |

Nothing in this checklist is executed by the agent.
