# Backup and Recovery

Local rehearsal only. No production backup has been created or restored by the agent.

Naming, manifest and off-platform storage conventions are in
`docs/data-retention-and-backup.md` §5. This file covers the dump commands, the restore
rehearsal and recovery after a failed migration or function deployment. Automated structural
and isolated-restore validation is in `scripts/verify-backup-restore.ts`; its default is a
dry run and `--execute` creates/drops a uniquely named local scratch database.

## 1. Back up (owner, before any migration)

```bash
# Full schema (keeps every public constraint, including the auth.users references)
supabase db dump -f backup-schema-$(date +%Y%m%d-%H%M).sql

# Data scoped to the schema this repository owns. Supabase-managed identity rows
# (auth.users, auth.identities) are owned by the platform and are restored by the
# provider, not by this project's seed.
supabase db dump --data-only --schema public -f backup-data-$(date +%Y%m%d-%H%M).sql
```

A data-only dump of the whole database cannot be restored into a bare database: it
contains `auth.*` rows whose tables are created by the platform. Scope it to `public`
for a reproducible rehearsal, or restore into a fresh Supabase project (which already
has the managed schemas).

Verify a dump is usable before relying on it:

```bash
grep -c "CREATE TABLE" backup-schema-*.sql      # expect > 0
grep -c "INSERT INTO"  backup-data-*.sql        # expect > 0
```

## 2. Local restore rehearsal (disposable database)

Never restore into the active application database. Build a scratch database inside the
local container instead:

```bash
docker exec -i supabase_db_samvad-backend psql -U postgres -d postgres \
  -c "create database samvad_restore_rehearsal"
docker exec -i supabase_db_samvad-backend psql -U postgres -d samvad_restore_rehearsal \
  -v ON_ERROR_STOP=1 -f /backup/schema.sql
docker exec -i supabase_db_samvad-backend psql -U postgres -d samvad_restore_rehearsal \
  -v ON_ERROR_STOP=1 -f /backup/data.sql
```

`scripts/verify-backup-restore.ts` performs the same procedure non-interactively and
creates the platform baseline (`extensions`, `auth.users` stub, `auth.uid()`, API roles,
the `supabase_realtime` publication) inside the scratch database only:

```bash
deno run --allow-read --allow-run --allow-env scripts/verify-backup-restore.ts \
  --schema backup-schema.sql --data backup-data.sql --execute
```

Verified on 3 November 2026 against the local stack: 11 tables, the seed rows and all
five SQL functions restored, scratch database dropped. The auth identities are not part
of that check — they are platform-owned.

Then verify integrity in the scratch database:

```sql
select count(*) from public.departments;            -- 6
select count(*) from public.doctors;                -- 6
select count(*) from public.doctor_schedules;       -- 25
select count(*) from public.daily_usage_limits;      -- 4
select count(*) from public.doctor_profiles;         -- 2 in production
select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in
 ('reserve_daily_usage','mark_report_reviewed','get_available_slots',
  'book_appointment','get_doctor_appointments');      -- 5
```

Drop it afterwards: `drop database samvad_restore_rehearsal with (force);`

**Rehearsal evidence produced by the agent:** `scripts/rehearse-db.ts` builds a brand-new
database, applies all 11 migrations from nothing, applies the seed twice and verifies
counts, functions, grants and RLS — 29/29 checks. That proves the migration path can
rebuild the schema; it is not a data restore test.

## 3. Failed migration

1. Stop. Do not re-run a partially applied file.
2. `supabase migration list` to see exactly which version is recorded.
3. Restore the pre-migration dump into a fresh project/database.
4. Re-apply only known-good migrations, in order.
5. Run `scripts/verify-db-release.ts` before reopening.

There are no down-migrations; recovery is restore-based by design.

## 4. Interrupted Edge Function deployment

The database contract is unchanged by a function rollback.

1. `supabase functions deploy chat-turn` (and `speak`) from the last known-good commit.
2. Confirm JWT enforcement: an unauthenticated POST returns **401**.
3. If a function was deployed with `--no-verify-jwt`, redeploy immediately without it.

Data written by the interrupted function (sessions/messages) remains valid: every write
is transaction-scoped and idempotent through `(session_id, turn_index)`.

## 5. What must never be done

- No backup or restore against a shared production project by an agent.
- No `drop database` of the active local stack while another agent is testing.
- No export of patient rows outside the disposable local stack.
