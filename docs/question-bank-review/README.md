# Question bank review package

**Status:** DRAFT. All 150 questions remain `draft_owner_review` at the bank level. Nothing
here is clinically validated and nothing may be presented to patients as clinically
approved.

## What is in this folder

| File | Purpose |
|---|---|
| `question-bank-v2-reviewed.csv` | The owner-supplied v2 source: 150 rows with wording, options, tags, report fields and reviewer comments/revision notes |
| `question-bank-v1-review.csv` | Generated v1 reviewer template; wording/options only, review columns intentionally blank/pending |
| `README.md` | This guide |

`question-bank-v2-reviewed.csv` is the integrity source of truth for `bank-v2.ts`. It was
supplied by the owner and is reproduced byte-for-byte except that the verifier strips the
UTF-8 BOM when reading. Do not regenerate this file from the TypeScript module: that would
destroy the reviewer metadata.

## Who reviews what

| Column | Reviewer |
|---|---|
| `clinical_review_status`, `reviewer_comments`, `revision_notes` | Qualified clinician |
| `hindi_review_status` (and Hindi text/options) | Hindi-fluent reviewer |

Set a status to `approved` or `needs_revision` in your own copy. Do **not** edit the CSV in
place if it will be regenerated; record decisions in the tracking sheet and send them to the
maintainer, who applies changes to `bank-v2.ts` deliberately.

## What to check (clinical)

1. The question asks for history only — no diagnosis, probability, prescription or advice.
2. It does not lead the patient toward an answer or use alarming wording.
3. It is appropriate for the department and is not a duplicate of another question.
4. The report field it fills (`report_field`) is the right place for the answer.
5. Answer type and options make sense (`free_text`, `yes_no`, `single_choice`).

## What to check (Hindi)

1. Natural, conversational Hindi a patient would actually speak — not literal translation.
2. Common English medical words may stay in Latin script (Hinglish) when that is clearer.
3. Every option label is translated and unambiguous.
4. The Hindi question asks the same thing as the English one; nothing added or dropped.

## Reproducing and validating

```bash
# Exact CSV ↔ active-bank integrity (all 150 rows, every column)
deno run --allow-read scripts/verify-question-bank-integrity.ts

# Structural bank validation and distribution
deno run --allow-read --allow-write scripts/export-question-bank.ts --check
```

The integrity verifier fails on any changed question ID, department, topic/tags, English or
Hindi wording, report field, answer type, option value/label/order, review status, comment
or revision note. It also fails if a bank row is missing from the CSV or the CSV contains an
unknown row. It is part of the release gate.

## Rules

- The scripts never edit the bank and never mark anything approved.
- Reviewer comments never change source questions automatically.
- The bank stays `draft_owner_review` until a named clinician and Hindi reviewer sign off.
- `GM-002` is a pinned regression example: its supplied bilingual options must remain
  `constant: Constant/लगातार` and `intermittent: Comes and goes/आता-जाता है`.
