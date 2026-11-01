# Figma V2 Design Exports (`docs/design/`)

This directory stores verified 1x PNG screenshots exported directly from Figma V2 (`Samvad HealthDesk AI — V2 Screens`, File Key: `PIIKHDaviWGq9EV9yBZcnc`) for visual parity checks during M2 frontend implementation.

## Screen Inventory (22 Frames — All LIVE VERIFIED & Exported)

### Patient Flow (Mobile: 390 × 844 viewport)
| Screen ID | Filename | Figma Frame Name | Node ID | Dimensions | Status | Description |
|---|---|---|---|---|---|---|
| **P1** | `P1-welcome.png` | `WelcomeScreen` | `72:2` | 390 × 844 | ✅ Exported | Language toggle (HI/EN), "Start Talking" button (h=58px), "Type Instead" (h=54px) |
| **P2** | `P2-consent.png` | `ConsentScreen` | `72:42` | 390 × 844 | ✅ Exported | Explicit On-screen Yes / No buttons (h=54px); audio consent greeting bubble |
| **P3** | `P3-conversation.png` | `ConversationView` | `72:66` | 390 × 844 | ✅ Exported | Active chat log, assistant message bubble, progress bar, mic idle (86×86px) |
| **P3b** | `P3b-conversation-mic.png` | `ProcessingView` | `72:192` | 390 × 844 | ✅ Exported | Active listening state, animated waveform visualization, 30s countdown |
| **P4** | `P4-question-chips.png` | `GenderQuestionView` | `72:121` | 390 × 844 | ✅ Exported | Current question with quick-reply option chips (severity, gender) |
| **P4b** | `P4b-conversation-type.png` | `MicDeniedView` | `72:209` | 390 × 844 | ✅ Exported | Keyboard open text-entry mode, input field, Done button |
| **P5** | `P5-transcript-review.png` | `WhatWeHeardView` | `72:167` | 390 × 844 | ✅ Exported | "What we heard" editable transcript field before sending answer |
| **P6** | `P6-review.png` | `PatientReportReview` | `72:235` | 390 × 844 | ✅ Exported | Summary card, preliminary department chip, allowlisted field edits, "Submit to hospital" & "Don't submit" |
| **P7** | `P7-booking-slots.png` | `BookingView` | `72:301` | 390 × 844 | ✅ Exported | Assigned doctor info, date chips, 30-min slot chips, "Not now" button |
| **P8a** | `P8a-slot-taken.png` | `SlotTakenView` | `72:361` | 390 × 844 | ✅ Exported | "Slot was just taken" warning banner above refreshed slot grid |
| **P8b** | `P8b-no-slots.png` | `SlotUnavailableView` | `72:342` | 390 × 844 | ✅ Exported | "No free slots for this date" card with alternative date chips |
| **P9a** | `P9a-confirm-booking.png` | `BookingConfirmation` | `72:394` | 390 × 844 | ✅ Exported | Confirmed appointment details, doctor name, date/time, server reference code |
| **P9b** | `P9b-confirm-report.png` | `ReportSentConfirmation` | `72:417` | 390 × 844 | ✅ Exported | "Report submitted" confirmation for "Not now" path (no appointment) |
| **P10** | `P10-emergency.png` | `EmergencyScreen` | `72:436` | 390 × 844 | ✅ Exported | Plain text "112", "This may be urgent" heading, no call button, no routine booking |
| **P11** | `P11-consent-declined.png` | `ConsentDeclinedScreen` | `72:452` | 390 × 844 | ✅ Exported | "No problem. We have not saved any health information." end screen |

### Doctor Portal (Desktop: 1280 × 820 viewport)
| Screen ID | Filename | Figma Frame Name | Node ID | Dimensions | Status | Description |
|---|---|---|---|---|---|---|
| **D1** | `D1-login.png` | `DoctorLogin` | `74:2` | 1280 × 820 | ✅ Exported | Login form with Evaluator Access card ("Credentials are shared privately with reviewers") |
| **D2** | `D2-dashboard.png` | `DoctorDashboard` | `74:24` | 1280 × 820 | ✅ Exported | 4 stat cards (Urgent, New, Booked, Not booked), recent reports table, 4-item sidebar |
| **D3** | `D3-reports-list.png` | `ReportsList` | `74:125` | 1280 × 820 | ✅ Exported | Filter tabs (All, Urgent, Booked, Not booked), report rows with department chips |
| **D4** | `D4-report-detail.png` | `DoctorReportDetail` | `74:220` | 1280 × 820 | ✅ Exported | Patient summary, department recommendation, collapsed full conversation, "Mark Reviewed" button |
| **D5** | `D5-urgent-detail.png` | `UrgentReportDetail` | `74:307` | 1280 × 820 | ✅ Exported | Urgent partial report, rule match citation, Emergency assignment, no booking action |
| **D6** | `D6-appointments.png` | `AppointmentsView` | `74:381` | 1280 × 820 | ✅ Exported | Tabs (Today, Upcoming, Past), scheduled patient slots, time badges |
| **D7** | `D7-urgent-list.png` | `UrgentReview` | `74:455` | 1280 × 820 | ✅ Exported | Dedicated view of pending urgent triage reports |

## Verified Design Tokens (Extracted from Live Figma Canvas)
- **Primary Font Family:** `Plus Jakarta Sans` (weights: Bold 700, SemiBold 600, Medium 500, Regular 400).
- **Indic Font Family:** `Noto Sans Devanagari` (for Hindi UI rendering).
- **Base Background:** `#dde3ee` (Desktop shell canvas) / `#f8fafc` (Mobile patient canvas).
- **Primary Navy / Brand Accent:** `#1f2a44` (Buttons, Mark, active chips).
- **Primary Text:** `#1d2433` (High contrast, headers, values).
- **Secondary / Caption Text:** `#4a5470` (Labels, subtitle, muted metadata).
- **Frosted Card Surfaces:** `rgba(255, 255, 255, 0.55)` with `backdrop-blur: 9px` and `border: 1px solid #ffffff`.
- **Primary Button Heights:** Mobile: `54px`–`58px`; Desktop: `54px` (exceeds 48px touch minimum).
- **Radii:** Cards: `20px`–`30px`; Inputs: `13px`; Buttons: `27px` (pill); Chips: `9999px` (full).

## Gaps Identified (Required by Architecture but Missing in Figma V2)
1. **Scripted Name Question:** Reuses P3 `ConversationView` layout (`72:66`).
2. **Scripted Age Question:** Reuses P3 `ConversationView` layout (`72:66`) with integer validation.
3. **Booking Blocked / Review Pending (Decision D4):** Required state for reports flagged `possible_urgent` or `needs_human_review`. Displays D4 copy: *"Your report has been submitted. Routine appointment booking is paused until a doctor reviews it."*
4. **Post-"Don't submit" Destination:** Clear session termination screen without hospital submission or appointment.
5. **Bilingual Hindi Layouts:** Figma V2 is English-only. Patient UI requires Noto Sans Devanagari text expansion support (~20-30% wider).
6. **Ambiguous Emergency Yes/No Clarification (Decision D9):** D9 copy (*"Is this happening to you right now?"*) with Yes/No chips.
7. **Session Creation Cap (`demo_busy`, Decision D9):** D9 copy (*"This demo has reached today’s usage limit. Please try again later."*).
8. **15-Turn Cap Incomplete Preview (Decision D9):** Summary with incomplete disclaimer and "End session" action only.
