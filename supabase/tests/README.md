# Local database test procedure

**Status: executed** on 2 November 2026 against a disposable local stack
(`supabase start`, migrations 1–5 + `seed.sql` applied, no remote project touched).

| Suite | File | Result |
|---|---|---|
| Edge Function lifecycle (real HTTP + real DB, stubbed providers) | `integration.ts` | **52 / 52 scenarios PASS** |
| RLS and ownership | `rls.sql` | PASS — 5 assertion blocks, all NOTICEs |
| Constraints, grants, IST bucketing | `constraints.sql` | PASS — 4 blocks |
| Mark Reviewed authorisation matrix | `mark_reviewed.sql` | PASS — 10 blocks |
| Atomic reservation, limit 5 | pgbench, 20 clients | 5 allowed / 15 denied, `used = 5` |
| Atomic reservation, limit 14 | pgbench, 20 clients | 14 allowed / 6 denied, `used = 14` |

The CLI is not global; it runs through `npx supabase@latest`. Everything below is a
reproducible procedure for a **disposable local stack only**.

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
# without a local psql client, run it inside the database container
docker exec -i supabase_db_samvad-backend \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/rls.sql

docker exec -i supabase_db_samvad-backend \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/constraints.sql
```

`rls.sql` resolves the four identities by email, so create these on the local stack
first (Auth admin API, service key): `patient-a@rls.test`, `patient-b@rls.test`,
`doctor-gm@rls.test`, `doctor-em@rls.test`.

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
docker exec -i supabase_db_samvad-backend psql -U postgres -d postgres -q -c \
  "update public.daily_usage_limits set daily_limit=5 where counter_name='sessions';
   delete from public.daily_usage_counters where counter_name='sessions';
   create table public._test_reservations (allowed boolean);"

docker exec -i supabase_db_samvad-backend sh -c \
  "printf \"insert into public._test_reservations select allowed from public.reserve_daily_usage('sessions');\\n\" > /tmp/reserve.sql"

docker exec -i supabase_db_samvad-backend pgbench -n -c 20 -j 4 -t 1 -f /tmp/reserve.sql \
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres"

docker exec -i supabase_db_samvad-backend psql -U postgres -d postgres -Atc \
  "select count(*) filter (where allowed), count(*) filter (where not allowed) from public._test_reservations;
   select used from public.daily_usage_counters where counter_name='sessions';"
```

Measured: **5 / 15** and `used = 5`. Do not exceed ~60 clients; the container's
`max_connections` is 100 and the other Supabase services hold ~33.

Expected: exactly one `t`, nineteen `f`, and `used = 1`. Any other result is a FAIL.

Repeat with `daily_limit = 14` to confirm a non-round boundary: 14 / 6 and `used = 14`.
Drop `public._test_reservations` and reset the limit afterwards.

## 5. IST rollover

`now()` cannot be faked without a helper, so this is verified in two parts:

1. **Bucketing (runnable):** insert a counter row for yesterday and today, call
   `reserve_daily_usage`, and confirm only today's row moved.
2. **Boundary (needs approval):** a test-only twin function that accepts a timestamp, or
   a GUC hook. Until one is approved, record the midnight crossing as NOT TESTED.

## 6. Edge Function integration run (executed 2 November 2026)

```bash
# 1. local providers stub (host)
deno run --allow-net supabase/tests/stub-providers.ts 8787 &

# 2. functions with the stub endpoints (container runtime → host.docker.internal)
npx supabase functions serve --env-file supabase/functions/.env &

# 3. harness
eval "$(npx supabase status -o env | sed 's/^/export /')"
LOCAL_ANON_KEY="$ANON_KEY" LOCAL_SERVICE_KEY="$SERVICE_ROLE_KEY" \
  deno run --allow-net --allow-env supabase/tests/integration.ts
```

`supabase/functions/.env` is gitignored and contains only stub values.

**Important:** the function runtime runs in a container, so a stub on the host must be
addressed as `host.docker.internal`, not `127.0.0.1`. Using `127.0.0.1` silently falls
back to the real provider endpoints and wastes a provider attempt.

Providers are switched with `POST http://127.0.0.1:8787/__control`
(`{"groq":"ok|malformed|abort|error500","prisma":...,"timbre":...}`) and counted with
`GET /__stats`, so no function restart is needed between scenarios.

Labels used in the harness output: `[HTTP+DB]` = real function invocation plus a real
database write; `[STUB]` = the function called the local provider stub.

## 7. Reset

```bash
supabase stop --no-backup
```

## What this does not cover

- Edge Function behaviour (needs `supabase functions serve` and a seeded stack).
- Provider calls (mocked in the Deno suite; live checks stay owner-run per
  `docs/provider-notes.md`).
- M4 booking and Mark Reviewed RPCs, which do not exist yet.
