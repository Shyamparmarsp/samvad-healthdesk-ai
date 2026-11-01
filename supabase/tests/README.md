# Local database test procedure

**Status: not executed.** The Supabase CLI is not installed here and no database was
started, linked or modified. Everything below is a reproducible procedure for a
**disposable local stack only**.

Never point these steps at the shared demo project.

## 1. Start a disposable stack

```bash
supabase start                 # requires Docker
supabase db reset              # applies supabase/migrations/*, then supabase/seed.sql
supabase status                # copy the local API URL and keys
```

`db reset` is safe here because the stack is local and empty. It is never run against a
remote project.

## 2. Create two throwaway identities

```bash
# patient A (anonymous)
curl -s -X POST "$LOCAL_URL/auth/v1/signup" \
  -H "apikey: $LOCAL_ANON_KEY" -H "Content-Type: application/json" -d '{}'

# doctor identities: create with the service key, then map them
```
Map them with the same SQL as `supabase/seed-doctor-profiles.sql` (replace the two
placeholders). Keep the local service key in the shell only.

## 3. Run the RLS assertions

```bash
psql "$LOCAL_DB_URL" -f supabase/tests/rls.sql
```

Each `DO` block impersonates one identity with `set local role authenticated` plus a
`request.jwt.claims` claim, then asserts exact row counts. A violation raises and aborts
the transaction; success prints a `NOTICE` per check and rolls everything back.

Covered: patient isolation across sessions/reports/messages, draft invisibility, the
Emergency cross-visibility for the General Medicine and Emergency doctors, doctor-profile
isolation, absence of any browser write path, and denial of the usage tables and
`reserve_daily_usage`.

## 4. Atomic reservation under concurrency

Two shells, same database, counters reset to a known state:

```bash
psql "$LOCAL_DB_URL" -c "update public.daily_usage_limits set daily_limit = 1 where counter_name = 'sessions';"
psql "$LOCAL_DB_URL" -c "delete from public.daily_usage_counters where counter_name = 'sessions';"

# fire 20 concurrent reservations
for i in $(seq 1 20); do
  psql "$LOCAL_DB_URL" -Atc "select allowed from public.reserve_daily_usage('sessions');" &
done
wait

psql "$LOCAL_DB_URL" -Atc "select used from public.daily_usage_counters where counter_name='sessions';"
```

Expected: exactly one `t`, nineteen `f`, and `used = 1`. Any other result is a FAIL.

Repeat with `daily_limit = 100` and 200 concurrent calls: `used` must be exactly 100.

## 5. IST rollover

`now()` cannot be faked without a helper, so this is verified in two parts:

1. **Bucketing (runnable):** insert a counter row for yesterday and today, call
   `reserve_daily_usage`, and confirm only today's row moved.
2. **Boundary (needs approval):** a test-only twin function that accepts a timestamp, or
   a GUC hook. Until one is approved, record the midnight crossing as NOT TESTED.

## 6. Reset

```bash
supabase stop --no-backup
```

## What this does not cover

- Edge Function behaviour (needs `supabase functions serve` and a seeded stack).
- Provider calls (mocked in the Deno suite; live checks stay owner-run per
  `docs/provider-notes.md`).
- M4 booking and Mark Reviewed RPCs, which do not exist yet.
