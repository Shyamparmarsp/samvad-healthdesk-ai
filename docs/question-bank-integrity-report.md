# Question-Bank Source Integrity Report

**Certified commit:** `feat/question-bank-integrity` (created from `feat/backend` @ `e5d77e5`)
**Scope:** the owner-reviewed CSV versus the active `question-bank-v2` implementation.
**Result:** **PASS** — all 150 rows and every supplied field match exactly. No question,
option, status, comment or revision note was changed.

---

## 1. Source provenance (important finding)

At the start of this task the repository contained only:

```
docs/question-bank-review/question-bank-v1-review.csv
```

That file is **generated** by `scripts/export-question-bank.ts` and hardcodes
`clinical_review_status = pending`, `hindi_review_status = pending`, and blank
`reviewer_comments` / `revision_notes` (see `scripts/export-question-bank.ts`, `row()`).
It is a reviewer template, not the owner-reviewed source. Comparing `bank-v2.ts` against it
would falsely report every review field as changed.

The actual owner source is `/Users/shyamparmar/Downloads/question-bank-v2-reviewed.csv`
(150 rows, UTF-8 with BOM, supplied 2 November 2026), referenced by
`supabase/functions/_shared/intake/bank-v2.ts` and
`docs/question-bank-v2-integration-blockers.md`.

It has now been vendored byte-for-byte as:

```
docs/question-bank-review/question-bank-v2-reviewed.csv
SHA-256 2ee525af946cee725beb6e4d7265c7afc3d6dfcf36deef3ed4e98b3e8a6b3168
```

The checksum is identical to the owner file. The only read-time transformation is removal
of the leading UTF-8 BOM; no wording, option, tag, status, comment or note is normalised or
rewritten.

---

## 2. What is compared

`scripts/verify-question-bank-integrity.ts` parses the CSV (quoted fields, escaped quotes,
embedded commas, CRLF, BOM) and compares every row against `QUESTIONS` and
`REVIEW_RECORDS`:

| CSV column | Bank source | Comparison |
|---|---|---|
| `question_id` | `QUESTIONS[].id` | exact; unique; one row per bank id |
| `department` | `QUESTIONS[].department` (prefix-derived) | exact |
| `tags` | `QUESTIONS[].tags` (`topic.split("-")`) | exact array |
| topic | `QUESTIONS[].topic` | derived `tags.join("-")`, exact |
| `english_question` | `QUESTIONS[].en` | exact character-for-character |
| `hindi_question` | `QUESTIONS[].hi` | exact character-for-character |
| `report_field` | `QUESTIONS[].field` | exact |
| `answer_type` | `QUESTIONS[].answerType` | exact |
| `english_options` + `hindi_options` | `QUESTIONS[].options` | value, English label, Hindi label and order all exact |
| `clinical_review_status` | `REVIEW_RECORDS[][1]` | exact |
| `hindi_review_status` | `REVIEW_RECORDS[][2]` | exact |
| `reviewer_comments` | `REVIEW_RECORDS[][3]` | exact, including embedded quotes/commas and long text |
| `revision_notes` | `REVIEW_RECORDS[][4]` | exact |

The script also fails if:

- the header is different;
- a row has the wrong column count;
- a CSV id is duplicated or absent from the bank;
- a bank question is missing from the CSV;
- a review record has no bank question;
- the bank version is not `question-bank-v2`;
- the bank or CSV does not contain 150 questions/rows;
- the v1 rollback bank is not `question-bank-v1` with 150 raw questions.

It exits `1` on any mismatch, `2` on an unreadable/invalid CSV, and `0` only on a complete
match.

---

## 3. Results

| Check | Result |
|---|---|
| CSV rows | **150** |
| Active questions | **150** (`question-bank-v2`) |
| Unique question IDs | **150** |
| Departments | **6 × 30** (general medicine, orthopedics, general surgery, dermatology, cardiology) |
| Review records | **150** |
| `free_text` / `yes_no` / `single_choice` | **16 / 116 / 18** |
| Questions with supplied options | **18** (all value/label/order pairs matched) |
| Conversation-level questions | **50**, across 8 fields outside report v1.2 |
| Clinical review status | **150 `pending`** |
| Hindi review status | **150 `assistant_reviewed`** |
| Non-empty reviewer comments | **150** matched |
| Non-empty revision notes | **150** matched |
| v1 rollback bank | **150 questions**, `question-bank-v1` |
| Wording changes | **0** |
| Option changes | **0** |
| Metadata changes | **0** |

Conversation-level field distribution (the Option 3 pool):

| Report field | Questions |
|---|---:|
| `clinical_details.context` | 18 |
| `clinical_details.functional_impact` | 10 |
| `clinical_details.lifestyle` | 8 |
| `clinical_details.past_procedures` | 5 |
| `clinical_details.family_history` | 3 |
| `clinical_details.location` | 3 |
| `clinical_details.treatments_tried` | 2 |
| `clinical_details.character` | 1 |
| **Total** | **50** |

Pinned option example — `GM-002`:

```
English: constant: Constant | intermittent: Comes and goes
Hindi:   constant: लगातार | intermittent: आता-जाता है
Field:   clinical_details.context
```

---

## 4. Reusable verification

```bash
# Defaults to docs/question-bank-review/question-bank-v2-reviewed.csv
deno run --allow-read scripts/verify-question-bank-integrity.ts

# Explicit path (e.g. a fresh owner copy during review)
deno run --allow-read scripts/verify-question-bank-integrity.ts --csv <path>

# Same via the documented environment variable
BANK_REVIEW_CSV=<path> deno run --allow-read --allow-env scripts/verify-question-bank-integrity.ts
```

The check is now part of `scripts/release-check.ts` as:

```
PASS question bank source integrity (CSV ↔ bank) — 150 CSV rows match the active bank
```

`BANK_REVIEW_CSV` is optional; the verifier runs with `--allow-read` alone against the
vendored file.

---

## 5. Remaining limitations / defects

1. **The older v1 CSV is still a generated template.** It intentionally has blank comments
   and pending statuses. It must not be used as the integrity source. The v2 owner CSV is now
   committed for that purpose.
2. **`scripts/question-bank-status.ts` still defaults to the v1 template.** It reports
   reviewer progress from that template, not the owner metadata (`assistant_reviewed` is not
   one of its approved/needs-revision/pending buckets). Use the integrity verifier for source
   provenance; changing the reviewer dashboard's status model is out of scope for this task.
3. **No clinical approval is claimed.** All clinical statuses are `pending`; the Hindi
   statuses are `assistant_reviewed`, not clinician-approved. `validateBank()` still marks
   every question `draft_owner_review`.
4. **BOM handling is the only transformation.** If a future owner copy uses different
   quoting/line endings, the parser still accepts RFC-4180 quoting and CRLF; it does not
   trim or normalise field content.

No question was added, removed, reworded, re-optioned or re-statused by this task.
