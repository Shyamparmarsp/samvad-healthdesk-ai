# Emergency Flow Certification — Samvad HealthDesk AI

Independent, evidence-backed certification of the deterministic demo emergency workflow.

> **Not clinically validated.** The matcher is a demonstration fixture, not triage. A
> phrase list can miss emergencies and can produce false positives. A lack of a match
> does not mean a person is safe. See `../demo-emergency-rules.md`.

## Verdict

**Backend emergency workflow: CERTIFIED — 209 / 209 automated cases PASS.**
Six documented deviations were reproduced and corrected (D-1 … D-6); no trigger phrase,
clinical threshold, question-bank entry, schema, provider contract or frontend file was
changed.

**Scope:** backend safety workflow (`chat-turn`, matcher, report, booking eligibility,
RLS). The rendered UI and voice path are **NOT TESTED** here — see
[`not-tested.md`](not-tested.md). The product is not certified end-to-end.

## Certified state

| | |
|---|---|
| Base branch | `feat/backend` |
| Base commit | `e5d77e53100f62d3ac5954cce7d4e9c5872f3053` |
| Certification branch | `feat/emergency-certification-v3` |
| Worktree | `../samvad-emergency-certification-v3` |
| Application changes | corrected emergency handler/matcher/logging only |
| Database schema / migrations / RLS | unchanged |
| Question bank | byte-for-byte unchanged (SHA-256 manifest) |
| Report contract | v1.2 / `schema_version` 1, unchanged |
| Frontend | not modified (read-only inspection) |
| Hosted infrastructure | not touched |
| Live provider calls | none (local stub only) |

### Branch isolation note

The requested worktree `../samvad-emergency-certification` and branch
`feat/emergency-certification` already existed from earlier work, and the instructions
require existing worktrees/branches to stay untouched. A new worktree and branch
(`-v3`) were created at `e5d77e5`; the previous certification artefacts were carried
forward at commit `86f7d5e` (tests/docs only, no application change). No existing branch
or worktree was modified.

## Results

| Suite | Result |
|---|---|
| Emergency certification matrix (mocked + live local HTTP) | **209 / 209 PASS** |
| Backend Deno unit suite | **219 / 219 PASS** |
| SQL authorization / RLS / immutability (9 blocks) | **PASS** |
| Integration suite (52 scenarios, corrected runtime) | **52 / 52 PASS** |
| Adaptive suite (29 scenarios, corrected runtime) | **29 / 29 PASS** |
| Release gate | **21 PASS, 0 FAIL, 0 BLOCKED, 1 NOT TESTED** (frontend not requested) |

## Documents

| File | Purpose |
|---|---|
| [`architecture.md`](architecture.md) | Components and execution order |
| [`trigger-matrix.md`](trigger-matrix.md) | Every English and Hindi trigger |
| [`negative-controls.md`](negative-controls.md) | Ordinary statements, negation, quoting |
| [`audit-report.md`](audit-report.md) | Requirement-by-requirement findings |
| [`defects-and-corrections.md`](defects-and-corrections.md) | D-1 … D-6 with impact and tests |
| [`test-matrix.md`](test-matrix.md) | All 209 automated cases |
| [`not-tested.md`](not-tested.md) | Explicit exclusions and advisory F-1 |
| [`release-gate.md`](release-gate.md) | Gate results and evidence |
| `evidence/` | Raw logs, hashes, matrix JSON |

## Request path in one line

`chat-turn` verifies the JWT, loads the owned session, classifies the confirmed answer
**before** parsing, question selection, adaptive retrieval or Groq, and returns an
`urgent_partial` report with `current_question_id = null` when a rule fires.

## Reproduce

The local stack supplies Auth/PostgREST/DB. To exercise the corrected functions without
disturbing the shared runtime, the certification used a parallel edge-runtime container
with this worktree mounted:

```bash
# 1. offline matcher/workflow/logging tests
(cd supabase/functions/_shared && deno test --allow-read)

# 2. SQL authorization suite (rolls back)
docker exec -i supabase_db_<project> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/tests/emergency_authorization.sql

# 3. live matrix (functions served from this worktree; local targets only)
LOCAL_URL=http://127.0.0.1:54321 \
FUNCTIONS_URL=http://127.0.0.1:<parallel-runtime-port> FUNCTIONS_PREFIX='' \
LOCAL_ANON_KEY=… LOCAL_SERVICE_KEY=… LOCAL_JWT_SECRET=… \
CERT_COMMIT=e5d77e5 \
deno run --allow-net --allow-env --allow-read --allow-write \
  supabase/tests/emergency-certification.ts
```

`FUNCTIONS_URL` is optional; it defaults to `LOCAL_URL`. `FUNCTIONS_PREFIX` defaults to
`/functions/v1`, which is correct for Kong; the direct runtime uses `''`.

The harness creates its own anonymous identities and deletes only those. It never resets a
usage counter, never edits reference data and never logs patient text.

## Corrections at a glance

| ID | Severity | Correction |
|---|---|---|
| D-1 | medium | Single-quoted examples no longer trigger; contractions still work |
| D-2 | high | An unrelated negation no longer cancels a present trigger; all occurrences evaluated |
| D-3 | low | Emergency transition clears the stale `current_question_id` |
| D-4 | low | Terminal sessions return `409 invalid_state`, not `turn_cap_reached` |
| D-5 | medium | A clear trigger in the clarification answer enters the urgent path |
| D-6 | low | Log sanitizer also rejects `patient_statement` / `patient_*` keys |

No phrase was added, removed or rewritten: the canonical `EMERGENCY_RULES` hash equals the
base commit (`L-PHRASE-01`).
