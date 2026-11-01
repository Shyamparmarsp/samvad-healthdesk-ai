# Report Design — Patient Intake Report Contract

**Document status:** owner-authorised reconstruction of a file that was missing from the repository and never committed. The requirement set below is derived only from `AGENTS.md`, `MILESTONES.md`, `docs/architecture-decisions.md`, `docs/demo-emergency-rules.md`, `docs/demo-seed-data.md` and `docs/failure-modes.md`. Choices that the source documents do not settle are marked and must be approved by the project owner.

**Document version:** 1.2 · **Report `schema_version`:** 1
**Last updated:** 1 November 2026

**Owner approvals recorded on 1 November 2026 (v1.1):** RD-01 (`provided` is the sixth information-status value), RD-02 (value/status invariant), RD-06 (the "Prefer not to say" → `declined` gender mapping, retained), RD-10 (`urgent_partial` carries no generated summary, retained), RD-17 (`reviewed_by` stores the authenticated doctor identity), RD-22 (relational/JSONB authority split). All other PROPOSED and OWNER APPROVAL REQUIRED items remain open and are listed in §21.
**Precedence:** `AGENTS.md` > `docs/*` > `MILESTONES.md` (sequencing) > `README.md`. Where this file and `AGENTS.md` disagree, `AGENTS.md` wins and this file must be corrected.

## Conventions used in this document

| Marker | Meaning |
|---|---|
| **SOURCE-DEFINED** | Required by an existing project document. Not negotiable here. |
| **PROPOSED** | A reconstruction choice where the source documents are silent. Safe to implement only after owner approval. |
| **OWNER APPROVAL REQUIRED** | A specific decision blocking schema, types or acceptance. Listed in §21. |
| **BLOCKED** | Cannot be specified from available information. Implementation must not guess. |

## Scope and non-negotiables — SOURCE-DEFINED

- This is an educational demonstration. Synthetic patients, fictional doctors, fictional schedules only.
- A report records **what the patient said**. It never contains a diagnosis, a disease probability, a risk or triage score, a prescription, a treatment or self-care recommendation, a vital sign, or any history the patient did not state.
- Reports are always written in **English**. The patient interface is Hindi/English; the doctor interface is English only.
- Patient-reported facts, the generated summary and the missing-information list are three distinct things and must remain visually and structurally separate.
- The backend owns report generation, completion validation, routing and status. The browser never writes a report.
- Every field ends with an information status. Missing information stays explicit; a blank is never silently equivalent to "none".
- A deterministic demo emergency rule takes precedence over everything in this document: it stops routine intake, produces an `urgent_partial` report, and suppresses routine booking permanently.

## 1. Report status enum — SOURCE-DEFINED

A report has exactly one status, from a closed set of three values.

| Value | Meaning |
|---|---|
| `draft` | Generated but not submitted by the patient. Private to the owning patient identity; never visible to any doctor. |
| `submitted` | The patient explicitly submitted it. Visible to the assigned doctor. May be eligible for routine booking, subject to the hold rules in §13. |
| `urgent_partial` | Produced by a deterministic emergency trigger from the answers received so far. Visible to the Emergency doctor and the General Medicine demo doctor. Permanently ineligible for routine booking. |

**No other report status exists.** There is no `reviewed`, `partial`, `partial_submitted`, `cancelled`, `expired`, `ended` or `completed` report status. In particular:

- **Mark Reviewed does not change the status.** It writes two review fields only (§17).
- **"Don't submit"** does not change the status. The report stays `draft`, private, and ends with the session.
- An incomplete intake at the 15-answer-turn cap produces no report status change and no submission path.

## 2. Session status enum — PROPOSED (separate from report status)

Session lifecycle is tracked on the intake session, never copied into `report.status`. Report status and session status are **different enums with different allowed values** and must not share a type.

| Session status | Meaning |
|---|---|
| `created` | Session created, no consent decision yet. |
| `consented` | Consent given, no answer yet. |
| `declined` | Consent refused. No health data collected, no report created. |
| `in_progress` | Answers being collected. |
| `emergency` | Deterministic emergency path taken; routine intake stopped. |
| `ended` | Session closed without submission (for example "Don't submit", or the incomplete-at-cap End action). |
| `submitted` | The report was submitted. |

Naming of these values is **PROPOSED**; the separation from report status is **SOURCE-DEFINED**. A session may be `ended` while its report is `draft`; a session may be `submitted` with a report `submitted`; an `emergency` session has an `urgent_partial` report.

## 3. Information status enum — SOURCE-DEFINED values; `provided` approved; triggers still PROPOSED

`AGENTS.md` requires every field to end with an information status and names five missing-value states: `not_provided`, `unknown`, `declined`, `unclear`, `not_asked`. A sixth value is required so that an answered field also carries a status.

| Status | Meaning | `value` | Source |
|---|---|---|---|
| `provided` | The patient gave a usable answer. | non-null | **SOURCE-DEFINED — approved 1 Nov 2026 (RD-01)** |
| `declined` | The patient explicitly chose not to answer. | `null` | **SOURCE-DEFINED** for gender ("Prefer not to say" is recorded as status `declined` with no value); **PROPOSED** extension to other optional fields |
| `unknown` | The patient says they do not know or cannot recall. | `null` | **SOURCE-DEFINED** value; trigger wording **PROPOSED** |
| `unclear` | An answer was given but could not be reliably interpreted. | `null` | **SOURCE-DEFINED** value; trigger **PROPOSED** |
| `not_provided` | The field was applicable, no usable answer was captured, and the patient made no explicit choice. | `null` | **SOURCE-DEFINED** value; trigger **PROPOSED** (RD-03) |
| `not_asked` | The question was never reached. | `null` | **SOURCE-DEFINED** value; used for `urgent_partial`, the 15-turn cap and early session end |

**Distinctions (PROPOSED — RD-03):**

- `declined` is a **patient choice**. `unknown` is a **gap the patient acknowledged**. `not_provided` is an **absence on our side** with neither a choice nor an acknowledged gap.
- `unclear` means an answer existed but was unusable. It is not a synonym for "never answered".
- `not_asked` is never applied to a field that was actually asked.

**Value invariant — approved 1 Nov 2026 (RD-02):** `value` is non-null **if and only if** `status = "provided"`. All other statuses carry `null`. The verbatim patient text is not duplicated into the report; it remains in the conversation (`messages`) and is visible to the doctor through the conversation view. Validation must reject any field object that violates this invariant, in the request path and in the report builder.

**Allowed statuses per field (PROPOSED):** all six values are legal for every clinical field. Completion rules (§8) — not the field definition — decide which statuses satisfy intake. This keeps validation closed without multiplying enum variants.

**Display strings:** only `not_provided` → "Not provided" is source-defined. Strings for `declined`, `unknown`, `unclear` and `not_asked` are **OWNER APPROVAL REQUIRED** (RD-13).

## 4. Field value model — SOURCE-DEFINED

Every clinical field is stored as an object, never a bare scalar:

```
{ "status": "<status>", "value": <string | number | string[] | null> }
```

## 5. Report document shape — approved structure (RD-22)

The report has two representations that must not be confused.

**Relational columns on `reports`** hold everything that state, filtering, ownership or authorization depends on: identity, status, routing ids, flags, reference, timestamps, review fields, `schema_version`.

**The versioned JSONB document (`reports.report`)** holds the clinical content snapshot: patient fields, primary concern, clinical details, the derived missing list, the summary, display-label snapshots and the emergency statement.

**Authority rule — approved 1 Nov 2026 (RD-22):** the JSONB document is **never** authoritative for `status`, flags, department, doctor, reference, timestamps or review fields. Those are read from columns. The JSONB may carry immutable display labels (`department_name`, `doctor_name`) so the report still reads correctly if a doctor record is later renamed. A reader must never derive a status, a flag, a doctor or a reference from the JSONB, and must never write one there.

```json
{
  "schema_version": 1,
  "patient": {
    "name":     { "status": "provided", "value": "Asha Test" },
    "age":      { "status": "provided", "value": 34 },
    "gender":   { "status": "provided", "value": "female" },
    "language": "en"
  },
  "primary_concern": { "status": "provided", "value": "knee pain when walking" },
  "clinical_details": {
    "duration":       { "status": "provided", "value": "about 3 weeks" },
    "severity":       { "status": "provided", "value": "moderate, worse in the evening" },
    "conditions":     { "status": "provided", "value": ["high blood pressure"] },
    "medications":    { "status": "declined", "value": null },
    "allergies":      { "status": "unknown",  "value": null },
    "other_symptoms": { "status": "provided", "value": ["mild swelling"] }
  },
  "missing_information": ["medications", "allergies"],
  "summary": {
    "text": "Patient reports knee pain when walking for about three weeks, described as moderate and worse in the evening. Also reports mild swelling, and one existing condition: high blood pressure.",
    "source": "template",
    "generated_from": ["primary_concern", "duration", "severity", "other_symptoms", "conditions"]
  },
  "routing_snapshot": {
    "department_key": "orthopedics",
    "department_name": "Orthopedics",
    "doctor_id": "00000000-0000-0000-0000-000000000000",
    "doctor_name": "Dr. Kabir Mehta",
    "is_fallback": false,
    "preliminary": true
  },
  "emergency": null
}
```

All values above are synthetic. `summary.text` restates only `provided` fields and adds nothing.

## 6. Field reference

### 6.1 Relational columns

| Field | Type | Description | Required | Patient-editable | Doctor-visible | Applies to `urgent_partial` | Source |
|---|---|---|---|---|---|---|---|
| `reports.id` | uuid | Primary key, server-generated | yes | no | as route parameter only, not displayed | yes | SOURCE-DEFINED |
| `reports.session_id` | uuid | Owning session; `UNIQUE` (one report per session) | yes | no | join key only | yes | SOURCE-DEFINED |
| `reports.user_id` | uuid | Patient `auth.uid()`; used for every ownership filter | yes | no | **no** | yes | SOURCE-DEFINED (ownership) |
| `reports.status` | enum `draft｜submitted｜urgent_partial` | Report state | yes | **no** | yes | always `urgent_partial` | SOURCE-DEFINED |
| `reports.schema_version` | integer | JSON document version; `1` today | yes | no | no | yes | PROPOSED |
| `reports.department_key` | enum (six seeded keys) | Preliminary department | yes | no | yes | `emergency` | SOURCE-DEFINED |
| `reports.doctor_id` | uuid | Assigned doctor | yes | no | yes | Emergency doctor | SOURCE-DEFINED |
| `reports.intake_reference` | text, `UNIQUE` | Server-generated reference | yes | no | yes | yes | SOURCE-DEFINED (existence); format PROPOSED (RD-19) |
| `reports.possible_urgent` | boolean, default false | Supplementary model flag | yes | **no** | yes | false | SOURCE-DEFINED |
| `reports.needs_human_review` | boolean, default false | Unresolved ambiguity flag | yes | **no** | yes | false (the urgent path already fired) | SOURCE-DEFINED |
| `reports.emergency_rule_id` | text, null | Deterministic rule that fired | null unless urgent | no | yes | required | SOURCE-DEFINED |
| `reports.submitted_at` | timestamptz, null | Server time of successful submission | on submit | no | yes | null (never submitted) | SOURCE-DEFINED |
| `reports.reviewed_at` | timestamptz, null | Server time of Mark Reviewed | no | **no** | yes | may be set | SOURCE-DEFINED |
| `reports.reviewed_by` | uuid, null | Reviewing doctor: the authenticated doctor identity (`auth.uid()`, referencing `auth.users.id`). Doctor record and display name are derived through `doctor_profiles`. Approved 1 Nov 2026 (RD-17). | no | **no** | yes | may be set | SOURCE-DEFINED (field); type **approved 1 Nov 2026 (RD-17)** |
| `reports.created_at` | timestamptz | Server time of creation | yes | no | yes | yes | PROPOSED |
| `reports.updated_at` | timestamptz | Server-maintained | yes | no | no | yes | PROPOSED |

### 6.2 JSONB document fields

| Path | Type of `value` | Description | Required to exist | Patient-editable | Doctor-visible | Applies to `urgent_partial` | Source |
|---|---|---|---|---|---|---|---|
| `patient.name` | string | Name as stated | yes | **yes** | yes | often `not_asked` | SOURCE-DEFINED |
| `patient.age` | integer (whole years) | Age in completed years; no date of birth | yes | **yes** | yes | often `not_asked` | SOURCE-DEFINED (D3: whole years) |
| `patient.gender` | enum `male｜female｜other` (values) | Gender. An explicit choice stores status `provided` with the chosen value. "Prefer not to say" stores status `declined` with `value: null`, because the RD-02 invariant forbids a value on any non-provided status; the `declined` member of `GenderValue` is never written as a value | yes | **yes** | yes | often `not_asked` | SOURCE-DEFINED mapping (**approved 1 Nov 2026, RD-06**); the literals `male`, `female`, `other` remain PROPOSED |
| `patient.language` | enum `en｜hi` | Session language, context only | yes | no | PROPOSED yes (RD-23) | yes | PROPOSED |
| `primary_concern` | string | The patient's own words | yes | **yes** | yes | often `not_asked` | SOURCE-DEFINED |
| `clinical_details.duration` | string | How long, as stated | yes | **yes** | yes | may be `not_asked` | SOURCE-DEFINED |
| `clinical_details.severity` | string | Severity as the patient described it; no clinical scale is introduced | yes | **yes** | yes | may be `not_asked` | SOURCE-DEFINED (required); domain PROPOSED (RD-05) |
| `clinical_details.conditions` | string[] | Existing conditions reported by the patient | yes (asked once) | **yes** | yes | may be `not_asked` | SOURCE-DEFINED |
| `clinical_details.medications` | string[] | Medicines reported by the patient | yes (asked once) | **yes** | yes | may be `not_asked` | SOURCE-DEFINED |
| `clinical_details.allergies` | string[] | Allergies reported by the patient | yes (asked once) | **yes** | yes | may be `not_asked` | SOURCE-DEFINED |
| `clinical_details.other_symptoms` | string[] | Additional symptoms reported by the patient | yes (asked once) | **yes** | yes | may be `not_asked` | SOURCE-DEFINED |
| `missing_information` | string[] | Field keys whose status is not `provided`; derived server-side | yes | **no** | yes | yes | PROPOSED (derived) |
| `summary` | object or null | See §7 | see §7 | no | yes, visually separated | **null** | SOURCE-DEFINED + owner decision (§7) |
| `routing_snapshot` | object | Display labels only; ids are authoritative in columns | yes | no | yes | yes | PROPOSED |
| `emergency` | object or null | `rule_id`, `patient_statement`, `triggered_at` | required for urgent | **no** | yes | required | SOURCE-DEFINED (rule id + statement); `triggered_at` PROPOSED |

## 7. Generated summary — SOURCE-DEFINED contract with one owner decision

**Normal report (`draft` or `submitted`):** `summary` is an object with three required members:

| Member | Type | Required | Notes |
|---|---|---|---|
| `summary.text` | string | yes | English; restates only `provided` fields |
| `summary.source` | enum `template｜groq` | yes | Deterministic template is the baseline; Groq may enhance it later |
| `summary.generated_from` | string[] | yes | Field keys whose values the summary used — PROPOSED provenance (RD-11) |

**`urgent_partial` report:** `summary` is **`null`**. No generated summary is produced during the emergency path. A deterministic one-line summary may be added later only if the owner separately approves it (RD-10, resolved by owner instruction).

**Content rules — SOURCE-DEFINED:**

- The summary may restate only fields with status `provided`. It introduces no new symptom, duration, severity, body part, medicine, condition, allergy or history.
- The summary never states or implies a diagnosis, a probability, a cause, a treatment, a medicine to take, or advice.
- The summary never mentions an information status value and never fills a gap.
- If a Groq-produced candidate contains any fact not present in the `provided` set, the candidate is discarded and the template summary is used instead.
- The summary is labelled in the UI as AI-organised text, not a clinical opinion. Exact label copy is **OWNER APPROVAL REQUIRED** (RD-12).

## 8. Completion criteria — SOURCE-DEFINED (with one clarification)

Intake is complete when all of the following hold:

1. `patient.name` is `provided`.
2. `patient.age` is `provided`.
3. `patient.gender` is `provided` **or** `declined`. A patient who chooses "Prefer not to say" has answered the question. It is stored as value `declined` with status `declined`, it counts as handled, and it must **never** block completion or submission.
4. `primary_concern` is `provided`.
5. `clinical_details.duration` is `provided`.
6. `clinical_details.severity` is `provided`.
7. `conditions`, `medications`, `allergies` and `other_symptoms` have each been **asked once**. Any recorded status counts as handled, including `declined`, `unknown` and `unclear`.

**Interpretation notes (PROPOSED):**

- "Answered" for items 1–6 excludes `declined`, `unknown`, `unclear`, `not_provided` and `not_asked`. Only `provided` satisfies them.
- For item 7 the criterion is "asked once", so an unusable answer still satisfies it. This is the reading in RD-04; it prevents a patient being trapped on an optional field.
- A patient may not decline a required field through the correction path, with the single exception of gender (§14, RD-09); the server rejects the rest.

**At the 15-answer-turn cap:** if completion is satisfied, the normal review and submit flow continues. If not, the patient sees the partial preview with an End action only — no submit, no doctor visibility, no assignment, no booking.

## 9. Routing — SOURCE-DEFINED

- The backend validates the department key against the six configured non-emergency departments: `general_medicine`, `orthopedics`, `general_surgery`, `dermatology`, `cardiology`, and `emergency` for the urgent path only.
- A language model may propose at most one non-emergency department key. Unknown or invalid keys are rejected and General Medicine fallback is used, with `is_fallback: true`.
- The backend, not the model, maps department to doctor.
- The mapping is always preliminary: `routing_snapshot.preliminary` is `true` and the UI shows the department chip with the exact copy "Preliminary suggestion, not a diagnosis". Hindi rendering is **BLOCKED** pending owner translation (RD-14).
- A deterministic emergency maps to `emergency`, producing an `urgent_partial` report and suppressing all routine slots.
- The patient can never change department or doctor.

## 10. Safety flags and emergency block — SOURCE-DEFINED

| Field | Behaviour |
|---|---|
| `possible_urgent` | Set only by the supplementary language-model flag. Never a diagnosis. `false` never means the patient is safe. Alone it blocks routine booking until Mark Reviewed and shows a review chip; it does **not** show 112 guidance and does **not** create an `urgent_partial` report. |
| `needs_human_review` | Set when an ambiguous emergency statement was not resolved (unclear free text, no reliable answer, abandoned clarification). Blocks routine booking until Mark Reviewed. |
| `emergency.rule_id` | One of the eight documented demo rules. Stored for the doctor. |
| `emergency.patient_statement` | The verbatim patient text that triggered the rule. Stored for the doctor. |
| `emergency.triggered_at` | Server timestamp (PROPOSED). |

Neither flag is patient-editable or patient-visible as a flag. The patient sees the 112 guidance for a deterministic trigger and a plain review message where a hold applies.

Review-chip label: `docs/demo-emergency-rules.md` permits either "Needs review" or "Urgent review"; one string must be chosen — **OWNER APPROVAL REQUIRED** (RD-24).

## 11. Intake reference — SOURCE-DEFINED existence, PROPOSED format

| Aspect | Rule | Source |
|---|---|---|
| Existence | Server-generated; the patient never supplies it | SOURCE-DEFINED |
| Uniqueness | Database `UNIQUE` constraint; generation retries on collision | PROPOSED |
| Format | `SHD-<YYYYMMDD>-<6 Crockford base32 characters>`, date in Asia/Kolkata | **PROPOSED** (RD-19) |
| Generation time | At report creation, for every status, so the value is stable | **PROPOSED** (RD-19) |
| Patient visibility | Only after successful submission; never shown for a draft or an `urgent_partial` | PROPOSED (consistent with "Confirmation shows a reference code") |
| Doctor visibility | Shown in the doctor report list and detail | PROPOSED |
| Relationship to booking | The booking confirmation may show the appointment `reference_code` instead of, or in addition to, the intake reference | **OWNER APPROVAL REQUIRED** (RD-20) |

## 12. Presentation order — PROPOSED (RD-12)

**Patient review screen:**

1. Emergency block — only for `urgent_partial`
2. Patient information — name, age, gender
3. Primary concern
4. Additional patient-reported details — duration, severity, conditions, medications, allergies, other symptoms
5. Missing or declined information
6. Generated summary (absent for `urgent_partial`), labelled as AI-organised, not a diagnosis
7. Preliminary department chip plus "Preliminary suggestion, not a diagnosis"
8. Safety and review flags, when present
9. Submission information — intake reference (after submit), timestamps, review state
10. Actions — "Submit to hospital" / "Don't submit" for a normal draft; "End session" only for the incomplete-at-cap preview

**Doctor detail screen (English only):** the same fact order, with patient-reported facts visually separated from the generated summary, plus the conversation and the Mark Reviewed action. No print view, no free-text notes, no Settings.

**Incomplete-at-cap preview:** shows the partial values with the approved incomplete disclaimer and an End action only. No Submit, no booking, no correction-to-submit, no doctor visibility.

## 13. Lifecycle and transitions

| Transition | Initiator | Conditions | Visibility afterwards | Source |
|---|---|---|---|---|
| ∅ → `draft` | system | Normal completion satisfied | none (drafts hidden) | SOURCE-DEFINED |
| ∅ → `urgent_partial` | system | Deterministic demo rule fires | Emergency doctor + General Medicine demo doctor | SOURCE-DEFINED |
| `draft` → `submitted` | patient via `submit_report` | Consent granted, ownership verified, completion revalidated, not an emergency report | assigned doctor | SOURCE-DEFINED |
| `draft` → `draft`, session ended | patient chooses "Don't submit" | No submission, no appointment, no doctor exposure; the draft persists privately | none | SOURCE-DEFINED |
| `submitted` → `submitted` + review fields | doctor via `mark_report_reviewed` | Caller is a mapped doctor who may read the report | unchanged | SOURCE-DEFINED |
| `urgent_partial` → terminal | — | No further transition | unchanged | SOURCE-DEFINED |

**Not permitted:** any transition out of `urgent_partial`; editing a `submitted` report; patient correction after submission; deletion of a submitted report; a `draft` becoming `urgent_partial` after completion (the matcher evaluates intake answers only — RD-21).

**Booking hold — SOURCE-DEFINED:** a `submitted` report with `possible_urgent` or `needs_human_review` cannot book until Mark Reviewed. After review, routine booking may resume only for a normal `submitted`, non-emergency report. `urgent_partial` is permanently ineligible, reviewed or not. Mark Reviewed is a workflow acknowledgement, not medical clearance.

**"Not now":** no appointment is created; the report stays `submitted` and remains visible to the assigned doctor.

## 14. Patient-editable allowlist — SOURCE-DEFINED scope, PROPOSED fields

Corrections are allowed **only while the report is `draft`**, only for these fields, and the browser sends field updates — never a replacement document.

| Allowed key | Notes |
|---|---|
| `patient.name` | value only |
| `patient.age` | whole years |
| `patient.gender` | one of the four options |
| `primary_concern` | value only |
| `clinical_details.duration` | value only |
| `clinical_details.severity` | value only |
| `clinical_details.conditions` | value array |
| `clinical_details.medications` | value array |
| `clinical_details.allergies` | value array |
| `clinical_details.other_symptoms` | value array |

**Payload (PROPOSED — RD-08):** `{ "<fieldKey>": { "value": <...>, "status": "provided" | "declined" } }`. A patient may set `provided` with a value, or `declined` on an optional field. **Gender is the single exception among the required fields**: because "Prefer not to say" is a documented on-screen option (§8 rule 3), a patient may also set `patient.gender` to `declined` here, and the report must treat that as answered. Declining any other required field (name, age, primary concern, duration, severity) is rejected with `invalid_field_status`.

**Consistency note:** gender `declined` must behave identically on the intake path and the correction path. Completion, submission validation and the missing-information list must all treat it as answered and must not render it as a warning.

**Explicitly rejected — any request touching these fails with `field_not_editable`:** `id`, `session_id`, `user_id`, `schema_version`, `status`, `intake_reference`, `submitted_at`, `created_at`, `updated_at`, every `routing_snapshot.*`, `flags.possible_urgent`, `flags.needs_human_review`, `emergency.*`, `review.*`, `reviewed_at`, `reviewed_by`, `missing_information`, `summary.*`, and any unknown key.

`missing_information` and `summary` are rejected because they are derived: accepting them would let a patient change what the doctor reads.

## 15. Doctor dashboard contract

A doctor sees only the reports their RLS policy permits: `submitted` and `urgent_partial` reports that are assigned to them, plus the documented Emergency-department cross-visibility for the General Medicine demo doctor and the Emergency doctor. Drafts are never visible.

| Category | Predicate | Source |
|---|---|---|
| **All** | every visible report | SOURCE-DEFINED tab |
| **Urgent** | `status = 'urgent_partial'` | SOURCE-DEFINED tab; whether flagged reports are included is PROPOSED (RD-15) |
| **New** | `status = 'submitted' AND reviewed_at IS NULL` | SOURCE-DEFINED card; predicate PROPOSED (RD-15) |
| **Booked** | a confirmed appointment exists for the report | SOURCE-DEFINED card |
| **Not booked** | `status = 'submitted'` and no confirmed appointment | SOURCE-DEFINED card; inclusion of `urgent_partial` is PROPOSED (RD-15) |
| **Reviewed** | `reviewed_at IS NOT NULL` | PROPOSED (label only, not a status) |
| **Pending review** | `reviewed_at IS NULL AND (possible_urgent OR needs_human_review)` | SOURCE-DEFINED concept; predicate PROPOSED (RD-15) |

**Counting rules — PROPOSED:** every card is a `COUNT(*)` over the doctor's visible reports with the predicate above. No trend, rate, score, average or "today" interpretation is invented. Appointment tabs (Today / Upcoming / Past) derive from the slot start time in Asia/Kolkata, and the Completed label derives from slot time; there is no completion write.

## 16. Mark Reviewed — SOURCE-DEFINED

| Aspect | Rule |
|---|---|
| Permitted caller | A doctor mapped in `doctor_profiles` who may read that report. The General-Medicine-versus-Emergency permission question is **OWNER APPROVAL REQUIRED** (RD-16). |
| Fields changed | `reviewed_at` and `reviewed_by` only. Nothing else changes. |
| `reviewed_at` | Server timestamp, never client-supplied. |
| `reviewed_by` | The authenticated doctor identity (`auth.uid()`), stored as a uuid referencing `auth.users.id`. The doctor record and display name are derived through the `doctor_profiles` mapping; they are not stored on the report. Approved 1 Nov 2026 (RD-17). |
| Idempotency | Repeated calls return success with the original values; the first review timestamp is not overwritten (PROPOSED — RD-18). |
| `possible_urgent` | Unchanged. The flag is a historical record. |
| `needs_human_review` | Unchanged. |
| Booking effect | Releases the routine-booking hold only for a normal `submitted`, non-emergency report. `urgent_partial` remains permanently ineligible. |
| Failure | Report unchanged, error shown, no false success. |
| Free text | Not supported (deferred). |

## 17. Database mapping

**`reports` table:** the relational columns in §6.1, plus `report jsonb NOT NULL` carrying the document in §5. `UNIQUE (session_id)`; `UNIQUE (intake_reference)`.

**`messages` table:** unchanged by this document, except that the conversation is the only place verbatim patient text lives. It must support doctor reading of the conversation for visible reports.

**`sessions` table:** unchanged by this document. Session status is separate (§2). The transient audio fields from the Batch 2E design (`pending_transcript_*`, `audio_claim_*`) are **not** part of the report document and must never be read into a report; they are cleared before or at submission.

**`appointments` table:** supplies the Booked / Not booked predicates and the booking reference. No report field depends on it.

**RLS:** no additional policy is required by this document. Doctor reads continue to be governed by the `doctor_profiles` mapping and the documented Emergency cross-visibility; `draft` rows must never satisfy a doctor policy. The JSONB payload inherits the row-level protection of `reports`.

## 18. Shared type implications

- `src/types/report.ts`: `ReportStatus` (three values), `SessionStatus` (seven values, separate type), `InfoStatus` (six values), `FieldValue<T>`, `ReportDocumentV1`, `CorrectableField`, `CORRECTABLE_FIELDS`, `PROTECTED_FIELDS`, `DepartmentKey`, `RoutingSnapshot`, `ReportFlags`, `EmergencyBlock`, `IntakeReference`.
- `src/types/chat.ts`: the review response returns `ReportDocumentV1`; the incomplete-at-cap response returns the same type with `can_submit: false`.
- `src/types/api.ts`: correction accepts only allowlisted field updates; submission and Mark Reviewed return server-confirmed values.
- `src/types/questions.ts`: one field-key list shared with `CorrectableField` and `missing_information`.
- `src/i18n/`: one key per `InfoStatus` value per language, the department disclaimer, the booking-hold copy and the incomplete-preview copy.

## 19. Non-goals

No diagnosis, disease probability, risk or triage score, prescription, treatment or self-care advice, vital signs, invented history, free-text doctor notes, report printing, admin editing, cross-patient access, or AI-written content the patient did not state.

## 20. Source-to-field traceability

| Source clause | Fields and rules derived |
|---|---|
| `AGENTS.md` patient flow step 5 (name, age, gender, primary concern; gender options; "Prefer not to say" stored as `declined`) | `patient.name`, `patient.age`, `patient.gender`, `primary_concern`, completion rule 3 |
| `AGENTS.md` completion criteria | `duration`, `severity`, `conditions`, `medications`, `allergies`, `other_symptoms`, asked-once rule |
| `AGENTS.md` "Missing values stay explicit" | §3 enum (five source values, one proposed) |
| `AGENTS.md` "Reports are always in English" | `patient.language` (context only), all report text English |
| `AGENTS.md` "patient-reported facts separate from the summary and missing fields" | §5, §7, §12 separation |
| `AGENTS.md` `correct_draft_report` allowlist | §14 |
| `AGENTS.md` Mark Reviewed definition | §16 |
| `AGENTS.md` booking-hold paragraphs | §13, §16 |
| `AGENTS.md` doctor dashboard screens and tabs | §15 |
| `MILESTONES.md` M1-S6 (relational columns plus versioned JSONB, intake reference, status, review fields) | §5, §6, §11, §17 |
| `MILESTONES.md` M2-S5 (patient-reported values, department chip, "Not provided") | §12, §3 display string |
| `MILESTONES.md` M3-S5 (status per field, facts/summary/missing separation, template summary, reference, routing allowlist) | §3, §6, §7, §9, §11 |
| `MILESTONES.md` D3 (age is a whole number of years) | `patient.age` type |
| `MILESTONES.md` M2-S8 (Urgent / New / Booked / Not booked cards) | §15 |
| `docs/demo-emergency-rules.md` (urgent_partial, rule id, statement, Emergency doctor, no slots, 112 plain text) | §6, §7, §10, §13 |
| `docs/architecture-decisions.md` (review is a workflow acknowledgement; release only for a normal submitted report) | §13, §16 |
| `docs/demo-seed-data.md` (department keys, doctor names, visibility, drafts hidden) | §9, §15, §17 |
| `docs/failure-modes.md` (correct only while draft; Mark Reviewed failure leaves the report unchanged) | §14, §16 |

## 21. Owner decision register

| ID | Question | Recommendation | Alternative | Blocks | Status |
|---|---|---|---|---|---|
| RD-01 | Add `provided` as the sixth information-status value? | Yes | Derive "answered" from a non-null value | M1-S6, M1-S9 | **APPROVED 1 Nov 2026** |
| RD-02 | Enforce `value ≠ null ⟺ status = provided`? | Yes | Allow a value on `unclear` for audit | M1-S9, M3-S5 | **APPROVED 1 Nov 2026** |
| RD-03 | Exact triggers for `not_provided` versus `not_asked` | `not_asked` = never reached; `not_provided` = reached, no answer, no explicit choice | Merge the two values | M3-S5 | OPEN |
| RD-04 | Does `unclear` satisfy the asked-once rule on the four optional fields? | Yes, because the criterion is "asked once" | Require a usable answer | M3-S5 | OPEN |
| RD-05 | Severity value domain | Free text as reported | A fixed scale (would introduce a clinical instrument) | M3-S5 | OPEN |
| RD-06 | Gender value strings | `male`, `female`, `other`, `declined` | Store display labels | M1-S9 | **PARTLY APPROVED 1 Nov 2026:** the "Prefer not to say" → value `declined` / status `declined` mapping is settled and retained. The literals `male`, `female`, `other` remain a PROPOSED naming detail; they do not block M1-S6 but must be confirmed before M1-S9 freezes the type union |
| RD-07 | Age bounds | Integer 0–120, no date of birth | No bound | M1-S9 | OPEN |
| RD-08 | Correction payload shape | `{value, status}` with status in `{provided, declined}` | Value-only payload with server-derived status | M1-S9 | OPEN |
| RD-09 | May a patient decline a required field? | No, with one exception: gender may be `declined` via "Prefer not to say"; the server rejects `declined` on name, age, primary concern, duration and severity | Allow any required field to be declined, then block submission | M3-S5 | OPEN (gender exception adopted as the working rule in §8 and §14) |
| RD-10 | Summary for `urgent_partial` | `null` — no generated summary | A separately approved deterministic one-liner | M3-S5 | **RESOLVED** (owner instruction: null) |
| RD-11 | Summary provenance and Groq fact check | `generated_from` list; discard non-compliant output | Trust model output | M3-S5 | OPEN |
| RD-12 | Section order and labels | §12 | Alternative ordering | M2-S5 | OPEN |
| RD-13 | Display strings for `declined`, `unknown`, `unclear`, `not_asked` | One string per status | Map all to "Not provided" | M2-S5, M3-S5 | OPEN |
| RD-14 | Hindi copy for the disclaimer and status strings | Owner translation | English-only chip | M2-S5 | BLOCKED |
| RD-15 | Dashboard predicates (New, Urgent inclusion, Not booked, Reviewed, Pending review) | §15 | Narrower definitions | M2-S8 | OPEN |
| RD-16 | May the General Medicine doctor Mark Reviewed an Emergency report? | Owner decision | Read-only for General Medicine | M4-S7 | OPEN |
| RD-17 | `reviewed_by` stores doctor record id or auth user id | **Approved: auth user id** (`auth.uid()`, referencing `auth.users.id`) | Doctor record id (rejected) | M1-S6 | **APPROVED 1 Nov 2026**; doctor record and display name are derived through `doctor_profiles` |
| RD-18 | Mark Reviewed idempotency | First write wins | Overwrite the timestamp on every call | M4-S7 | OPEN |
| RD-19 | Intake-reference format and generation time | `SHD-YYYYMMDD-XXXXXX`, generated at creation, revealed after submit | Generate at submit | M1-S6 (column), M3-S5 (behaviour) | OPEN |
| RD-20 | Confirmation code: intake reference or appointment reference? | Appointment reference on confirmation; intake reference on the report | Show the intake reference only | M4-S8 | OPEN |
| RD-21 | Can a draft correction trigger the emergency matcher? | No — the matcher is scoped to intake answers | Match corrections as well | M3-S4 | OPEN |
| RD-22 | Relational versus JSONB authority split | §5 and §17 | All-JSONB or all-relational | M1-S6 | **APPROVED 1 Nov 2026** |
| RD-23 | Is `patient.language` doctor-visible? | Yes, as context | No | M1-S9 | OPEN |
| RD-24 | Review chip label | "Needs review" | "Urgent review" | M2-S9 | OPEN |
| RD-25 | May a submitted report ever be edited? | No | Allow a correction window | M3-S5 | OPEN |

Related decisions from the wider project: OD-01 (emergency matcher input), OD-02 (clarification turn accounting), OD-04 (Emergency cross-visibility statuses), OD-06 (response envelope and the `transcript_preview` state), OD-09 (clearing `needs_human_review` after a later "No"), OD-15 (text answer during an audio claim), OD-16 (accept-path atomicity). All remain OPEN.

## 22. Implementation gaps

**M1-S6 — unblocked by this document as of 1 November 2026.** RD-01, RD-17 and RD-22 are approved, so `reports` can be authored with the columns in §6.1, the three-value `report_status` enum, `report jsonb NOT NULL` with `schema_version`, and `reviewed_by uuid` referencing `auth.users.id`. Two non-report items remain schema-critical and are **not** decided by this document:

- **OD-10** — pending-transcript columns, and **OD-13** — audio-claim columns plus claim TTLs. If they are not included in the initial `sessions` table, a later additive migration and a separate `APPROVE APPLY` become necessary. Including them now is cheaper.
- **`messages` partial unique index** `UNIQUE (session_id, turn_index) WHERE role = 'patient'` — required for the accept-path recovery and the one-answer-per-turn guarantee. It cannot be added later without a migration.

**M1-S9** now needs only RD-06 (the literals `male`, `female`, `other`), RD-07 (age bounds), RD-08 (correction payload) and RD-23 (`patient.language` visibility). RD-01 and RD-02 are approved.

**M3-S5** still requires RD-03, RD-04, RD-05, RD-09, RD-11, RD-19, RD-21 and RD-25.

**M2-S5 and M2-S8** depend on RD-12, RD-13, RD-15 and RD-24. Hindi copy (RD-14) remains **BLOCKED** until the owner supplies it.

**M4-S7** depends on RD-16 (General Medicine review rights on Emergency reports) and RD-18 (idempotency).

## 23. Change log

| Version | Date | Change |
|---|---|---|
| 1.0 | 1 November 2026 | Initial reconstruction. Gender "Prefer not to say" settled as `declined` and treated as a handled question. Summary nullability separated for normal versus `urgent_partial` reports. Report and session status enums separated. Traceability table and owner decision register established. |
| 1.2 | 1 November 2026 | Consistency fix found during implementation: gender "Prefer not to say" is recorded as status `declined` with `value: null`, because RD-02 forbids a value on a non-provided status. The `declined` member of `GenderValue` is therefore never written as a value. Completion, submission and the missing-information list treat it as answered. |
| 1.1 | 1 November 2026 | Owner approvals recorded: RD-01 (`provided`), RD-02 (value/status invariant), RD-17 (`reviewed_by` = `auth.uid()` referencing `auth.users.id`; doctor record and name derived via `doctor_profiles`), RD-22 (relational/JSONB split). RD-06 and RD-10 retained as corrected. Consistency review applied: gender `declined` now permitted on the correction path as well as at intake (§14), and RD-09 narrowed to exclude gender. §22 updated to reflect the new M1-S6 status. |
