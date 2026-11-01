# Operational Logging and Demo Capacity

Two operational concerns, both code-derived. Nothing here is inferred.

---

# Part 1 — What is logged, and what is deliberately excluded

`supabase/functions/_shared/logging.ts` emits structured single-line JSON events:

| Event | Fields | Emitted when |
|---|---|---|
| `provider_attempt` | `provider`, `ok` | after every Groq / Prisma / Timbre call |
| `provider_failure` | `provider`, `reason` (e.g. `missing_key`) | provider unusable |
| `usage_capped` | `counter` (`sessions`/`groq`/`prisma`/`timbre`) | daily reservation refused |
| `action_rejected` | `action`, `code` | a request was refused with a stable code |
| `action_completed` | `action`, plus safe routing fields (`source`, `reason`) | successful state transition |

Deliberately **never** logged:

- patient text, transcripts, `original_text`/`final_text`
- audio bytes, base64, MIME payloads
- API keys, `Authorization`/`apikey` headers, JWTs
- provider request or response bodies, prompts, model output text
- SQL, SQLSTATE text, stack traces

Correlation: events carry no session id or user id, so a log line can never be joined back
to a patient. That is intentional — the MVP has no analytics requirement, and adding one
would create a health-data store.

Failure stages are distinguishable: `usage_capped` (quota) vs `provider_failure` (missing
key / auth) vs `provider_attempt{ok:false}` (timeout or malformed response) vs
`action_rejected{code}` (contract). A provider timeout is reported as
`provider_unavailable` to the client, never as a success.

No analytics tables, no new services, no per-request telemetry store.

---

# Part 2 — Demo capacity model

Derived from the code paths, not estimated.

## Costs per action

| Action | sessions | groq | prisma | timbre |
|---|---|---|---|---|
| `start_session` | **1** | 0 | 0 | 0 |
| `record_consent` | 0 | 0 | 0 | 0 |
| scripted answer turn | 0 | 0 | 0 | 0 |
| audio answer (preview) | 0 | 0 | **1** | 0 |
| adaptive question selection | 0 | **1** | 0 | 0 |
| `speak` for an adaptive question | 0 | 0 | 0 | **1** |
| draft creation (department routing) | 0 | **1** | 0 | 0 |
| `resume_session` | 0 | 0 | 0 | 0 |
| correction / submission | 0 | 0 | 0 | 0 |
| **rejected request** (4xx/401) | 0 | 0 | 0 | 0 |

A `postMessage`-free UI therefore costs, per session: 1 session + ~1–2 Groq (routing and,
when the report is incomplete, adaptive selection).

## A normal demo journey (10 text answers, no voice)

1 session, 1 Groq (draft routing), 0 Prisma, 0 Timbre.

## A voice-first journey (10 answers, 3 adaptive questions with speech)

- sessions **1**
- prisma **10** (one per audio turn; the preview re-uses the same stored transcript)
- groq **2** (routing + adaptive selection)
- timbre **3** (only adaptive questions are synthesised; cached prompts never are)

## Approximate evaluator capacity at the approved defaults (100 / 300 / 150 / 120 per IST day)

| Limit | Value | Binding constraint |
|---|---|---|
| sessions | 100 | 100 text journeys, or ~15 voice journeys (Prisma-bound) |
| groq | 300 | ~150 journeys at 2 calls each |
| prisma | 150 | **15 voice journeys** at 10 audio turns — the real ceiling |
| timbre | 120 | 40 journeys at 3 adaptive questions |

**The Prisma call budget is the binding constraint for a voice-first demo.** For a
judging day, either keep most answers typed, or raise `prisma` to 300–400 with owner
approval (this consumes real provider credit).

## Guarantees verified by tests

| Property | Evidence |
|---|---|
| Atomic reservation | `constraints.sql`, concurrency run (5/15 and 14/6 splits) |
| IST day bucketing | `ist_boundary.sql` (23:59:59 vs 00:00:01, independent counters) |
| Midnight reset | new `counter_date` row; previous day untouched |
| `demo_busy` | API test asserts the envelope, UI test asserts the state |
| No provider call after the turn cap | `speak` returns text at the cap; `chat-turn` refuses the 16th answer |
| Failed attempt still consumes one call | reservation precedes the attempt |

## Cross-check command

```bash
deno run --allow-net --allow-env --allow-read --allow-run scripts/demo-preflight.ts
```

reports every counter's headroom and warns above 80%. Recommended evaluator quota: keep
the approved defaults, and raise only `prisma` if the demo will be voice-first.
