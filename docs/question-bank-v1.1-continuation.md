# Question bank v1.1 — continuation record (NOT completed)

**Status: BLOCKED — INSUFFICIENT SESSION CAPACITY. No content was authored or changed.**

This file exists so the next session can finish the work without re-deriving it. It
deliberately contains **no invented questions and no Hindi corrections**: fabricating
clinical content or claiming a 150-entry language audit that was not performed would be
worse than stopping.

The bank is untouched at `question-bank-v1`, 150 questions, all `draft_owner_review`.

---

## 1. Verified baseline (measured, not assumed)

```
version question-bank-v1
total   150
per-department: general_medicine 30 · orthopedics 30 · general_surgery 30
                dermatology 30 · cardiology 30
distinct topics 139
distinct tags   145
review statuses ["draft_owner_review"]
```

Relevant existing tags (only these touch the requested gap areas):

```
dizziness, headache, numbness, sleep, stress, weakness, onset, duration,
frequency, impact, pain
```

### What this already tells us

| Requested gap | Existing coverage signal | Assessment |
|---|---|---|
| Headaches (recurring/persistent) | tags `headache`, `headache-pattern` | **partial** — pattern exists, but onset/frequency/functional-impact depth is likely thin |
| Sleep / insomnia | tag `sleep`, `sleep-impact`, `snoring`, `night-breath` | **partial** — sleep appears as a *cardiac/orthopaedic* modifier, not as a primary complaint |
| Stress / mental wellbeing | tag `stress`, `work-load` | **weak** — no mental-wellbeing question set; and any crisis screening is blocked pending a clinical safety policy |
| Hand / finger pain | none | **gap confirmed** |
| Numbness / weakness | tags `numbness`, `weakness` | **partial** — likely neurological-adjacent, not a dedicated cluster |
| Neurological + stroke warning signs | tags `dizziness`, `vision`, `speech`, `seiz` appear only partly | **gap in the bank**; the deterministic emergency matcher already covers stroke phrases |
| Pain location/onset/duration/frequency/impact | tags `location`, `onset`, `duration`, `frequency`, `impact`, `pain-pattern`, `pain-severity` | **structurally covered** — expansion should reuse these fields rather than invent new ones |
| Symptoms outside the five departments | — | **gap confirmed**; the routing layer has no sixth department, so such questions must map to an existing report field |

**Do not treat this table as the finished coverage audit.** It is a tag-level screen. A real
audit requires reading all 150 `en`/`hi` pairs and recording, per requested gap, which
specific questions do or do not cover it.

---

## 2. Exact plan for the next session

1. **Read `supabase/functions/_shared/intake/bank-v1.ts` in full** (150 entries) and produce
   `docs/question-bank-v1.1-coverage-report.md` — one row per requested gap area with the
   specific existing IDs that cover it and the specific missing facets.
2. **Author only what the audit justifies**, targeting ~50 but explicitly allowing fewer.
   Hard rules:
   - never reuse or renumber an existing ID; new IDs continue the per-department sequence
     (`GM-031…`, `ORTH-031…`, `SURG-031…`, `DERM-031…`, `CARD-031…`) or use a new prefix only
     with owner approval;
   - each question maps to an existing `report.field` (`primary_concern`,
     `clinical_details.{duration,severity,conditions,medications,allergies,other_symptoms}`)
     — no new report fields, no schema change;
   - no diagnosis, cause attribution, probability, prescription or treatment advice;
   - **no** statement linking a headache to blood pressure, or stress to any disorder;
   - no mental-health crisis screening until a qualified clinical safety policy exists.
3. **Bump the bank version to `question-bank-v1.1`** via a new module (e.g.
   `bank-v1.1.ts`) with v1 retained unchanged, so existing sessions and tests stay stable.
   Update `BANK_VERSION` consumers and `docs/integration-contract.md`.
4. **Hindi audit of all 150 existing + new entries.** For each: Devanagari spelling, matras,
   punctuation, natural conversational register, correct medical terminology, read-aloud
   pronunciation, meaning equivalence, absence of Romanised Hinglish. Output
   `docs/question-bank-v1.1-language-audit.md` as a correction register with three columns:
   **original → proposed → reason** (plus the ID and section). Nothing is auto-approved.
5. **Stroke-language expansion:** add English and Hindi variants to the deterministic
   emergency matcher for existing stroke warning signs, and extend `safety.test.ts`. The
   matcher must keep precedence over adaptive selection.
6. **Retrieval tests:** department relevance, missing-field relevance, ranking, exclusion of
   already-asked IDs, and the documented fallback when no candidate is relevant. Keep the
   3-adaptive-question cap and the 15-answer limit.
7. **Artifacts:** `question-bank-v1.1-review.csv` (exported through
   `scripts/export-question-bank.ts`, never hand-written), the language audit, the coverage
   report.
8. **Validation:** `deno test`, `scripts/export-question-bank.ts --check`,
   `scripts/question-bank-status.ts`, `supabase/tests/adaptive.ts`, then
   `scripts/release-check.ts`.

---

## 3. Capacity note

The remaining session budget was exhausted by the preceding release engineering. Writing
~50 bilingual clinical questions and auditing 150 Hindi strings requires substantially more
context than remained, and partial output would be worse than none: an unreviewed Hindi string
reaches a patient through text-to-speech.

**No files were modified. No questions were added. No Hindi corrections were proposed.**
The bank, its tests and the 150-entry CSV export are exactly as they were.

## 4. Blocks that are not engineering blocks

- Mental-health crisis screening: **BLOCKED — OWNER/CLINICAL** until a safety policy exists.
- Clinical approval of any new or revised question: **BLOCKED — OWNER/CLINICAL**.
- Hindi sign-off: **BLOCKED — OWNER/CLINICAL REVIEW**.
