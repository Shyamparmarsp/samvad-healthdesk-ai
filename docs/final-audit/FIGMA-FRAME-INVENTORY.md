# Figma Frame Inventory and Screen Mapping

**File:** Samvad HealthDesk AI — V2 Screens
**File key:** `PIIKHDaviWGq9EV9yBZcnc`
**Pages:** 1 — `Samvad HealthDesk AI — V2 Screens` (`0:1`)
**Direct inspection:** yes — Figma MCP `get_metadata`, `get_screenshot` (native size) and `download_assets` (SVG) were used against the original file. Nothing in this inventory is derived from previously generated implementation screenshots or prior audit reports.

## Document-level facts

| Property | Value |
|---|---|
| Total nodes | 937 |
| Top-level frames | 22 |
| Frame types present | 364 `frame`, 413 `text`, 88 `rounded-rectangle`, 48 `ellipse`, 23 `line` |
| Components / component sets / instances | **0 / 0 / 0** — the file is a flat mockup, there is no component library and no variants |
| Raster images | none — all artwork is vector, rounded-rectangle or text |
| Canvas grid | 5 columns × 5 rows approx., frames spaced 470 px (mobile) / 1390 px (desktop) apart |

Because there are no components, "component variants" do not exist in the source. Every visual state in this audit is therefore a **static frame**, and interactive states (hover, disabled, selected, loading) beyond the captured frame were **not specified** by the owner and were not invented here.

## Patient frames (390 × 844)

| # | Node ID | Frame name | Position | Intended screen | Implemented by | Key visual elements | Interaction states in frame | Notes |
|---|---|---|---|---|---|---|---|---|
| P1 | `72:2` | WelcomeScreen | 0,0 | Patient welcome | `features/patient/WelcomeView.tsx` | glow-lilac `81:2`, glow-sand `81:3`, brand/mark `81:4` (30×30), brand/name `81:6`, language-toggle `81:7` (120×34), title `81:11` (342×62 @y103), subtitle `81:12`, features-card `81:13` (350×300 @y253) with 3 icon rows `81:14/19/24` (52×52 icons from `81:15/20/25`), abstract-glass-shape `81:29`, btn-start-talking `81:30` (350×58 @y623, mic icon `81:31`), btn-type-instead `81:35` (350×54 @y694, keyboard icon `81:36`), footer `81:40` @y816 | English selected in the language pill; no pressed/hover states | No back arrow (home) |
| P2 | `72:42` | ConsentScreen | 470,0 | Consent | `ConsentView.tsx` | glow orbs, brand, assistant avatar `81:47` (30×30), bubble `81:50` (306×184) with text `81:51`, btn-consent-yes `81:53` (346×54), btn-consent-no `81:55` (346×54), footer, language-toggle `98:46` (moved to 254,10) | Yes / No buttons; no audio control in the frame | Bubble copy differs from the shipped consent text (see D-34) |
| P3 | `72:66` | ConversationView | 940,0 | Conversation (voice, severity chips, listening) | `ConversationView.tsx` | progress track/value `81:67/68` (346×4 @y72), assistant avatar `81:70` + bubble `81:73`, patient bubble `81:75` + avatar `81:76` (28×28), assistant-2 `81:80/83`, severity chips mild/moderate/severe `81:85/87/89` (98/130/98 × 40, **Moderate is rendered selected**), voice card `81:91` (350×266 @y500) containing waveform `81:92` (35 bars), btn-switch-to-text `81:128` (58×58), btn-microphone `81:133` (86×86), btn-done `81:137` (58×58), captions `81:132/140`, status `81:141` ("Listening... 0:12 / 0:30"), footer `81:142`, **back arrow `98:38` (25×25 @7,80)** | Listening state with timer; Moderate chip selected; Done enabled | This is the only conversation state in the file |
| P4 | `72:121` | GenderQuestionView | 1410,0 | Gender question (quick-reply grid) | `ConversationView.tsx` (same component, `gender` options → 2×2 grid) | progress (track x18, value x22 — 4 px misalignment in the source file), assistant bubble, gender chips `81:160/162/164/166` (164×42, 2×2 @x22/204, y222/276), voice card, **back arrow `98:42`** | No chip selected | Chips are 42 px high in Figma, 40 px in the implementation |
| P5 | `72:167` | WhatWeHeardView | 0,960 | Editable transcript | `WhatWeHeardView.tsx` | progress, heard/card `81:232` (350×248 @y166) with title + editable text `81:234`, btn-send-heard `81:236` (350×54, **paper-plane icon** `81:237`), btn-speak-again `81:241` (350×52, mic icon `81:242`), link-play-question `81:246` (text link), footer, **back arrow `98:51`** | Text field focused/editable | No disabled state shown for Send |
| P6 | `72:192` | ProcessingView | 470,960 | "Understanding your answer" | **not implemented as a real screen** — fixture branch only (`ConversationView.tsx:174-194`) | progress, processing/card `81:260` (350×270) with 3 dots `81:261/262/263` and status text `81:264`, footer, **back arrow `98:55`** | 3-dot loading only | Frame exists; no route/state reaches it |
| P7 | `72:209` | MicDeniedView | 940,960 | Microphone denied → text fallback | **not implemented as a real screen** — fixture branch only (`ConversationView.tsx:196-230`) | progress, mic-denied/card `81:278` (350×294) with title, text field `81:280` + send button `81:282`, **back arrow `98:59`**, btn-try-mic-again `81:286` (350×54), footer | Text entry + retry | The real app shows an inline amber banner instead |
| P8 | `72:235` | PatientReportReview | 1410,960 | Draft review + submit | `ReportReviewView.tsx` | progress value 230.67 (2/3), page title `81:304` @y112, subtitle `81:305`, details-card `81:306` (350×392) with **9 label/value rows** `81:307…` each with a **16×16 pencil edit icon** `81:309/315/321/327/333/339/345/351/357` and dividers `81:312…`, department-card `81:360` (350×106), btn-submit-to-hospital `81:365` (350×48), btn-dont-submit `81:367` (350×48 — a **frosted button**, not a text link), footer, **back arrow** | Rows are editable (pencil affordance); no inline edit state shown | Rows: Name, Age, Gender, Primary concern, Duration, Severity, Medical history, Medications, Allergies |
| P9 | `72:301` | BookingView | 0,1920 | Slot selection | `BookingView.tsx` | progress (full), page title `81:…` @y112, subtitle "Dr. Aditi Rao · General Medicine", **back arrow**, date-card `81:384` (350×118) with **3 date chips + "More dates" link**, slots-card `81:396` (350×264) with **6 slot chips in a 3×2 grid**, btn-book-selected-slot `81:410` (350×56, **calendar icon**, label includes the chosen time), link-not-now `81:415`, footer | 3rd date selected (Mon 02 Nov); 03:30 PM slot selected | No "Assigned Specialist" card, no "Select date/time" labels |
| P10 | `72:342` | SlotUnavailableView | 470,1920 | No slots for the date | **no dedicated screen** — inline empty state in `BookingView.tsx:254-266` | title, subtitle, booking/no-slots-card `81:…` (350×220) containing "No free slots on this date." + **Try another date button + Not now button inside the card**, footer, **back arrow** | Two buttons only | Implementation puts Try-another-date in the footer and it is a no-op (D-13) |
| P11 | `72:361` | SlotTakenView | 940,1920 | Slot collision | **no dedicated screen** — amber banner inside `BookingView.tsx:173-187` | title, subtitle, booking/slot-taken-banner `81:…` (350×68, **soft red**), booking/alternative-slots `81:…` (350×226, six alternatives), footer, **back arrow** | Collision banner + alternatives; no primary CTA | Implementation keeps the full grid and shows footer CTAs |
| P12 | `72:394` | BookingConfirmation | 1410,1920 | Appointment confirmed | `ConfirmationView.tsx` (`type="appointment"`) | confirmation/check-circle `81:…` (92×92), title `81:…` (350×40), details-card `81:…` (350×176) with **centred lines**: reference, "Dr. Aditi Rao · General Medicine", "Mon 02 Nov 2026 · 03:30 PM", confirmation/note "Your report has been sent to Dr. Rao.", btn-confirmation-done `81:…` (350×54), footer, **back arrow** | Static success | No label/value two-column layout, no separate reference box |
| P13 | `72:417` | ReportSentConfirmation | 0,2880 | Report only (Not now) | `ConfirmationView.tsx` (`type="report_only"`) | check-circle `81:…`, title "Report sent", details-card with "Your report has been sent to Dr. Aditi Rao. No appointment was booked.", btn-confirmation-done, footer, **back arrow** | Static success | No reference code shown in this frame |
| P14 | `72:436` | EmergencyScreen | 470,2880 | 112 guidance | `EmergencyView.tsx` | **warm/sand background**, emergency/card `81:…` (350×490 @y170) with title "This may be urgent", the guidance paragraph, large "112"; language-toggle `81:…` (120×31), **back arrow**, footer | **No button in the frame** | Implementation adds an "End demo" button and omits the back arrow at base |
| P15 | `72:452` | ConsentDeclinedScreen | 940,2880 | Consent declined | `ConsentDeclinedView.tsx` | declined/card `81:…` (350×230 @y249) with "No problem. We have not saved any health information.", btn-back-to-start (350×54), footer, language-toggle | Single CTA | No back arrow (uses "Back to start") |

## Doctor frames (1280 × 820)

All doctor frames share `doctor/shell` (1260×800), `doctor/sidebar` (238×780), the brand block and the dashboard glow orbs.

| # | Node ID | Frame name | Position | Intended screen | Implemented by | Key visual elements | Interaction states | Notes |
|---|---|---|---|---|---|---|---|---|
| D1 | `74:2` | DoctorLogin | 0,4000 | Doctor authentication | `DoctorLogin.tsx` | doctor/shell, brand mark 42×42, login/title (420×45) @x101 y305, login/subtitle, login/form-card `74:…` (520×620 @x650 y100) containing Email, Password (**with eye toggle**), "Log in" (h54), login/evaluator-access-card | Empty fields | No back/return navigation in the frame |
| D2 | `74:24` | DoctorDashboard | 1390,4000 | Dashboard (home) | `DoctorDashboardView.tsx` | sidebar + **back arrow before the title**, page/title "Welcome, Dr. Rao", page/subtitle, 4 metric cards `metric/card/0..3` (210×102: 2 Urgent / 5 New / 2 Booked / 1 Not booked), dashboard/reports-card (944×525) with 5 rows (avatar, name·age, concern, status pill, time, chevron) | "Dashboard" nav item active | Implementation shows "Welcome, Dr. Aditi Rao" and adds counts to the nav items |
| D3 | `74:125` | ReportsList | 2780,4000 | Reports list | `DoctorReportsList.tsx` | sidebar + **back arrow**, page/title "Reports", reports/list-card (944×646) with 4 pill tabs (All active, Urgent, Booked, Not booked) and **5 list rows only** | Tabs; row hover | **No search field, no table header, no Review/Action columns** |
| D4 | `74:220` | DoctorReportDetail | 4170,4000 | Standard report detail | `DoctorReportDetail.tsx` | **back arrow** before "Patient Report", report/id line, two chips (source "Voice · English", "Pending review"), patient-card (926×70: avatar, name, age·gender; department chip, "Booked"), details-card (452×540) with Primary concern / Reported symptoms / Relevant history (Conditions, Medications, Allergies) / Missing information / Warning flags ("None") / Preliminary routing / Appointment, summary-card (458×540) with AI summary, "Show full conversation" box (AI + Patient lines), "Mark Reviewed" button | Conversation expanded (static), pending review | Figma shows assistant+patient conversation; docs forbid fabricating assistant text, so this is a justified divergence |
| D5 | `74:307` | UrgentReportDetail | 0,4920 | Urgent report detail | `DoctorUrgentDetail.tsx` | urgent-report/back-arrow, title, **thin full-width emergency banner** (924×42) "Urgent: emergency rule triggered", patient-card (926×70) with "Partial report, intake stopped early", details-card (452×458) with Primary concern / Warning flag chip (`severe_chest_pain`) / statement / Missing information / Preliminary routing, flags-card (458×458) with Appointment "No appointment (urgent)" and an enabled **"Mark Reviewed"**, source/pending chips | Reviewed button enabled for the logged-in General Medicine doctor | Conflicts with the documented OD-03 read-only rule for General Medicine (needs owner ruling) |
| D6 | `74:381` | AppointmentsView | 1390,4920 | Appointments | `DoctorAppointmentsView.tsx` | **back arrow** before "Appointments", table-card (944×646) with tabs Today / **Upcoming (active)** / Past and columns **Date | Time | Patient | Age / Gender | Concern | Status**; rows Mon 02 Nov 03:30 PM Aarav Sharma 28·Male Headache (3 days) Upcoming | Three tabs; Completed label for past | **No Intake/Ref column** |
| D7 | `74:455` | UrgentReview | 2780,4920 | Urgent / review queue | `DoctorUrgentList.tsx` | **back arrow** before "Urgent / Review", urgent/list-card (944×340) with **2 rows**: Vikram Kumar (Emergency rule) and **Meera Joshi (Needs review)**, each with an "Open" button | Two status chips | Figma includes a `needs_human_review` row; the implementation's queue predicate includes `urgent_partial` only (documented as SOURCE-DEFINED, inclusion of flagged reports is open decision RD-15) |

## Screens in the app with no approved Figma frame

These are implemented but have **no reference in the Figma file**; they are judged on internal consistency and the written docs only:

| Screen / state | Where | Why it exists |
|---|---|---|
| Session ended ("Don't submit" / incomplete-at-cap) | `SessionEndedView.tsx` | Required by AGENTS.md step 8 / report-design §"incomplete-at-cap" |
| Booking blocked ("Review Pending") | `BookingView.tsx:115-135` | Required by the booking-hold rule |
| Text intake mode card | `ConversationView.tsx:738-780` | Text fallback; Figma only shows the mic-denied text field |
| Field-edit bottom sheet | `ReportReviewView.tsx:270-314` | Correction UI; Figma only shows a pencil icon |
| Error banner (red) and mic-error banner (amber) | `PatientShell.tsx:588-607`, `ConversationView.tsx:452-468` | Failure handling; docs/failure-modes.md |
| Doctor "Patient responses" disclosure | `DoctorReportDetail.tsx:338-432` | Real conversation reader (M3 feature) |
| 404 route | `App.tsx:38-52` | SPA fallback |
| Hidden "Patient Intake / Doctor Portal" nav links | `App.tsx:15-18` | Test/assistive hook — see D-24 |

## Frame coverage statement

All 22 top-level frames were rendered from Figma at native resolution and compared with a screenshot of the running application. No frame was skipped, and no frame was marked MATCH without a captured comparison (see `evidence/comparison/`).
