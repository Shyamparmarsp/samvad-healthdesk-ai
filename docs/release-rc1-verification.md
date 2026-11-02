# Release Candidate verification — `release/samvad-rc1`

Audit date: 2 November 2026. Every value below was read from Git or produced by a command
in this session. Reported results were **not** taken on trust.

---

## 1. Repository verification

| Worktree | Branch | HEAD | Dirty |
|---|---|---|---|
| `../samvad-backend` | `feat/backend` | `8b90b7d` | 0 |
| `../samvad-integration` | `release/samvad-rc1` | `ace1a5c` | 0 |
| `../samvad-frontend` | `feat/frontend` | `6d786a0` | 0 |

**Ancestry result (important).** `6d786a0` (feat/frontend) is **not** an ancestor of
`ace1a5c`, because it is a *merge* commit that merged `release/samvad-rc1` back into
`feat/frontend`. Content is identical:

```
git diff --stat ace1a5c 6d786a0     # no output → identical trees
git diff --stat ace1a5c 6d786a0 -- src tests docs   # no output
```

So the release branch **does** contain the same frontend snapshot, API adapter and test
suite as `feat/frontend`; the divergence is ancestry-vector only, with no missing files.
This is recorded rather than "fixed", and nothing was merged.

No stale or duplicated sources were found: one `src/lib/audio/voice.ts`, one
`tests/api/browser/{driver,local-stack,supabase-journey,supabase-extras}.mjs`, one
`tests/verify-interactions.mjs`, one `tests/visual-qa.mjs`.

---

## 2. Test matrix — actual results at these SHAs

Environment: local Supabase stack + Edge Functions + provider stub on 127.0.0.1. **No
hosted project, staging or production endpoint was used for anything below.**

| Command | Dir | Environment | Result | Count |
|---|---|---|---|---|
| `npx tsc --noEmit` | integration | static | **PASS** | — |
| `npm run test:mock` | integration | in-memory mock | **PASS** | 26/26 |
| `npm run test:supabase` | integration | simulated adapter | **PASS** | 7/7 |
| `npm run build` | integration | Vite | **PASS** | built |
| `npm run test:api` | integration | real local Supabase | **BLOCKED** | 3 files aborted |
| `npm run test:api:browser` | integration | real local Supabase | **BLOCKED** | not run |
| `npm run test:api:browser:extras` | integration | real local Supabase | **BLOCKED** | not run |
| `npm run test:e2e` | integration | headless Chrome, mock API | **NOT TESTED** | not run this pass |
| `npm run test:visual` | integration | headless Chrome | **NOT TESTED** | not run this pass |
| Deno tests / type checks | backend | Deno | **NOT TESTED** | not run this pass |
| SQL/RLS suites, rehearsal, smoke | backend | local Postgres | **BLOCKED** | Docker down |

### Why the real-stack suites are BLOCKED

```
failed to inspect container health: Cannot connect to the Docker daemon
at unix:///Users/shyamparmar/.docker/run/docker.sock
```

The Docker daemon stopped during this audit, so the local Supabase stack, Postgres and the
Edge Functions are unreachable. `npm run test:api` consequently aborts during harness
start-up with `Local Supabase configuration is missing` (its CLI fallback cannot query the
stopped stack). That is an **environment outage, not a code failure** — and it is recorded
as BLOCKED rather than PASS or FAIL.

**Last verified real-stack results** (earlier in this session, Docker up):
`test:api` 51/51 at `516ec49`; browser journey 17/17 and extras 9/9 at `516ec49`;
backend gate 24 PASS / 0 FAIL / 0 BLOCKED / 0 NOT TESTED at `8b90b7d`. Those runs are
evidence for *those* commits and are **not** reused as evidence for `ace1a5c`.

To close this gap, with Docker running:

```bash
npx supabase start
npx supabase functions serve --env-file supabase/functions/.env
deno run --allow-net supabase/tests/stub-providers.ts 8787
cd ../samvad-integration && npm run test:api && npm run test:api:browser && npm run test:api:browser:extras
cd ../samvad-backend && deno run --allow-all scripts/release-check.ts --frontend
```

---

## 3. Reconciling "17/22 with 5 blocked" against "0 blocked"

Both numbers are correct and measure different scopes. They must not be aggregated:

| Assertion | Scope | Meaning |
|---|---|---|
| `release-check`: **0 BLOCKED** | gate **steps** | no orchestrated test was skipped due to a missing prerequisite |
| `verify-deploy-config`: **17/22, 5 owner-blocked** | individual **configuration items** | five things only the owner can supply |

The five owner-blocked items are: project linkage, `GROQ_API_KEY`, `GNANI_API_KEY`,
`ALLOWED_ORIGINS`, and provider mode (unset until live endpoints are configured). None is a
code defect; none can be satisfied by an agent. The overall gate reporting "0 blocked"
never meant "production configuration is complete".

---

## 4. Security review

| Area | Finding | Status |
|---|---|---|
| Patient identity / session ownership | derived from verified JWT only; foreign session → 404 | PASS |
| Doctor identity | `doctor_profiles` mapping; unmapped user signed out | PASS |
| Report ownership | filtered by `user_id` on every elevated write | PASS |
| Browser write access | none on `sessions`/`reports`/`appointments`; measured `has_table_privilege = false` | PASS |
| Submitted-report immutability | `reports_guard_terminal` freezes content/routing/flags/status; 5/5 SQL assertions | PASS |
| Idempotency | submit_report, record_consent, submit_turn, mark_reviewed, book_appointment idempotent | PASS |
| `start_session` | **not deduplicated** — a lost response can consume one extra daily slot (no clinical duplication) | ACCEPTED RISK |
| Atomic booking | partial unique indexes; one winner, loser `23505` | PASS |
| Emergency → routine booking | refused with `22023`, even after review | PASS |
| GM cross-visibility | read-only; GM review of an emergency report denied (OD-03 unimplemented by design) | PASS |
| Error sanitisation | stable codes only; provider/SQL text never reaches the browser | PASS |
| Secrets in bundle | none; no `sb_secret_` in the build output | PASS |
| CORS allowlist | implemented in `_shared/cors.ts`; **platform forces `*` locally**; hosted behaviour unverified | PARTIAL |

### Required owner acknowledgement (not granted)

`get_doctor_appointments()` is a `SECURITY DEFINER` function beyond the two named in
`AGENTS.md` (the project already carries `get_available_slots` as a third). It is required
because `appointments` has no browser read grant. Controls verified: `search_path = ''`,
schema-qualified, scoped to the caller's `doctor_profiles`, `authenticated` execute only,
`anon` denied, no `user_id` returned. **No owner acknowledgement exists in the record.**

---

## 5. Unresolved decisions — behaviour as implemented, not re-decided

| ID | Actual behaviour | Owner decision |
|---|---|---|
| **OD-02** | Clarification answers do **not** increment `answer_turn_count`; the clarification question stays current until resolved. Evidence: `handleSubmitTurn` ambiguity branch counts the statement, the clarification branch does not. | **UNRESOLVED** |
| **OD-03** | General Medicine may **read** emergency reports but may **not** mark them reviewed (`42501`). Only the Emergency doctor may. | Preserved, unchanged |
| **OD-09** | A later "No" records `clarification_answer` but never clears `needs_human_review`. | Preserved, unchanged |
| Data retention | No retention or deletion policy exists in code or schema. | **OWNER/LEGAL DECISION** |
| Question bank | 150 entries, all `draft_owner_review`; 0 clinical and 0 Hindi approvals recorded. | **OWNER/CLINICAL REVIEW** |
| CORS | Function-level allowlist correct; hosted production behaviour never tested. | **OWNER VERIFICATION** |
| Live providers | Groq / Prisma / Timbre never called. | **OWNER ACTIVATION** |

---

## 6. Owner-blocked tasks

1. Acknowledge (or reject) the `get_doctor_appointments()` `SECURITY DEFINER` exception.
2. Set server-side secrets `GROQ_API_KEY`, `GNANI_API_KEY`, `ALLOWED_ORIGINS`.
3. Link the Supabase project and approve `db push` (11 migrations) plus `seed.sql`.
4. Create the two doctor Auth users and run `scripts/map-doctor-profiles.ts --confirm`.
5. Deploy both Edge Functions (never with `--no-verify-jwt`) and the frontend.
6. Run post-deployment verification and the live provider check (`--live`, synthetic input).
7. Decide OD-02 and the data-retention policy; commission clinical and Hindi review.

---

## 7. Explicitly untested production claims

- No hosted Supabase project has been contacted; no remote migration, seed or secret exists.
- No Edge Function or frontend deployment has been performed.
- Hosted CORS, hosted RLS and hosted Auth behaviour are **NOT TESTED**.
- Live Groq / Prisma / Timbre behaviour is **NOT TESTED**.
- Real-stack, browser and SQL suites at `ace1a5c` are **BLOCKED** by the Docker outage.

---

## 8. Recommendation

**READY WITH DOCUMENTED OWNER BLOCKERS** — conditionally, and not yet fully evidenced at
this SHA.

- Engineering that could run at `ace1a5c` passes: TypeScript, mock 26/26, simulated 7/7,
  production build.
- The release branch content is verified identical to `feat/frontend`.
- The real-stack evidence for this exact SHA is **missing because of the Docker outage**,
  not because of a failure. Re-run the commands in §2 before treating the candidate as
  verified.
- Nothing here constitutes authorisation to deploy. Production readiness remains an
  owner decision gated on the seven items in §6.
