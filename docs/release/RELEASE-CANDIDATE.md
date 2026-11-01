# Release Candidate — Test Report and Coverage Matrix

**Branch:** `release/samvad-rc1` · **Worktree:** `../samvad-integration`
**Backend:** `feat/backend`
**Date:** 2 November 2026
**Status:** every executable check below was actually run in this session.

This report separates evidence by layer. A passing mock test is never presented as proof
of real Supabase behaviour, and stubbed provider calls are never presented as live
verification.

---

## 1. Evidence layers (read this before quoting any number)

| Layer | What it proves | Where |
|---|---|---|
| **A. Mock / unit** | pure logic, API adapter behaviour against an in-memory backend | `tests/contract-regression`, `tests/patient-flow`, `tests/doctor-flow` |
| **B. Simulated backend (NOT real)** | contract wiring inside a hand-written fake of the schema/RPCs | `tests/supabase-mode`, `tests/local-supabase-journey` |
| **C. Real local database** | migrations, seeds, RLS, constraints, grants, SQL functions | `supabase/tests/*.sql` via `psql` |
| **D. Real local Edge Function HTTP** | actual `chat-turn`/`speak` invocations, real JWT, real Postgres, stubbed providers | `supabase/tests/integration.ts`, `adaptive.ts` |
| **E. Real browser → Supabase** | the built app driving real Auth, Functions, Postgres, RLS, RPCs; stubbed providers | `tests/api/browser/*.mjs` |
| **F. Real browser → mock API** | UI behaviour, accessibility, i18n, layout | `tests/verify-interactions.mjs` |
| **G. Live providers** | real Groq / Prisma / Timbre | **NOT TESTED** (deliberate; no live calls) |

---

## 2. Results by layer

| Layer | Command | Result |
|---|---|---|
| A | `npm run test:mock` | **26 / 26 PASS** |
| B | `npm run test:supabase` | **7 / 7 PASS** (simulated — not real-stack evidence) |
| A+B | `npm test` (includes C/E via `test:api`) | **84 / 84 PASS** |
| C | 6 SQL suites via `psql` | **32 / 32 assertion blocks PASS** |
| D | `scripts/demo-smoke.ts` | **52/52 integration + 29/29 adaptive PASS**, exit 0 |
| E | `npm run test:api:browser` | **17 / 17 PASS** |
| E | `npm run test:api:browser:extras` | **9 / 9 PASS** |
| F | `npm run test:e2e` | **16 / 16 journeys PASS** |
| — | `npx tsc --noEmit` | **PASS** |
| — | `npm run build` | **PASS** (543 kB js / 145 kB gzip; one chunk-size warning only) |
| — | Deno unit tests `supabase/functions/` | **181 / 181 PASS** |
| — | `deno check chat-turn + speak` | **PASS** |
| G | live providers | **NOT TESTED** |

### Layer C detail

| Suite | Assertions | Result |
|---|---|---|
| `rls.sql` | 5 | PASS |
| `constraints.sql` | 4 | PASS |
| `mark_reviewed.sql` | 10 | PASS |
| `booking.sql` | 4 | PASS |
| `ist_boundary.sql` | 4 | PASS |
| `doctor_appointments.sql` | 5 | PASS |

### Layer E detail — `supabase-journey.mjs` (17)

1. patient anonymous sign-in + welcome
2. English consent copy rendered
3. consent accepted → first scripted question
4. audio capture → transcript preview (stub Prisma, **real** WAV upload → Edge Function → Postgres)
5. transcript editable before acceptance
6. confirmed transcript counts as one answered turn
7. full scripted intake completes through the real backend
8. review screen renders persisted report fields
9. submission → booking screen
10. availability from `get_available_slots`
11. booking persisted; confirmation shows the server reference `APT-YYYYMMDD-XXXXXX`
12. doctor email/password sign-in against real Auth
13. doctor sees the submitted report through RLS
14. report detail → Mark Reviewed
15. `reviewed_at`/`reviewed_by` persisted
16. appointment row in PostgreSQL matches the UI reference
17. zero uncaught page errors

### Layer E detail — `supabase-extras.mjs` (9)

1. consent denied → no report, no messages, session `declined`
2. Hindi consent + Devanagari UI
3. Hinglish answer stored verbatim, `sessions.language = 'hi'`
4. clear emergency → 112 guidance, `urgent_partial`, no slots
5. ambiguous emergency → Yes/No clarification → Yes escalates
6. “Not now” → submitted report, zero appointments
7. unparseable required answer → department-aware adaptive bank question
8. adaptive question survives a page reload (`resume_session`)
9. zero uncaught page errors

---

## 3. Coverage matrix — user action → evidence

| # | User action | Evidence | Layer | Status |
|---|---|---|---|---|
| 1 | Anonymous patient sign-in | journey #1, api patient-journey | E, D | PASS |
| 2 | English consent | journey #2–3 | E | PASS |
| 3 | Hindi consent + wording | extras #2 | E | PASS |
| 4 | Scripted intake (10 answers) | journey #7, smoke, api | E, D | PASS |
| 5 | Adaptive bank question | extras #7, api safety | E, D | PASS |
| 6 | All 150 bank questions valid | `export-question-bank.ts --check`, deno `question-bank.test` | unit | PASS |
| 7 | Hindi/English text + localised options | extras #2, api safety (`text_hi`) | E, D | PASS |
| 8 | 3-adaptive-question cap | api safety, backend `adaptive.ts` | D | PASS |
| 9 | 15-answer cap | api safety (`is_cap_reached`), backend `progression.test` | D, unit | PASS |
| 10 | Audio capture | extras/journey #4, WAV encoder | E | PASS |
| 11 | Transcript preview + edit | journey #4–5 | E | PASS |
| 12 | Confirmed answer submission | journey #6 | E | PASS |
| 13 | Report v1.2 + gender-declined | api patient-journey (declined, null value) | D | PASS |
| 14 | Report correction (allowlist) | api patient-journey (update + 2 rejections) | D | PASS |
| 15 | Report submission | journey #9, api | E, D | PASS |
| 16 | Doctor email/password login | journey #12, api | E, D | PASS |
| 17 | Doctor RLS report read | journey #13, api contract | E, D | PASS |
| 18 | Mark Reviewed | journey #14–15, SQL `mark_reviewed` | E, C | PASS |
| 19 | Availability RPC | journey #10, api | E, D | PASS |
| 20 | Atomic booking | journey #11, `booking.sql` | E, C | PASS |
| 21 | Idempotent retry | api patient-journey, SQL booking | D, C | PASS |
| 22 | Slot conflict | api patient-journey (`slot_taken`) | D | PASS |
| 23 | Consent denied | extras #1 | E | PASS |
| 24 | Not now | extras #6 | E | PASS |
| 25 | Emergency positive | extras #4 | E | PASS |
| 26 | Ambiguous clarification Yes | extras #5 | E | PASS |
| 27 | Clarification No / unresolved | api safety | D | PASS |
| 28 | GM cannot review Emergency | SQL `mark_reviewed`, api contract | C, D | PASS |
| 29 | Cross-patient isolation | api contract, SQL `rls` | D, C | PASS |
| 30 | Unassigned doctor denied | api contract | D | PASS |
| 31 | Invalid/expired session | api contract (401), api `not_found` | D | PASS |
| 32 | `demo_busy` | api safety, `handleStartSession` | D | PASS |
| 33 | Provider failure fallback | deno provider tests, api `speak` text fallback | unit, D | PASS |
| 34 | Adaptive resume after reload | extras #8 | E | PASS |
| 35 | Doctor appointments read | api patient-journey, SQL `doctor_appointments` | D, C | PASS |
| 36 | Dashboard stats | api patient-journey | D | PASS |
| 37 | Session resume | extras #8, api patient-journey | E, D | PASS |
| 38 | Sign-out | api patient-journey (`doctorLogout`) | D | PASS |
| 39 | Speech generation | api safety (`speak` → object URL) | D | PASS |
| 40 | Speech playback in UI | **not asserted** — the UI calls `speak` only for adaptive questions and the browser suite stops before playback | — | **NOT TESTED** |
| 41 | Live Groq / Prisma / Timbre | — | G | **NOT TESTED** |
| 42 | Production deployment | — | — | **BLOCKED** (owner approval) |

### Known gaps — stated plainly

- **#40 speech playback.** `speak` is verified at the Edge Function and API layer
  (real audio bytes → object URL). The browser journey does not play the audio element,
  because the UI only requests speech for adaptive questions and the journey asserts the
  rendered question rather than the player. Playback remains **NOT TESTED** in-browser.
- **#41 live providers.** Never called. All provider evidence is stub-based.
- **Two of 26 browser checks use synthetic audio** when the headless browser has no
  microphone; the request is still a valid WAV that traverses the real pipeline.

---

## 4. Defects found and fixed in this cycle

| Defect | Impact | Fix |
|---|---|---|
| Voice path uploaded `audio/webm` + a placeholder string | mic button always failed with `invalid_request`; transcript preview unreachable in real mode | `src/lib/audio/voice.ts` WAV encoder; `PatientShell` sends real WAV |
| UI fabricated a transcript when the backend returned none | violates “never claim success before the backend confirms” | fallback removed; `provider_unavailable` now offers text |
| API suites ran concurrently against one database and the `demo_busy` test lowers the global cap | intermittent cross-suite failures | `test` split into sequential stages; `test:api` uses `--test-concurrency=1` |
| (earlier cycle) `speak` rejected every adaptive bank id | paid TTS path unreachable | backend accepts bank ids |
| (earlier cycle) `doctorLogin` seeded-email fallback | any authenticated account could claim a doctor profile | rejected + signed out |
| (earlier cycle) `bookAppointment` matched demo ids | wrong doctor name on every confirmation | resolved by uuid |
| (earlier cycle) doctor appointments unreadable | “Booked” always 0 | `get_doctor_appointments()` RPC |

---

## 5. Test-integrity guards added during this release

Two false-positive risks were found and closed while re-running on the final HEAD:

1. **Silent mock-mode run.** The app picks its mode from the `VITE_*` variables baked at
   build time. A build made without them makes every browser assertion pass against the
   in-memory mock while proving nothing about Supabase. Both browser scripts now refuse to
   report: `assertRealSupabaseTraffic()` fails the run unless a `chat-turn` request
   actually reached the configured Supabase URL. The journey prints the observed count
   (`3 real Edge Function request(s)`).
2. **Shared `dist` between suites with opposite modes.** `test:e2e` (mock) and
   `test:api:browser` (Supabase) consume the same build output, so whichever ran last
   silently decided the mode. `npm run test:e2e` now runs `build:mock` itself, which
   clears `VITE_SUPABASE_*` for that build; the browser scripts build with the real
   variables inside the run.

Both hazards would have produced a green report that was not evidence. They are called
out here rather than quietly fixed.

## 6. Operational note

`npm run test:e2e` binds port 4173 and CDP port 9222. A stale `vite preview` from an
earlier aborted run makes it hang without output. Clear the ports first:

```bash
pkill -f "vite preview --port 4173"
lsof -nP -iTCP:4173 -sTCP:LISTEN   # expect no output
```
