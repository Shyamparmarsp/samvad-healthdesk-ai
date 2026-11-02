# Emergency Flow Certification — Samvad HealthDesk AI

Independent audit and automated certification of the deterministic demo emergency path.

> **Not clinically validated.** The matcher is a demonstration fixture, not triage. A
> phrase list can miss emergencies and can produce false positives. A lack of a match
> does not mean a person is safe. See `../demo-emergency-rules.md`.

## Verdict

**NOT CERTIFIED — 187 PASS / 10 FAIL / 0 NOT TESTED in the automated matrix.**

Five defects were demonstrated. Two are safety-relevant matcher-sensitivity gaps
(**D-2 high**, **D-5 medium**); one is a quoted-example false positive (**D-1 medium**);
two are API-hygiene issues (**D-3 low**, **D-4 low**). No authorization defect, no
booking bypass, no false notification claim and no data exposure was found.

Read in this order:

| Document | Purpose |
|---|---|
| [`audit-report.md`](audit-report.md) | What was inspected, how, what was found, defect records |
| [`test-matrix.md`](test-matrix.md) | All 197 automated cases: expected, actual, PASS/FAIL |
| [`release-gate.md`](release-gate.md) | Gate-by-gate result, blocking findings and owner actions |
| [`evidence/`](evidence/) | Raw run logs and the machine-readable result |

## What was certified

| | |
|---|---|
| Repository | Samvad HealthDesk AI (one private repository) |
| Base branch / commit | `feat/backend` @ `e5d77e53100f62d3ac5954cce7d4e9c5872f3053` |
| Certification worktree | `../samvad-emergency-certification` |
| Certification branch | `feat/emergency-certification-v2` |
| Application code changed | **None.** Tests and documentation only. |
| Database schema changed | **None.** No migration, grant or policy was edited. |
| Frontend changed | **None.** |
| Hosted infrastructure touched | **None.** Local disposable stack only. |
| Live provider calls | **None.** `GROQ_BASE_URL`, `PRISMA_BASE_URL` and `TIMBRE_ENDPOINT` on the local stack point at the local provider stub. |

### Branch-name note

The requested branch name `feat/emergency-certification` already existed (checked out in
the sibling worktree `../samvad-emergency-cert` at `e5717dd`). Because existing worktrees
and branches must not be modified, the requested worktree path
`../samvad-emergency-certification` was created from `e5d77e5` on the new branch
`feat/emergency-certification-v2`. No commit was added to the existing branch and no
existing worktree was touched.

## Test layers

1. **Matcher unit tests** — every configured English and Hindi clear phrase, every
   ambiguous phrase, every opt-in Romanised phrase, negative controls, case/whitespace/
   punctuation variants, determinism and clarification resolution.
   `supabase/functions/_shared/safety.certification.test.ts` (15 tests).
2. **Workflow/state-machine tests** — source-order proof that the matcher runs before
   parsing, question selection, bank retrieval, Groq routing and draft generation, plus
   the 15-turn cap, adaptive budget, completion criteria and report schema.
   `supabase/functions/_shared/emergency-workflow.test.ts` (13 tests).
3. **Live end-to-end matrix** — real `chat-turn` HTTP calls against the local stack:
   normal intake, English and Hindi triggers, ambiguous → Yes/No/unclear, persistence,
   slots/booking refusal, resume, ownership isolation, no-provider-on-trigger, doctor
   reads through RLS, Mark Reviewed matrix.
   `supabase/tests/emergency-certification.ts` (197 cases, writes
   `emergency-certification-result.json`).
4. **Database authorization suite** — RLS, grants, policy shape, immutability, RPC
   authorization, permanent emergency ineligibility, structural invariants.
   `supabase/tests/emergency_authorization.sql` (9 assertion blocks).

## Reproduce

Prerequisites: Docker, Deno, a **local** Supabase stack (`npx supabase@latest start`),
and the five local test identities documented in `supabase/tests/README.md`
(`patient-a@rls.test`, `patient-b@rls.test`, `doctor-gm@rls.test`, `doctor-em@rls.test`,
`doctor-or@rls.test`) with doctor profile mappings.

```bash
# 1. Offline matcher + workflow suites (no network, no database)
cd supabase/functions/_shared
deno test --allow-read                       # expect 209 passed

# 2. Type-check the two Edge Functions with the function import map
cd ../../..
deno check --config supabase/functions/deno.json \
  supabase/functions/chat-turn/index.ts supabase/functions/speak/index.ts

# 3. Database authorization suite (transaction rolls back)
docker exec -i supabase_db_<project> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/tests/emergency_authorization.sql

# 4. Live certification matrix (local targets only; refuses anything else)
LOCAL_URL=http://127.0.0.1:54321 \
LOCAL_ANON_KEY=... LOCAL_SERVICE_KEY=... LOCAL_JWT_SECRET=... \
CERT_COMMIT=$(git rev-parse e5d77e5) \
deno run --allow-net --allow-env --allow-read --allow-write \
  supabase/tests/emergency-certification.ts
```

The harness creates its own throwaway anonymous identities, deletes only those, never
resets a usage counter and never edits reference data. It exits `1` when any case fails,
so it can be wired into a release gate as-is.

`LOCAL_JWT_SECRET` is required only for the caller-scoped doctor checks; without it those
cases are reported `NOT TESTED`, never `PASS`.

## Scope boundaries honoured

- No emergency phrase, threshold or rule ordering was invented, removed or rewritten.
- No clinical threshold, diagnosis, treatment or recommendation was added.
- The reviewed question bank was not modified.
- The frontend was not modified.
- No live provider request was made.
- No patient statement or transcript is logged by the harness; only fixed demo phrases
  and synthetic fixture text appear in the matrix.
- Implementation code was left untouched. D-1 to D-5 are recorded for an owner decision
  rather than silently changed, because each would alter matcher or workflow semantics.
