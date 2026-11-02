# Button and Interaction Matrix

Every interactive element found in the running application was inspected for **visual correctness** (vs the Figma frame) and **functional correctness** (does the advertised action happen). "Tested" means it was exercised in the headless browser during this audit; "code" means behaviour was established by reading the handler only.

Status values: **PASS** · **VISUAL** (works, appearance differs from Figma) · **PARTIAL** (works but not as advertised) · **DEAD** (visible, does nothing) · **WRONG** (does a different action) · **MISSING** (absent at base commit, present at HEAD) · **UNTESTED**.

| # | Screen | Element | Expected appearance (Figma) | Actual appearance | Expected action | Actual result | Status |
|---|---|---|---|---|---|---|---|
| 1 | Welcome | English segment | Dark pill segment | Dark pill segment | Switch to English | Switches all patient copy | PASS |
| 2 | Welcome | हिंदी segment | Light segment | Light segment | Switch to Hindi | Switches copy; some hardcoded English remains (D-26) | PASS |
| 3 | Welcome | Start Talking (350×58, mic) | Navy pill, mic glyph | Navy pill, identical mic glyph | Create session → Consent | Session created, Consent shown | PASS |
| 4 | Welcome | Type Instead (350×54, keyboard) | Frosted pill, dotted keyboard | Frosted pill, grid keyboard icon | Start intake in text-first mode | Calls the **same** handler as Start Talking; no text-first mode is set | PARTIAL |
| 5 | Consent | Yes, I agree (346×54) | Navy pill | Navy pill | Record consent, start questions | Records consent, Conversation shown | PASS |
| 6 | Consent | No (346×54) | Frosted pill labelled **"No"** | Frosted pill labelled **"No, do not proceed"** | Declines, no health data | Consent-declined shown; session id cleared | PASS (copy differs) |
| 7 | Consent | Play/replay greeting (in-bubble control) | **not in Figma** | Text button "Replay audio" → "Playing..." | Play the pre-generated consent greeting | No `<audio>`, `HTMLMediaElement.play` never called; a 2.5 s timer only | DEAD |
| 8 | Consent | Back | not in Figma frame | 36 px button, 25×25 arrow (HEAD) | Return to Welcome | Returns to Welcome (HEAD) | MISSING at base |
| 9 | Conversation | Microphone (86×86) | Navy circle, Figma mic | Navy circle, identical mic | Start recording; live timer; hard stop at 30 s | Records, timer 00:00→00:30, auto-stops and opens the transcript step | PASS |
| 10 | Conversation | Microphone, second turn | Usable again | Enabled again after a completed recording | Record another answer | Enabled and records (`disabled=false`) | PASS |
| 11 | Conversation | Done (58×58) | Rounded square | Rounded square, stroke 2 vs 1.8 | Stop early and submit | Stops and opens the transcript step | PASS |
| 12 | Conversation | Type switch (58×58) | Figma keyboard | Grid keyboard | Switch to text input | Text card shown, input focused | PASS |
| 13 | Conversation | Use voice | — | Text link in text card | Return to voice card | Voice card shown | PASS |
| 14 | Conversation | Text input + Send (48 px) | — | — | Submit typed answer | Answer submitted, next question asked | PASS |
| 15 | Conversation | Severity chips (3) | 98/130/98 × 40; **Moderate dark** | Equal-width chips; **Moderate always dark** | Select and submit severity | Submits "Moderate"; the dark styling is static, not selection state | PARTIAL |
| 16 | Conversation | Gender chips (4) | 164×42 2×2 | 2×2, 40 px high | Select gender | Submits the selected value | PASS |
| 17 | Conversation | Emergency Yes / No | red/white chips (per docs, not Figma) | red/white chips | Yes → urgent flow; No → negates only | Not exercised (mock never enters ambiguity) | UNTESTED |
| 18 | Conversation | Replay audio | not in Figma | Text button with speaker icon | Replay the current question audio | Calls `speak`; in mock mode returns no audio and **gives no feedback**; in Supabase mode a **paid Timbre call on every click** | PARTIAL |
| 19 | Conversation | Back | 25×25 arrow at 7,80 | 36 px button, same vector, at 14,105 (HEAD) | Previous step | Returns to Consent (HEAD) | MISSING at base |
| 20 | What we heard | Send (350×54) | Paper-plane icon | Text "→ Send" | Confirm transcript | Answer submitted, next question | PASS (icon MISSING) |
| 21 | What we heard | Speak again (350×52) | Mic icon | Mic icon | Return and re-record | Returns to the conversation; does **not** start recording | PARTIAL |
| 22 | What we heard | Play question again | Text link | Text link | Replay the question | **Navigates back to the conversation**; no audio | WRONG |
| 23 | What we heard | Back | 25×25 arrow | 20 px chevron in header | Return to conversation | Works | PASS (visual APPROX) |
| 24 | Report review | Edit × 9 | 16×16 pencil icon | The word **"Edit"** | Edit that field | Opens a bottom-sheet editor with the current value | PASS (visual MISSING) |
| 25 | Report review | Save (sheet) | — | Navy pill | Persist correction | Field updated in the draft and re-rendered | PASS |
| 26 | Report review | Cancel (sheet) | — | Text + grey pill | Discard | Sheet closes, no change | PASS |
| 27 | Report review | Submit to Hospital (350×48) | Navy pill "Submit to hospital" | Navy pill h=50 "Submit to Hospital" | Submit report, assign doctor | Report submitted, Booking shown | PASS |
| 28 | Report review | Don't submit (350×48 frosted button) | **Frosted button** | Transparent 40 px text link | End privately | Session ended screen, draft not submitted | VISUAL |
| 29 | Report review | End session (cap only) | One button | One navy button | End incomplete session | Not reachable in mock mode | UNTESTED |
| 30 | Report review | Back | 25×25 arrow | Same vector (HEAD) | Return | Returns to conversation | MISSING at base |
| 31 | Booking | Date chip (7) | 3 chips + "More dates" | 7 chips, horizontal scroll, **no More dates** | Select date and load slots | Loads that date's slots | VISUAL + no "More dates" affordance (D-20) |
| 32 | Booking | Slot chip (14) | 6 chips 3×2 | 14 chips 3×5 | Select slot | Selection ring/navy fill | PASS (VISUAL) |
| 33 | Booking | Book Appointment (350×54) | "Book 03:30 PM" + calendar icon | "Book Appointment" | Book the selected slot | Booking created; confirmation shown **with "Invalid Date"** (D-03) | PARTIAL |
| 34 | Booking | Try another date (no-slots state) | Navy button in the no-slots card | Navy footer button | Load another date / next available | **No handler** (`BookingView.tsx:304` → `() => {}`) | DEAD |
| 35 | Booking | Not now | Text link | Text link | Skip booking, keep report | Report-sent confirmation | PASS |
| 36 | Booking | Back | 25×25 arrow | Same vector (HEAD) | Return to review | Returns to review (shows "Draft preview" for a submitted report) | MISSING at base |
| 37 | Booking blocked | Done | — | Navy pill | Leave the hold screen | Not reachable without a held report | UNTESTED |
| 38 | Confirmation | Done (350×54) | Navy pill | Navy pill | Finish, return home | Ends demo, returns to Welcome, clears session | PASS |
| 39 | Confirmation | Back | 25×25 arrow | Same vector (HEAD) | Return without losing state | **Re-opens the bookable slot grid** over an existing booking (D-10) | MISSING at base / regresses at HEAD |
| 40 | Emergency | End demo | **not in Figma** | Full-width navy button | End the demo | Returns to Welcome | PASS |
| 41 | Emergency | Back | 25×25 arrow | Same vector (HEAD) | Return | **Restores routine intake and hides 112** (D-02) | MISSING at base / unsafe at HEAD |
| 42 | Consent declined | Back to start (350×54) | Navy pill | Navy pill | Restart | Welcome shown | PASS |
| 43 | Session ended | Start Talking | — | Navy pill | Restart | Welcome shown, state cleared | PASS |
| 44 | Global | Error banner ✕ | — | Red banner dismiss | Dismiss error | Banner removed | PASS |
| 45 | Conversation | Mic error ✕ | — | Amber banner dismiss | Dismiss | Banner removed; **no retry control** | PARTIAL |
| 46 | Doctor login | Email field | 44 px frosted input | 44 px frosted input | Type email | Works | PASS |
| 47 | Doctor login | Password field + eye | Input **with eye toggle** | Input with **no toggle** | Type password / reveal it | Types; cannot reveal | MISSING (I-23) |
| 48 | Doctor login | Log in | Navy 54 px pill | Navy 54 px pill | Authenticate | Dashboard shown | PASS |
| 49 | Doctor login | Log in with bad credentials | — | — | Show an error, stay on login | "Invalid credentials" alert shown | PASS |
| 50 | Doctor login | Mock identity chips | not in Figma | 2 chips (mock mode only) | Prefill demo email | Prefills | PASS (extra UI) |
| 51 | Doctor login | Return to patient side | not in Figma frame | Hidden `<a>` at base; visible **"Back to Patient Intake"** at HEAD | Return to patient intake | Works at HEAD; at base only a 0×0 invisible link | MISSING at base |
| 52–55 | Sidebar | Dashboard / Reports / Appointments / Urgent | 238 px sidebar rows | Same, with added count badges | Navigate | All four switch the view | PASS |
| 56 | Sidebar | Log out | Text link under the profile | Text link | End session | Returns to Login | PASS |
| 57 | Reports list | Tabs All/Urgent/Booked/Not booked | Pill tabs | Pill tabs | Filter | All=2, Urgent=1, Booked=0, Not booked=1 on the seed data | PASS |
| 58 | Reports list | Search field | **not in Figma** | Rounded search input | Filter by patient/ref/concern | "Rohan" → 1 row | PASS (extra UI) |
| 59 | Reports list | Row / Open → | Row with chevron | 6-column table row + "Open →" | Open the report | Opens detail (urgent rows open urgent detail) | PASS (VISUAL) |
| 60 | Dashboard | 4 stat cards | 210×102 frosted cards | Same, clickable | Navigate to Urgent / Reports / Appointments | All navigate; Enter/Space also work | PASS |
| 61 | Dashboard | View All | Text link | Text link | Open Reports | Opens Reports | PASS |
| 62 | Dashboard | Report row | Row with chevron | Row with chevron | Open report | Opens the correct report | PASS |
| 63 | Report detail | Back | 25×25 arrow | 36 px circle, 16 px chevron | Back to Reports | Works | PASS (visual APPROX) |
| 64 | Report detail | Patient responses disclose | "Show full conversation" | "Patient responses / Expand ▼" | Show stored answers | Loads 8 answers with transcript vs confirmed text | PASS |
| 65 | Report detail | Retry (conversation error) | — | Inline retry link | Retry the read | Not exercised (error path) | UNTESTED |
| 66 | Report detail | Mark Reviewed | Navy full-width button | Navy full-width button | Write review fields | Reviewed state shown | PASS |
| 67 | Urgent list | Open | Navy pill per row | Navy pill per row | Open urgent detail | Opens | PASS |
| 68 | Urgent detail | Acknowledge Triage | Figma shows "Mark Reviewed" enabled for the GM doctor | Shown only to the Emergency doctor; GM sees a read-only chip | Acknowledge the triage | Not exercised (needs the Emergency login) | UNTESTED / doc conflict |
| 69 | Urgent detail | Read-only cross-visibility chip | not in Figma | Static pill | none | n/a | PASS |
| 70 | Appointments | Today / Upcoming / Past | Pill tabs, **Upcoming active** | Pill tabs, **Today active** | Filter by IST date | Filters correctly | PASS (default differs) |
| 71 | Appointments | View Intake → | **not in Figma** | Text link in a 7th column | Open the report | Opens the report | PASS (extra UI) |
| 72 | 404 | Return to Patient Intake | — | Link | Navigate home | Not exercised | UNTESTED |

**Total: 72 interactive elements** (63 distinct controls; the four sidebar items and the nine report Edit buttons are counted once each).

## Elements that look interactive but are not

| Element | Why it looks interactive | Reality |
|---|---|---|
| Consent greeting control | Speaker glyph, hover underline, "Playing..." label | Timer only; no audio (row 7) |
| "Play question again" | Underlined link | Navigation, not playback (row 22) |
| "Try another date" | Full-width primary button | `onClick={() => {}}` (row 34) |
| "Moderate" severity chip | Always rendered dark (Figma mock state) | Looks pre-selected but is just styling (row 15) |
| Doctor "Mark Reviewed" success badge | Looks like a disabled button | Static div; also hardcodes "Dr. Aditi Rao" (D-32) |

## Elements that are interactive but have no handler at all

Only one: **"Try another date"**. Every other visible button resolves to a real handler.
