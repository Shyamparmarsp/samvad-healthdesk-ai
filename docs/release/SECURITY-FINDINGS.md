# Security Findings — Release Candidate

**Scope:** Edge Functions (`chat-turn`, `speak`), PostgreSQL schema/RLS/grants/RPCs, the
browser API layer (`src/lib/api.ts`), provider adapters, and the audio pipeline.
**Method:** adversarial tests against the real local stack (layer C/D/E) plus static
review of every migration and function. No production system was touched.

---

## 1. Verdict

| Area | Result |
|---|---|
| Authentication bypass | **PASS** — no bypass found |
| Cross-patient data exposure | **PASS** — denied and asserted |
| Unauthorised doctor access | **PASS** — denied and asserted |
| Browser write privileges | **PASS** — none exist |
| Service-role / provider key exposure | **PASS** — none in source, bundle or git |
| Error-message leakage | **PASS** — codes only, no SQL/provider text |
| XSS from patient content | **PASS by construction** — React text nodes, no `dangerouslySetInnerHTML` |
| Concurrency (booking, counters, turns) | **PASS** |
| **SECURITY DEFINER surface** | **1 open item — owner acknowledgement required (F-1)** |
| CORS restrictiveness | **NOT ACHIEVED** — platform wildcard (F-2, documented, not a code defect) |

---

## 2. Open items requiring a decision

### F-1 — A third `SECURITY DEFINER` function was added (owner acknowledgement required)

`AGENTS.md` says: *“book_appointment() and mark_report_reviewed() are the only narrowly
scoped SECURITY DEFINER exceptions.”* The project already carried a **third**
(`get_available_slots`, documented as an accepted deviation because `reports` has no
browser read policy). This release adds a **fourth**:

```
public.get_doctor_appointments()   -- 20261102160000_doctor_appointment_reads.sql
```

**Why it exists:** `appointments` has no browser `SELECT` grant (an invariant enforced by
`_shared/schema.test.ts`), and an `invoker` function runs as the caller, so it could not
read the table. Without a read path the doctor dashboard could not show a single booking —
“Booked” was permanently 0 and the Today/Upcoming/Past tabs were permanently empty.

**Verified controls** (measured on the live local database):

| Control | Evidence |
|---|---|
| `prosecdef = true` (intended) | `select prosecdef from pg_proc` → `t` |
| Fixed empty `search_path` | `proconfig = {"search_path=\"\""}` |
| Schema-qualified names, no dynamic SQL | migration review |
| Caller identity validated inline | `v_uid := (select auth.uid()); … if v_uid is null then raise 28000` |
| Scoped to the caller’s own doctor row | `where a.doctor_id = v_doctor` from `doctor_profiles` |
| Non-doctor returns an empty set, never an error that confirms a mapping | SQL test block 3 |
| `EXECUTE` granted to `authenticated` only | `anon` = false, `authenticated` = true |
| `EXECUTE` revoked from `PUBLIC`/`anon`/`authenticated` then re-granted narrowly | migration text |
| No table grant added | `appointments` SELECT/INSERT for `authenticated` = **false** |
| No patient `user_id` returned | column list excludes `appointments.user_id` |
| Read-only | function body contains a single `RETURN QUERY SELECT` |

**Owner action:** acknowledge or reject this exception. Rejecting it means accepting that
the doctor appointments screen and the Booked/Not-booked statistics cannot work in real
mode; the RPC would then be dropped and `getDoctorAppointments()` would return an empty
list. It is enforced by `_shared/schema.test.ts`, so a fifth definer cannot appear without
editing the reviewed allowlist.

### F-2 — CORS allowlist is not enforced by the platform (documented, not fixable in code)

Measured directly (`docs/cors-verification.md`): the local **edge runtime** (`:8081`) answers
`OPTIONS` itself with `Access-Control-Allow-Origin: *`, and Kong (`kong/2.8.1`) adds its own
`*` to proxied responses. `_shared/cors.ts` sets the exact origin, but the origin value is
overwritten before it reaches the browser.

Impact: any web page can read a function response **if it already holds a token**. Since
there is no cookie auth and the app uses bearer tokens only, and every query is scoped by
`auth.uid()`, this does not widen data access. It does mean `ALLOWED_ORIGINS` must not be
described as a security control. **Never weaken JWT/RLS/ownership to “fix” CORS.**

Residual uncertainty: hosted Supabase uses the same open-source edge runtime, so the
behaviour is expected to be identical in production, but this release **did not verify a
hosted project**. Status: **NOT TESTED in production**.

---

## 3. Adversarial tests executed

All of these run against the real local stack with real JWTs.

| Attack | Expected | Result |
|---|---|---|
| Patient A resumes patient B’s session | `404 not_found`, no existence disclosure | PASS |
| Patient A requests slots/bookings for B’s report | `P0002` → `not_found` | PASS |
| Patient reads `sessions` / `reports` / `appointments` tables directly | denied or zero rows | PASS |
| Patient inserts a report | denied (`42501`) | PASS |
| Patient calls `reserve_daily_usage` | denied | PASS |
| Patient calls `mark_report_reviewed` | denied | PASS |
| Doctor books a patient’s report | denied (ownership from `auth.uid()`) | PASS |
| Unassigned doctor reads a report | zero rows | PASS |
| Emergency doctor reads an unrelated GM report | zero rows | PASS |
| GM doctor reviews an emergency report (OD-03 interim) | `42501` | PASS |
| GM doctor reads emergency report | allowed, read-only | PASS |
| Emergency report after Mark Reviewed is bookable | `22023` refusal | PASS |
| Unknown action / unknown top-level key | `400 invalid_request` | PASS |
| Non-UUID session id | `400` | PASS |
| Both text and audio in one turn | `400` | PASS |
| `audio/webm` | `400` before any provider call (verified by provider call counter) | PASS |
| Stale question answer | `409 invalid_question_state` | PASS |
| Answer after the 15th turn | `turn_cap_reached`, no provider call | PASS |
| Duplicate concurrent booking | exactly one winner (`23505` for the loser) | PASS |
| Repeated identical booking | idempotent, `already_booked: true` | PASS |
| Duplicate submission of the same turn | unique `(session_id, turn_index)`; no second row | PASS |
| Client supplies `doctor_id` / `department` as authority | ignored; server derives from the report | PASS |
| Report-id probing with a foreign UUID | `not_found` | PASS |

Additional static assertions in `_shared/schema.test.ts` (181 Deno tests):
no browser write grants, RLS enabled on every table, `SECURITY DEFINER` confined to the
reviewed allowlist, usage counters service-role only, reservation function is
`SECURITY INVOKER` with an IST-derived date and no caller-supplied date/amount.

---

## 4. Secret and key handling

| Check | Result |
|---|---|
| `service_role` / `sb_secret_` in source or git | none (git grep) |
| Provider keys in source, docs or README | none |
| Keys in the browser bundle | none — only supabase-js’ own key-type string constants |
| `.env*` tracked | only `.env.example` (names, no values) |
| Keys printed by scripts | none; presence-only checks |
| Logs | event names, counter names and stage labels only — no tokens, headers, transcripts, audio or provider bodies |

---

## 5. Logging and error surfaces

`_shared/logging.ts` emits structured events (`provider_attempt`, `provider_failure`,
`usage_capped`, `action_rejected`, `action_completed`) with a provider name, a boolean and
a stage — never patient text, audio, SQL, stack traces or credentials.

Client-visible errors are codes from a fixed list (`_shared/errors.ts`); `toErrorCode()`
collapses anything unexpected to `internal`. Provider failures surface as
`provider_unavailable`, caps as `usage_capped` telemetry plus a domain response. PostgREST
SQLSTATEs are mapped in `src/lib/api.ts` to codes the UI can translate.

Residual: database error text can still reach the developer console because PostgREST
returns a message the client logs. It is never rendered to the patient and never contains
patient data. Accepted for the MVP.

---

## 6. Items deliberately not claimed

- **Live provider security** (TLS, vendor-side retention) — **NOT TESTED**.
- **Hosted-platform CORS behaviour** — **NOT TESTED**.
- **Deployed-project RLS** — **BLOCKED** until the owner deploys with approved migrations.
- **Penetration testing beyond the local stack** — out of scope.
