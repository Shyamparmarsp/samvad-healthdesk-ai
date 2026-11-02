# Owner decisions required before release

Two items need an explicit owner ruling. Nothing in the release candidate changes either
behaviour while they are open, and no agent may widen a clinical permission on its own.

---

## D-30 — Who may acknowledge an urgent / emergency report?

### Current behaviour (release candidate, verified)

| Layer | Rule | Evidence |
|---|---|---|
| Doctor UI | Only the Emergency doctor sees **Acknowledge Triage**. General Medicine sees a disabled **Read-only cross-visibility** control. | `src/features/doctor/DoctorUrgentDetail.tsx` (`canReview` is `currentDoctor.department_key === 'emergency'`, fail-closed when the doctor is unknown) |
| Database RPC | `mark_report_reviewed()` raises unless the caller is mapped to the **Emergency** doctor for an `urgent_partial` report. | `supabase/migrations/20261102120000_mark_report_reviewed.sql` |
| RLS reads | Both the General Medicine and the Emergency demo doctor can **read** emergency reports (cross-visibility); no other department can. | `reports_doctor_read` policy; `supabase/tests/rls.sql` |
| Automated proof | 10 assertions in `mark_reviewed.sql`, 9 in `emergency_authorization.sql`, and the `L-DOC-01…05` live scenarios (209/209 emergency certification). | local stack run, 3 Nov 2026 |

Consequences of the current rule:

- The General Medicine doctor can read the urgent report and its conversation but cannot
  clear the review hold.
- An urgent report stays on the booking hold until the Emergency doctor reviews it. That
  is the safe direction.
- Mark Reviewed is a workflow acknowledgement, not medical clearance, and it never makes
  an emergency report bookable.

### Why a decision is needed

The original Figma frame shows the General Medicine doctor with an enabled Mark Reviewed
button, while `docs/demo-emergency-rules.md` describes that doctor as read-only. The two
documents disagree; the implementation follows the stricter documentation.

### Options

| Option | Effect | Risk |
|---|---|---|
| **A — keep the current fail-closed rule** (recommended) | Only the Emergency doctor acknowledges; GM read-only | A judge logged in as GM cannot clear the hold |
| B — let both demo doctors acknowledge | Matches the Figma screenshot | Widens a clinical permission; contradicts `demo-emergency-rules.md`; needs a new RPC rule + migration |
| C — replace acknowledgement with a neutral "Seen" marker with no workflow effect | Removes the ambiguity entirely | Larger change; still needs a migration |

**Owner ruling required:** A / B / C. Until recorded, the candidate ships **A**.

### Related open question — urgent queue membership

The urgent queue predicate is `status = 'urgent_partial'` only. Reports that are
`submitted` with `needs_human_review = true` are **not** listed in the urgent queue
(they appear in Reports with a warning flag and are subject to the booking hold). The
Figma D7 frame shows one such report in the queue.

| Option | Effect |
|---|---|
| **Keep the current predicate** (recommended) | The urgent queue means "emergency trigger fired" |
| Include `needs_human_review` | Queue mixes emergencies with unclear answers; needs a UI label change and a queue-rule test update |

**Owner ruling required.** No queue behaviour was changed.

---

## D-34 — Which consent copy is the authoritative one?

### What the patient sees today

The consent **bubble** renders the versioned legal text (`CONSENT_TEXT`), and the same
consent is spoken/played as the greeting. The two texts are different on purpose:

| | Text | Where |
|---|---|---|
| **Shown + accepted** | “I understand that Samvad HealthDesk AI is an AI intake assistant and not a doctor, and that it cannot diagnose or treat me. I agree that the health information I give will be processed to prepare a preliminary report, and that this report will be shared with the hospital's doctor only if I submit it. I can stop at any time.” | `src/types/consent.ts` and `supabase/functions/_shared/consent.ts` (identical), version `2026-11-01.v1` |
| **Spoken greeting** | “Hello! Before we begin, please note that I am an AI assistant and not a medical doctor. I will collect preliminary details about your concern to draft a report for hospital staff. Do you agree to proceed?” | `src/i18n/en.ts` → `consent.greetingAudio` (also used for the cached greeting audio) |
| **Figma P2 bubble** | The spoken greeting text | Figma frame `72:42` |

Hindi versions of both exist. The Hindi consent text is flagged
`CONSENT_HINDI_NEEDS_OWNER_REVIEW = true` in the backend module.

### Why a decision is needed

The Figma frame shows the friendly greeting inside the bubble. The current screen shows
the formal consent text in the bubble and uses the friendly greeting as the spoken
audio. Both are defensible; they differ visually from the frame.

### Options

| Option | Effect | Consequence |
|---|---|---|
| **A — keep the formal text in the bubble, greeting as audio** (recommended) | Defensible for consent; the accepted text is the versioned legal text | The bubble stays textually different from the Figma frame (accepted visual divergence) |
| B — show the greeting in the bubble and the formal text below it | Matches Figma and keeps the legal text visible | Longer screen; needs a layout pass |
| C — accept the greeting as the consent text | Exact Figma match | The persisted consent record would no longer state “cannot diagnose or treat”, “shared only if I submit”, or “I can stop at any time” — not recommended |

**Owner ruling required:** A / B / C, plus confirmation that the Hindi wording in
`supabase/functions/_shared/consent.ts` is approved.

If the wording changes, `CONSENT_VERSION` must be bumped in **both** the frontend
(`src/types/consent.ts`) and the backend (`_shared/consent.ts`) in the same release; the
backend rejects a version mismatch, and stored consent records must keep the text the
patient actually accepted.

---

## Sign-off block (owner)

| Decision | Ruling | Date | Initials |
|---|---|---|---|
| D-30 urgent-review authority (A / B / C) | | | |
| D-30 urgent-queue membership (keep / include needs_human_review) | | | |
| D-34 consent copy (A / B / C) | | | |
| Hindi consent wording approved | yes / no | | |
| D-06 prompt audio generated + listening pass recorded | yes / no | | |
