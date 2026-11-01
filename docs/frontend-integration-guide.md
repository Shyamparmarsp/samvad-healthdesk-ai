# Frontend Integration Guide (backend handoff)

## Environment

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_KEY=<local publishable/anon key>
```
Never put provider keys or the service-role key in a `VITE_` variable.

## Authentication

- Patient: `supabase.auth.signInAnonymously()`. The session belongs to that identity; losing it means losing the session.
- Doctor: `signInWithPassword`. A doctor must exist in `doctor_profiles`; otherwise RLS returns no rows.

## Invoking

```ts
await supabase.functions.invoke("chat-turn", { body: { action, ... } });   // JWT attached automatically
await supabase.functions.invoke("speak", { body: { session_id, question_id } });
await supabase.rpc("mark_report_reviewed", { p_report_id });
await supabase.rpc("get_available_slots", { p_report_id, p_days: 14 });
await supabase.rpc("book_appointment", { p_report_id, p_slot_start });
```

All calls require the user JWT. Functions return 401 without it; that is not a CORS problem.

## Behaviour you can rely on

| Area | Contract |
|---|---|
| Response envelope | `ChatTurnResponse` (§4 of the integration contract) |
| Errors | `error` is a code (`invalid_request`, `not_found`, `invalid_state`, `demo_busy`, …) — map `code`, not message |
| Resume | `resume_session` repairs an interrupted accept and clears expired audio state |
| Audio | audio turn returns `transcript_preview`; confirm by resending the same `submit_turn` with `text` |
| Adaptive questions | `current_question.id` may be a core id or a bank id (`GM-001` … `CARD-030`) |
| Booking | `23505` = slot taken; refresh availability and let the patient choose again |
| Emergency | `emergency_triggered` + `session_status: "emergency"`; no slots, ever |

## Common failures

| Symptom | Backend cause |
|---|---|
| 401 on every call | missing/expired JWT; anonymous sign-in not enabled |
| 404 on resume | session belongs to another identity |
| 400 on `record_consent` | consent version is not `2026-11-01.v1` |
| 400 on `submit_turn` | both text and audio sent, or `audio/webm` used |
| 409 `invalid_question_state` | answering a question that is no longer current; call `resume_session` |
| Empty doctor list | doctor not mapped in `doctor_profiles`, or the report is a draft |
| `demo_busy` | daily session cap reached (Asia/Kolkata day) |

## Mock vs real

The frontend may keep a mock `api.ts` for UI work. Real mode must call the Supabase client only through `src/lib/api.ts`, and no component may import the client directly.
