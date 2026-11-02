# Emergency Flow Audit Report

**Certified application state:** `feat/backend` @ `e5d77e53100f62d3ac5954cce7d4e9c5872f3053`
**Certification worktree:** `../samvad-emergency-certification` (branch `feat/emergency-certification-v2`)
**Environment:** disposable local Supabase stack, 11 migrations applied, question-bank-v2 active,
providers pointed at the local stub. No hosted project was contacted.
**Date:** 2 November 2026

**Verdict: NOT CERTIFIED.** 187 of 197 automated cases pass. Five defects were
demonstrated (D-1 … D-5). The urgent-report workflow, authorization model and regression
limits are otherwise intact. No code was changed: each defect is recorded for an owner
decision because fixing it would alter matcher or workflow semantics, which a
certification run must not do silently.

---

## 1. Scope and method

This is a verification audit, not a redesign. Four independent layers were used so that no
single test type is the only evidence:

| Layer | Artifact | What it proves |
|---|---|---|
| Matcher contract | `_shared/safety.certification.test.ts` (15 tests) | Every configured trigger and negative control |
| Workflow / state machine | `_shared/emergency-workflow.test.ts` (13 tests) | Execution order, cap, completion, schema |
| Live HTTP matrix | `supabase/tests/emergency-certification.ts` (197 cases) | Real `chat-turn`/`speak`/PostgREST behaviour on the local stack |
| Database authorization | `supabase/tests/emergency_authorization.sql` (9 blocks) | RLS, grants, immutability, RPC authorisation |

Supporting evidence: the full existing Deno suite (**209 passed / 0 failed**) and
`deno check --config supabase/functions/deno.json` on both Edge Functions (clean).

Matcher inventory (fixed by `safety.ts`; no phrase was added or removed):

| Category | Count |
|---|---|
| Clear English phrases | 35 |
| Clear Hindi (Devanagari) phrases | 27 |
| Ambiguous English phrases | 24 |
| Ambiguous Hindi phrases | 20 |
| Opt-in Romanised phrases | 11 |
| Rules | 8, in declared precedence order |

Live scenarios created their own anonymous identities and deleted only those. Usage
counters were read but never reset; the normal-completion control consumed the same local
stub reservations any ordinary session consumes.

---

## 2. Emergency detection

### 2.1 Every configured trigger was exercised

- **62 clear phrases** (35 English + 27 Devanagari) each returned `clear`. Six are covered
  by dedicated live scenarios; all 62 are unit-tested.
- **44 ambiguous phrases** (24 English + 20 Devanagari) each returned `ambiguous` with the
  owning rule id.
- **11 Romanised phrases** returned `none` with the option disabled and `clear` with
  `includeRomanized: true`, so Tier C stays opt-in as documented.
- **Rule precedence** is the declared array order: “I cannot breathe and I have severe
  chest pain” resolves to `breathing_emergency`. This is deterministic and repeated-call
  stable.

### 2.2 Negative controls

Ten ordinary statements (English and Hindi) produced `none`: knee pain, mild cough,
headache, tiredness, routine check-up, fever, medicine refill, itchy skin, rash, and “no
fever, mild cough”. Seven negated mentions of a trigger phrase also produced `none`,
including “I do not have chest pain”, “no bleeding” and “सीने में दर्द नहीं है”.

### 2.3 Case, whitespace, punctuation, orthography

`CANNOT BREATHE`, irregular internal whitespace, `!!!`, `cannot-breathe`, `I can't
breathe`, the curly-apostrophe form, and the Devanagari nukta variants all still match.
`normalizeAnswer` preserves Devanagari letters and marks.

### 2.4 Findings

- **D-2 (high)** — an unrelated later negation cancels a present trigger. Four configured
  probes fail; one is confirmed end-to-end over HTTP. See §5.
- **D-1 (medium)** — a single-quoted example triggers because apostrophes are stripped
  before quoted spans are removed. Two probes fail. See §5.
- **O-1 (observation)** — the `severe_allergic_reaction` phrase “throat is swelling and i
  cannot breathe” resolves to `breathing_emergency` because the breathing rule is declared
  first. The urgent path is still entered; only the stored rule id differs. This is
  consistent with the declared priority, not a defect, but the allergic rule id is
  effectively unreachable for that phrase.

---

## 3. Execution precedence

### 3.1 Matcher runs first

Source-order proof (`emergency-workflow.test.ts`) reads the real
`supabase/functions/chat-turn/index.ts` and asserts that
`const match = classifyAnswer(text)` precedes:

- `parseAnswer(...)` (normal answer parsing),
- `nextQuestion(...)` (fixed/scripted adaptive selection),
- `maybeAdaptiveQuestion(...)` (bank retrieval and Groq),
- `ensureDraftReport(...)` (routing and draft generation).

The clear branch is also asserted to contain no call to any of those functions before its
immediate `return json(response)`.

### 3.2 Live proof that a model cannot override an emergency

Two emergency sessions were driven end-to-end, plus a same-turn ordinary control:

- **Early trigger** — the emergency answer was the `primary_concern` turn (the first
  adaptive boundary).
- **Late trigger** — nine ordinary answers were given, then the emergency phrase was the
  `other_symptoms` turn. This is the turn where an ordinary answer completes the report and
  reaches draft routing, so it is the strongest comparison point.
- **Same-turn control** — the ordinary session answered `other_symptoms` normally.

| Observation | Early trigger | Late trigger | Ordinary final turn |
|---|---|---|---|
| `emergency_triggered` | `true` | `true` | `false` |
| `session_status` | `emergency` | `emergency` | `in_progress` |
| `can_submit` | `false` | `false` | `true` (completed draft) |
| New question selected | none | none (question unchanged) | draft produced |
| Groq reservations on that turn | **0** | **0** | **≥ 1** |
| Urgent report statement preserved | yes | yes | n/a |

Further observations:

| Observation | Result |
|---|---|
| Further `submit_turn` after the emergency | refused, turn count unchanged |
| Timbre reservations after the emergency (`speak`) | **delta 0** (text fallback) |
| Response claim of notification/dispatch | none |
| `summary` in the urgent report | `null` |

The ordinary control proves a reservation is consumed on the exact turn where the late
trigger is submitted. The zero delta on both trigger turns is therefore direct evidence
that adaptive selection, draft routing and model reasoning were never reached. Groq cannot
override a deterministic match because it is never consulted.

### 3.3 Findings

- **D-5 (medium)** — a clear trigger typed as the *clarification answer* is not classified.
  The clarification branch runs before `classifyAnswer`. Live reproduction: ambiguous chest
  pain → clarification → “I cannot breathe” returns no emergency; the session is flagged
  `needs_human_review` and the clarification question stays current. It is never presented
  as safe and booking stays held, but the 112 path is delayed.
- **D-3 (low)** — after the emergency, the response still returns the answered question in
  `current_question` because `sessions.current_question_id` is not cleared.
- **D-4 (low)** — a further turn on an emergency session returns `200` with
  `error: "turn_cap_reached"`, not a state error. Data is still refused.

---

## 4. Urgent report behaviour — 15 / 15 PASS

Live-verified on an app-created urgent report:

| Check | Observed |
|---|---|
| Report status | `urgent_partial` |
| Department / doctor | `emergency`, seeded Emergency doctor, `preliminary: true`, `is_fallback: false` |
| `submitted_at` | `null` (never submitted) |
| `summary` | `null` (no generated summary) |
| `possible_urgent` | `false` |
| `needs_human_review` | preserved, never cleared |
| `emergency_rule_id` | matches the rule that fired |
| `emergency.patient_statement` | verbatim patient text, truncated at 500 characters |
| Unreached fields | explicit `not_asked`, no invented values |
| `schema_version` | 1 (document and row) |
| Slots RPC | refused `22023` |
| Booking RPC | refused `22023` |
| Appointment rows | 0 |
| `submit_report` | `409 invalid_state` |
| Resume | restores `emergency_triggered`, `urgent_partial`, no Submit |
| Mark Reviewed | does not change status; report still unbookable afterwards |
| Response text | no “notified”, “dispatched”, “ambulance”, “called 112” claim |

The Hindi trigger (Devanagari at the `name` turn) produced the same report shape, preserved
the Devanagari statement verbatim, and left `patient.name` as `not_asked`.

The approved English and Hindi 112 guidance strings are present in
`docs/demo-emergency-rules.md`, contain no `tel:` link, and the backend adds no advice.

### Findings

- **D-3 (low, restated)** — the stale `current_question` is part of the response shape.
  The urgent report itself is correct.
- **O-2 (unresolved)** — the clear-trigger statement is stored in
  `report.emergency.patient_statement` but is not inserted as a `messages` row. The
  contract requires preservation (satisfied) but does not state whether the conversation
  log must contain the trigger turn. The ambiguous path *does* insert the message. Recorded
  as unresolved; no change made.

---

## 5. Doctor access and RLS — 7 / 7 live + 9 / 9 SQL PASS

Policies inspected in `20261101120200_intake_tables.sql`, `20261102120000_mark_report_reviewed.sql`,
`20261102130000_availability_and_booking.sql` and `20261102170000_report_immutability.sql`.
The application read path is a caller-scoped Supabase client selecting `reports` and relying
on RLS (`../samvad-frontend/src/lib/api.ts:2012`, read-only inspection; the frontend itself
is a separate worktree and was not modified).

| Caller | Submitted report | Urgent emergency report | Draft |
|---|---|---|---|
| Assigned doctor | read | read if assigned | **no** |
| Emergency doctor | no (unless assigned) | **read** | **no** |
| General Medicine demo doctor | read if assigned | **read (cross-visibility)** | **no** |
| Other mapped doctor (orthopedics) | read only if assigned | **no** | **no** |
| Owning patient | no direct read | no direct read | no direct read |
| `anon` | no grant | no grant | no grant |

- The live checks used minted short-lived local JWTs for the mapped test doctors and
  confirmed the same matrix through PostgREST, including conversation access following
  report access (`messages` policy delegates to `reports`).
- Direct `PATCH`, `DELETE`, report `INSERT` and appointment `INSERT` as a doctor all fail.
- Mark Reviewed: General Medicine `42501`, orthopedics `42501`, patient `42501`, draft
  `22023`; Emergency doctor succeeds and is idempotent (first timestamp preserved).
- After review the report remains `urgent_partial`, `submitted_at` stays `null`, slots and
  booking still refuse `22023`, and no appointment exists.
- The owner path cannot rewrite the urgent report either: promotion to `submitted`, content
  rewrite, routing-to-a-bookable-department and clearing `emergency_rule_id` are all
  rejected `42501` by `reports_guard_terminal`.
- Structural checks: RLS enabled on all eight clinical/usage tables; `reports` has exactly
  one SELECT-only policy whose qual mentions `submitted` and `urgent_partial` and not
  `draft`; `authenticated` holds no report/message/session/appointment write grant;
  `report_status` is still `draft,submitted,urgent_partial`; the 15-answer constraint and
  `schema_version` default 1 are intact; the three RPCs are `SECURITY DEFINER` with an
  empty `search_path`; `reserve_daily_usage` is `SECURITY INVOKER`; `anon` cannot execute
  booking/review.

No policy, grant or limit was widened to make any test pass.

---

## 6. Regression testing — 5 / 5 live + 13 workflow + 209 unit PASS

- Normal non-emergency intake completed a full 10-turn session with a normal draft,
  `is_complete: true`, `can_submit: true`, a template summary and `emergency: null`.
- Fixed order is unchanged: name → age → gender → primary concern → duration → severity →
  conditions → medications → allergies → other symptoms.
- `MAX_ANSWER_TURNS = 15` and `MAX_ADAPTIVE_QUESTIONS = 3` are unchanged; the 15th answer
  is accepted, an incomplete cap is End-only with no next question, and a complete cap may
  still submit.
- Completion criteria are unchanged, including gender `declined` as a handled answer.
- `REPORT_SCHEMA_VERSION = 1`; `reports.schema_version` default remains 1.
- The question bank, migrations, seed data, frontend and Edge Function source are byte-for-byte
  unchanged from `e5d77e5` (empty `git diff` for `supabase/functions`, `supabase/migrations`
  and `supabase/seed.sql`).

---

## 7. Defect records

All five are **open** and **not fixed** in this branch. Each would change matcher or
workflow semantics, which requires an owner decision.

### D-1 — Single-quoted examples trigger the emergency path (medium)

| | |
|---|---|
| File | `supabase/functions/_shared/safety.ts` (`normalizeAnswer` L176-184, `stripQuoted` L187-194, `classifyAnswer` L253-255) |
| Contract | `docs/demo-emergency-rules.md` matching rule 1: only the patient's own answer, never a quoted example. `safety.ts` header: “Quoted examples are removed before matching.” |
| Cause | `classifyAnswer` runs `stripQuoted(normalizeAnswer(answer))`. `normalizeAnswer` deletes `'` and `’` first, so by the time `stripQuoted` runs no single-quote delimiters remain. Only double-quoted spans are actually removed. |
| Repro | `classifyAnswer("The form says 'having a seizure now'")` → `{kind:"clear", ruleId:"seizure_or_convulsion"}`. `"My friend told me to say 'I cannot breathe'"` → `clear / breathing_emergency`. |
| Expected | `none` |
| Impact | False positive: unnecessary urgent screen and 112 guidance. Direction is conservative (not a missed emergency), but it contradicts the documented rule. |
| Suggested direction | Quote-aware pre-strip on the raw text that does not treat an apostrophe inside a contraction as a delimiter; then normalise. Must be regression-tested against the existing 62 clear phrases. |

### D-2 — An unrelated later negation cancels a present trigger (high)

| | |
|---|---|
| Files | `supabase/functions/_shared/safety.ts` (`isNegated` L218-227, `findPhrase` L235-244) |
| Contract | `docs/demo-emergency-rules.md` rules 2 and 4: a negated mention must not trigger; a clear positive match triggers the urgent path. |
| Cause | `isNegated` scans 40 characters before **and 25 characters after** the phrase for any negation token in the same clause. A negation that belongs to a different symptom (“no fever”) therefore cancels the trigger. `findPhrase` also checks only the first occurrence of a phrase, so an earlier negated mention hides a later positive one. |
| Repro | `"I cannot breathe but I have no fever"` → `none` (live: normal intake continues, no emergency). `"I have chest pain but no fever"` → `none`. `"I have severe chest pain and no fever"` → `none`. `"no chest pain, but chest pain now"` → `none`. |
| Expected | `clear` for the first and third; `ambiguous` (or clear) for the second and fourth. |
| Impact | **False negative.** A present demo trigger does not enter the urgent path and the 112 guidance is not shown. The patient can continue routine intake. It does not claim safety and cannot book an emergency slot, but it is the most safety-relevant finding. |
| Suggested direction | Scope negation to the mention (a negation immediately governing the phrase, including Hindi post-verbal negation), not to any later token in the clause; evaluate all occurrences, not only the first. Requires owner approval because it changes trigger sensitivity. |

### D-3 — `current_question` survives the emergency transition (low)

| | |
|---|---|
| File | `supabase/functions/chat-turn/index.ts` (`createEmergencyReport` L394-439, `baseResponse`/`currentQuestionFor` L233-282) |
| Contract | The emergency response must stop routine intake; the documented contract returns `emergency_triggered` + `session_status: "emergency"` and the UI switches screens. It does not explicitly require `current_question` to be absent. |
| Cause | `createEmergencyReport` updates session status and `ended_at` but not `current_question_id`; `baseResponse` then re-serialises the answered question. |
| Repro | Live: after `I cannot breathe`, `session_status = emergency` and `current_question.id = primary_concern`. |
| Impact | A naive client could render or replay the old question; `speak` also returns its text (no paid call). The shipped UI keys on `emergency_triggered`, so the demo is not broken, but the wire state is ambiguous. |
| Suggested direction | Clear `current_question_id` on transition, and/or suppress `current_question` when status is `emergency`. |

### D-4 — Emergency refusal reports `turn_cap_reached` (low)

| | |
|---|---|
| Files | `supabase/functions/_shared/conversation.ts` (`canAcceptAnswer` L224-227), `supabase/functions/chat-turn/index.ts` (L596-598) |
| Cause | `canAcceptAnswer` returns `false` for both “cap reached” and “not in progress”; the caller maps every `false` to `turn_cap_reached`. |
| Repro | Live: a second `submit_turn` on the emergency session returns `200 { error: "turn_cap_reached" }` with an unchanged turn count. |
| Impact | Refusal is correct and no data is accepted, but a client may show the wrong state (cap UI instead of ended/emergency). |
| Suggested direction | Return a distinct state error (`invalid_state`/`session_ended`) when the session is not answerable. |

### D-5 — The clarification answer is not classified (medium)

| | |
|---|---|
| File | `supabase/functions/chat-turn/index.ts` (clarification branch L668-708; matcher L710-725) |
| Contract | `docs/demo-emergency-rules.md` rule 1 (evaluate the patient's answer) and rule 4 (a clear positive triggers the urgent path); the matcher must not be bypassed on a patient turn. |
| Cause | The `emergency_clarification` branch handles the answer with `resolveClarification` and returns before `classifyAnswer` is reached. A clear phrase without a yes/no token resolves to `unresolved`. |
| Repro | Live: ambiguous “I have some chest pain” → clarification → answer “I cannot breathe” → no emergency, `needs_human_review = true`, clarification question stays current. |
| Impact | A clear emergency phrase entered at the clarification step delays the 112 path. It is never presented as safe, the review flag is set and booking remains held, so the failure is a delay rather than a false clearance. |
| Suggested direction | Classify the clarification text with the deterministic matcher before/alongside resolution, and treat a clear match as the urgent path. |

---

## 8. Ambiguities and unresolved items

| Item | Status |
|---|---|
| **OD-02** — does the clarification answer consume a turn? | Still unresolved. Observed: unclear, No and Yes do not increment `answer_turn_count`. No change made. |
| **OD-03** — may a General Medicine doctor Mark Reviewed an emergency report? | Interim deny is implemented and verified. Unchanged. |
| Negation scoping / quoted-example semantics (D-1, D-2) | Not defined precisely enough to fix without an owner decision. Recorded, not changed. |
| Trigger statement in the conversation log (O-2) | Contract requires preservation in the report (satisfied) but is silent on a `messages` row. Recorded as unresolved. |
| `current_question` after emergency (D-3) | The wire contract does not state whether it must be absent. Recorded; no change. |
| Mark Reviewed review-chip wording | RD-24 still open (out of emergency scope). |

---

## 9. Frontend presentation — advisory only

Read-only inspection of the separate frontend worktree (`../samvad-frontend`), first at
`f616004` and re-checked unchanged at `a93243e`. That branch is being advanced by another
agent; it is not part of this worktree and was not modified:

- `EmergencyView.tsx` shows the approved English guidance, a large plain-text **112**, no
  `tel:` link and no notification/dispatch claim.
- **Advisory A-1 (low/medium, frontend-owned):** `EmergencyView.tsx` hardcodes the English
  guidance string instead of using `t.emergency.guidance`, so a Hindi session receives the
  English guidance. The approved Hindi string exists in `src/i18n/hi.ts` but is unused on
  that screen. This worktree cannot fix it (frontend is out of scope); it must be raised on
  the frontend branch.
- The UI was **not rendered** in this audit. Rendering is `NOT TESTED` here; the backend
  contract and approved copy were verified.

---

## 10. Out-of-scope observation (not certified)

`maybeAdaptiveQuestion` calls `suggestDepartment(...)` when no preliminary department is
cached **without** a preceding `reserveUsage(admin, "groq")`, while `resolveDraftRouting`
does reserve (`chat-turn/index.ts` L301-312 vs L184-198). This is a D5 usage-accounting
question, unrelated to the emergency path. It is noted for the owner and was not
investigated further, because expanding this certification would blur its scope.

---

## 11. Change statement

```
git diff --stat e5d77e5 -- supabase/functions supabase/migrations supabase/seed.sql
(no output)
```

Only tests, evidence and this documentation were added. No phrase, threshold, rule order,
question, policy, grant, migration, seed row or frontend file was modified. No hosted
infrastructure was touched. The local stack's usage counters were read, not reset.
