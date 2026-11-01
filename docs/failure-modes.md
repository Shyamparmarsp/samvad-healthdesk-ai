# MVP Failure Handling

This is the concise failure-handling reference aligned to the milestone plan in `MILESTONES.md`. Do not build a large retry/observability system for the MVP. Every failure below ends in a retry, a text fallback or a clear message, never a dead end.

| Failure | Required MVP behaviour |
|---|---|
| Microphone permission denied | Offer text mode. |
| Unsupported or over-30-second recording | Stop upload; offer re-record or text. Verify the exact provider cap before release. |
| Empty/poor transcript | Ask patient to repeat or type; do not invent an answer. |
| Patient edits the "What we heard" transcript | Send the edited text; keep the original transcript stored separately. |
| Prisma error or rate limit (429) | Show a retry state and offer text; do not invent an answer. |
| Groq timeout or invalid JSON | Preserve the last saved answer; retry once or ask a safe scripted question. |
| Unknown question/department ID | Reject output and use an approved fallback question or General Medicine fallback. |
| Timbre failure | Display the same approved question as text. |
| Network interrupted | Restore session from the same persisted anonymous Auth identity; show retry state. |
| Anonymous Auth identity lost | Do not retrieve a report using only a guessable session ID or phone number. |
| Consent declined | Collect no health information and create/share no clinical report; show the "No problem" end screen. |
| Ambiguous emergency phrase | Ask the fixed Yes/No clarification. “Yes” confirms the current demo trigger and enters the urgent path. “No” negates only that candidate; it is not medical clearance, and intake continues only if no other rule/review flag remains. An unclear/free-text answer or no reliable answer becomes `needs_human_review` and blocks routine booking. |
| Patient exits before submission | Keep the draft private to that authenticated session; do not show it in the doctor dashboard, except the deterministic urgent partial-report path after consent. |
| Patient taps Don't submit | End the session, keep the draft private, create no appointment. |
| Patient corrects report | Allow only listed patient-provided fields and only while draft. |
| No slots available | Offer another date or Not now; do not create an appointment. |
| Slot taken before booking | RPC rejects booking; show "That slot was just taken", refresh availability and let patient choose again. |
| Doctor login fails | Show a generic error; never reveal which of email or password was wrong. |
| Doctor opens dashboard | Fetch on page load/refresh; no realtime push exists. |
| Mark Reviewed fails | Show an error and leave the report unchanged; show success only after the RPC confirms. |
| Database write fails | Do not show a success state until the write is confirmed. |
| 15-answer-turn session cap reached | Accept and save no more than 15 patient answer turns. If completion criteria are satisfied, use the normal review/submit path. If incomplete, show the partial-draft preview with the incomplete disclaimer and **End session only**; no Submit, doctor visibility, assignment or appointment. Never accept a 16th answer or make further provider calls. |
| Global daily session-creation cap reached | Atomically reject the new session using the Asia/Kolkata session counter and return the translated `demo_busy` message: “This demo has reached today’s usage limit. Please try again later.” Do not create a session or show a fake success. Owner may adjust `daily_usage_limits` in Supabase SQL Editor without redeploy; browser has no access to the usage tables. |
| Individual provider daily cap reached | Reject only that provider request and use its safe non-paid fallback: Prisma → text entry; Timbre → show the approved question as text; Groq → scripted question/deterministic summary. Do not lock the whole app or unrelated provider integrations. Do not retry the capped provider again that IST day unless the owner deliberately adjusts the limit. Every attempted app-provider request counts, including provider errors. |

Do not add `client_turn_id` idempotency, production-grade rate limiting, detailed observability or a broad failure-injection framework. Focused atomic counter-concurrency, cap-boundary, IST date-rollover and booking-race tests are mandatory, not deferred. Disable the send button while a request is in flight and avoid blind retries after an uncertain response; refresh session state before retrying where practical.

Never expose API keys, JWTs, full provider error bodies, stack traces or unnecessary health text in browser errors/logs.
