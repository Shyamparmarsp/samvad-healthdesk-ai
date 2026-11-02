# Defects and Corrections

Six concrete deviations from the documented safety contract were demonstrated by the
audit. Each was corrected only after reproduction, and each correction is covered by a
regression test. No trigger phrase, threshold, question, schema, provider contract or
frontend file was changed.

> Original contract references: `docs/demo-emergency-rules.md` (matching rules 1–4),
> `docs/integration-contract.md` §7, `AGENTS.md` (deterministic matcher precedence,
> 15-answer cap, no patient content in logs).

---

## D-1 — Single-quoted examples triggered the urgent path (medium)

**Files:** `supabase/functions/_shared/safety.ts` (`normalizeAnswer`, `stripQuoted`,
`classifyAnswer`).

**Demonstrated:** `classifyAnswer("The form says 'having a seizure now'")` returned
`clear / seizure_or_convulsion`, and `"My friend told me to say 'I cannot breathe'"`
returned `clear / breathing_emergency`. The contract says only the patient's own answer is
evaluated, never a quoted example.

**Impact:** a patient quoting a phrase could be shown the 112 screen unnecessarily
(false positive).

**Cause:** `normalizeAnswer` deleted apostrophes before `stripQuoted` ran, so a
single-quoted span no longer had delimiters to match. Only double-quoted spans were
actually removed.

**Correction:** quote-aware stripping runs on the raw text first. A single quote is
treated as a delimiter only at a word boundary, so contractions (`don't`, `can't`) and
possessives (`patient's`) are unaffected. `classifyAnswer` then normalises and strips once
more for straight/curly double quotes.

**Verification:** `M-QUOTE-01` … `M-QUOTE-05`; `cert: single-quoted examples are inert and
apostrophes still work`.

---

## D-2 — An unrelated negation cancelled a present trigger (high)

**Files:** `supabase/functions/_shared/safety.ts` (`isNegated`, `clauseAround`,
`findPhrase`).

**Demonstrated:** `"I cannot breathe but I have no fever"` → `none`;
`"I have chest pain but no fever"` → `none`;
`"I have severe chest pain and no fever"` → `none`;
`"no chest pain, but chest pain now"` → `none`. The documented rule is that a clear
positive enters the urgent path, and a negated mention must not trigger.

**Impact:** a present trigger did not enter the urgent path and the 112 guidance was not
shown. The patient could continue routine intake. This was the most safety-relevant
finding. It did not claim safety and could not book an emergency slot, but it is a false
negative.

**Cause:** `isNegated` scanned a fixed 40-character window before and 25 characters after
the phrase within the same sentence clause, and `findPhrase` examined only the first
occurrence. A later “no <other symptom>” therefore looked like a negation of the mention,
and an earlier negated occurrence hid a later positive one.

**Correction:**
- The context segment now ends at sentence punctuation **and** coordination/contrast
  conjunctions (`and`, `but`, `however`, `although`, `though`, `yet`, `और`, `लेकिन`,
  `मगर`).
- Negation before the mention is limited to six tokens; negation after is limited to the
  immediately following token (which preserves Hindi post-verbal negation such as
  `सीने में दर्द नहीं है`).
- Every occurrence of a phrase is evaluated, not only the first.

**Verification:** `M-NEGSCOPE-01` … `M-NEGSCOPE-08`; live `L-PREC-02`, `L-PREC-05`,
`L-PREC-06`, `L-PREC-07`; `cert: a negation outside the mention's clause segment does not
cancel it`; `cert: every occurrence is considered, not only the first`.

---

## D-3 — A stale current question survived the emergency transition (low)

**File:** `supabase/functions/chat-turn/index.ts` (`createEmergencyReport`).

**Demonstrated:** after `I cannot breathe`, the response returned
`session_status: "emergency"` but still advertised `current_question.id = "primary_concern"`
(the question just answered).

**Impact:** a client that renders `current_question` instead of switching on
`emergency_triggered` could replay a routine question. `speak` could return its text (no
paid call). The shipped UI keys on `emergency_triggered`, so the demo was not broken, but
the wire state was ambiguous.

**Correction:** the emergency transition now also sets `current_question_id = null`.

**Verification:** `L-EMERG-09`, `L-PREC-03`; `workflow: the emergency transition clears the
stale current question`.

---

## D-4 — A terminal session reported `turn_cap_reached` (low)

**Files:** `supabase/functions/_shared/conversation.ts` (`canAcceptAnswer`),
`supabase/functions/chat-turn/index.ts` (`handleSubmitTurn`).

**Demonstrated:** a second `submit_turn` on an `emergency` session returned
`200 { error: "turn_cap_reached" }`, although the session was not at the 15-turn cap.

**Impact:** refusal was correct and no data was accepted, but a client could show the
End-only cap state instead of the emergency/ended state.

**Correction:** the handler distinguishes the cap (`>= 15` answers → `turn_cap_reached`)
from any other non-answerable status (`409 invalid_state`). Cap behavior is unchanged.

**Verification:** `L-EMERG-11`; `workflow: cap and terminal-state refusals are distinct`;
`workflow: the 15-answer cap and its End-only preview are unchanged`.

---

## D-5 — A clear trigger in the clarification answer was not classified (medium)

**File:** `supabase/functions/chat-turn/index.ts` (clarification branch).

**Demonstrated:** ambiguous “I have some chest pain” → clarification → answer
“I cannot breathe” produced no emergency; the session was only flagged
`needs_human_review` and the clarification question stayed current.

**Impact:** a clear emergency phrase entered at the clarification step delayed the 112
path. It was never presented as safe and booking stayed held, but the deterministic
matcher was bypassed on a patient-answer turn.

**Correction:** the clarification answer is classified before the yes/no parser. A clear
match creates the urgent report using that rule and that statement; yes/no/unresolved
behavior is otherwise unchanged.

**Verification:** `L-PREC-01`; `workflow: a clear trigger in the clarification answer is
classified before yes/no`.

---

## D-6 — The log sanitizer did not recognise `patient_statement` (low, defence in depth)

**File:** `supabase/functions/_shared/logging.ts`.

**Demonstrated:** the forbidden-key pattern matched `text`, `transcript`, `message`,
`answer`, `name`, `concern`, `symptom`, medication/allergy fragments and secret names, but
not `patient_statement` or `patient_*`. No current call site passed such a field, so no
statement had leaked; the guarantee was weaker than documented.

**Impact:** a future log call could have emitted an emergency statement (truncated to 64
characters) without the sanitizer removing it.

**Correction:** `statement` and `patient` were added to the forbidden-key pattern.
Call-site scanning and an emitted-line test were added.

**Verification:** `logging-privacy.test.ts` (4 tests); `L-LOG-01`.

---

## What was deliberately not changed

| Area | Status |
|---|---|
| Emergency phrases, rule ids, rule order | unchanged; canonical `EMERGENCY_RULES` SHA-256 equals the base commit (`L-PHRASE-01`) |
| Clinical thresholds / safety semantics | unchanged; D-1/D-2 restore the documented matching rules |
| Question bank (`bank-v1.ts`, `bank-v2.ts`, loader, review CSV) | byte-for-byte unchanged (SHA-256 manifest) |
| Report v1.2 and `schema_version` | unchanged |
| Database schema / migrations / RLS | unchanged |
| Frontend / microphone / 112 screen | unchanged (separate worktree; read-only inspection only) |
| Gnani / Groq contracts | unchanged |
| Live providers / hosted infrastructure | not touched |
