# Release and Operations Runbook

Commands marked **[owner]** require explicit approval or credentials. Nothing in this file
was executed against a remote project.

## 1. Local development and verification

```bash
npx supabase start                 # disposable local stack (Docker)
npx supabase db reset              # applies supabase/migrations/*, then seed.sql
npx supabase functions serve --env-file supabase/functions/.env
deno test --allow-read             # from supabase/functions/_shared
deno check supabase/functions/chat-turn/index.ts supabase/functions/speak/index.ts
```

Database suites (local only):

```bash
for f in rls constraints mark_reviewed booking ist_boundary; do
  docker exec -i supabase_db_samvad-backend psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/$f.sql
done
```

Integration: run `supabase/tests/stub-providers.ts` on the host, point the functions at
`host.docker.internal:8787` (see `supabase/tests/README.md`), then
`deno run --allow-net --allow-env supabase/tests/integration.ts`.

## 2. Required Supabase configuration

- Anonymous sign-ins **enabled** (patient flow has no signup).
- Project linked locally with `supabase link --project-ref <ref>` **[owner]**.
- No realtime, no extra schemas, no public bucket.

## 3. Migrations and seeds, in order

1. `20261101120000_enums_and_helpers.sql`
2. `20261101120100_reference_tables.sql`
3. `20261101120200_intake_tables.sql`
4. `20261101120300_appointments.sql`
5. `20261101120400_usage_tables.sql`
6. `20261102120000_mark_report_reviewed.sql`
7. `20261102130000_availability_and_booking.sql`
8. `20261102140000_ist_day_bucket.sql`
9. `supabase/seed.sql` (six departments, six fictional doctors, weekday schedules, D5 limits)

Apply with `APPROVE APPLY <project> <exact filenames> supabase/seed.sql` **[owner]**.

## 4. Doctor Auth users and profiles

1. Dashboard → Authentication → create two users **[owner]**:
   General Medicine / Dr. Aditi Rao, Emergency / Dr. Neha Verma.
2. Copy each Auth UID, replace the placeholders in `supabase/seed-doctor-profiles.sql`.
3. Review and run that file in the SQL Editor **[owner]**.
4. Never insert into `auth.users` with SQL; never store passwords in the repo.

## 5. Edge Function deployment prerequisites

`supabase functions deploy chat-turn speak` **[owner]**, `verify_jwt` kept on, and the
secrets below set first. Both functions read provider keys only from the environment.

## 6. Supabase Function Secrets (exact names)

| Name | Used by |
|---|---|
| `GROQ_API_KEY` | `_shared/groq.ts` |
| `GNANI_API_KEY` | `_shared/prisma.ts`, `_shared/timbre.ts` |

Set with `npx supabase secrets set --env-file <file>` **[owner]**. Never place them in
`VITE_` variables, Vercel, Git or logs.

## 7. Frontend environment variables

`VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` only (public/publishable key). No server secret
may appear in the browser bundle. Coordinate the exact values with the frontend docs.

## 8. Provider activation

1. Non-live sanity check: `deno run --allow-env supabase/tests/provider-verification.ts`.
2. Set both secrets **[owner]**.
3. Live probe **[owner]**: `--live` with both keys present; synthetic inputs only.
4. Record statuses and latencies in `docs/provider-notes.md`; listen to both TTS files.
5. Cached opening audio: manual 10-call reservation (M3-S7) — no database access from the
   script.

## 9. Remote verification (after deployment) **[owner]**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<ref>.supabase.co/functions/v1/chat-turn -X POST -d '{}'
# expect 401 without a JWT
```

Then run the acceptance matrix from MILESTONES M4-S10 with a synthetic patient.

## 10. Rollback and recovery

- Functions: redeploy the previous commit; secrets roll back by re-setting the old values.
- Database: migrations are additive; no destructive rollback is scripted. Restore from the
  project backup if a migration must be undone.
- Usage counters: never reset during a demo day; adjust limits instead.
- Emergency: if providers fail, the app must still serve text fallbacks.

## 11. Post-deployment smoke tests

1. `/` loads, language toggle works.
2. Consent No ends with no report.
3. Consent Yes → four fixed questions → draft → submit.
4. Doctor login (private) → report visible → Mark Reviewed.
5. Slots appear; booking returns a reference; second booking of the same slot is refused.
6. Emergency phrase → 112 text, no slots.
7. `/doctor` survives a refresh (SPA rewrite).

## 12. CORS and `ALLOWED_ORIGINS` (M4-S14)

CORS is an exact-origin allowlist in `supabase/functions/_shared/cors.ts`. It is applied to
every response — success and error — and to preflight.

| Situation | Behaviour |
|---|---|
| Local origins (`localhost:5173`, `127.0.0.1:5173`, `:4173`, `:3000`) | Always allowed for local development |
| Production origin from `ALLOWED_ORIGINS` | Allowed; echoed back with `Vary: Origin` |
| Unknown origin | No `Access-Control-Allow-Origin` header (the browser blocks it) |
| `ALLOWED_ORIGINS` unset | Non-local origins are refused (fail closed); local origins still work |
| `OPTIONS` preflight | `204` for an allowed origin, `403` for an unknown one |
| Wildcard `*` in the configuration | Stripped and ignored |

**Owner action (production):** set the secret/variable

```bash
npx supabase secrets set ALLOWED_ORIGINS="https://<project>.vercel.app"   # [owner]
```

Use the exact deployed origin, no trailing slash, no wildcard. Multiple origins may be
comma-separated. Never add `*` to make a failing preflight “work” — that is a security
regression, not a fix.

CORS is not authentication: JWT verification, RLS and ownership checks are unchanged. A
401 is a credential problem, not a CORS problem.
