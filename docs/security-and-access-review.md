# Security and Access Review

Consolidated access model and the owner decisions that remain. This is the short review
surface; the full audit is `docs/final-security-signoff.md`, with earlier point-in-time
results in `docs/security-readiness-review.md` and `docs/security-test-results.md`.

Scope: the two Edge Functions, PostgreSQL grants/RLS/SQL functions, provider adapters,
audio handling, logging and error surfaces. No hosted project was touched; every runtime
claim was measured on the disposable local stack.

**Verdict:** no authentication bypass, cross-patient exposure or unauthorised write was
found. Two read-only `SECURITY DEFINER` functions need explicit owner acknowledgement
(§5), and CORS cannot be enforced at the platform layer (§6).

---

## 1. Trust boundaries

| Actor | Credential | Database role | May do |
|---|---|---|---|
| Patient browser | anonymous Supabase JWT | `authenticated` | call `chat-turn` / `speak`; call slot and booking RPCs for its own report |
| Doctor browser | email/password JWT | `authenticated` | read reports via RLS; call `mark_report_reviewed` and `get_doctor_appointments` |
| Edge Function | platform JWT verification | user-scoped client + server-only admin client | server-owned writes after proving ownership |
| Service role | secret key, server-side only | `service_role` | `reserve_daily_usage`; never exposed to a browser |

`auth.uid()` is derived from verified claims. A client-supplied user, doctor, department or
status is never trusted as authority.

## 2. Endpoint and action access

| Surface | Caller | Ownership / state check |
|---|---|---|
| `chat-turn` `start_session` | patient | creates `user_id = auth.uid()`; reserves the daily session counter first |
| `chat-turn` `resume_session` | patient | `id AND user_id`; foreign session → 404 |
| `chat-turn` `record_consent` | patient | session owned; status must be `created`; version must match |
| `chat-turn` `submit_turn` | patient | session owned; current question equality; 15-answer cap; audio preview does not consume a turn |
| `chat-turn` `correct_draft_report` | patient | session and report owned; draft only; allowlisted fields only |
| `chat-turn` `submit_report` | patient | owned; completion revalidated; draft only; idempotent |
| `speak` | patient | session owned; question must be the server-known current question |
| `get_available_slots` | patient | owns the submitted, non-emergency report; review hold respected |
| `book_appointment` | patient | owns report; doctor and department derived server-side; slot revalidated in-transaction |
| `mark_report_reviewed` | doctor | mapped doctor may read the report; only `reviewed_at` / `reviewed_by` change |
| `get_doctor_appointments` | doctor | scoped to the caller's own `doctor_profiles.doctor_id` |

Doctors cannot call `chat-turn`. Patients cannot call the doctor RPCs successfully:
`mark_report_reviewed` and `get_doctor_appointments` fail authorisation, and booking is
restricted to the caller's own report.

## 3. Database exposure

| Table | Browser SELECT | Browser write | Notes |
|---|---|---|---|
| `sessions` | denied | denied | server-owned |
| `consent_records` | denied | denied | server-owned |
| `messages` | doctor-scoped through report visibility | denied | no direct patient read |
| `reports` | assigned doctor + documented Emergency read; drafts never match | denied | server-owned |
| `appointments` | denied at table level | denied | RPC-only |
| `daily_usage_limits` / `daily_usage_counters` | denied | denied | service-role reservation only |
| `departments`, `doctors`, `doctor_schedules`, `doctor_profiles` | readable by signed-in callers (by design) | denied | reference and identity mapping |
| `schema_migrations` | platform-owned | platform-owned | never edited manually |

RLS is enabled on every public table. No browser INSERT/UPDATE/DELETE grant exists on a
server-owned table. A missing grant is not a policy gap: all mutations go through an Edge
Function or a reviewed SQL function.

## 4. SQL function allowlist

| Function | Mode | Execute granted to | Purpose |
|---|---|---|---|
| `reserve_daily_usage(text)` | `SECURITY INVOKER` | `service_role` only | atomic IST-day counter reservation |
| `mark_report_reviewed(uuid)` | `SECURITY DEFINER` | `authenticated` | the only doctor write |
| `book_appointment(uuid, timestamptz)` | `SECURITY DEFINER` | `authenticated` | atomic slot reservation |
| `get_available_slots(uuid, integer)` | `SECURITY DEFINER` | `authenticated` | read availability for an owned report |
| `get_doctor_appointments()` | `SECURITY DEFINER` | `authenticated` | read the caller's own appointments |

Every definer function uses a fixed empty `search_path`, schema-qualified names, no dynamic
SQL, inline `auth.uid()`, and ownership derived from the caller. No table write grant was
added for any of them. `_shared/schema.test.ts` enforces the allowlist, so a new definer
cannot appear without editing the reviewed set.

## 5. Open item — additional `SECURITY DEFINER` read functions

`AGENTS.md` names `book_appointment()` and `mark_report_reviewed()` as the only narrow
`SECURITY DEFINER` exceptions. The implementation also contains two read functions:

| Function | Why it cannot be `SECURITY INVOKER` | Status |
|---|---|---|
| `get_available_slots(uuid, integer)` | `reports` has no browser read policy, so the caller cannot read the report being booked | recorded as an accepted deviation in the earlier security review |
| `get_doctor_appointments()` | `appointments` has no browser SELECT grant; “Booked” statistics and the Today/Upcoming/Past tabs cannot work without it | **owner acknowledgement still required** |

Verified controls for both: `prosecdef = true`, `search_path=""`, caller identity validated
inline, results scoped to the caller, non-doctors get an empty set rather than an existence
signal, `EXECUTE` only to `authenticated` (anon denied), no patient `user_id` returned, and a
single read-only `SELECT` body.

**Owner decision:** accept the two read exceptions, or drop the corresponding RPCs and
accept that slots (first function) or the appointments screen (second function) cannot work
in real mode. Rejection is a scope decision, not a silent code change.

## 6. Open item — CORS is not an authorisation control

Measured behaviour: the local edge runtime and Kong both set
`Access-Control-Allow-Origin: *`, overriding the exact-origin header produced by
`_shared/cors.ts` (`docs/cors-verification.md`). `ALLOWED_ORIGINS` remains correct and
useful, but it does not restrict who may *read* a response that already holds a token.

Impact is bounded: authentication is bearer-token only (no cookies) and every query is
scoped by `auth.uid()`, so a wildcard origin does not widen data access. Hosted behaviour
was not verified; treat it as **NOT TESTED** and do not describe CORS as a security control.
Never weaken JWT, RLS or ownership to compensate.

## 7. Verified controls

| Control | Evidence |
|---|---|
| JWT enforced before the handler | unauthenticated POST → 401 for both functions |
| Identity from verified claims | `userClaims.sub` only; every request schema rejects unknown top-level keys |
| Cross-patient isolation | foreign `resume_session` → 404; foreign report/slot/booking → `not_found`; zero rows on direct reads |
| Doctor isolation | assigned-only reports; unrelated doctor zero rows; drafts invisible; GM/EM matrix asserted |
| Terminal report immutability | trigger freezes content, routing, flags, ownership and status after `draft`; `urgent_partial` stays unbookable after review |
| Booking races | partial unique indexes; exactly one winner; loser `23505`; identical repeat idempotent |
| Turn and usage caps | 15-answer cap; atomic reservation with IST buckets; no provider call after the cap |
| Audio validation | size and format allowlist; `audio/webm` rejected before a provider call; raw audio never persisted |
| Error and log redaction | fixed error codes; no SQL/provider text to patients; no transcripts, audio or keys in logs |
| Secret handling | server-only env reads; no secret in source, bundle or Git; scans and presence-only checks |
| Test evidence | 181 Deno tests; 52 integration + 29 adaptive HTTP; 29/29 database checks; 6 SQL suites / 32 assertions |

## 8. Not claimed

- Hosted RLS/grants behaviour — **NOT TESTED** until the owner deploys approved migrations.
- Live provider TLS/vendor retention — **NOT TESTED**; no live provider call was made.
- CORS enforcement on hosted Supabase — **NOT TESTED**.
- Penetration testing beyond the local stack — out of scope.
- Production rate limiting beyond the four daily application caps — deliberately out of MVP
  scope.

## 9. Owner review checklist

```
[ ] Read the two open items (§5, §6) and record accept / reject.
[ ] Confirm AGENTS.md's two named definer exceptions are understood to be four in practice.
[ ] Confirm no patient data outside the synthetic demo is entered.
[ ] Confirm doctor credentials are shared only through a private evaluator channel.
[ ] Confirm the secret key is absent from Vercel, the repository and the browser bundle.
[ ] After deployment: verify 401, doctor isolation and emergency behaviour with synthetic data.
[ ] After the demo: disable the doctor accounts and execute retention.
Decision / date / operator: ______________________________________
```

## 10. Re-running the checks

```bash
# Full local gate (no hosted project, no live provider)
npx supabase start
export LOCAL_SERVICE_KEY=$(npx supabase@latest status -o env | grep '^SERVICE_ROLE_KEY=' | cut -d'"' -f2)
deno run --allow-all scripts/release-check.ts

# Read-only database assertions
deno run --allow-net --allow-env --allow-read --allow-run --allow-write scripts/verify-db-release.ts

# Secret scan (must find no value-shaped key material)
git grep -nE 'sb_secret_|sk-[A-Za-z0-9]{20,}' -- . ':!*.example' || true
```

Use synthetic data only. Do not run any of these against a hosted project, and do not enable
live providers in CI.
