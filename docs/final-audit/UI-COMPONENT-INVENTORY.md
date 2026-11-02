# UI Component Inventory

Scope: every production React component in the patient and doctor surfaces, plus the reusable elements, cards and states they render. "States" lists only the states the code can actually produce; a state that exists in Figma but cannot be reached is called out.

## 1. Application shell and routing

| Component | File | Responsibility | States rendered | Notes |
|---|---|---|---|---|
| `App` | `src/App.tsx` | Router, i18n provider, 404 | `/`, `/doctor`, `*` (404), lazy-load fallback for the doctor chunk | Renders **two invisible, keyboard-focusable links** ("Patient Intake", "Doctor Portal") at `App.tsx:15-18` — see D-24 |
| `main` | `src/main.tsx` | React root | — | `StrictMode` enabled |
| `I18nProvider` | `src/i18n/index.tsx` | Runtime language switch | `en`, `hi` | Language lives in React state only; **not persisted** across reload (D-38) |

## 2. Patient components

| Component | File | Inputs (props) | States rendered | Key reusable elements |
|---|---|---|---|---|
| `PatientShell` | `features/patient/PatientShell.tsx` | — | 11 screens: `welcome`, `consent`, `consent_declined`, `conversation`, `what_we_heard`, `review`, `session_ended`, `booking`, `confirmed_booking`, `confirmed_report_only`, `emergency`; plus error banner, processing flag, fixture overrides | Screen state machine, session persistence (`samvad_session_id`), error sanitiser, mock fixtures `AARAV_SHARMA_REPORT/REPORT_ROW/APPOINTMENT` |
| `PatientHeader` | `features/patient/PatientHeader.tsx` | `progress?: number`, `onBack?: () => void` | With/without progress bar; with/without back button | Brand mark + wordmark, language pill (English/हिंदी), 4 px progress track |
| `WelcomeView` | `WelcomeView.tsx` | `onStartTalking`, `onTypeInstead` | Static; language en/hi | Feature card (350×300), 3× 52 px icon wells, primary pill (350×58), secondary pill (350×54), footer disclaimer |
| `ConsentView` | `ConsentView.tsx` | `onAgree`, `onDecline` | Idle, "Playing..." (2.5 s fake), error banner from parent | Assistant avatar + bubble, two 54 px pills, fake audio control |
| `ConsentDeclinedView` | `ConsentDeclinedView.tsx` | `onRestart` | Static | Frosted centre card, "Back to start" pill |
| `ConversationView` | `ConversationView.tsx` | messages, currentQuestion, turnCount, maxTurns, demoBusy, callbacks, isProcessing | `inputMode` voice/text; recording `idle/recording/completed/error`; mic error banner; demo-busy banner; 3 fixtures (P3, P3b, P4, P4b) | Message bubbles (assistant/patient) + avatars, progress header, turn counter, replay-audio row, option chips (3-up severity / 2×2 gender / generic), emergency Yes/No panel, voice control card (35-bar waveform, 3 buttons, status caption), text-mode card, processing indicator |
| `WhatWeHeardView` | `WhatWeHeardView.tsx` | `initialTranscript`, `onConfirm`, `onCancel` | Editing; Send disabled when empty | Editable transcript card, Send pill, Speak-again pill, "Play question again" text link, back button via `PatientHeader onBack` |
| `ReportReviewView` | `ReportReviewView.tsx` | report, isCapReached, canSubmit, onCorrectField, onSubmit, onDontSubmit, onEndSessionCap | Submittable (Submit + Don't submit), capped/incomplete (End session only), edit sheet open | 9 field rows with text "Edit" buttons, department chip card, footer actions, modal edit sheet, cap banner |
| `BookingView` | `BookingView.tsx` | report, onBookAppointment, onNotNow | Loading slots, slots loaded, no slots, slot-taken banner, booking error banner, booking-in-flight, booking blocked (review hold) | Doctor card, date chip scroller (7 weekdays), slot chip grid (14), footer CTA, Not now |
| `ConfirmationView` | `ConfirmationView.tsx` | type, report, appointment?, onHome | `appointment`, `report_only` | Success circle, reference box, doctor/department/date rows, Done |
| `EmergencyView` | `EmergencyView.tsx` | `onEndDemo` | Static | Red title, English guidance paragraph, 64 px "112", End demo button |
| `SessionEndedView` | `SessionEndedView.tsx` | reason, onRestart | `dont_submit`, `incomplete_cap` | Lock icon, privacy card, restart CTA |

## 3. Doctor components

| Component | File | Inputs | States rendered | Key reusable elements |
|---|---|---|---|---|
| `DoctorShell` | `features/doctor/DoctorShell.tsx` | — | `dashboard`, `reports`, `report_detail`, `urgent`, `appointments`; logged-in/out; fixture bypass | Frosted sidebar (brand, 4 nav items + counts, doctor footer with Log out), main scroll area, data loading |
| `DoctorLogin` | `DoctorLogin.tsx` | `onLoginSuccess` | Idle, submitting ("Signing In..."), error alert, mock identity quick-select | Hero block, form card (email, password), Log in, Evaluator access card, visible "Back to Patient Intake" (HEAD only) |
| `DoctorDashboardView` | `DoctorDashboardView.tsx` | doctor, stats, recentReports, bookedReportIds, callbacks | Fixture and real data variants; empty | 4 keyboard-activatable metric cards (210×102), recent-reports card with 5 rows, status pills |
| `DoctorReportsList` | `DoctorReportsList.tsx` | reports, bookedReportIds, onSelectReport | 4 tabs × search; empty result | Pill tabs, search field, 6-column table, status pills, review state, Open action |
| `DoctorReportDetail` | `DoctorReportDetail.tsx` | report, onBack, onRefreshReport | Pending/Reviewed, marking, review error, conversation `idle/loading/ready/error` + retry | Back button, source/status chips, patient card, details card, AI summary card, responses disclosure, Mark Reviewed |
| `DoctorUrgentDetail` | `DoctorUrgentDetail.tsx` | report, currentDoctor, onBack, onRefreshReport | Emergency doctor (acknowledge), GM (read-only), reviewed, marking, error | Emergency banner, patient card, warning-flag chip, audit-rule note, acknowledge control |
| `DoctorUrgentList` | `DoctorUrgentList.tsx` | urgentReports, onSelectReport | Empty, populated | Safety banner, row with avatar/ref/chip/Open, keyboard row activation |
| `DoctorAppointmentsView` | `DoctorAppointmentsView.tsx` | appointments, onSelectReport | Today / Upcoming / Past; empty | Tabs, 7-column table, Completed/Upcoming pills, "View Intake →" |

## 4. Reusable element catalogue (design-system level)

| Element | Where defined | Figma source | Match |
|---|---|---|---|
| Frosted card (rgba(255,255,255,0.55), 1 px white, blur 9 px, shadow `0 7px 22px -3px rgba(41,51,79,.12)`) | repeated Tailwind classes + `.frosted-card` in `index.css` | all cards | High |
| Ambient glow orbs | `.glow-lilac` / `.glow-sand` | `background/glow-lilac`, `background/glow-sand` | High (blur 28 px, radial) |
| Brand mark | 30/36/42 px rounded square with a text `+` | `brand/mark` + `brand/plus` (text node) | Approximation — `+` glyph metrics differ (D-45) |
| Language pill | `PatientHeader` (120×34, 58×30 segments) | `language-toggle` | High |
| Progress track | `PatientHeader` (346×4) | `progress/track`, `progress/value` | High |
| Primary pill | 54/58 px, `#1f2a44` | `btn-*` primary | High |
| Secondary frosted pill | 54 px, rgba(255,255,255,.74) | `btn-*` secondary | High |
| Option chip | 40 px rounded-20 | severity/gender chips (40/42 px) | Close |
| Status pill | dashboard/report list | `status` pills | High |
| Avatar badge | initials circle (`#e4e8f2`, 38/40/42/50 px) | patient avatars | Close (Figma uses a ring, impl uses a filled tint) |
| Assistant avatar | white circle/rounded-square + robot SVG | bare 30×30 robot vector, no container | **Mismatch** (D-43) |
| Patient chat avatar | white circle + person SVG | bare 28×28 person vector, no container | **Mismatch** (D-44) |
| Error banner | red 3-line banner with ✕ | none in Figma | Invented (documented failure UI) |
| Empty state | centred grey text | none | Invented (acceptable) |

## 5. Interaction states that exist in code

| State | Reachable? | Where |
|---|---|---|
| Recording (red pulsing mic, animated waveform, live timer) | yes | `ConversationView` |
| Recording complete | yes (brief) | `ConversationView` |
| Mic error | yes | `ConversationView` |
| Processing | yes (inline only) | `ConversationView` |
| Demo busy | only if the backend returns it mid-session | `ConversationView` |
| Slot taken | yes (banner) | `BookingView` |
| No slots | yes | `BookingView` |
| Booking blocked / review hold | yes | `BookingView` |
| Incomplete at cap | only via real backend | `ReportReviewView` |
| Reviewed / Pending review | yes | doctor views |
| Conversation loading/ready/error/retry | yes | `DoctorReportDetail` |
| Doctor data loading/error | **no** — errors are swallowed | `DoctorShell.loadData` |

## 6. Components that do **not** exist but are implied by the Figma file or the docs

| Missing component | Implied by | Impact |
|---|---|---|
| `ProcessingView` | Figma `72:192` | P6 cannot be reproduced at all |
| `MicDeniedView` | Figma `72:209` | P7 cannot be reproduced; denied users get no recovery |
| `SlotUnavailableView` | Figma `72:342` | P10 rendered as an inline empty cell |
| `SlotTakenView` | Figma `72:361` | P11 rendered as a banner |
| Any audio/cached-prompt player | AGENTS.md "play the pre-generated greeting"; `public/audio/` | No greeting, no cached prompts |
| Any shared `BackButton` at base commit | every Figma frame with `report/back-arrow` | Added at HEAD (`src/features/common/BackButton.tsx`) |
| Shared `EmptyState` / `ErrorState` / `Spinner` | — | Duplicated ad-hoc markup in 9 places |
