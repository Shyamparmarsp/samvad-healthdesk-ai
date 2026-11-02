# Emergency Flow Audit Report

**Certified application state:** `feat/backend` @ `e5d77e53100f62d3ac5954cce7d4e9c5872f3053`
**Certification branch:** `feat/emergency-certification-v3`
**Environment:** local Supabase stack (11 migrations), local provider stub, no hosted
project, no live provider call.
**Date:** 2 November 2026

**Verdict: backend emergency workflow CERTIFIED.** 209 / 209 automated cases pass, 219 / 219
unit tests pass, 9 / 9 SQL authorization blocks pass, and 52 / 52 integration plus 29 / 29
adaptive scenarios pass against the corrected runtime. Six deviations were reproduced and
corrected (D-1 … D-6). The rendered UI and voice path are **NOT TESTED** (see
`not-tested.md`), so no end-to-end product certification is claimed.

---

## 1. Method

Four independent layers, so no single test type is the only evidence:

| Layer | Artifact | Proof |
|---|---|---|
| Matcher contract | `_shared/safety.certification.test.ts` (18 tests) | Every configured trigger, negative controls, Unicode/quote/negation cases |
| Workflow/state machine | `_shared/emergency-workflow.test.ts` (16 tests) | Execution order, cap, adaptive budget, completion, schema, corrections |
| Log privacy | `_shared/logging-privacy.test.ts` (4 tests) | Sanitizer and call sites |
| Live HTTP matrix | `supabase/tests/emergency-certification.ts` (209 cases) | Real `chat-turn`/`speak`/PostgREST behaviour |
| Database authorization | `supabase/tests/emergency_authorization.sql` (9 blocks) | RLS, grants, immutability, RPC matrix |
| Regression | `integration.ts` 52/52, `adaptive.ts` 29/29 | Normal flow, provider fallbacks, routing |
| Gate | `scripts/release-check.ts` | 21 PASS, 0 FAIL, 0 BLOCKED, 1 NOT TESTED |

The live matrix was executed against **this worktree's** functions in a parallel
edge-runtime container on the same local DB/stub; the shared runtime and all other
worktrees were untouched. `FUNCTIONS_URL`/`FUNCTIONS_PREFIX` support in the harness makes
that explicit.

Matcher inventory (unchanged; canonical hash equals the base commit):

| Category | Count |
|---|---|
| Clear English | 35 |
| Clear Hindi (Devanagari) | 27 |
| Ambiguous English | 24 |
| Ambiguous Hindi | 20 |
| Opt-in Romanised | 11 |
| Rules | 8, in declared precedence order |

---

## 2. Emergency detection

- **62 clear phrases** (35 EN + 27 Devanagari) each return `clear`; **44 ambiguous**
  phrases each request the fixed clarification; **11 Romanised** phrases remain opt-in.
- **62 negative/ordinary cases** (10 ordinary statements, 7 governed negations, 8 scoping
  cases, 5 quoted examples, empty/punctuation input, plus controls) produce `none` or the
  documented clarification, never an emergency claim.
- Case, whitespace, punctuation, hyphen, apostrophe (ASCII/curly) and Devanagari nukta
  variants still match. Normalisation preserves letters, marks and digits.
- Rule precedence is the declared array order; the canonical `EMERGENCY_RULES` SHA-256 is
  identical to `e5d77e5` (`L-PHRASE-01`), so no phrase was added, removed or rewritten.

Two deviations were found and corrected:

- **D-1 (medium):** single-quoted examples triggered the urgent path because apostrophes
  were stripped before quote removal.
- **D-2 (high):** an unrelated later negation (“but no fever”) cancelled a present
  trigger, and only the first occurrence of a phrase was examined.

Both corrections are described with reproduction and tests in
`defects-and-corrections.md`; the full matrix is in `trigger-matrix.md` and
`negative-controls.md`.

---

## 3. Execution precedence

Source-order proof (`emergency-workflow.test.ts`) reads the real handler and asserts that
`classifyAnswer(text)` precedes `parseAnswer`, `nextQuestion`, `maybeAdaptiveQuestion` and
`ensureDraftReport`. The clear branch returns through `respondWithEmergency` before any of
them.

Live proof at the adaptive boundary:

| Observation | Early trigger | Late trigger (final scripted turn) | Ordinary same turn |
|---|---|---|---|
| `emergency_triggered` | `true` | `true` | `false` |
| New question selected | none | none | draft produced |
| Groq reservations on the turn | **0** | **0** | **≥ 1** |
| Further `submit_turn` | refused | refused | n/a |
| Timbre reservations after (`speak`) | 0 | 0 | n/a |
| Emergency response `current_question` | absent | absent | n/a |

The ordinary control consumes a Groq reservation on the exact turn where the late trigger
makes zero. Groq cannot override a deterministic match because it is never consulted.

Two deviations were corrected here:

- **D-5 (medium):** a clear trigger typed as the clarification answer was not classified;
  it is now classified before yes/no and enters the urgent path (`L-PREC-01`).
- **D-3/D-4 (low):** the emergency response retained a stale question, and a terminal
  session reported the turn-cap error. The transition now clears `current_question_id`
  and returns `409 invalid_state` for a terminal session (`L-EMERG-09`, `L-EMERG-11`).

---

## 4. Urgent report behaviour — 15 / 15 PASS

| Check | Observed |
|---|---|
| Status | `urgent_partial` |
| Department / doctor | `emergency`, seeded Emergency doctor, preliminary |
| `submitted_at` | `null` |
| `summary` | `null` |
| `possible_urgent` | `false` |
| `needs_human_review` | preserved, never cleared |
| `emergency_rule_id` | matched rule |
| `emergency.patient_statement` | verbatim confirmed text (≤500 chars) |
| Unreached fields | explicit `not_asked`, no invented values |
| `schema_version` | 1 |
| Slots / booking RPCs | refused `22023`; 0 appointments |
| `submit_report` | `409 invalid_state` |
| Resume | restores the urgent report, no Submit |
| Mark Reviewed | status unchanged; still unbookable |
| 112 guidance | approved EN/HI text, no `tel:` link, no notification claim |

Hindi trigger: the Devanagari statement is preserved verbatim and unanswered fields stay
`not_asked`.

---

## 5. Doctor visibility and security — 7 / 7 live + 9 / 9 SQL PASS

| Caller | Submitted | Urgent emergency | Draft |
|---|---|---|---|
| Assigned doctor | read | read if assigned | **no** |
| Emergency doctor | no (unless assigned) | **read** | **no** |
| General Medicine demo doctor | read if assigned | **read (cross-visibility)** | **no** |
| Orthopedics / other mapped doctor | only if assigned | **no** | **no** |
| Owning patient | no direct read | no direct read | no direct read |
| `anon` | no grant | no grant | no grant |

- Direct `PATCH`, `DELETE`, report `INSERT` and appointment `INSERT` by a doctor/patient
  fail.
- Mark Reviewed: GM `42501`, orthopedics `42501`, patient `42501`, draft `22023`,
  Emergency doctor succeeds and is idempotent. Review never changes status or booking
  eligibility.
- The terminal-report trigger rejects promotion, content rewrite, routing change and
  clearing the rule id (`42501`).
- Structural checks: RLS on all clinical/usage tables; exactly one SELECT-only `reports`
  policy; no write grants for `authenticated`; three RPCs `SECURITY DEFINER` with empty
  `search_path`; `reserve_daily_usage` is `SECURITY INVOKER`; `anon` cannot execute
  booking/review.

No policy, grant or limit was widened.

---

## 6. Regression protection — 8 / 8 live + 16 workflow + 219 unit PASS

- Normal intake completes a 10-turn session with a normal draft, `can_submit=true`, a
  template summary and `emergency: null`.
- Fixed order and scripted adaptive order are unchanged.
- `MAX_ANSWER_TURNS=15` and `MAX_ADAPTIVE_QUESTIONS=3` are unchanged; the 15th answer is
  accepted; an incomplete cap is End-only; a complete cap may still submit; a terminal
  state now returns `invalid_state` (cap behaviour untouched).
- Report contract is **v1.2**, `REPORT_SCHEMA_VERSION=1`; the response and row schema
  versions are 1.
- Question bank files are byte-for-byte identical to `e5d77e5` (SHA-256 manifest).
- Doctor conversation access follows report access (RLS); no new read path.
- The integration suite (52/52) and adaptive suite (29/29) pass against the corrected
  runtime, including provider-failure fallbacks and routing.
- Logging: forbidden keys are dropped; call sites pass no patient content; an emitted-line
  test confirms a synthetic statement never appears (`logging-privacy.test.ts`,
  `L-LOG-01`). **D-6** hardened the sanitizer to reject `patient_statement`/`patient_*`.

---

## 7. Defects

| ID | Severity | Finding | Status |
|---|---|---|---|
| D-1 | medium | Single-quoted examples triggered | corrected |
| D-2 | high | Unrelated negation cancelled a present trigger; only first occurrence checked | corrected |
| D-3 | low | Stale `current_question` after emergency | corrected |
| D-4 | low | Terminal session reported `turn_cap_reached` | corrected |
| D-5 | medium | Clarification answer bypassed the matcher | corrected |
| D-6 | low | Log sanitizer missed `patient_statement` | corrected |

Full reproduction, impact, correction and test references:
[`defects-and-corrections.md`](defects-and-corrections.md).

---

## 8. Unresolved / out of scope

| Item | Status |
|---|---|
| **OD-02** — does the clarification answer consume a turn? | Still unresolved. Observed: unclear, No and Yes do not increment `answer_turn_count`. Unchanged. |
| **OD-03** — may a General Medicine doctor Mark Reviewed an urgent report? | Interim deny implemented and verified. Unchanged. |
| Trigger statement in the conversation log | Preserved in `report.emergency`; not inserted as a `messages` row. The contract requires preservation (satisfied) but is silent on a message row. Unchanged. |
| Rendered UI, Hindi guidance, voice path, live providers | **NOT TESTED** — see `not-tested.md`. |
| Frontend advisory **F-1** | `EmergencyView.tsx` hardcodes the English guidance, so Hindi sessions may see English text. Frontend-owned; not modified. |
| Mark Reviewed review-chip wording | RD-24 still open; out of emergency scope. |

---

## 9. Change statement

Application changes are limited to the demonstrated deviations:

```
supabase/functions/_shared/safety.ts          (matcher quote/negation scoping)
supabase/functions/chat-turn/index.ts         (clarification classification, current question, state error)
supabase/functions/_shared/logging.ts         (sanitizer key pattern)
supabase/functions/_shared/*.test.ts          (new certification tests)
docs/emergency-certification/                 (this evidence set)
supabase/tests/emergency-*.{ts,sql}           (harness and authorization suite)
```

No trigger phrase, clinical threshold, question-bank entry, migration, RLS policy, seed
row, provider contract or frontend file was changed. No hosted project was contacted and
no live provider was called. The working-tree diff against `e5d77e5` for
`supabase/migrations/`, `supabase/seed.sql` and `src/` is empty.
