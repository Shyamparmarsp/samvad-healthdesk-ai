# Speech Round-Trip — Release Gate

**Application state under test:** `feat/provider-verification-harness` @ `0cff52a`
**Run:** 2 November 2026, local stack only (API, Edge Functions, provider stub and database up)
**Result:** **25 PASS, 0 FAIL, 0 BLOCKED, 1 NOT TESTED**
**Live provider calls:** **NOT RUN**

The single `NOT TESTED` is the frontend build step, which is only run with `--frontend`
and is out of scope here.

## Gate results

| Gate | Result | Evidence |
|---|---|---|
| Existing Deno type check (`chat-turn`, `speak`) | **PASS** | `deno check --config supabase/functions/deno.json …` |
| Existing Deno unit suite (181 tests) | **PASS** | 181 passed, 0 failed |
| Existing provider smoke tests | **PASS** | 17 passed, 0 failed |
| **Speech round-trip failure-path tests** | **PASS** | **25 passed, 0 failed** |
| **Round-trip default mode makes no request** | **PASS** | Non-live, 4-request plan, zero requests, no files |
| Provider smoke default mode | **PASS** | No request, exit 0 |
| Provider smoke live mode without keys | **PASS** | Refused (exit 2) before any request |
| Question bank validation (150, bilingual) | **PASS** | 150 questions valid |
| Contract fixtures (17) | **PASS** | 17 valid |
| Secret scan (tracked files) | **PASS** | No key-shaped strings |
| Database release verification (read-only) | **PASS** | 29/29 |
| SQL suites (RLS, constraints, review, booking, IST, appointments, immutability) | **PASS** | 5 / 4 / 10 / 4 / 4 / 5 / 5 assertions |
| Clean-room migration rehearsal | **PASS** | 29/29, 11 migrations |
| Deployment configuration preflight | **PASS** | 17/22 pass, 0 fail, 5 owner-blocked |
| Demo preflight | **PASS** | 16/16 |
| Reset safety self-test | **PASS** | 5 refusal cases |
| Demo smoke (integration + adaptive) | **PASS** | 52/52 and 29/29 |
| Frontend build | **NOT TESTED** | Not requested (`--frontend` absent) |
| **Live English round trip** | **NOT RUN** | Requires explicit owner authorization |
| **Live Hindi round trip** | **NOT RUN** | Requires explicit owner authorization |
| Clinical transcription accuracy | **NOT TESTED** | Out of scope; synthetic sentences only |

## Reproduce

```bash
LOCAL_URL=http://127.0.0.1:54321 \
LOCAL_ANON_KEY=… LOCAL_SERVICE_KEY=… \
deno run --allow-all scripts/release-check.ts
```

Both `LOCAL_*` keys are needed by the existing integration suite. A run without
`LOCAL_ANON_KEY`/`LOCAL_SERVICE_KEY` reports the integration suite as failed, not as a
provider defect.

Machine-readable result: [`evidence/release-check-result.json`](evidence/release-check-result.json)
(a snapshot of the repository's `release-check-result.json` from this run).

## Focused evidence

| File | Contents |
|---|---|
| [`evidence/release-check.log`](evidence/release-check.log) | Full console output of the gate run |
| [`evidence/provider-roundtrip-test.log`](evidence/provider-roundtrip-test.log) | 25 mocked round-trip tests, 0 failed |
| [`evidence/provider-smoke-test.log`](evidence/provider-smoke-test.log) | Existing 17 provider smoke tests, unchanged |
| [`evidence/non-live-dry-run.log`](evidence/non-live-dry-run.log) | Dry run: 4-request plan, zero requests |
| [`evidence/deno-check.log`](evidence/deno-check.log) | Explicit-config type check |
| [`evidence/release-check-result.json`](evidence/release-check-result.json) | Full gate result (JSON) |

## Small gate fix included

The gate's type-check step previously ran `deno check` without a config. That passed only
in worktrees that already had a gitignored `supabase/functions/node_modules` from an
earlier run; on a clean worktree it failed with `Import "@supabase/server" not a
dependency`. The step now passes
`--config supabase/functions/deno.json`, which is the configuration the Edge Functions
actually use. No check was removed or weakened; the suite now passes on a clean worktree.

## What this gate does not prove

- It does **not** prove Timbre or Prisma work. No live provider request was made.
- It does **not** prove transcript accuracy for real speech, accents, noise or clinical
  terms. The mocked transcripts are fixed strings and the fake TTS fixture is 10 bytes.
- It does **not** replace the owner listening pass. See
  [`manual-listening-checklist.md`](manual-listening-checklist.md).

## Sign-off

| | |
|---|---|
| Harness implementation | Complete; existing provider contracts preserved |
| Mocked tests | 25/25 PASS + 17/17 existing PASS |
| Release gate | 25 PASS, 0 FAIL, 0 BLOCKED, 1 NOT TESTED |
| Live round trip | **NOT RUN — owner authorization required** |
| Hosted infrastructure | Not touched |
| Deployment / merge | Not performed |
