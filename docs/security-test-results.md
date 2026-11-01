# Security Test Results (adversarial campaign)

Executed against the real local stack with real JWTs. Full control-by-control evidence is
in `docs/final-security-signoff.md`; this file records the **attempts** and their outcome.

| # | Attack | Expected | Actual |
|---|---|---|---|
| 1 | Patient A resumes patient B's session | 404 `not_found` | PASS |
| 2 | Patient A requests slots for B's report | `P0002` → `not_found` | PASS |
| 3 | Patient A books B's report | `not_found` | PASS |
| 4 | Patient reads `sessions`/`reports` directly | denied or zero rows | PASS |
| 5 | Patient reads `appointments` directly | permission denied (`42501`) | PASS |
| 6 | Patient inserts a report | denied | PASS |
| 7 | Patient calls `mark_report_reviewed` | denied | PASS |
| 8 | Patient calls `reserve_daily_usage` | denied | PASS |
| 9 | Anonymous call to `chat-turn` / `speak` | 401 | PASS |
| 10 | Doctor books a patient's report | denied (ownership from `auth.uid()`) | PASS |
| 11 | Unassigned doctor reads a report | zero rows | PASS |
| 12 | Emergency doctor reads an unrelated GM report | zero rows | PASS |
| 13 | GM doctor reviews an emergency report (OD-03) | `42501` | PASS |
| 14 | Emergency report booked after Mark Reviewed | `22023` | PASS |
| 15 | REPORT-ID probing with a foreign UUID | `not_found` | PASS |
| 16 | Malformed payload / unknown action / unknown key | 400 `invalid_request` | PASS |
| 17 | Non-UUID session id | 400 | PASS |
| 18 | Both text and audio in one turn | 400 | PASS |
| 19 | Oversized text (>4000 chars) | 400 | PASS |
| 20 | Oversized audio (>2 MB base64) | 400 before provider call | PASS |
| 21 | `audio/webm` | 400 before provider call (counter unchanged) | PASS |
| 22 | Repeated submission of the same turn | unique `(session_id, turn_index)`; no second row | PASS |
| 23 | Duplicate concurrent booking | one winner, loser `23505` | PASS |
| 24 | Repeat identical booking | idempotent `already_booked: true` | PASS |
| 25 | Duplicate report correction | last write wins on the draft only; submitted report → `invalid_state` | PASS |
| 26 | Invalid adaptive question id | 400 `invalid_request` | PASS |
| 27 | Client-supplied `doctor_id` / department as authority | ignored; derived from the report | PASS |
| 28 | Answer after the 15th turn | `turn_cap_reached`, no provider call | PASS |
| 29 | Stale question answer | 409 `invalid_question_state` | PASS |
| 30 | Service-role key in the browser bundle | none found | PASS |

## SECURITY DEFINER review

| Function | Mode | search_path | EXECUTE | Verdict |
|---|---|---|---|---|
| `reserve_daily_usage(text)` | INVOKER | `''` | service_role only | PASS |
| `mark_report_reviewed(uuid)` | DEFINER | `''` | authenticated | PASS |
| `get_available_slots(uuid,integer)` | DEFINER | `''` | authenticated | PASS (documented deviation) |
| `book_appointment(uuid,timestamptz)` | DEFINER | `''` | authenticated | PASS |
| `get_doctor_appointments()` | DEFINER | `''` | authenticated, anon denied | PASS technically, **owner acknowledgement required** |

`AGENTS.md` names two sanctioned exceptions; the project carries four documented ones. The
newest (`get_doctor_appointments`) is required because `appointments` has no browser read
grant and an INVOKER function cannot read it. It returns no `user_id`, is scoped to the
caller's `doctor_profiles` row and never confirms whether a mapping exists.

## Not tested

- Hosted-project RLS (no deployment).
- Live provider security.
- Third-party penetration testing.
