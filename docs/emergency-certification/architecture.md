# Emergency Workflow Architecture and Execution Order

This page explains how a patient answer becomes an urgent report, and where each safety
check sits in the request path. It describes the code at `feat/backend` `e5d77e5` plus the
five documented corrections listed in `defects-and-corrections.md`.

## 1. Components

| Component | Location | Responsibility |
|---|---|---|
| Patient SPA | `src/` (separate frontend branch) | UI, microphone, transcript confirmation, 112 screen |
| `chat-turn` | `supabase/functions/chat-turn/index.ts` | Single intake endpoint: six actions, ownership checks, matcher, state machine, report writes |
| `speak` | `supabase/functions/speak/index.ts` | Timbre TTS for the current adaptive question only |
| Deterministic matcher | `supabase/functions/_shared/safety.ts` | Fixed phrase rules, negation/quote handling, clarification resolution |
| Conversation state | `supabase/functions/_shared/conversation.ts` | Fixed/adaptive order, 15-answer cap, completion flags |
| Report builder | `supabase/functions/_shared/report.ts` | Report v1.2 document, `urgent_partial` shape, corrections |
| Routing | `supabase/functions/_shared/routing.ts` | Preliminary department, emergency routing |
| Database | `supabase/migrations/` | Sessions/messages/reports, RLS, booking RPCs, immutability |
| Providers | `_shared/groq.ts`, `prisma.ts`, `timbre.ts` | Optional; every failure has a deterministic fallback |

Only `chat-turn` writes intake state. The browser has no direct write path to `sessions`,
`messages`, `reports` or `appointments`.

## 2. Per-turn execution order (`submit_turn`)

```
POST /functions/v1/chat-turn  { action:"submit_turn", session_id, question_id, text|audio }
  │
  ├─ 1. withSupabase({auth:"user"}) → verified user id (never a client-supplied id)
  ├─ 2. validate the action shape (unknown keys rejected)
  ├─ 3. load the session WHERE id = … AND user_id = verified id  (ownership)
  ├─ 4. if the session is not answerable:
  │        cap (15 answers)        → 200 { error:"turn_cap_reached" }
  │        any terminal state      → 409 { error:"invalid_state" }        [correction D-4]
  ├─ 5. audio turn? → Prisma transcription only; return transcript preview (no turn
  │      accepted until the patient confirms). A provider failure falls back to text.
  ├─ 6. text turn → session.current_question_id must equal the submitted question
  │
  ├─ 7. if question_id = "emergency_clarification" and a candidate is pending:
  │        a. classify the clarification answer with the deterministic matcher
  │           → clear match: create urgent report and return                [correction D-5]
  │        b. else resolve yes / no / unresolved
  │           yes        → create urgent report
  │           unresolved → needs_human_review, keep asking, never "safe"
  │           no         → clear only that candidate, continue routine intake
  │
  ├─ 8. deterministic matcher on the patient-confirmed text only
  │        clear     → create urgent report and RETURN (no parse, no question selection,
  │                    no adaptive retrieval, no Groq, no draft routing)
  │        ambiguous → store the patient message, set pending rule + clarification question
  │        none      → continue
  │
  ├─ 9. normal answer: parse into the report field, store the message, advance the turn
  ├─ 10. next question: fixed order → scripted adaptive → (if still incomplete and budget
  │      remains) one adaptive bank question selected with Groq
  └─ 11. if the report is complete: build a draft (routing + deterministic summary)
```

The order is enforced in source and asserted by `emergency-workflow.test.ts`:
`classifyAnswer(text)` precedes `parseAnswer`, `nextQuestion`, `maybeAdaptiveQuestion` and
`ensureDraftReport`. The clear branch returns through `respondWithEmergency` before any of
those functions.

### Why a model cannot override the trigger

Groq is consulted only in steps 10–11, after the matcher has already returned. The
matcher reads no model output; it is a pure function over the confirmed text. The live
matrix proves the practical consequence: on a normal final-answer turn a Groq reservation
is consumed, while the identical turn carrying a trigger consumes **zero** and produces
an urgent report.

## 3. Urgent report creation

`createEmergencyReport` performs one write path:

| Field | Value |
|---|---|
| `reports.status` | `urgent_partial` |
| `reports.department_key` | `emergency` |
| `reports.doctor_id` | seeded Emergency doctor (resolved from the database, never the model) |
| `reports.emergency_rule_id` | the matched rule id |
| `reports.possible_urgent` | `false` (the deterministic rule already forced the path) |
| `reports.needs_human_review` | preserved from the session; never cleared |
| `reports.submitted_at` | `null` |
| `report.schema_version` | `1` |
| `report.summary` | `null` |
| `report.emergency.patient_statement` | verbatim confirmed text, max 500 chars |
| `report.missing_information` | unanswered fields remain explicit |
| `sessions.status` | `emergency` |
| `sessions.current_question_id` | `null` (routine intake stopped) [correction D-3] |

The report is created before any routine intake continuation and is returned immediately
as `emergency_triggered: true`, `can_submit: false`.

## 4. Booking suppression

`get_available_slots` and `book_appointment` accept only a caller-owned `submitted`
report in a non-emergency, booking-enabled department. `urgent_partial` fails with
SQLSTATE `22023`. Mark Reviewed changes only the two review columns, so an emergency
report remains permanently unbookable. The terminal-report trigger freezes status,
routing, flags and content after `draft`.

## 5. Doctor visibility (RLS)

`reports_doctor_read` allows `submitted` and `urgent_partial` rows when the caller is the
assigned doctor, or when the row is in the Emergency department and the caller is mapped
to General Medicine or Emergency. Drafts never match. `messages_doctor_read` delegates to
that report policy. `mark_report_reviewed` uses the OD-03 interim rule: the Emergency
doctor may acknowledge an urgent report; a General Medicine doctor may not.

## 6. Limits and fallbacks

| Control | Value | Location |
|---|---|---|
| Accepted answer turns per session | 15 | `conversation.ts`, DB `CHECK (0..15)` |
| Adaptive bank questions | 3 | `_shared/intake/select.ts` |
| Clarification ambiguity | fixed Yes/No, unclear → human review | `safety.ts`, `chat-turn` |
| Groq failure | scripted question / deterministic summary | adapters |
| Prisma failure | text entry, no health data lost | `chat-turn` audio phase |
| Timbre failure | approved question as text, no paid retry | `speak` |
| Provider retries | none | adapters |

## 7. Logging boundary

`_shared/logging.ts` allowlists event names and sanitizes fields: keys containing text,
transcript, audio, message, answer, content, name, concern, symptom, medication, allergy,
statement, patient, token, key, secret, authorization, password or cookie are dropped;
strings truncate to 64 characters; objects are dropped. `logging-privacy.test.ts` and
`L-LOG-01` verify that no call site passes patient content.
