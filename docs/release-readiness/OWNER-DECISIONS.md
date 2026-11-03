# Owner decisions

**Status as recorded:** **D-30 approved** and **D-34 approved** on 3 November 2026 against commit
`dbe2e25` (tag `v1.0.0-demo`). Two separate items remain pending and are named explicitly below;
they are not part of either approved decision.

| ID | Decision | Ruling | Status |
|---|---|---|---|
| **D-30** | Urgent-report review authority | Retain the existing restrictive rule: **only the Emergency doctor** may acknowledge / Mark Reviewed an urgent report. General Medicine keeps read-only cross-visibility. | **APPROVED** — 3 Nov 2026 |
| **D-34** | Consent copy | Retain the intended existing version **`2026-11-01.v1`** and its exact text. No paraphrase, no shorter Figma greeting copy, no new version. | **APPROVED** — 3 Nov 2026 |
| — | Urgent queue membership | Retain the current predicate: `urgent_partial` only | **RECORDED** — 3 Nov 2026 (no change) |
| — | Hindi consent wording (linguistic sign-off) | Human review of the Hindi consent text | **PENDING** |
| — | D-06 prompt audio | Generate + owner listening pass | **PENDING** |

Both approvals **retain existing behaviour**. No code, migration, RLS policy, RPC or consent text
changed as a result of either ruling, and no agent may widen a clinical permission on its own.

---

## D-30 — Urgent report review authority

### Owner decision (approved 3 November 2026)

> **Retain the existing restrictive emergency-review behaviour. Only the Emergency doctor may
> acknowledge / Mark Reviewed on urgent reports. General Medicine may have read-only
> cross-visibility but must not gain acknowledgement authority.**

**Implementation effect: none.** The UI, the RPC and RLS already behave this way; the approval
ratifies the existing `OD-03` interim rule rather than changing it. Option B (both demo doctors
acknowledge) and Option C (neutral "Seen" marker) were **not** adopted.

### Behaviour the approval retains (verified at `dbe2e25`)

| Layer | Rule | Evidence |
|---|---|---|
| Doctor UI | Only the Emergency doctor sees **Acknowledge Triage**. General Medicine sees a disabled **Read-only cross-visibility** control. | `src/features/doctor/DoctorUrgentDetail.tsx` — `canReview = Boolean(currentDoctor && currentDoctor.department_key === 'emergency')`, failing closed when the doctor is unknown (D-36) |
| Database RPC | `mark_report_reviewed()` raises `42501` unless the caller is mapped to the **Emergency** doctor and the report is an `urgent_partial` emergency report. | `supabase/migrations/20261102120000_mark_report_reviewed.sql` |
| RLS reads | Both the General Medicine and the Emergency demo doctor can **read** emergency reports (cross-visibility); no other department can. Read access never grants review authority. | `reports_doctor_read` policy; `supabase/tests/rls.sql` |
| Booking | An emergency / `urgent_partial` report is permanently ineligible for routine slots, reviewed or not. | `book_appointment()` |
| Automated proof | `mark_reviewed.sql`, `emergency_authorization.sql` and the `L-DOC-01…05` live scenarios. | local-stack run, 3 Nov 2026 |

Consequences of the approved rule:

- The General Medicine doctor can read the urgent report and its conversation but cannot clear the
  review hold.
- An urgent report stays on the booking hold until the Emergency doctor reviews it.
- Mark Reviewed is a workflow acknowledgement, **not** medical clearance, and it never makes an
  emergency report bookable.

### Implementation and documentation inconsistencies (defects, not decision items)

The decision is settled. The following divergences are tracked as documentation/design defects and
do **not** reopen D-30:

| # | Inconsistency | Effect | Disposition |
|---|---|---|---|
| 1 | Figma frame D5 shows an **enabled "Mark Reviewed"** for the logged-in General Medicine doctor | Design artefact contradicts the approved rule | Treat the Figma frame as superseded; record in visual-parity documentation |
| 2 | `docs/demo-emergency-rules.md` describes the General Medicine doctor as "read-only … beyond Mark Reviewed", which can be read as granting acknowledgement | Ambiguous wording in a safety document | Documentation defect: reword to state that General Medicine cannot Mark Reviewed (not changed in this task; documentation edit requires separate approval) |
| 3 | `tests/api/README.md` and code comments refer to the rule as "OD-03 **interim**" | "Interim" now reads as temporary when it is the approved long-term rule | Wording defect; behaviour is correct |

No code defect was found in this review: the UI, RPC, RLS and booking rules already match the
approved decision.

### Options considered (superseded by the approval, retained for history)

| Option | Effect | Outcome |
|---|---|---|
| **A — keep the fail-closed rule** | Only the Emergency doctor acknowledges; General Medicine read-only | **APPROVED** |
| B — let both demo doctors acknowledge | Matches the Figma screenshot | Rejected — would widen a clinical permission |
| C — neutral "Seen" marker with no workflow effect | Removes the ambiguity | Rejected — larger change, needs a migration |

---

## Urgent queue membership — retained (recorded 3 November 2026)

This is a separate question from D-30's review authority. The owner record retains the existing
behaviour: the predicate is unchanged, so no queue behaviour, label or test changes.

The urgent queue predicate is `status = 'urgent_partial'` only. Reports that are `submitted` with
`needs_human_review = true` are **not** listed in the urgent queue (they appear in Reports with a
warning flag and remain subject to the booking hold). The Figma D7 frame shows one such report in
the queue.

| Option | Effect | Outcome |
|---|---|---|
| Keep the current predicate | The urgent queue means "emergency trigger fired" | **RETAINED** |
| Include `needs_human_review` | Queue mixes emergencies with unclear answers; needs a UI label change and a queue-rule test update | Rejected |

**No queue behaviour was changed**, and none is planned under this record.

---

## D-34 — Consent copy

### Owner decision (approved 3 November 2026)

> **Approve and retain the intended existing consent version, `2026-11-01.v1`, without
> undocumented changes. Preserve its exact text. Do not introduce shorter Figma greeting copy,
> paraphrase the wording, or create a new version.**

Concretely, the approval means:

- The consent **bubble** keeps rendering the formal versioned `CONSENT_TEXT`.
- The friendly greeting remains **audio only**; it is **not** moved into the bubble.
- The English and Hindi consent strings are preserved **byte-for-byte**.
- No new `CONSENT_VERSION` is created, and no wording is paraphrased or "tidied".
- Option B (greeting above the formal text) and Option C (greeting as the consent text) were
  **not** adopted.

### Approved wording (verbatim, preserved)

| Language | Text |
|---|---|
| English (325 characters) | "I understand that Samvad HealthDesk AI is an AI intake assistant and not a doctor, and that it cannot diagnose or treat me. I agree that the health information I give will be processed to prepare a preliminary report, and that this report will be shared with the hospital's doctor only if I submit it. I can stop at any time." |
| Hindi (332 characters, Devanagari) | "मैं समझता/समझती हूँ कि संवाद हेल्थडेस्क AI एक AI इनटेक सहायक है, डॉक्टर नहीं है, और यह मेरा निदान या इलाज नहीं कर सकता। मैं सहमत हूँ कि मेरी दी गई स्वास्थ्य जानकारी से एक प्रारंभिक रिपोर्ट तैयार की जाएगी, और यह रिपोर्ट केवल तब अस्पताल के डॉक्टर के साथ साझा की जाएगी जब मैं इसे सबमिट करूँगा/करूँगी। मैं किसी भी समय रुक सकता/सकती हूँ।" |

| Artefact | Value |
|---|---|
| Version | `2026-11-01.v1` |
| Files that must stay byte-identical | `src/types/consent.ts` and `supabase/functions/_shared/consent.ts` |
| English SHA-256 | `b051ef1159e5836a9ba1217959bdbfa7aa36b32b26e2c13475360c4037f4482b` |
| Hindi SHA-256 | `7272f99d6ecca586507d205dccd7670290c699453f2220e01105bf034ee76d64` |
| Greeting (audio only, not the accepted text) | `src/i18n/en.ts` → `consent.greetingAudio`; Hindi equivalent in `src/i18n/hi.ts` |
| Drift guard | `tests/contract-regression.test.ts` asserts the version and both language strings match between frontend and backend |
| Persistence | `record_consent` stores the server constant verbatim with `consent_version`; a client version mismatch is rejected, so the stored copy can never disagree with what the patient saw |

The two SHA-256 values are a checksum of the approved wording for traceability. They are not a
project-issued identifier — no consent hash existed before this record.

### Hindi linguistic sign-off — still pending

`CONSENT_HINDI_NEEDS_OWNER_REVIEW = true` remains set in `supabase/functions/_shared/consent.ts`.

The D-34 approval covers **which version is authoritative and that its text must not change**. It
is **not** a human Hindi linguistic review, and no human Hindi approval is claimed anywhere in this
repository. That sign-off remains pending.

### Options considered (superseded by the approval, retained for history)

| Option | Effect | Outcome |
|---|---|---|
| **A — formal text in the bubble, greeting as audio** | Defensible for consent; accepted text is the versioned legal text | **APPROVED** |
| B — greeting in the bubble plus formal text below | Matches Figma, keeps the legal text visible | Rejected — no layout change authorised |
| C — greeting becomes the consent text | Exact Figma match | Rejected — the persisted record would lose "cannot diagnose or treat", "shared only if I submit", and "I can stop at any time" |

### If the wording ever changes

`CONSENT_VERSION` must be bumped in **both** the frontend (`src/types/consent.ts`) and the backend
(`_shared/consent.ts`) in the same release. The backend rejects a version mismatch, and stored
consent records must keep the text the patient actually accepted.

---

## Sign-off block (owner)

| Decision | Ruling | Date | Initials |
|---|---|---|---|
| D-30 urgent-review authority (A / B / C) | **A — retain the fail-closed rule** (only the Emergency doctor acknowledges) | 2026-11-03 | |
| D-34 consent copy (A / B / C) | **A — intended version `2026-11-01.v1`, wording and version unchanged** | 2026-11-03 | |
| D-30 urgent-queue membership (keep / include `needs_human_review`) | **keep the current predicate** — `urgent_partial` only | 2026-11-03 | |
| Hindi consent wording approved | **pending — no human Hindi sign-off claimed** | — | |
| D-06 prompt audio generated + listening pass recorded | yes / no | | |
