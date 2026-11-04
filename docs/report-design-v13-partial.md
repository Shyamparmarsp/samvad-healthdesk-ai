# Report contract v1.3 — non-emergency partial reports

Status: **implemented**, additive to v1.2 (`docs/report-design.md`). Owner-authorised
4 November 2026. Nothing in v1.2 changes; existing reports stay readable as they are.

## What v1.2 could not represent

Report schema v1.2 has three report statuses: `draft`, `submitted`, `urgent_partial`.
There was no non-emergency status for "the patient finished early and sent what they have":

- `urgent_partial` is emergency-only (`reports_emergency_rule_scope` requires an
  `emergency_rule_id`) **and** is the sole urgent-queue predicate, so it cannot host a
  routine partial report.
- `submitted` means a completed intake and unlocks routine booking under the completion
  contract (§8), which forbids sending an incomplete intake.
- `draft` is invisible to doctors by design.

## What v1.3 adds

One new `report_status` value: **`partial`**.

- `partial` reports are sent to the assigned doctor and are routine (bookable).
- `urgent_partial` keeps its exact meaning and stays the only urgent-queue status.
- The JSON document is **unchanged** (`schema_version: 1`, every v1.2 field with the same
  meaning and the same value/status invariant). No field was added, renamed or remapped.
- The report *contract version* is v1.3 because the status set changed.

## Semantics

| Aspect | Behaviour |
|---|---|
| Eligibility | At least **3 distinct accepted answers**, enforced server-side (`acceptedAnswerCount`). Rejected, empty, duplicate and unanswered submissions never count. |
| Creation | Only after explicit confirmation of the preview. `submit_report` with `partial: true` sends; `partial: true, preview: true` returns the document without writing anything. |
| Status | `partial`. Never `urgent_partial`, never `submitted`. |
| `submitted_at` | Required (same as `submitted`). |
| `possible_urgent` | Always `false`. A deterministic emergency never produces a partial report. |
| `needs_human_review` | Left at its default `false`: a partial report is not an unresolved emergency ambiguity. |
| Summary | Deterministic template of provided facts only. `null` when nothing is reportable — never invented narrative. |
| Unanswered fields | Keep their explicit status (`not_asked`, `not_provided`, `unknown`, `unclear`, `declined`) with `value: null`, and are listed in `missing_information`. |
| Doctor visibility | The same assignment policy as `submitted`, plus the documented emergency cross-visibility. No new grant or role. |
| Doctor UI | `PARTIAL INTAKE` badge in the list, "Partial intake" in the dashboard, and an explicit banner in the detail view. |
| Booking | Allowed through the existing `get_available_slots` / `book_appointment` RPCs, with the existing emergency, department and review-hold refusals. |
| Immutability | `reports_guard_terminal` is unchanged: any non-draft row is frozen except review columns. |
| Urgent queue | Predicate unchanged: `status = 'urgent_partial'`. A partial report can never match. |

## Migration

1. `20261104083816_report_status_partial.sql` — `alter type public.report_status add value
   if not exists 'partial'`. Its own transaction because a new enum value cannot be used in
   the transaction that adds it.
2. `20261104083818_partial_reports_v13.sql` — widens `reports_status_submitted_at` to
   `submitted or partial`, re-creates `reports_doctor_read` with `partial`, and re-creates
   `get_available_slots` / `mark_report_reviewed` with the same guards plus `partial`.

Both are additive. No row is rewritten, no column is dropped, no privilege is broadened and
`urgent_partial` semantics are byte-identical.

## Not represented, on purpose

- A partial report is **not** a clinical clearance and is not a completed assessment.
- Unanswered information is **not** a negative finding: the doctor sees "not asked" /
  "not provided" with an explicit pending-in-person-review banner.
- No diagnosis, probability, treatment, vital sign or history is inferred.
