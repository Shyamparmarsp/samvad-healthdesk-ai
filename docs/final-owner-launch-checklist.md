# Final Owner Launch Checklist

A short, ordered sequence. Everything here is an **owner action**; the agent has performed
none of it. Each step lists where, exactly what, whether approval is required, the expected
success signal and how to detect failure.

Replace every `<placeholder>`. No project reference, URL or credential in this file is
real.

---

## Step 1 — `GROQ_API_KEY`

| | |
|---|---|
| **Where** | Supabase Dashboard → Project Settings → Edge Functions → Secrets (or `supabase secrets set GROQ_API_KEY=…`) |
| **Approval** | Yes — it activates a paid provider |
| **Success** | `supabase secrets list` shows `GROQ_API_KEY`; an adaptive question is model-selected rather than always the first candidate |
| **Failure** | Key absent → department routing always reports `is_fallback: true`; wrong key → `provider_unavailable` and deterministic fallback (the app still works) |
| **Verify** | `deno run --allow-env supabase/tests/provider-verification.ts --live` → `groq: PASS` |

## Step 2 — `GNANI_API_KEY`

| | |
|---|---|
| **Where** | same secrets screen |
| **Approval** | Yes |
| **Success** | an audio turn returns a real transcript preview; an adaptive question returns audio bytes |
| **Failure** | voice step shows `provider_unavailable` and offers text; `/speak` returns `{ text }` |
| **Verify** | harness → `prisma: PASS`, `timbre: PASS` (a human must listen to the clips) |

## Step 3 — `ALLOWED_ORIGINS`

| | |
|---|---|
| **Where** | same secrets screen |
| **Value** | your real frontend origin, comma-separated, exact, no wildcard, no trailing slash |
| **Approval** | Yes |
| **Success** | `supabase secrets list` shows it |
| **Reality check** | the platform forces `Access-Control-Allow-Origin: *` (see `docs/cors-verification.md`). This variable is for correctness, not authorization. Do not treat it as a security control. |
| **Failure** | a wrong origin here changes nothing observable today; do not weaken JWT/RLS to “fix” CORS |

## Step 4 — Vercel public environment

| | |
|---|---|
| **Where** | Vercel → Project → Settings → Environment Variables (Production) |
| **Values** | `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`, `VITE_SUPABASE_KEY=<publishable/anon key>` |
| **Never** | the secret/service-role key in any `VITE_` variable |
| **Approval** | Yes |
| **Success** | redeploy succeeds; the app reaches the patient welcome screen without console 401s |
| **Failure** | app falls back to mock mode if either variable is empty — check the build logs for both names |

## Step 5 — Doctor Auth accounts

| | |
|---|---|
| **Where** | Supabase Dashboard → Authentication → Users → Add user |
| **Create** | General Medicine — Dr. Aditi Rao; Emergency — Dr. Neha Verma |
| **Rule** | never insert into `auth.users` with SQL |
| **Approval** | Yes |
| **Success** | two confirmed users; copy each UID |
| **Failure** | unconfirmed email → sign-in fails with `invalid_credentials` |

## Step 6 — Map doctor profiles

| | |
|---|---|
| **Where** | terminal / SQL editor |
| **Do** | put the two UIDs into `supabase/seed-doctor-profiles.sql`, then `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed-doctor-profiles.sql` |
| **Approval** | Yes |
| **Success** | `select dp.user_id, d.display_name, d.department_key from doctor_profiles dp join doctors d on d.id = dp.doctor_id;` → exactly 2 rows |
| **Failure** | the script raises and changes nothing if a placeholder is unreplaced, the UIDs match, or a department has more than one doctor |
| **Gate** | the doctor portal shows no reports until this is done |

## Step 7 — Approve migrations and seeds

| | |
|---|---|
| **Where** | terminal |
| **Do** | `supabase link --project-ref <ref>` → `supabase db push` → `psql -f supabase/seed.sql` |
| **Approval** | Yes — this is the only step that changes production data |
| **Order** | the 11 migrations in `docs/backend-deployment-runbook.md` §5; the seed is **not** applied by `db push` |
| **Success** | `supabase migration list` shows all 11 local = remote; 6 departments, 6 doctors, 25 schedule rows, 4 usage limits |
| **Failure** | a failed migration → stop, restore the pre-migration dump, re-apply known-good files. Never re-run a half-applied file. |

## Step 8 — Live provider verification

| | |
|---|---|
| **Where** | terminal with the two keys in the environment |
| **Do** | `deno run --allow-env --allow-net --allow-write supabase/tests/provider-verification.ts --live` |
| **Approval** | Yes — this makes real, billable requests with synthetic input only |
| **Success** | `provider-verification-result.json` shows `mode: live` and each provider `PASS` |
| **Failure** | any provider `FAIL` → see `docs/provider-activation-checklist.md` §7 |
| **Until done** | every provider row stays **NOT TESTED** |

## Step 9 — Deploy

| | |
|---|---|
| **Where** | terminal |
| **Do** | `supabase functions deploy chat-turn` → `supabase functions deploy speak` (no `--no-verify-jwt`), then deploy the frontend from Vercel |
| **Approval** | Yes |
| **Success** | both deployments succeed; an unauthenticated POST to `/functions/v1/chat-turn` returns **401**; `GET /doctor` survives a refresh |
| **Failure** | 200 without a token → JWT verification was disabled; redeploy without the flag |
| **Bundle check** | `grep -c sb_secret_ dist/assets/*.js` → 0 |

## Step 10 — Post-deployment smoke

| | |
|---|---|
| **Where** | the deployed frontend, plus the CLI for the read-only database check |
| **Do** | complete one patient journey, then log in as each doctor |
| **Approval** | none (verification only) |
| **Success** | consent → voice (or text) → review → submit → book → confirmation with `APT-…`; doctor sees the report and Mark Reviewed works; “I cannot breathe” shows 112 and no slots; “Not now” leaves the report visible with no appointment |
| **Failure** | any 401 → step 4; empty doctor list → step 6; no slots → check `departments.booking_enabled` |
| **Read-only DB gate** | `deno run --allow-net --allow-env --allow-read --allow-run --allow-write scripts/verify-db-release.ts` → exit 0 |

---

# Release Matrix

Evidence classes: **U** unit · **M** mock · **S** simulated backend · **R-DB** real local
database · **R-HTTP** real local Edge Function HTTP · **R-BR** real browser→Supabase ·
**STUB** stubbed providers · **LIVE** live providers.

| Area | Evidence | Status |
|---|---|---|
| Migrations, seeds, grants, RLS, SQL functions | R-DB (`verify-db-release` 29/29, 6 SQL suites / 32 assertions) | **PASS** |
| Edge Function contract (six actions, speak, auth) | R-HTTP (81 scenarios) + U (181) | **PASS** |
| Frontend API layer (20 exports) | R-DB/R-HTTP (51) + M (26) + S (7) | **PASS** |
| Real browser patient→doctor→booking journey | R-BR (26 checks) | **PASS** |
| UI interaction/accessibility/i18n | headless browser (16 journeys) | **PASS** |
| Build and types | `tsc`, `vite build`, `deno check` | **PASS** |
| Secret handling | scan, `.env.example`, bundle grep | **PASS** |
| CORS allowlist enforcement | local probes (platform forces `*`) | **FAIL** (platform) — see note |
| Hosted CORS behaviour | no deployment | **NOT TESTED** |
| Live Groq / Prisma / Timbre | never called | **NOT TESTED** |
| `get_doctor_appointments()` SECURITY DEFINER exception | source + runtime grants | **BLOCKED** on owner acknowledgement |
| Remote migrations / seeds / deployment | owner action | **BLOCKED** |
| Doctor Auth accounts + profile mapping | owner action | **BLOCKED** |

**CORS note:** the function-level allowlist is implemented and unit-tested, but the local
edge runtime and Kong both overwrite the response origin with `*`. This is recorded as
**FAIL** for “restrictive CORS achieved at runtime”, not as a code defect, and it is not a
data-exposure vector because every read is scoped by a verified JWT.

---

# Is the application ready for owner configuration and deployment?

**Yes, with two explicit pre-conditions.**

All engineering is complete and independently verified: database release verification
29/29, backend HTTP 81/81, frontend 84/84, browser 26/26, UI 16/16, builds and type checks
clean. The only remaining work is owner-only configuration and two decisions:

1. Acknowledge the `get_doctor_appointments()` SECURITY DEFINER exception (§9 of
   `docs/final-security-signoff.md`). Without it, do not deploy the doctor appointments
   screen.
2. Accept that CORS restriction is not enforceable at the platform layer, and that live
   provider behaviour is unverified until step 8 is run.

No application code change is blocked on the owner.
