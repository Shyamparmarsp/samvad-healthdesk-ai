# API Error Reference (frontend)

`error` is always a **stable code** from `supabase/functions/_shared/errors.ts` — never
prose, never patient data, never SQL or provider text. The frontend owns all copy and all
translation.

Two delivery styles:

- **Thrown** (`ApiError` with `.code` / `.status`): the request failed at transport or
  contract level, or a domain action was refused.
- **Returned on a 200 envelope** (`response.error`): an expected state the UI must render
  (cap reached, provider unavailable, …). These are **not** thrown — read them from the
  response.

## Domain states returned with HTTP 200

| Code | Meaning | UI behaviour |
|---|---|---|
| `demo_busy` (also `demo_busy: true`) | daily session cap reached | show the approved demo-busy state; do not create a session |
| `turn_cap_reached` | 15 accepted answers | if `can_submit` false, show the incomplete preview with **End** only |
| `provider_unavailable` | Prisma/Timbre/Groq failed or is capped | offer text entry / text question; never claim success |
| `transcript_empty` | no speech detected | ask to repeat or type; no turn consumed |
| `audio_in_progress` | another audio attempt holds the claim | retry shortly |
| `audio_superseded` | a late transcription arrived after the session moved on | discard; refresh |

## Refusals (thrown, with HTTP status)

| Code | HTTP | Meaning | Recovery |
|---|---|---|---|
| `invalid_request` | 400 | malformed body, unknown key, bad consent version, bad audio format/size | fix the request; never blind-retry |
| `invalid_question` | 400 | unknown question id | client bug |
| `field_not_editable` | 400 | correction touched routing/flags/status/summary/reference | client bug |
| `invalid_field_status` | 400 | declining a required field (gender excepted) | client bug |
| `unauthorized` | 401 | missing/invalid JWT | re-authenticate |
| `not_found` | 404 | session/report not owned by this identity | do not retry; do not reveal why |
| `invalid_state` | 409 | action not allowed now (e.g. correcting a submitted report) | `resume_session` |
| `invalid_question_state` | 409 | answer for a question that is no longer current | `resume_session` |
| `internal` | 500 | unexpected failure | show a retry state |

## PostgREST / RPC SQLSTATEs (mapped by `src/lib/api.ts`)

| SQLSTATE | API code | Meaning | UI |
|---|---|---|---|
| `23505` | `slot_taken` | slot taken, or this report already booked another slot | refresh availability |
| `42501` | `review_hold` | booking held until a doctor reviews | approved hold copy |
| `22023` | `not_bookable` | draft / `urgent_partial` / emergency / bad horizon | no slots UI; emergency → 112 only |
| `P0002` | `not_found` | report not found or not owned | generic failure |
| `28000` | `unauthorized` | not authenticated | re-authenticate |

Mark Reviewed maps `42501` → `forbidden`, `22023` → `invalid_state`, `P0002` → `not_found`.

## Auth-specific

| Code | HTTP | Meaning |
|---|---|---|
| `invalid_credentials` | 401 | wrong email/password |
| `not_a_doctor` | 403 | authenticated user has no `doctor_profiles` row (the client signs out) |

## Rules

1. Key off `code`, never the message.
2. Never show a database message to a patient.
3. A `401` from the platform carries **no** CORS header, so its body is unreadable in a
   browser: treat "non-2xx with no body" as an auth failure and re-authenticate.
4. Never show success before the backend confirms.
