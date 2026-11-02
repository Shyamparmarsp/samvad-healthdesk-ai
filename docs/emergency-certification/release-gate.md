# Emergency Certification — Release Gate

**Application under test:** `feat/backend` @ `e5d77e53100f62d3ac5954cce7d4e9c5872f3053`
**Gate run:** 2 November 2026, local disposable stack, providers pointed at the local stub
**Machine result:** 197 cases — **187 PASS, 10 FAIL, 0 NOT TESTED**
**Release gate verdict: FAIL — NOT CERTIFIED**

This gate is evidence-based. A passing unit-test count alone is not treated as
certification: the FAILs below are live-reproduced contract deviations, and the PASSes
include end-to-end HTTP, RLS and immutability evidence.

---

## Gate results

| # | Gate | Result | Evidence |
|---|---|---|---|
| G1 | Emergency detection — every configured trigger, negative controls, normalisation, both languages | **FAIL** | 152/158. D-2 (high), D-1 (medium) |
| G2 | Execution precedence — matcher before parsing/selection/model; no further questions; no override | **FAIL** | 7/11. D-5 (medium), D-3 (low), D-4 (low); core zero-provider proof PASS |
| G3 | Urgent report — `urgent_partial`, statement preserved, supported content only, no booking, 112 guidance, no false claims | **PASS** | 15/15 |
| G4 | Doctor access and RLS — authorized visibility, GM/EM boundaries, unauthorized reads/writes rejected, no widening | **PASS** | 7/7 live + 9/9 SQL blocks |
| G5 | Regression — normal intake, 15-turn cap, adaptive budget, report schema | **PASS** | 5/5 live + 13 workflow tests + 209/209 full Deno suite |
| G6 | Hygiene — self-only test data, no counter reset, no sensitive logging | **PASS** | 1/1 + cleanup evidence |

**BLOCKED: 0.**

### Not tested (declared scope limitations, not passes)

| Item | Reason |
|---|---|
| Audio → Prisma → editable transcript → classification | Exercising it requires a live Prisma provider call, which this task forbids. The confirmed text is the matcher input and the audio branch is unchanged; the text path was fully tested. |
| Patient/doctor UI rendering of the 112 screen | Frontend is a separate worktree and out of scope. Read-only inspection found the English guidance correct but a Hindi-localisation gap (advisory A-1). |
| Live Groq / Timbre behaviour | Providers are stubbed locally by design (D5 guardrails). Precedence is proven by reservation deltas, not by provider output. |

---

## Findings requiring a decision before certification

| Defect | Severity | Why it matters |
|---|---|---|
| **D-2** — an unrelated later negation cancels a present trigger (`I cannot breathe but I have no fever` → no emergency) | **high** | A documented clear trigger does not enter the urgent path; 112 guidance is not shown. It does not claim safety or permit emergency booking, but it is a safety-relevant false negative. |
| **D-5** — a clear trigger typed as the clarification answer is not classified | **medium** | The urgent path is delayed and only `needs_human_review` is set. Listed here because it is a patient-answer path that bypasses the deterministic matcher. |
| **D-1** — a single-quoted example triggers the urgent path | **medium** | False positive: unnecessary urgent screen. Contradicts the documented “quoted example” rule. |
| **D-3 / D-4** — stale `current_question`; misleading `turn_cap_reached` on an emergency session | **low** | API hygiene only; no data accepted and no safety claim. |

The gate verdict is FAIL because any failing case fails the gate; the harness’s
`blocking_findings` field lists only the high/critical cases (D-2). D-1, D-3, D-4 and D-5
are still open and must be resolved or explicitly accepted.

D-1, D-2 and D-5 must not be fixed inside a certification branch: each changes matcher or
workflow semantics. They need an owner decision, a reviewed change and a full re-run of
this gate.

---

## Owner actions

1. **Decide D-2.** Approve a negation-scoping change (negation must govern the mention, and
   all phrase occurrences must be considered) or explicitly accept the current false
   negative as a demo limitation. Recommended: fix before any judged demo that relies on
   the matcher.
2. **Decide D-5.** Approve running the deterministic matcher on clarification answers.
3. **Decide D-1.** Approve quote-aware pre-stripping that does not break contractions.
4. **Schedule D-3/D-4** as small API-hygiene fixes (clear `current_question_id` on
   emergency; return a state error instead of `turn_cap_reached`).
5. **Raise A-1 on the frontend branch**: `EmergencyView.tsx` ignores the Hindi guidance
   string, so Hindi sessions see English guidance.
6. After any fix, re-run all four layers and require **197/197 PASS** before re-issuing
   the gate.

No owner credential, hosted project or production data was required or used.

---

## Evidence map

| File | Contents |
|---|---|
| `evidence/live-matrix.log` | Full stdout of the 197-case run (PASS/FAIL per case) |
| `../../emergency-certification-result.json` | Machine-readable cases, verdict and summary |
| `evidence/authorization-sql.log` | Nine SQL authorization blocks with their PASS notices |
| `evidence/deno-test.log` | Full Deno unit/regression suite (209 passed) |
| `evidence/deno-check.log` | Type-check of `chat-turn` and `speak` with the function import map |
| `evidence/environment.txt` | Commit, branch, Deno version, applied migrations, local stub endpoints and the empty application diff |
| `test-matrix.md` | Human-readable matrix generated from the JSON |
| `audit-report.md` | Narrative audit, defect records and file references |

## Reproduction commands

```bash
# matcher + workflow (offline)
(cd supabase/functions/_shared && deno test --allow-read)

# type-check
deno check --config supabase/functions/deno.json \
  supabase/functions/chat-turn/index.ts supabase/functions/speak/index.ts

# authorization (rolls back)
docker exec -i supabase_db_<project> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/tests/emergency_authorization.sql

# live matrix (local only; exits 1 on any FAIL)
LOCAL_ANON_KEY=... LOCAL_SERVICE_KEY=... LOCAL_JWT_SECRET=... \
CERT_COMMIT=e5d77e5 \
deno run --allow-net --allow-env --allow-read --allow-write \
  supabase/tests/emergency-certification.ts
```

## Sign-off

| | |
|---|---|
| Automated evidence | Complete: 197 cases, 9 SQL blocks, 28 new tests, 209 existing tests |
| Application code changed | No |
| Policies/grants widened | No |
| Hosted infrastructure touched | No |
| Release recommendation | **Do not certify.** Resolve or formally accept D-2 and D-5, then re-run. |
