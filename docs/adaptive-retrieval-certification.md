# Adaptive Retrieval Certification

**Certified commit:** `feat/question-bank-integrity` (from `feat/backend` @ `e5d77e5`)
**Scope:** deterministic adaptive retrieval, candidate ranking, the 50 conversation-level
questions, persistence of accepted answers, and the three-question limit.
**Result:** **PASS** — 11 focused retrieval tests, 33/33 HTTP adaptive scenarios, and the
full release gate (22 PASS / 0 FAIL / 1 NOT TESTED).

---

## 1. Code under test

| File | Responsibility |
|---|---|
| `supabase/functions/_shared/intake/question-bank.ts` | expansion, validation, `retrieveCandidates()` |
| `supabase/functions/_shared/intake/select.ts` | `MAX_ADAPTIVE_QUESTIONS = 3`; constrained model selection with deterministic fallback |
| `supabase/functions/chat-turn/index.ts` | `maybeAdaptiveQuestion()`: department routing, tag/missing-field inputs, asked-id exclusion, Groq reservation, cap |
| `supabase/tests/adaptive.ts` | real HTTP + DB adaptive scenarios |

Retrieval is metadata-only and deterministic. There are no embeddings, no vector store and
no free-text generation.

Scoring rule (`retrieveCandidates`):

```
score = (2 × number of requested tags present in question.tags)
      + (1 if question.field is in missingFields)
```

Filters: department equality, not in `askedIds`, `score > 0`. Sort: score descending, then
question id ascending. Candidate ceiling: 8. The caller may ask at most 3 adaptive questions.

---

## 2. Focused tests

New file: `supabase/functions/_shared/intake/adaptive-retrieval.test.ts`.

| # | Requirement | Test | Result |
|---|---|---|---|
| 1 | Department relevance | every department returns only its own questions for a sample tag | PASS |
| 2 | Tag relevance | cardiology `chest` candidates all carry the `chest` tag | PASS |
| 3 | Missing-information relevance | a missing `clinical_details.severity` with no tags returns only severity questions | PASS |
| 4 | Ranking and candidate selection | fever + missing severity ranks `GM-003`, `GM-001`, `GM-002` (score then id) | PASS |
| 5 | Already-asked exclusion | asked ids are absent on the next retrieval | PASS |
| 6 | Duplicate exclusion | duplicate asked ids are harmless; returned ids are unique | PASS |
| 7 | Conversation-level fields | all **50** remain eligible when their own tags are relevant | PASS |
| 8 | Zero-candidate fallback | no tag match returns `[]`; `selectAdaptiveQuestion` returns `null` | PASS |
| 9 | Question eligibility | all **150** questions are reachable when their own tags are relevant | PASS |
| 10 | Three-question limit | `MAX_ADAPTIVE_QUESTIONS === 3`; HTTP suite proves no fourth question | PASS |

Additional pinned tests in the same area:

- neutral field scoring: with no tags and all report fields missing, only report-field
  questions are returned; the 50 conversation-level questions do **not** become eligible;
- fallback id is always inside the candidate set;
- 8-candidate ceiling;
- no model-supplied text: the model can only return an id from the candidate enum.

### 50 conversation-level questions

The test derives the report-field set and finds **50** questions whose `field` is outside
report v1.2. For each one it calls retrieval with every other question already asked; the
target must still be returned. This proves the unsupported-field questions are not silently
filtered out.

Field distribution: `context` 18, `functional_impact` 10, `lifestyle` 8,
`past_procedures` 5, `family_history` 3, `location` 3, `treatments_tried` 2,
`character` 1.

### Unsupported fields do not discard answers

Real-stack scenario (`supabase/tests/adaptive.ts`):

1. Fixed intake with concern **“fever pattern every evening”** and an unclear gender.
2. Retrieval selects **`GM-002`** (`clinical_details.context`, one of the 50).
3. The answer **“It comes and goes”** is accepted as turn 11.
4. `messages` contains a patient row with `question_id = GM-002` and that exact answer.

No report field is updated because `context` is conversation-level; the answer is preserved
as a conversation message by design.

### Previously accepted answers persist

After answering the three adaptive questions in the knee scenario, the HTTP test queries
`messages` with the service key and confirms **three** bank rows
(`ORTH-*` ids) are stored with their answers. The new certification scenario also confirms
the `GM-002` row persists.

### Three-question limit

`supabase/tests/adaptive.ts` drives adaptive questions until none remain:

- exactly **3** adaptive answers are accepted;
- a fourth bank question is never selected;
- three adaptive rows are persisted;
- the 15-answer limit is untouched (`turn_count` 10 → 11 → 12 → 13);
- emergency routing still bypasses adaptive selection entirely.

### No invention

- `selectAdaptiveQuestion` sends a JSON schema whose `question_id` enum is exactly the
  candidate ids; an id outside the set, extra fields or malformed JSON falls back.
- The fallback is `candidates[0]`, always an existing bank question.
- Zero candidates returns `null`; `chat-turn` then continues without an adaptive question.
- Model text is never used; `chat-turn` reads the approved English/Hindi from the bank.

---

## 3. Execution results

```bash
deno test --allow-read --allow-env supabase/functions/
# 194 passed, 0 failed

deno test --allow-read --allow-env \
  supabase/functions/_shared/intake/adaptive-retrieval.test.ts
# 11 passed, 0 failed

deno run --allow-net --allow-env --allow-read supabase/tests/adaptive.ts
# 33/33 adaptive scenarios passed

deno run --allow-all scripts/release-check.ts
# 22 PASS, 0 FAIL, 0 BLOCKED, 1 NOT TESTED
# integration 52/52, adaptive 33/33, identities created=21 deleted=21
```

The release gate also passed: 194 unit tests, bank validation, CSV integrity, 17 contract
fixtures, database 29/29, seven SQL suites, migration rehearsal 29/29, deploy preflight,
demo preflight and reset self-test.

---

## 4. Preserved behaviour

| Invariant | Evidence |
|---|---|
| `BANK_VERSION = question-bank-v2` | bank test and integrity verifier |
| v1 rollback bank available | `bank-v1.ts`, 150 raw questions, version `question-bank-v1` |
| `GM-002` options unchanged | explicit bank test and full CSV comparison |
| 15-answer limit unchanged | turn counts in HTTP scenarios |
| Emergency precedence unchanged | emergency scenario bypasses retrieval |
| Doctor conversation-reader compatibility | messages remain patient rows with `question_id`, `original_text`, `final_text`, `input_mode`, `turn_index`; no schema change |
| No new clinical content | 150 ids/texts/options unchanged |

---

## 5. Remaining limitations / defects

1. **The local Groq stub cannot exercise model selection.** `supabase/tests/stub-providers.ts`
   always returns a department object, so the adaptive HTTP suite exercises the deterministic
   fallback. Model acceptance/rejection is covered by unit tests with controlled Groq
   responses; live Groq remains **NOT TESTED**.
2. **Retrieval is lexical, not semantic.** Tags come from concern words longer than three
   characters; a concern that shares no tag with a question yields zero candidates and no
   adaptive follow-up. This is by design, not a defect, and is covered by the zero-candidate
   test.
3. **Field-namespace validation is intentionally permissive.** `validateBank()` accepts any
   `clinical_details.[a-z_]+` as a conversation-level field (Option 3). A typo in a future
   CSV could therefore be accepted as conversation-level; the CSV integrity check is the
   control against accidental field changes.
4. **No clinical approval is implied.** Questions remain `draft_owner_review`; the adaptive
   suite proves routing and persistence, not clinical validity.
5. **The doctor reader shows answers, not questions.** The messages table stores no
   assistant question text; the UI labels core ids and displays bank ids. This is unchanged
   and documented in `docs/frontend-backend-contract-map.md`.
