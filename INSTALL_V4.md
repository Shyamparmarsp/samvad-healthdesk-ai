# Samvad HealthDesk AI — v4 document update package

**Package date:** 1 November 2026  
**Purpose:** install the coordinated v4 runbooks and matching project-document corrections before starting `M1-S0`.

## Replace these files in the project

Copy the files from this package to the matching locations in your existing project, replacing the old versions only after making a backup:

| Package file | Destination in your project | Why it is included |
|---|---|---|
| `MILESTONES.md` | Repository root | Authoritative agent runbook: four milestones, step prompts, stop/approval gates, provider caps, doctor provisioning, integration and submission. |
| `HUMAN_ROADMAP.md` | Repository root | Single owner checklist for credentials, dashboard actions, manual tests, approvals, deployment and submission. |
| `AGENTS.md` | Repository root | Always-on architecture and security rules aligned with the new sequencing and required focused counter tests. |
| `README.md` | Repository root | Removes the public-password contradiction and documents private evaluator access. |
| `docs/architecture-decisions.md` | `docs/` | Aligns architecture decisions with milestone sequencing, D5 caps, doctor account timing and review/booking holds. |
| `docs/failure-modes.md` | `docs/` | Adds session-cap `demo_busy`, provider-specific fallbacks and the 15-turn incomplete preview. |
| `docs/demo-seed-data.md` | `docs/` | Adds two-doctor provisioning, profile mapping timing and private credential policy. |
| `docs/demo-emergency-rules.md` | `docs/` | Defines the Yes/No ambiguity clarification and its limited meaning. |

Do not move or replace `M.md` or `docs/report-design.md` as part of this update. Keep existing `docs/design/` exports and other project assets. `M.md` remains historical context; `docs/report-design.md` remains the report contract.

## Figma V2 change

The existing Figma V2 `DoctorLogin` card was updated in place. Its text now reads:

```text
Evaluator access
Credentials are shared privately with reviewers.
Not displayed in public project materials.
```

This removes the old email/password placeholders. The text nodes were read back after the update. The layout was not redesigned.

## Before installing

1. Back up the full existing repository.
2. Confirm your working tree and existing files; do not delete the old milestone files or human checklist automatically.
3. Copy the eight replacement files listed above into the matching destinations.
4. Keep `HUMAN_ROADMAP.md` as the only active owner checklist. `HUMAN_MANUAL_CHECKLIST.md` is superseded; retain it as an archive if you prefer, but do not follow it alongside the new roadmap.
5. Review `git status` and the diff. Do not commit or push until you have inspected the changes.

## Still to be done during execution

- `docs/provider-notes.md` is intentionally not included: M1-S5 must create it from actual account access, provider documentation and synthetic smoke-test evidence. It must not be filled with guessed model IDs, endpoints or formats.
- M1-S8 requires the owner to create two Supabase Auth users through the Dashboard, then review and approve the named `doctor_profiles` mapping SQL. Never run SQL against `auth.users` or share passwords with an agent.
- Confirm/adjust the proposed D5 daily caps after checking actual provider balances and quotas. They are application guardrails, not provider quota promises.
- The official challenge pages disagree on submission mechanics: the registration terms mention a participant workspace, while the current programme FAQ and challenge blog say the submission form is emailed and there is no dashboard. Follow the actual current email instructions received for your registration. Do not assume there is a private evaluator-credential field.
- Working evaluator credentials remain private. If the actual submission form has a genuinely private reviewer-only field, verify that before use; otherwise ask Gnani organisers for an approved private access method.

## Start instruction

After installing and reviewing the documents, give the agent `AGENTS.md`, `MILESTONES.md` and the relevant specialized docs, then ask it to execute **M1-S0 only**. Keep `HUMAN_ROADMAP.md` for your own manual tasks. Do not ask the agent to run a whole milestone in one prompt.
