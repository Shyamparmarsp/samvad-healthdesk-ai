# Backend Operations Manual

Day-to-day operation of the two Edge Functions, the database and the release gates.
Every command here was executed in this environment unless marked otherwise.

## 1. Architecture in one page

- Two Edge Functions only: `chat-turn` (six actions) and `speak` (adaptive TTS).
- PostgreSQL owns authorisation: RLS + five SQL functions (four `SECURITY DEFINER`,
  one `SECURITY INVOKER`). Browsers have no write grant on any server-owned table.
- Provider calls (Groq / Prisma / Timbre) are optional; every failure has a text fallback.
- Daily usage is reserved atomically per IST day before any expensive action.

## 2. Local stack

```bash
npx supabase start
npx supabase functions serve --env-file supabase/functions/.env
deno run --allow-net supabase/tests/stub-providers.ts 8787   # provider stub
```

Health: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:54321/functions/v1/chat-turn`
→ **401** (JWT enforced, function alive).

## 3. The release gate

```bash
export LOCAL_SERVICE_KEY=$(npx supabase@latest status -o env | grep '^SERVICE_ROLE_KEY=' | cut -d'"' -f2)
deno run --allow-all scripts/release-check.ts --frontend    # + --skip-smoke for a fast pass
```

| Script | Purpose |
|---|---|
| `release-check.ts` | orchestrated gate; PASS/FAIL/BLOCKED/NOT TESTED + JSON |
| `verify-db-release.ts` | read-only "is this database ready?" (29 checks) |
| `rehearse-db.ts` | clean-room rebuild in a disposable database (28 checks) |
| `demo-preflight.ts` | stack, stub, usage headroom, migration ledger, CORS probes |
| `demo-smoke.ts` | 52 HTTP + 29 adaptive scenarios, isolated identities, self-only cleanup |
| `verify-deploy-config.ts` | production config presence checks (never prints secrets) |
| `map-doctor-profiles.ts` | owner-safe doctor mapping (dry run by default) |
| `question-bank-status.ts` | reviewer dashboard (never approves anything) |

## 4. Idempotency — what a retry does

| Action | Retry behaviour |
|---|---|
| `start_session` | creates a **new** session and consumes one session slot. Not deduplicated: there is no client key in the contract. A lost response therefore risks one wasted slot, never duplicate clinical data. |
| `record_consent` | replay of the same decision returns the current state, no second consent row |
| `submit_turn` | unique `(session_id, turn_index)`; a duplicate cannot consume a second turn |
| transcript confirm | confirming an already-accepted turn hits the same unique index |
| `correct_draft_report` | last write wins on a draft; a submitted report returns `invalid_state` |
| `submit_report` | **idempotent**: replay returns the stored submitted report, not an error |
| `speak` | stateless; repeated calls may re-synthesise (bounded by the Timbre counter) |
| `mark_report_reviewed` | idempotent, first timestamp preserved |
| `book_appointment` | idempotent for the same slot (`already_booked: true`) |

## 5. Failure semantics

| Stage | Client sees | Log event |
|---|---|---|
| usage cap | `demo_busy` / provider fallback | `usage_capped` |
| provider timeout | `provider_unavailable` | `provider_attempt{ok:false}` |
| provider key missing | text fallback | `provider_failure{reason:"missing_key"}` |
| contract violation | 4xx code | `action_rejected{code}` |
| unexpected | 500 `internal` | `action_rejected{code:"internal"}` |

Every request logs one `request_completed` line with a random `correlation_id`, the
action, the HTTP status and `duration_ms`. No patient identifier is ever included.

## 6. Report lifecycle guarantees

- `draft` → private, patient-correctable, never visible to a doctor.
- `draft` → `submitted` is the only status transition a patient can cause.
- After leaving `draft`, a database trigger (`reports_guard_terminal`) freezes clinical
  content, routing, flags, reference, ownership and status. Only `reviewed_at` /
  `reviewed_by` remain writable.
- `urgent_partial` keeps `summary: null` and can never be booked, even after review.

## 7. Troubleshooting

| Symptom | Check |
|---|---|
| every call 401 | JWT missing; anonymous sign-in disabled |
| 404 on resume | session belongs to another identity (correct behaviour) |
| doctor portal empty | `doctor_profiles` mapping missing |
| no slots | report not `submitted`, department not bookable, or review hold |
| `demo_busy` | daily session cap for the IST day |
| voice fails | `audio/webm` rejected → send WAV; or provider unavailable |

## 8. What must never be done

- No live provider call from tests or CI.
- No remote migration/seed/deploy without explicit owner approval.
- No weakening of JWT, RLS or ownership to work around a platform behaviour.
- No patient data, transcript, audio or credential in logs.
