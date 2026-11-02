# Application Logic and Integration Audit

Scope: functional behaviour of the base commit `6637841` (all browser-verified findings), plus the HEAD delta where navigation changed. Backend comparison is **static** against `../samvad-backend` (`feat/backend`). No live provider, hosted Supabase or Vercel call was made.

---

## 1. Patient state machine

`PatientShell.tsx` holds a single `currentScreen` union of 11 screens and transitions in handlers. It works, but the machine has no terminal-state guard and only one transition is optimistic.

| Transition | Trigger | Guard | Notes |
|---|---|---|---|
| welcome → consent | `handleStartIntake` | none | **`res.demo_busy` is not checked** (D-04) |
| consent → conversation | `handleConsentAgree` | `if (!sessionId) return` | The guard makes the button a silent no-op when `sessionId` is empty |
| consent → consent_declined | `handleConsentDecline` | same guard | Clears `samvad_session_id` |
| conversation → what_we_heard | `transcript_preview` present | — | `pendingTranscript` set from the backend, never invented |
| conversation → review | `is_complete` or (`is_cap_reached` && draft) | — | Correct per the completion rule |
| conversation → emergency | `emergency_triggered` | — | Correct |
| what_we_heard → conversation | confirm | — | **Navigates before awaiting the send** (D-41) |
| review → booking | `submit_report` success | — | Uses `submitted_report.id` |
| booking → confirmed_booking | `book_appointment` success | — | **No try/catch here** — relies on `BookingView` catching |
| booking → confirmed_report_only | Not now | — | No appointment created |
| review → session_ended | Don't submit / End session | — | Clears the stored session id |
| any → welcome | restart | — | Clears session, chat state, appointment, error |

**Dead-end state (not reachable in mock, reachable from a real partial response):** if the backend returns `is_complete:false`, `is_cap_reached:false` and no `current_question`, `PatientShell` stays on `conversation`, `handleSendAnswer` returns early because `chatState.current_question` is undefined, and no control can advance the flow. There is no "session could not continue" affordance. (D-39)

---

## 2. Session and usage limits

| Rule | Implementation | Verdict |
|---|---|---|
| Max 15 accepted answer turns | Enforced server-side (`canAcceptAnswer`), counted in mock (`turnCount >= 15`) | correct server-side |
| Incomplete-at-cap → preview with End only | `ReportReviewView` renders a single "End session" when `!canSubmit` | correct in code; **not reachable in mock mode** (mock completes in ≤13 turns) |
| No provider call after the 15th answer | Server-side; the client stops sending once it renders the preview | not verified live |
| Global daily caps → `demo_busy` | Server returns `demo_busy:true` from `start_session` with HTTP 200 (`chat-turn/index.ts:444-456`); the client ignores it | **broken at session creation** (D-04) |
| `demo_busy` mid-session | `ConversationView` shows a translated amber banner and disables mic/send/chips | correct (untested live) |
| Per-provider fallback | `provider_unavailable` → error banner telling the patient to type | correct copy; no automatic text-mode switch |

The **mock backend cannot reach the 15-turn cap** — the longest mock path is 10 scripted + 3 adaptive = 13 turns. Consequently the cap preview, "End only" enforcement and the 15th-turn behaviour are covered only by `tests/patient-flow.test.ts` Journey 8, not by this browser audit.

---

## 3. Voice, recording and transcription

Verified in the browser and by the 12-case unit suite:

- Recording starts only after `getUserMedia` resolves and `MediaRecorder.start()` succeeds (`audio/index.ts:49-98`).
- The timer is derived from `Date.now()` deltas on a 250 ms interval, so pauses do not cause drift; the browser probe recorded `00:00 → 00:03` over ~3.2 s.
- At 30 s the interval calls `handleStopListening()` once; `isStoppingRef` makes the stop idempotent.
- The recorded webm/opus is decoded with Web Audio, downmixed, resampled to 16 kHz and re-encoded as 16-bit PCM WAV (`voice.ts:99-126`) because the backend rejects webm.
- After the stop, the app calls `chatTurn` with `audio_base64`/`audio_format`, receives `transcript_preview`, and shows "What we heard" for editing before the answer is accepted. Verified end to end; the confirmed turn is only counted after the patient sends the edited text.

Problems found:

| ID | Problem |
|---|---|
| D-05 | A denied/unavailable microphone produces only an inline banner. The approved MicDenied screen with a text field and "Try microphone again" is not rendered, and the app does not switch to text mode. The patient must discover the "Type" button. |
| D-40 | `handleVoiceRecorded` accepts a `string` payload, but a string makes it call `captureVoiceAnswer()`, which **opens the microphone again for 1.2 s**. The only producer of a string is the "no recorder" fallback in `ConversationView.handleStopListening` (line 380-386), so this is latent rather than commonly hit — but it is a microphone capture with no user gesture. |
| — | `captureVoiceAnswer` returns a synthetic 440 Hz tone on failure with `source:'synthetic'`; the UI never tells the patient the audio was not real. The backend will usually return an empty/invalid transcript, which surfaces as `provider_unavailable`. Acceptable for a demo, but it should be stated in the demo script. |
| D-06 | No pre-generated audio. The greeting never plays and every question replay is a live Timbre call; the "play" control on Consent is a timer. |

---

## 4. Report correctness

| Rule (docs/report-design.md) | Frontend behaviour | Verdict |
|---|---|---|
| Six information statuses must remain distinguishable | Both the patient review and the doctor detail collapse every absence to **"Not provided"**; `declined`, `unknown`, `unclear` and `not_asked` are never rendered | **violated** (D-14). Browser proof: a patient who answered "none" to conditions/medications/allergies sees three "Not provided" rows (`notProvided: 3, declined: 0, unknown: 0`) |
| `missing_information` comes from the report field | Doctor detail recomputes it from `!value` and only for 3 fields | **violated** (D-15) |
| Patient may correct all allow-listed fields | 9 of 10 allow-listed fields have Edit controls; `clinical_details.other_symptoms` has none | **violated** (D-12) |
| Non-declinable fields reject `declined` | Mock `correctDraftReport` rejects them; the UI never offers a decline action | correct |
| Gender "Prefer not to say" → `declined` | Review displays "Prefer not to say"; report stores `declined`/null | correct |
| Routing/flags/status are never patient-editable | The review only sends `CORRECTABLE_FIELDS`; `report_id` is omitted when it is not a UUID | correct |
| Summary is `null` for `urgent_partial` | The urgent detail never renders a summary and explains why | correct |
| Intake reference shown after submit | Shown on both confirmations | correct |

---

## 5. Booking logic

| Behaviour | Result |
|---|---|
| Slots fetched per selected date | `getAvailableSlots(report.id, dateStr)`; in Supabase mode `p_days=14` then client-side prefix filter |
| Slot collision | `23505` → `slot_taken` → amber banner + grid refresh. Correct |
| Booking hold (`possible_urgent` / `needs_human_review` without review) | `isBookingBlocked` renders a "Review Pending" state. Correct in code; not exercised (no held report in the demo data) |
| Emergency never bookable | Not reachable from the UI (the emergency screen replaces booking); the RPC also rejects with `22023` |
| Duplicate submission guard | `isBooking` prevents a double click; the RPC additionally enforces one confirmed appointment per report |
| Slot load error | **Swallowed into `[]`**, indistinguishable from "no slots"; no retry (`BookingView.tsx:82-86`) → D-22 |
| "More dates" | **Absent**; 7 chips scroll horizontally (AGENTS.md requires a "see more dates" path) → D-20 |
| Confirmation date/time | **`Invalid Date • Invalid Date` in mock mode** (D-03) |
| Timezone | Slot `time_display` is built with `getHours()` in the **browser's** timezone while the UI says "Asia/Kolkata"; a non-IST viewer sees shifted times. Date chips use `toISOString()` (UTC) for the date key, which can be one day behind for IST users before 05:30 → D-21 |

**Root cause of D-03:** `PatientShell.handleBookAppointment` sends `slot_start: slotId` and `BookingView` passes the slot `id` (`slot-<doctor>-<date>-<time>` in mock mode). `bookAppointment` then stores `req.slot_start` as the appointment's `slot_start`, so `new Date('slot-…')` is invalid. In Supabase mode `getAvailableSlots` sets `id = row.slot_start`, which is why the bug is invisible there — it is still a contract misuse (`slot_id` and `slot_start` are distinct fields in `BookAppointmentRequest`).

---

## 6. Emergency logic

| Behaviour | Result |
|---|---|
| Clear trigger stops routine intake | Works; verified with "I have severe chest pain and pressure in my chest" |
| 112 shown as plain text, no `tel:` link | Works |
| No routine slots offered | Works (booking screen never shown) |
| `urgent_partial` report saved with rule id + statement | Works in mock (report row created) |
| Negation guard | Works in code (`isNegated`); "no chest pain" does not trigger |
| Ambiguous clarification chips | Chips exist (`emergency_clarification` id) but the mock never sets the pending-clarification state, so **the Yes/No path was not executed** |
| Hindi guidance | **Body copy stays English** (D-07) |
| Back out of emergency (HEAD) | **Routine intake returns and the guidance disappears** (D-02) |
| Server-side containment | Verified: `submitReport` throws `invalid_state` for an emergency session (`chat-turn/index.ts:888`), and `canAcceptAnswer` refuses further answers. So no second report can be created; the risk is the missing guidance, not data corruption |

---

## 7. Doctor portal logic

| Behaviour | Result |
|---|---|
| Login rejects unmapped users | `doctor_profiles` lookup; signs out and throws `not_a_doctor` — correct |
| Login requires a password | `signInWithPassword` in Supabase mode; mock ignores the password (expected) |
| Report visibility | All reads are RLS-scoped; the frontend never filters by doctor id in Supabase mode (correct — authority is the database) |
| Dashboard stats | `urgent`/`new_reports`/`booked`/`not_booked` derived per docs §15; `booked`/`not_booked` compare against the caller's appointment list |
| Reports tabs | Predicates match docs §15 (`urgent` = `urgent_partial` only; `not_booked` excludes booked and urgent) |
| Search | Case-insensitive over name/reference/concern; client-side only |
| Report detail | Renders report fields; **warning flags hardcoded "None"** (D-01); source chip hardcoded "Voice · English" (D-33); appointment line hardcoded/synthesised (D-35) |
| Conversation reader | Real `messages` query, RLS-backed, patient rows only, transcript vs confirmed displayed correctly. **This is the best-integrated feature in the app.** |
| Mark Reviewed | Calls the RPC, refreshes; success badge hardcodes "Reviewed by Dr. Aditi Rao" (D-32) |
| Urgent review authority | UI allows only the Emergency doctor; `!currentDoctor || …` is fail-open if the prop is ever omitted (D-36). Figma shows the GM doctor with an enabled button; docs are ambiguous → owner ruling needed (D-30) |
| Appointments | Tabs derived from `slot_start`/`slot_end` in Asia/Kolkata (`Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata'})`) — correct. Table **headers do not match the cells** (D-18) |
| Errors | Every load error is swallowed to `console.error` → empty lists with no message or retry (D-25) |
| Logout | `doctorLogout` → `auth.signOut()`; returns to login |

---

## 8. Frontend ↔ backend contract comparison (static)

| Frontend call (`src/lib/api.ts`) | Backend (`supabase/functions` / migrations) | Match |
|---|---|---|
| `invoke('chat-turn', {action:'start_session', language})` | `validation.ts:119` allows only `action`,`language` | ✅ |
| `{action:'resume_session', session_id}` | `validation.ts:127` | ✅ |
| `{action:'record_consent', session_id, consent, consent_version, language}` | `validation.ts:133` | ✅ |
| `{action:'submit_turn', session_id, question_id, text?, audio_base64?, audio_format?}` | `validation.ts:155` | ✅ |
| `{action:'correct_draft_report', session_id, report_id?, updates}` | `validation.ts:182` (`report_id` optional, UUID-checked) | ✅ |
| `{action:'submit_report', session_id, report_id?}` | `validation.ts:202` | ✅ |
| Response: `session_id, session_status, current_question, messages, turn_count, max_turns, is_complete, is_cap_reached, can_submit, draft_report, submitted_report, emergency_triggered, demo_busy, transcript_preview, error` | `contract.ts:190-225` | ✅ |
| `current_question.answer_type` (frontend optional field) | **Not present in backend `CurrentQuestion`** | ⚠️ frontend-only extension; the UI falls back to option matching, so no breakage, but the field should be added to the contract or removed from the client type |
| `speak` → `POST /functions/v1/speak {session_id, question_id}` → audio bytes or `{text}` | `speak/index.ts:27-36, 58-76` | ✅ |
| `rpc('get_available_slots', {p_report_id, p_days})` | `availability_and_booking.sql:30-31` (days clamped 1..14) | ✅ |
| `rpc('book_appointment', {p_report_id, p_slot_start})` | `availability_and_booking.sql:121-122` | ✅ (but the client sometimes sends a slot id as `p_slot_start` → D-03) |
| `rpc('mark_report_reviewed', {p_report_id})` | `mark_report_reviewed.sql:31` | ✅ |
| `rpc('get_doctor_appointments')` and the 12 mapped columns | `doctor_appointment_reads.sql:29-44` | ✅ |
| `from('reports').select('*')` (list + detail) | `grant select` + `reports_doctor_read` RLS | ✅ |
| `from('messages').select(...)` for the reader | `messages_doctor_read` RLS (nested report policy) | ✅ |
| `from('doctor_profiles').select('doctor_id').eq('user_id', auth.uid)` | `doctor_profiles_read_self` | ✅ |
| `from('doctors')` / `from('departments')` display lookups | `*_read_authenticated using (true)` | ✅ |
| Error codes → copy (`42501`, `22023`, `23505`, `P0002`, `28000`) | Raised with those SQLSTATEs in the RPCs | ✅ |

### Mock vs Supabase divergences (important for demo honesty)

| Area | Mock | Supabase | Impact |
|---|---|---|---|
| Session persistence | in-memory Map (lost on refresh) | server rows | mock demo loses progress on refresh |
| Slot identity | `slot-…` string id, separate `start_time` | id = `slot_start` | hides D-03 |
| Booking duplicate | checked in memory | RPC enforces | mock can book a different slot twice for one report |
| `demo_busy` | only via a test setter | real cap | start path untested |
| Turn cap | max 13 turns | 15 | cap UI unreachable in mock |
| Emergency matcher | client-side regex | server-side | two implementations can drift |
| Doctor review authority | UI-only | RPC + RLS | mock UI is the only guard |
| Doctor data | seeded fakes | RLS | — |

---

## 9. Provider contracts (static only)

| Provider | Frontend expectation | Verified |
|---|---|---|
| Prisma (STT) | Never called from the browser. The browser posts WAV base64 to `chat-turn`; the Edge Function calls Prisma. Client formats are validated to `audio/wav` | ✅ by reading `voice.ts` + `validation.ts`; **not** verified against the live provider |
| Timbre (TTS) | Only via the `speak` Edge Function, which streams bytes; the client turns them into an object URL and revokes it on end/error | ✅ statically; model id / language quality **not verified** (no keys) |
| Groq | Never called from the browser; server-side only per docs | ✅ statically; model id / structured output **not verified** |

No endpoint, model id, key or payload was invented in this audit or found invented in the code reviewed.

---

## 10. Unverified workflows (explicit)

1. Real Prisma transcription and Timbre playback (no keys; no live calls).
2. Real Groq extraction/routing and `possible_urgent` (server only).
3. Supabase-mode end-to-end: RLS, JWT expiry, `resume_session`, `demo_busy`, booking race, duplicate booking rejection.
4. Ambiguous-emergency clarification (Yes/No chips), `needs_human_review`, and the booking hold.
5. 15-turn cap preview and End-only enforcement in the browser.
6. Emergency doctor login and urgent-detail "Acknowledge Triage".
7. Non-IST browser rendering of slot times (found by inspection, not executed).
8. Screen-reader interaction and automated contrast checks.
