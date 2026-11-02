# Behaviors NOT TESTED

The certification covers the **backend emergency safety workflow**. The following items
were not executed in this worktree and are explicitly excluded from the certification
claim.

| Item | Why not tested | What was verified instead |
|---|---|---|
| Rendered patient UI and the 112 screen | The frontend lives in a separate worktree; this branch has no UI and must not modify it | Read-only inspection of `EmergencyView.tsx` (current frontend branch): large plain-text 112, no `tel:` link, no notification claim. Approval copy reviewed against `docs/demo-emergency-rules.md`. |
| Hindi UI guidance on the emergency screen | Frontend-owned; code inspection only | The approved Hindi sentence exists in `src/i18n/hi.ts`. The current `EmergencyView.tsx` hardcodes the English sentence, so Hindi sessions may see English text — recorded as advisory **F-1** below. |
| Microphone capture, audio upload, Prisma transcription, editable transcript | Would require a live/real audio provider and microphone; the task forbids live provider calls | The text path, transcript-confirmation state, and provider-failure fallbacks are covered by the existing 52-scenario integration suite (with the local stub). |
| Live Groq / Prisma / Timbre provider behaviour | No live provider calls permitted | Provider contracts and failure fallbacks are unit-tested; the emergency turn is proven to make **zero** provider calls. |
| Hosted Supabase / Vercel deployment, CORS, RLS on a remote project | Hosted infrastructure must not be touched | Local PostgREST/RLS and local Edge Functions only. |
| A real 112 call, ambulance dispatch, doctor paging | Does not exist by design; the demo must never claim it | Response/report text scanned; no notification/dispatch claim (`L-CLAIM-01`). |
| Clinical validity, triage accuracy, sensitivity/specificity | Not a clinical product | Explicit disclaimer in `docs/demo-emergency-rules.md`; no clinical claims added. |
| Browser anonymous-identity persistence and session resume after a refresh | Requires a browser session | `resume_session` ownership and emergency restore are tested over HTTP; identity persistence is frontend-owned. |
| Accessibility, keyboard operation, visual parity | Frontend-owned | Not assessed here. |
| Doctor conversation-reader UI | Separate worktree | The `messages` RLS read path and its delegation to report access are tested (`L-DOC-02`, SQL block 1–3). |
| Mark Reviewed UI interaction | Frontend-owned | The RPC authorization matrix and immutability are tested in SQL and over PostgREST. |
| Full 15-turn UI flow to the End-only preview | UI flow; the backend cap is covered elsewhere | `MAX_ANSWER_TURNS = 15`, `canAcceptAnswer`, `progress`, DB constraint and the existing 52-scenario integration suite are verified. |

## Advisory F-1 (frontend, not modified here)

`src/features/patient/EmergencyView.tsx` in the frontend worktree renders:

```tsx
Your answer may indicate an urgent situation. This demonstration cannot assess or treat
emergencies. Please call 112 now or go to the nearest emergency department. Do not wait
for a routine appointment.
```

This matches the approved English copy, and the screen shows a large plain-text `112`
with no `tel:` link. However, the string is hardcoded instead of using
`t.emergency.guidance`, so a Hindi session receives English guidance even though the Hindi
translation exists. This worktree must not modify the frontend; the fix belongs on the
frontend branch.

## Certification scope statement

The backend emergency safety workflow is certified on the evidence in this directory.
The product is **not** certified end-to-end until the rendered UI (including Hindi
guidance) and the voice path are exercised by the frontend/voice owners.
