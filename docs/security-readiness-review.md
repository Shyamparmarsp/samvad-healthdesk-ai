# Backend Security Readiness Review

**Scope:** the complete backend on `feat/backend`, audited 2 November 2026 against the
disposable local stack. No live provider call was made. Statuses: PASS / FAIL / NOT TESTED /
BLOCKED. Evidence names the test that proves the claim.

| # | Area | Evidence | Status |
|---|---|---|---|
| 1 | Edge Function JWT verification | Unauthenticated `POST /functions/v1/chat-turn` → **401** (probe); `withSupabase({ auth: "user" })`; `verify_jwt` default kept on | PASS |
| 2 | Identity derivation | `auth.uid()`/`userClaims.sub` only; no client-supplied user id accepted; `requireOwnedRow` on every fetch | PASS |
| 3 | Cross-patient isolation | `integration.ts`: foreign `resume_session` → 404, foreign REST report read → 0 rows; `rls.sql` patient block | PASS |
| 4 | Doctor authorization | `rls.sql` + `integration.ts`: assigned doctor sees the routed report, GM/EM cross-visibility, drafts invisible, unrelated doctor 0 rows, EM cannot read another department's conversation | PASS |
| 5 | SECURITY DEFINER scope | `pg_proc`: 3 functions, all `search_path=""`, owner `postgres`, ACL = postgres/service_role/authenticated (no PUBLIC, no anon) | PASS |
| 6 | Browser write path | `has_table_privilege('authenticated','appointments','insert')` = false; no INSERT/UPDATE/DELETE grant to anon/authenticated on any server-owned table; `schema.test.ts` | PASS |
| 7 | Provider credentials | Read only via `Deno.env` inside the functions; never returned, never logged; `policy.test.ts` allowlists the names; secret scan clean | PASS |
| 8 | Error redaction | Adapters return enums, never provider bodies; `toErrorCode` collapses unknown throws to `internal`; isolation test asserts the destination is not echoed | PASS |
| 9 | Logging / patient data | `sanitizeFields` drops transcript/answer/audio/token keys and truncates; only counters, statuses and providers are logged | PASS |
| 10 | Request size and audio validation | `validation.ts`: text ≤ 4000, base64 ≤ 2 MB, format allowlist, webm rejected before any provider call, exactly one of text/audio | PASS |
| 11 | Turn and daily limits | 15-answer cap enforced by conditional update + partial unique index; 4 counters with IST buckets; 20-way and 80-client pgbench runs produced exactly the configured number of successes | PASS |
| 12 | Provider timeout / failure | Every adapter uses `AbortController`; timeouts map to typed failures; `speak` falls back to text; `integration.ts` provider-failure scenario | PASS |
| 13 | CORS | Functions set `Access-Control-Allow-Origin: *` with explicit method/header allowlists | PASS (demo scope) — tighten to the Vercel origin before public launch (owner action) |
| 14 | Dependency pinning | `deno.lock` committed; `@supabase/server` pinned to major 1 | PASS |
| 15 | Migration / grant / seed safety | `schema.test.ts` asserts RLS on every table, no browser write grants, usage tables service-only, seeds contain no credentials and never touch `auth.users` | PASS |
| 16 | Booking + review authorisation | `booking.sql` (4 blocks), `mark_reviewed.sql` (10 blocks), concurrency race (1 winner) | PASS |
| 17 | IST day boundary | `ist_boundary.sql` (4 blocks) against the production helper `ist_day_bucket()` | PASS |
| 18 | Live provider behaviour | Harness exists (`supabase/tests/provider-verification.ts`), non-live default; **no key available** | BLOCKED (owner) |
| 19 | Real device / browser E2E | Frontend-owned | NOT TESTED |
| 20 | Rate limiting beyond daily caps | Deliberately out of MVP scope | NOT TESTED (by design) |

## Defects found and fixed during this audit

- `booking.sql` ended with `COMMIT`, leaking fixtures and failing on re-run → `ROLLBACK`.
- `rls.sql` used absolute counts and broke once other suites added reports → clears the
  intake domain inside its own transaction.
- `get_available_slots` could not validate ownership as `SECURITY INVOKER` (patients have no
  report read policy) → made `SECURITY DEFINER` with the same narrow checks, documented.

## Remaining owner actions

1. Add `GROQ_API_KEY` and `GNANI_API_KEY` to Supabase Function Secrets, then run the
   harness in live mode (see `docs/provider-notes.md` §7).
2. Restrict CORS to the deployed frontend origin before public launch.
3. Confirm D5 numeric caps against real provider quotas.
4. Decide OD-02, OD-03, OD-09.
