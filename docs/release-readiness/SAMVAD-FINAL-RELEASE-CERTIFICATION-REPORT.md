# Samvad HealthDesk AI — Final Release Certification Report

**Document:** `SAMVAD-FINAL-RELEASE-CERTIFICATION-REPORT`
**Date:** 3 November 2026
**Release candidate:** `release-candidate/samvad-final` @ `4ee6061`
**Baseline defects:** the 50-finding register from the final UI/logic audit, plus 5 findings raised across the remediation and certification rounds (N-01…N-05)

---

## 1. Executive release decision

**Verdict: RELEASE CANDIDATE CERTIFIED FOR OWNER-SUPERVISED DEPLOYMENT — NOT YET APPROVED FOR PUBLIC ACCESS.**

The candidate now passes every executable gate, including the real local Supabase stack that
was previously unavailable:

| Gate | Result |
|---|---|
| Unified release gate (`scripts/release-check.ts --frontend`) | **30 PASS · 0 FAIL · 0 BLOCKED · 0 NOT TESTED** |
| Real local Supabase API suite (`npm run test:api`) | **55 / 55** (real Auth, real RLS, real Edge Functions, stubbed providers) |
| Local integration harness | **52 / 52** scenarios |
| Adaptive retrieval harness | **33 / 33** scenarios |
| Emergency certification | **209 / 209** (matcher, live workflow, doctor authorization, documentation invariants) |
| SQL authorization / RLS / booking / immutability suites | **8 files, 47 assertion blocks, all pass** |
| Backend Deno unit suites | **232 / 232** |
| Frontend mock + contract suites | **121 / 121** and **7 / 7** |
| Browser E2E | **16 / 16** checks |
| Visual QA | 7 viewports, zero overflow, 23 screenshots |
| Production build | clean; zero fixture strings and zero secrets in the bundle |
| Backup → restore rehearsal | **PASS** against a real local dump into a disposable database |

**Two blockers remain, and both are owner actions rather than code defects:**

1. **Prompt audio is still digital silence.** All eleven shipped files are 1.000 s at
   −91 dB (byte-identical). Playback, caching, autoplay-blocked handling and the paid-call
   guard are correct; the speech does not exist yet. A guarded generator and a complete
   manifest are ready (`docs/release-readiness/AUDIO-ASSETS-MANIFEST.md`). Until the owner
   runs the authorized generation and listening pass, **D-06 / N-02 stay OPEN**.
2. **Owner decisions D-30 and D-34 are unrecorded.** The candidate keeps the stricter
   documented behaviour (Emergency-doctor-only acknowledgement) and the versioned consent
   text; neither is changed silently.

Five visual findings remain open with the design owner (processing screen, booking layout,
reports-list layout, dedicated slot-state screens, brand plus), plus three partial visual
items. None affects data integrity, safety or authorization.

**Deployment-readiness by gate:**

| Gate | Verdict |
|---|---|
| Internal scripted demo (real local stack) | **PASS** |
| Owner visual acceptance | **FAIL** — 5 open, 3 partial |
| Security / RLS / authorization | **PASS** (real local stack) |
| Hosted Supabase readiness | **PASS** — procedure ready, 5 owner-blocked preflight items |
| Vercel readiness | **PASS** — configuration verified, no secrets in client vars |
| Hosted smoke test | **NOT TESTED** — requires owner credentials and a hosted project |
| Live provider behavior | **NOT TESTED** — no credential was used |
| Public evaluator access | **NOT YET** — audio + decisions + hosted smoke |

---

## 2. Commit matrix

| Role | Ref | Commit | Notes |
|---|---|---|---|
| Frontend (design owner) | `feat/frontend-figma-parity` | `aa11a14` | contains `78b68c2` (visual pass) and merged the validated remediation |
| Backend | `feat/backend` | `e5d77e5` | unchanged baseline |
| Emergency certification | `feat/emergency-certification-v3` | `b913506` | **integrated** — matcher scoping, logging privacy |
| Speech round-trip | `feat/speech-roundtrip-verification-v2` | `13e88b2` | **integrated** — includes the provider harness `0cff52a` |
| Provider harness | `feat/provider-verification-harness` | `0cff52a` | already inside `13e88b2` |
| Question-bank integrity | `feat/question-bank-integrity` | `37cf711` | **integrated** — docs, CSV, retrieval tests, scripts |
| Demo lifecycle ops | `feat/demo-lifecycle-ops` | `d6e7551` | **integrated** — shutdown, retention, backup docs/scripts |
| Doctor conversation reader | `feat/doctor-conversation-reader` | `5e584b5` | **already an ancestor** of the frontend branch — not merged again |
| OpenCode remediation | `fix/opencode-audit-frontend` | `c12df34` | **already an ancestor** via the design owner's merge |
| Prompt audio (new) | `fix/opencode-prompt-audio` | `5ef0086` | merged as `7f9100d` |
| Backup-restore tooling (new) | `fix/opencode-backup-restore` | `cbf1d0d` | merged as `19ac58d` |
| **Release candidate** | `release-candidate/samvad-final` | **`4ee6061`** | disposable; not merged into any permanent branch |

---

## 3. Integration history and conflict resolutions

1. `e5d77e5` (backend) → merge `feat/emergency-certification-v3` → added 2 commits.
2. → merge `feat/speech-roundtrip-verification-v2` (brings the provider harness).
   *Conflict:* `release-check-result.json` (generated evidence). Resolved with the newer
   side and regenerated later.
3. → merge `feat/question-bank-integrity`. *Conflict:* generated result JSONs only.
4. → merge `feat/provider-verification-harness`: already contained, no-op.
5. → merge `feat/demo-lifecycle-ops`. *Conflict:* generated result JSONs only.
6. → merge `feat/frontend-figma-parity` (`aa11a14`). *Conflicts:* `.env.example`
   (kept the superset containing both `VITE_` and server-secret names),
   `docs/cors-verification.md` and `docs/frontend-integration-guide.md` (kept the longer,
   authoritative versions).
7. → `fix/opencode-audit-frontend`: already contained (the design owner merged the
   validated branch), so no second merge.
8. → corrective commit `01730a8` (see N-05).
9. → merge `fix/opencode-prompt-audio` (`5ef0086`).
10. → merge `fix/opencode-backup-restore` (`cbf1d0d`).

**Excluded deliberately:** `release/rc-1`, `release/samvad-rc1`, `feat/frontend`,
`feat/frontend-integration`, `feat/foundation`, `main` (older or superseded lineage);
`feat/emergency-certification` / `-v2` and `feat/speech-roundtrip-verification` (superseded
by their later revisions). Nothing in those lines is needed for this candidate, and merging
them blindly would re-introduce superseded emergency or speech logic.

**Reproducibility:** the candidate is two commits plus merges — `git log --graph` above
shows the exact order. Re-running the integration from `e5d77e5` with the same merge order
and resolutions reproduces the tree.

---

## 4. Figma visual acceptance

Unchanged from the audit baseline: 22 frames compared, 16 vectors exported. The audit's
per-frame verdicts still apply, with these changes in the candidate:

| Frame | Audit verdict | Candidate |
|---|---|---|
| P1 Welcome | high fidelity | unchanged (+ demo-busy state) |
| P2 Consent | partial | greeting playback wired; bubble copy still the formal consent text (D-34) |
| P3 Conversation | partial | mic-denied and dead-end states added; chip selection fixed; avatars' paths adopted |
| P4 Gender / chips | partial | selection-driven styling fixed (D-50) |
| P5 What we heard | partial | replay wired, send icon and Hindi labels adopted |
| P6 Processing | not implemented | **still not implemented** (D-09) |
| P7 Mic denied | not implemented | **implemented** with text fallback + retry |
| P8 Review | partial | pencil icon, statuses, other-symptoms row; 3-column layout not rebuilt (D-31) |
| P9 Booking | material mismatch | time in CTA + More dates added; layout not rebuilt (D-16) |
| P10/P11 Slot states | material mismatch | inline states + retry; dedicated screens not built (D-48) |
| P12/P13 Confirmation | partial | 92 px circle + "Report sent to Dr X" note adopted (D-49) |
| P14 Emergency | partial | Hindi body fixed, no Back, 112 plain text |
| D1 Login | partial | password reveal added (D-27) |
| D2 Dashboard | high fidelity | unchanged |
| D3 Reports list | material mismatch | still a table (D-47) |
| D4 Report detail | partial | real warning flags, missing information, source chip, reviewer |
| D5 Urgent detail | partial | real rule/flags/routing, fail-closed authority |
| D6 Appointments | material mismatch | headers now match cells (Department / Reference); Figma layout not rebuilt |
| D7 Urgent list | material mismatch | unchanged |

**Visual acceptance: not met.** Five open findings, three partial.

---

## 5. Screen and component audit

- 12 patient and 8 doctor components plus `App`; 2 Edge Functions; 11 migrations.
- No component imports the Supabase client directly (only `src/lib/api.ts` does).
- The doctor conversation reader (`getDoctorMessages`) is intact and RLS-scoped; it renders
  stored patient rows only and never fabricates assistant text.
- Report v1.2 field statuses are preserved end to end (patient review, doctor detail).
- No fixture router, synthetic report table or credential-free doctor path exists in `src/`.

## 6. Icon and avatar audit

Adopted: Figma sidebar icon paths, 30×30 assistant and 28×28 patient line-art vectors,
16×16 edit pencil, paper-plane send, 92 px confirmation check. Still open: avatar white
containers (D-43/D-44), brand-plus metrics (D-45) and a few rounded-square icon
treatments. No glyph was invented or substituted with a different symbol.

## 7. Button and navigation verification

- Forward patient flow, Back on non-terminal screens, terminal guards on emergency and both
  confirmations, doctor list ↔ detail with preserved tab/search, logout, direct `/doctor`
  while logged out.
- Controls that previously did nothing now behave (consent greeting, play question again,
  try another date, more dates) or report honestly (missing session, slot load failure,
  session restore failure).
- Automated inventory: 6 controls audited, 0 unlabelled, 0 dead links, 100% accessible names;
  the audit's 72-control matrix remains the wider reference.

## 8. Patient workflow results

Real local stack: anonymous auth → consent → fixed questions → adaptive questions (bank-v2
ids such as `GM-002`) → draft → correction → submit → slots → booking → confirmation.
Hindi journey verified end to end. Emergency path verified separately. `demo_busy` verified
by exhausting the local cap.

## 9. Doctor workflow results

Login requires a mapped Supabase identity; an unmapped Auth user is signed out with
`not_a_doctor`. Dashboard, report list, report detail with real warning flags, stored
conversation, Mark Reviewed (timestamp + reviewer only), appointments, urgent queue.
General Medicine can read emergency reports; only the Emergency doctor can acknowledge.

## 10. Emergency certification

`feat/emergency-certification-v3` integrated. On the candidate: 209/209 — matcher scoping
(multi-occurrence, clause boundaries, negation window), deterministic rule order, fixed
clarification, live escalation matrix, doctor authorization (10 SQL blocks), logging privacy,
question-bank and phrase hash invariants. A rule match stops routine intake, shows plain 112
text, and never offers slots. The candidate's emergency screen has no Back control.

## 11. Microphone and recording verification

12-case recording lifecycle suite passes: start only after `getUserMedia`, wall-clock 30 s
timer, hard stop at 30 s, idempotent stop, track release, WAV re-encode, transcript preview
before acceptance, no silent re-capture. **Physical microphone hardware and real device
browsers were not exercised** (headless Chrome with emulated media only).

## 12. English/Hindi speech verification

- Mocked round-trip harness: **25/25** tests — Unicode-safe normalisation, punctuation and
  whitespace tolerance, material-mismatch detection, timeout and error paths, four-request
  budget, non-live default.
- **Live English and Hindi TTS→STT was NOT run** (no credential). It is not clinical
  accuracy validation and is not claimed.

## 13. Consent audio asset verification

| Item | Result |
|---|---|
| Cached asset resolution | `/audio/{lang}/{prompt}.mp3` first, then the shipped `{prompt}_{lang}.wav` |
| Provider call for a cached prompt | none (asserted in E2E) |
| Autoplay blocked vs missing asset | distinguished (two separate UI states) |
| Adaptive replay | one provider call per (language, question) per page session, then cache |
| Shipped files | 11 × 1.000 s, −91 dB, byte-identical → **not speech** |
| Generator | ready, dry-run default, double opt-in, silence/duration/duplicate validation |
| Live generation | **NOT RUN** — owner credential and budget reservation required |

## 14. Appointment and booking correctness

Real stack: 14-day Asia/Kolkata weekday slots, booking reserves atomically, duplicate slot
and duplicate report are refused, another patient cannot read or book the report, emergency
is permanently ineligible, flagged reports are held until review. Confirmation renders a
real IST date/time (captured). The client sends the slot's ISO `slot_start`; a slot id is
rejected.

## 15. Doctor conversation reader verification

`getDoctorMessages` returns stored patient answers ordered chronologically, with
`original_text` vs `final_text` and `input_mode`. Verified on the real stack (voice answer
shows both, bank-v2 ids render, another department cannot read it). Draft reports are never
visible.

## 16. Authentication and RLS verification (real local stack)

| # | Check | Result |
|---|---|---|
| 1 | Anonymous patient authentication | PASS |
| 2 | Session creation and ownership | PASS |
| 3 | Patient report submission | PASS |
| 4 | Message insertion | PASS |
| 5 | Doctor authentication | PASS |
| 6 | Doctor ↔ profile mapping (and refusal when unmapped) | PASS |
| 7 | Assigned General Medicine doctor access | PASS |
| 8 | Emergency report cross-visibility | PASS |
| 9 | Emergency-only acknowledgement | PASS |
| 10 | Cross-department access rejection | PASS |
| 11 | Report immutability and draft invisibility | PASS |
| 12 | Appointment booking | PASS |
| 13 | Duplicate appointment rejection | PASS |
| 14 | Unauthenticated / invalid JWT access | PASS (401/denied); **clock-based expiry not simulated** |
| 15 | Edge Function authorization | PASS |
| 16 | Consent persisted with version and text | PASS |

This is genuine database + API verification, not the simulated in-memory suite (which also
still passes, 7/7, as a contract regression only).

## 17. Supabase setup readiness

`docs/release-readiness/HOSTED-SUPABASE-SETUP.md` — 14 ordered owner steps with exact
commands: project creation, project ref, 11 migrations, seed, two Auth users, mapping via
`scripts/map-doctor-profiles.ts`, three secrets, both function deploys, JWT check, CORS
origin, hosted smoke list, RLS checks, workflow checks, rollback.

Deployment preflight on the candidate: **17 PASS / 0 FAIL / 5 owner-blocked** (link project,
3 secrets, provider mode). No secret value is read or printed by any check.

## 18. Vercel setup readiness

`docs/release-readiness/VERCEL-DEPLOYMENT.md`: verified build command (`tsc && vite build`),
output `dist`, SPA rewrite, public-only `VITE_` variables, preview/production separation,
exact-origin CORS linkage, 12-step smoke list, rollback by promoting the previous deployment.
No server secret is exposed to Vite variables.

## 19–20. Defect register and severity summary

### Totals

| Severity | Count | Fixed & verified | Owner action | Still open |
|---|---|---|---|---|
| P0 | 1 | 1 | 0 | 0 |
| P1 | 13 | 11 | 2 | 0 |
| P2 | 31 | 21 | 2 | 8 |
| P3 | 10 | 9 | 0 | 1 |
| **Total (55)** | **55** | **42** | **4** | **9** |

No P0 or P1 defect remains open. The four owner-action items are: prompt audio (D-06 /
N-02, counted once under each ID), urgent-review authority (D-30) and consent copy (D-34).
They are owner decisions or owner-only generation, not defects in the delivered code.

### Register

| ID | Sev | Finding | Current implementation | Evidence | Status |
|---|---|---|---|---|---|
| D-01 | P0 | Doctor warning flags hardcoded to “None” | `describeWarningFlags()` reads `possible_urgent`, `needs_human_review`, `emergency_rule_id`; shared `WarningFlags` component renders flags / “None” / unavailable / malformed | 11 unit tests; urgent-detail capture shows `Possible urgent` + `Emergency rule: severe_chest_pain` | FIXED AND VERIFIED |
| D-02 | P1 | Back on emergency restores routine intake | `emergency` terminal in `resolveBackNavigation`; no Back control; answer handlers short-circuit | navigation tests; E2E assertion | FIXED AND VERIFIED |
| D-03 | P1 | Confirmation shows “Invalid Date” | ISO `slot_start`, mock rejects a slot id, IST formatter with explicit fallback | 4 unit tests; captured confirmation | FIXED AND VERIFIED |
| D-04 | P1 | `demo_busy` ignored at session start | Busy notice + retry on Welcome; consent disabled with a message | 2 unit tests; cap exercised on the real stack | FIXED AND VERIFIED |
| D-05 | P1 | Mic-denied screen missing | Real denied state with text fallback and retry | component render; E2E text path | FIXED AND VERIFIED |
| D-06 | P1 | No cached greeting; paid replay per click | Cached-first resolution, provider never called for fixed prompts, per-session TTS cache, blocked-vs-missing states | E2E audio instrumentation; generator; manifest | **OWNER ACTION** |
| D-07 | P1 | Hindi emergency body English | `t.emergency.guidance` + notice | Hindi E2E | FIXED AND VERIFIED |
| D-08 | P1 | Production fixtures / credential-free doctor | all `FIGMA_*` bypasses deleted; source-scan test; login always required | source-scan test; bundle scan | FIXED AND VERIFIED |
| D-09 | P2 | Processing screen not a real state | still only an inline indicator | component audit | **STILL OPEN** |
| D-10 | P1 | Back from confirmation re-opens booking | terminal confirmations; read-only submitted summary; duplicate booking refused | navigation tests; booking tests | FIXED AND VERIFIED |
| D-11 | P1 | Back → consent resets intake | idempotent consent; state restored | mock + real-stack journeys | FIXED AND VERIFIED |
| D-12 | P1 | `other_symptoms` not correctable | row + multi-value editor | review render test | FIXED AND VERIFIED |
| D-13 | P2 | “Try another date” does nothing | searches the next date with a free slot | unit test | FIXED AND VERIFIED |
| D-14 | P2 | All absences shown as “Not provided” | six distinct status labels | unit tests | FIXED AND VERIFIED |
| D-15 | P2 | Missing information recomputed | reads `report.missing_information` | unit test; doctor detail | FIXED AND VERIFIED |
| D-16 | P2 | Booking layout differs | time in CTA, More dates; layout not rebuilt | screen audit | **STILL OPEN** |
| D-17 | P2 | Fixture dashboard/list mismatch | single data source, computed badges | doctor tests | FIXED AND VERIFIED |
| D-18 | P2 | Appointment headers mismatch cells | relabelled Department / Reference (no invented demographics) | unit test; N-01 | FIXED AND VERIFIED |
| D-19 | P2 | “Play question again” navigates away | replay handler wired | component + E2E | FIXED AND VERIFIED |
| D-20 | P2 | No “More dates” | 14-day window control | component | FIXED AND VERIFIED |
| D-21 | P2 | Browser-timezone slot times | explicit Asia/Kolkata formatting | datetime tests | FIXED AND VERIFIED |
| D-22 | P2 | Slot-load error looks like “no slots” | distinct error state + retry | component | FIXED AND VERIFIED |
| D-23 | P2 | Silent session loss on refresh | explicit restore-failure message | component + E2E | FIXED AND VERIFIED |
| D-24 | P2 | Hidden links are first tab stops | removed from tab order | E2E accessibility | FIXED AND VERIFIED |
| D-25 | P2 | Doctor load errors swallowed | loading/error/retry, last good data kept | component | FIXED AND VERIFIED |
| D-26 | P2 | Hardcoded English on patient screens | emergency/review/what-we-heard fixed; “Press Send…”, “Draft Preview”, “Session Ended Privately”, “Back to start” remain | source audit | **STILL OPEN** |
| D-27 | P3 | No password reveal | eye toggle | component | FIXED AND VERIFIED |
| D-28 | P3 | No in-flight disabling | submit/book/edit disabled while pending | component | FIXED AND VERIFIED |
| D-29 | P2 | Reports filter state lost on Back | tab/search lifted to shell | component | FIXED AND VERIFIED |
| D-30 | P2 | Urgent review authority ambiguity | fail-closed: Emergency doctor only, in UI **and** RPC | 10 SQL blocks, 9 authorization blocks, 5 live scenarios | **OWNER ACTION** |
| D-31 | P2 | Review row layout differs | pencil icon adopted; 3-column layout not rebuilt | screen audit | **STILL OPEN** |
| D-32 | P2 | Reviewer name hardcoded | resolved via `reviewed_by` → doctor display name | unit test | FIXED AND VERIFIED |
| D-33 | P2 | Source chip hardcoded | derived from report language + input modes | unit test | FIXED AND VERIFIED |
| D-34 | P2 | Consent copy divergence | versioned consent text shown, greeting spoken; decision documented | `OWNER-DECISIONS.md` | **OWNER ACTION** |
| D-35 | P2 | Urgent detail hardcoded | report data + routing snapshot | unit test | FIXED AND VERIFIED |
| D-36 | P3 | `canReview` fails open | deny by default | unit test | FIXED AND VERIFIED |
| D-37 | P2 | Submitted report shown as draft after Back | read-only submitted summary | unit test; navigation | FIXED AND VERIFIED |
| D-38 | P3 | Language not persisted | localStorage + `documentElement.lang` | E2E Hindi journey | FIXED AND VERIFIED |
| D-39 | P2 | Conversation dead end | explicit panel with End | unit test | FIXED AND VERIFIED |
| D-40 | P3 | Silent microphone re-capture | reported, never re-records | code + tests | FIXED AND VERIFIED |
| D-41 | P3 | Navigate before answer accepted | await then navigate | code + tests | FIXED AND VERIFIED |
| D-42 | P3 | Appointments default to Today | Upcoming default | unit test | FIXED AND VERIFIED |
| D-43 | P2 | Assistant avatar glyph/container | exact vector adopted; container remains | screen audit | **STILL OPEN** |
| D-44 | P2 | Patient avatar glyph/container | exact vector adopted; container remains | screen audit | **STILL OPEN** |
| D-45 | P3 | Brand plus metrics | unchanged | screen audit | **STILL OPEN** |
| D-46 | P3 | Gender prints lower-case | capitalised / mapped | unit test | FIXED AND VERIFIED |
| D-47 | P2 | Reports list is a table | not rebuilt | screen audit | **STILL OPEN** |
| D-48 | P2 | No dedicated slot-state screens | inline states only | screen audit | **STILL OPEN** |
| D-49 | P2 | Confirmation layout differs | 92 px circle + report-sent note | capture | FIXED AND VERIFIED |
| D-50 | P3 | Severity chip always dark | selection-driven | component | FIXED AND VERIFIED |
| N-01 | P1 | Design branch fabricated demographics and a fallback date | rejected at merge; data-driven behaviour retained | `01730a8`; N-05 | FIXED AND VERIFIED |
| N-02 | P1 | Shipped prompt audio is silence | manifest + guarded generator; placeholders proven −91 dB | manifest, validator | **OWNER ACTION** |
| N-03 | P2 | Design corrections uncommitted | committed as `78b68c2`; src diff byte-identical | sha256 comparison | VERIFIED ALREADY FIXED |
| N-04 | P2 | Backup-restore rehearsal not executable | platform baseline created inside the scratch DB; dump pair documented | real dump restored, 11 tables + 5 functions | FIXED AND VERIFIED |
| N-05 | P1 | Lossy merge `aa11a14` re-introduced fabricated data and broke the build | six files restored from the validated tree; `tsc` clean; `src/` byte-identical to validation | `01730a8` | FIXED AND VERIFIED |

---

## 21. Test results with execution environment

| Suite | Environment | Command | Result |
|---|---|---|---|
| TypeScript | macOS, local | `npx tsc --noEmit` | clean |
| Frontend mock/unit | Node 26 + tsx | `npm run test:mock` | 121/121 |
| Supabase contract (**simulated**) | Node + tsx | `npm run test:supabase` | 7/7 |
| **API integration (real local stack)** | Docker + Supabase CLI 3.0.0 + real Edge Functions + stubbed providers | `npm run test:api` | **55/55** |
| Integration harness (real stack) | same | `deno run supabase/tests/integration.ts` | 52/52 |
| Adaptive harness (real stack) | same | `deno run supabase/tests/adaptive.ts` | 33/33 |
| Emergency certification (real stack) | same | `deno run supabase/tests/emergency-certification.ts` | 209/209 |
| SQL RLS/authorization/booking/immutability | local Postgres container | 8 files via `psql` | 47 assertion blocks, all pass |
| Backend Deno unit | Deno 2.9.7, mocked providers | `deno test _shared/ .` | 232/232 |
| Prompt-audio manifest drift | Deno | `deno test supabase/tests/prompt-audio-manifest.test.ts` | 3/3 |
| Speech round-trip (**mocked**) | Deno | `deno test supabase/tests/provider-roundtrip.test.ts` | 25/25 |
| Provider smoke (**mocked**) | Deno | `deno test supabase/tests/provider-smoke.test.ts` | 17/17 |
| Browser E2E | headless Chrome, built bundle | `npm run test:e2e` | 16/16 |
| Visual QA | headless Chrome, 7 viewports | `npm run test:visual` | pass, 23 screenshots |
| Production build | Vite 6 | `npm run build` | pass, 111 modules |
| Unified release gate | local stack | `deno run --allow-all scripts/release-check.ts --frontend` | 30 PASS / 0 FAIL / 0 BLOCKED |
| Deployment preflight | local | `scripts/verify-deploy-config.ts` | 17 PASS / 0 FAIL / 5 owner-blocked |
| Demo preflight | local | `scripts/demo-preflight.ts` | 16/16 |
| Backup → restore | local dump → scratch DB | `scripts/verify-backup-restore.ts --execute` | pass, then dropped |

Local stack: Supabase CLI 3.0.0, PostgreSQL 17.11, Edge Runtime 1.77.8, Docker 29.9.2.
Providers were served by `supabase/tests/stub-providers.ts`; **no live provider request was
made**.

## 22. Blocked, skipped and untested

| Item | Reason |
|---|---|
| Live Groq / Prisma / Timbre | no credential; explicit owner authorization required |
| Live English/Hindi speech round-trip | same |
| Live prompt-audio generation | same (generator ready) |
| Hosted Supabase smoke | no hosted project was created or linked |
| Hosted Vercel deployment | not deployed by instruction |
| Physical microphone, iOS/Android, Safari, Firefox | no devices/browsers available |
| Screen-reader pass (VoiceOver/NVDA) | not available in this environment |
| Clock-based JWT expiry | not simulated; unauthenticated/invalid JWT is covered |
| 15-turn cap in the browser | unreachable in mock mode (completes ≤13 turns); covered by unit tests |
| Clinical speech accuracy | explicitly out of scope |

A local-stack pass is not a hosted pass, and a stubbed-provider pass is not provider
verification.

## 23. Owner decisions and required actions

1. **Generate prompt audio** (10 files) with the verified Timbre model, after reserving the
   attempts in the daily limit; then complete the listening pass. `scripts/generate-prompt-audio.ts`.
2. **Record D-30** (urgent-review authority) and the urgent-queue question.
3. **Record D-34** (consent copy) and approve the Hindi consent wording.
4. **Create and link the hosted project**, apply migrations/seed, create the two doctor
   users, map them, set the three secrets, deploy both functions.
5. **Set the Vercel project**, the two public env vars and the exact origin in
   `ALLOWED_ORIGINS`.
6. **Run the hosted smoke list** and record the result.
7. **Approve the merge** of `release-candidate/samvad-final` into the permanent release
   branch (not done here).

## 24. Deployment checklist and rollback

**Before deployment:** owner decisions recorded · audio generated and listened to · secrets
set · exact CORS origin set · migrations 11 and seed applied · two doctors mapped · preflight
green · local suites green · release gate green.

**Deployment order:** Supabase migrations → seed → doctor users → mapping → secrets →
`chat-turn` → `speak` → Vercel project → env vars → deploy → CORS origin redeploy →
hosted smoke.

**Rollback:** promote the previous Vercel deployment; redeploy the previous functions;
restore the pre-migration backup for schema failures; ban the doctor accounts or pause the
Vercel project to stop public access. Details in both readiness documents.

## 25. Final recommendation

The release candidate is **technically ready for owner-supervised deployment** and is the
first version in which the backend has been verified against a real database, real JWT
handling, real RLS and real Edge Functions. It is **not yet ready for public evaluator
access**: prompt audio is silent, two owner decisions are unrecorded, five visual findings
remain open, and neither the hosted environment nor a live provider has been exercised.

No claim of launch, production readiness or clinical validity is made. Merge, deployment and
hosted setup remain owner actions.
