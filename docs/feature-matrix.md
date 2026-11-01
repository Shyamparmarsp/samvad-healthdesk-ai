# Samvad HealthDesk AI — Feature & Readiness Matrix

**Version:** 1.0 Release Candidate (`release/samvad-rc1`)  
**Product:** Samvad HealthDesk AI  
**Scope:** Pre-visit Patient Intake and Smart Clinical Referral (Bilingual Hindi/English)  

---

## 1. Feature Classification Legend

- **Complete (Production-Ready Code):** Full UI, state machine, data model, validation, and automated browser verification tests exist and pass.
- **Backend-Integrated:** Connected to real Supabase PostgreSQL schema, RLS policies, and Edge Functions (`chat-turn`, `speak`).
- **Mock-Only Fallback:** Built-in client-side simulated responses enabling 100% offline testing without cloud services or external credentials.
- **Requires Live Credentials:** Functionality is implemented and tested with contracts, but requires provider API keys (Gnani Cloud Prisma/Timbre, Groq API) for live network execution.
- **Requires Human / Owner Action:** Operational tasks requiring project owner approval (e.g. Supabase Auth user creation in dashboard, applying SQL mappings, setting provider limits).

---

## 2. Core Feature Matrix

| Domain | Feature / Capability | Implementation Status | Frontend Component | Backend / Persistence | Notes & Boundaries |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Patient / Identity** | Anonymous Patient Auth | **Backend-Integrated** | `api.ts` (`startAnonymousSession`) | Supabase Anonymous Auth | No signup forms or passwords; sessions tied to verified anonymous JWT. |
| **Patient / Consent** | Explicit On-Screen Consent | **Complete** | `ConsentCard.tsx`, `PatientShell.tsx` | `sessions.consent_accepted` | Yes/No buttons only. Never inferred from voice. Timestamp & text version recorded. |
| **Patient / Consent** | Consent Decline Handling | **Complete** | `ConsentCard.tsx` | Zero DB records written | Stops intake immediately; no health data collected or persisted. |
| **Bilingual / i18n** | English / Hindi UI Switching | **Complete** | `i18n/`, `Header.tsx` | Client-side reactive provider | Devanagari Noto Sans rendering; 22+ audited strings in `docs/hindi-ui-review.csv`. |
| **Intake / Scripted** | Fixed Opening Demographics | **Complete** | `ConversationView.tsx` | `chat-turn` Edge Function | Name, Age, Gender, Primary Concern strictly ordered by backend. |
| **Intake / Voice** | Voice Audio Recording | **Complete** | `AudioRecorder.tsx`, `voice.ts` | Web Audio / WAV 16kHz PCM | 30s countdown timer, automated fallback, silence detection, audio context safety. |
| **Intake / Speech** | Speech-to-Text (STT) | **Requires Live Credentials** (Mock Fallback) | `api.ts`, `voice.ts` | Gnani Prisma v2.5 REST | Uses live Prisma when keys are present; falls back to editable text preview in mock. |
| **Intake / Speech** | Text-to-Speech (TTS) | **Requires Live Credentials** (Audio Cache Fallback) | `speak.ts`, `AudioPlayer.tsx` | Gnani Timbre v2.5 / `public/audio/` | Opening questions use cached static audio; adaptive questions call Timbre REST. |
| **Intake / Review** | "What We Heard" Transcript Edit | **Complete** | `ConversationView.tsx` | Local turn buffer | Patient inspects and corrects voice transcription before submitting the turn. |
| **Intake / Adaptive** | Adaptive Follow-up Engine | **Backend-Integrated** | `ConversationView.tsx` | `chat-turn` (Groq API + Canonical Bank) | Dynamic selection of up to 3 follow-ups from 150-question canonical backend bank. |
| **Intake / Guards** | 15-Turn Session Cap | **Complete** | `ConversationView.tsx` | DB / `chat-turn` invariant | Strict hard cap. Session terminates with partial preview if incomplete at turn 15. |
| **Intake / Guards** | Project Daily Spend Caps | **Backend-Integrated** | Handled in API errors | `daily_usage_limits`, `reserve_daily_usage()` | Asia/Kolkata date rollover; atomic counter reservation; protects provider credits. |
| **Safety / Triage** | Deterministic Emergency Trigger | **Complete** | `EmergencyAlert.tsx` | `chat-turn` safety rules engine | Acute cardiac/respiratory danger phrases immediately halt routine intake. |
| **Safety / Triage** | Plain-Text 112 Advisory | **Complete** | `EmergencyAlert.tsx` | None (Static guidance) | No clickable `tel:` link; no false claim of emergency dispatch. |
| **Safety / Triage** | Urgent Partial Report | **Backend-Integrated** | `EmergencyAlert.tsx` | `reports` (status: `urgent_partial`) | Immediately routed to Emergency triage queue for Dr. Neha Verma. |
| **Safety / Triage** | Permanent Slot Suppression | **Complete** | `SlotPicker.tsx` | `book_appointment()` check | Emergency intakes are permanently barred from routine outpatient booking. |
| **Report / Review** | Draft Intake Report Review | **Complete** | `ReportReview.tsx` | `chat-turn` (`correct_draft_report`) | Clear "Draft Preview" badge; patient reviews structured clinical summary. |
| **Report / Review** | Patient Field Corrections | **Complete** | `ReportReview.tsx` | `chat-turn` allowlist validator | Patient may correct Name, Age, Primary Concern. Routing and flags are read-only. |
| **Report / Review** | Explicit Report Submission | **Complete** | `ReportReview.tsx` | `chat-turn` (`submit_report`) | Transitions report from `draft` to `submitted`; assigns department and doctor. |
| **Report / Review** | "Don't Submit" Private Exit | **Complete** | `ReportReview.tsx` | `sessions` (status: `closed`) | Discards session privately; report is never exposed to hospital doctor portal. |
| **Doctor / Auth** | Doctor Authentication | **Requires Human Action** | `DoctorLogin.tsx` | Supabase Auth (Email / Password) | Owner creates accounts in Supabase Dashboard; credentials provided confidentially. |
| **Doctor / Profile** | Doctor Profile RLS Mapping | **Requires Human Action** | `api.ts` (`getCurrentDoctorProfile`) | `doctor_profiles` table + RLS | Associates Auth UID to Doctor ID (Dr. Aditi Rao, Dr. Neha Verma) via SQL migration. |
| **Doctor / KPI** | Doctor Dashboard Stat Cards | **Complete** | `DoctorDashboard.tsx` | `reports`, `appointments` queries | Computes Total Reports, Pending Review, Booked, and Urgent Triage metrics. |
| **Doctor / Queue** | Reports Queue & Filtering | **Complete** | `DoctorReportsList.tsx` | Caller-scoped RLS SELECT | Filter tabs: `All`, `Urgent`, `Booked`, `Not Booked`. Doctors see assigned cases only. |
| **Doctor / Triage** | Emergency Triage Queue | **Complete** | `DoctorUrgentList.tsx` | RLS cross-visibility policy | General Medicine and Emergency doctors can monitor emergency cases. |
| **Doctor / Detail** | Structured Clinical Detail | **Complete** | `DoctorReportDetail.tsx` | `reports` read by ID | Sections: Demographics, Chief Complaint, Timeline, Vitals/Observations, Routing. |
| **Doctor / Audit** | "Mark Reviewed" Audit Stamp | **Backend-Integrated** | `DoctorReportDetail.tsx` | `mark_report_reviewed()` RPC | Security Definer RPC; stamps `reviewed_at` and `reviewed_by_doctor_id`; single-write. |
| **Doctor / Audit** | Booking Hold Release | **Complete** | `ReportReview.tsx`, `SlotPicker.tsx` | Report review status check | For `needs_human_review` reports, Mark Reviewed releases hold for outpatient booking. |
| **Booking / Slots** | Available Slot Query | **Backend-Integrated** | `SlotPicker.tsx` | `get_available_slots()` RPC | Timezone-aware (Asia/Kolkata) query filtering for unreserved doctor slots. |
| **Booking / Commit** | Atomic Slot Reservation | **Backend-Integrated** | `SlotPicker.tsx` | `book_appointment()` RPC | Atomic transaction with `FOR UPDATE` locking; prevents race condition double-booking. |
| **Booking / Receipt** | Booking Confirmation Receipt | **Complete** | `BookingConfirmation.tsx` | `appointments` read | Displays human-readable reference code, doctor name, date, time, and instructions. |
| **Booking / Alt** | "Not Now" Booking Postponement | **Complete** | `SlotPicker.tsx` | `reports.booking_status` = `none` | Patient skips appointment booking; report remains submitted on doctor's dashboard. |

---

## 3. Deployment & Operational Readiness Summary

| Operational Area | Readiness State | Verification Evidence |
| :--- | :--- | :--- |
| **TypeScript Type Safety** | 100% Validated (`tsc --noEmit`) | Zero type errors across frontend and test suites. |
| **Unit & Integration Tests** | 84 / 84 Passing | 26 Mock tests, 7 Supabase RPC tests, 51 API integration tests. |
| **End-to-End Browser Tests** | 16 / 16 Passing | Headless Chrome CDP tests verifying all patient & doctor flows. |
| **Real Browser Supabase Tests**| 26 / 26 Passing (17 core + 9 extras) | Full lifecycle tested against local Supabase instance. |
| **Responsive Visual QA** | 100% Zero Overflow across 7 viewports | 360x800, 390x844, 430x932, 768x1024, 1024x768, 1280x820, 1440x900. |
| **Bundle Splitting** | Initial Entry reduced by ~41 kB | Doctor Portal (`DoctorShell`) dynamically loaded via `React.lazy`. |
| **Audio Concurrency Protection**| Timeout & Fallback Guards | Strict 2.5s timeout prevents headless audio context deadlocks. |
| **Evaluator Access Protocol** | Confidential Reviewer Access | Evaluator credentials excluded from all public repositories and documentation. |
