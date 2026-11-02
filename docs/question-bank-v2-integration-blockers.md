# question-bank-v2-reviewed.csv — integration blockers

Source: `/Users/shyamparmar/Downloads/question-bank-v2-reviewed.csv` (150 rows, supplied by
the owner as the source of truth). **Nothing was integrated.** Two technical blockers make a
naive import unsafe; both need a decision, not more analysis.

## B-1 — UTF-8 BOM corrupts the ID column (fixable, mechanical)

The header begins `\ufeffquestion_id`. Any reader that does not strip the BOM sees no
`question_id` column, so every row's ID is empty. `scripts/import-question-bank-review.ts`
and `scripts/export-question-bank.ts --check` would therefore fail or mis-key all 150 rows.

Fix: strip the BOM on read (`lstrip("\ufeff")`). No content change. This one I can fix
without a decision.

## B-2 — 8 distinct unsupported report fields across 50 questions

The reviewed bank uses 14 distinct `report_field` values. `ReportDocumentV1.clinical_details`
defines exactly six: `duration`, `severity`, `conditions`, `medications`, `allergies`,
`other_symptoms`.

Unknown fields in the CSV:

| Field | Questions |
|---|---|
| `clinical_details.context` | 18 |
| `clinical_details.functional_impact` | 10 |
| `clinical_details.lifestyle` | 8 |
| `clinical_details.past_procedures` | 5 |
| `clinical_details.family_history` | 3 |
| `clinical_details.location` | 3 |
| `clinical_details.treatments_tried` | 2 |
| `clinical_details.character` | 1 |
| **Total** | **50** |

Why this blocks a silent import: `answerQuestionIdFor()` maps a bank question's `field` to a
core question through `questionForField(field)`. For an unknown field that returns `null`, so
`parseAnswer` is skipped and `applyAnswer` never runs. The patient's answer would still be
stored as a message and would still consume a turn, but **it would never reach the report** —
50 of 150 questions would appear to work while silently contributing nothing.

**Count correction (owner request, verified):** there are **8** distinct unsupported
fields across **50** questions. The earlier prose said "seven" and a summary said "51" —
both were wrong; the table above is now authoritative.

Three options, all with consequences:

1. **Extend `ReportDocumentV1.clinical_details` with the seven new fields.** Changes report
   v1.2 → v1.3: schema, doctor view, PDF/report rendering, `CORRECTABLE_FIELDS`, missing-
   information logic and the 17 contract fixtures. Largest change, highest fidelity to the
   reviewed content.
2. **Map each new field onto the nearest existing field** (e.g. `context`/`character`/
   `location` → `other_symptoms`, `functional_impact` → `severity`, `family_history`/
   `past_procedures`/`treatments_tried` → `conditions`). No schema change, but semantically
   lossy: a "pattern" answer would be stored as an "other symptom".
3. **Keep the fields as bank metadata only** (accept that those 51 answers inform the
   conversation but not the structured report), documented as a limitation.

I did not choose one, because each changes clinical output or the doctor-facing report
contract, and that is an owner/product decision.

## What is verified

```
rows            150
departments     30 each (general_medicine, orthopedics, general_surgery, dermatology, cardiology)
answer types    yes_no 116 · single_choice 18 · free_text 16
review columns  clinical_review_status, hindi_review_status, reviewer_comments, revision_notes present
duplicate IDs   none once the BOM is stripped
```

Existing bank is untouched (`question-bank-v1`, 150 entries, all `draft_owner_review`).
No content was rewritten, no question was added, no Hindi audit was repeated.

## Next step

Owner chooses option 1, 2 or 3 for B-2. Then: strip the BOM, emit `bank-v2.ts` from the CSV
with wording/options/comments/notes preserved verbatim, bump `BANK_VERSION`, run `deno test`,
`export-question-bank.ts --check`, `adaptive.ts` and the release gate. v1 stays in Git for
recovery.

---

## Owner decision (Option 3) and the remaining technical step

**Decided:** Option 3 — keep the existing report schema unchanged, do not map unsupported
fields to unrelated ones, accept that answers to those 50 questions stay at conversation
level and are visible to the doctor through the conversation messages (which the doctor view
already reads via the `messages_doctor_read` RLS policy and the report detail screen).

Two mechanical steps remain, and one of them is **not** purely mechanical:

1. **CSV → `RAW_QUESTIONS` module (mechanical).** Strip the BOM, emit
   `bank-v2.ts` with the same tuple shape used by `bank-v1.ts`, change the single import in
   `question-bank.ts` from `./bank-v1.ts` to `./bank-v2.ts`, and bump `BANK_VERSION`.
   `bank-v1.ts` stays in the tree, so rollback is `git revert` of one file plus one import.

2. **Owner-specified option wording needs a tuple extension (blocked, small but real).**
   `bank-v1.ts` stores only `[id, topic, en, hi, field, answerType]`; the option labels are
   derived from a hardcoded per-topic table (`optionsFor(topic, answerType)`). The reviewed
   CSV carries its own option text, e.g. `GM-002`:
   `constant: Constant | intermittent: Comes and goes` (Hindi: `constant: लगातार | intermittent: आता-जाता है`).
   Importing through the existing tuple would **silently replace the owner's wording** with
   the topic table's wording — exactly what the instruction forbids.

   Required change: extend `RawQuestion` with an optional seventh element carrying the
   `{ value, en, hi }[]` options, and make `expand()` prefer it over `optionsFor()`. That is
   a contained change in `bank-v1.ts`'s type surface plus `expand()` in `question-bank.ts`,
   but it must be done and verified against `localizedOptions()` and the adaptive tests before
   the bank is switched over. It was not completed here.

**Do not switch `question-bank.ts` to `bank-v2.ts` until step 2 is done**, or 18 single_choice
questions will silently carry v1 option text instead of the reviewed text.

Bank currently shipping: `question-bank-v1`, unchanged, all tests passing.
