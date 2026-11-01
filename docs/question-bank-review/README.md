# Question bank review package — `question-bank-v1`

**Status:** DRAFT. All 150 questions are `draft_owner_review`. Nothing here is clinically
validated and nothing may be presented to patients as clinically approved.

## What is in this folder

| File | Purpose |
|---|---|
| `question-bank-v1-review.csv` | 150 rows, one per stable question ID, generated from source |
| `README.md` | This guide |

## Who reviews what

| Column | Reviewer |
|---|---|
| `clinical_review_status`, `reviewer_comments`, `revision_notes` | Qualified clinician |
| `hindi_review_status` (and Hindi text/options) | Hindi-fluent reviewer |

Set a status to `approved` or `needs_revision` in your own copy. Do **not** edit the CSV in
place if it will be regenerated; record decisions in the tracking sheet and send them to the
maintainer, who applies changes to `bank-v1.ts` deliberately.

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
deno run --allow-read --allow-write scripts/export-question-bank.ts
deno run --allow-read scripts/export-question-bank.ts --check
```

`--check` prints the distribution, the pending/approved counts and fails on duplicate IDs,
missing English/Hindi, missing localized options, a version mismatch or a wrong count.

## Rules

- The script never edits the bank and never marks anything approved.
- Reviewer comments never change source questions automatically.
- The bank stays `draft_owner_review` until a named clinician and Hindi reviewer sign off.
