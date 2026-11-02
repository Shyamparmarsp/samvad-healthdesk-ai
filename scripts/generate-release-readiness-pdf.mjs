/**
 * Generates the final regression & release-readiness PDF from a self-contained HTML
 * report, rendered by headless Chrome (Page.printToPDF). No new dependencies.
 *
 * Usage: node scripts/generate-release-readiness-pdf.mjs
 */
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = resolve(process.cwd());
const HTTP_PORT = 4196;
const CDP_PORT = 9246;
const OUTPUT = resolve(ROOT, 'docs/release-readiness/SAMVAD-FINAL-REGRESSION-AND-RELEASE-READINESS-REPORT.pdf');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDIDATE = '938126a';
const FRONTEND_BASE = '3df09cd';
const ANTIGRAVITY_PATCH = 'ffd2fd28ce7e45a170e410b096bc0c8c3c92588eeb1abcb8516dd2f7d2b137e8';
const OPENCODE = 'c12df34';
const BACKEND = 'e5d77e5';
const AUDIT = 'ab4ba5b';

const defects = [
  ['D-01', 'P0', 'Doctor warning flags hardcoded to None', 'FIXED', 'Data-driven flags + 11 tests + captured urgent detail'],
  ['D-02', 'P1', 'Back leaves the emergency state and drops 112 guidance', 'FIXED', 'Terminal state guard, no Back control, E2E assertion'],
  ['D-03', 'P1', 'Booking confirmation shows Invalid Date', 'FIXED', 'ISO slot_start + IST formatter, captured confirmation'],
  ['D-04', 'P1', 'demo_busy at session start is ignored', 'FIXED', 'Busy notice on Welcome + disabled consent + retry'],
  ['D-05', 'P1', 'Mic-denied screen not implemented', 'FIXED', 'Real denied state, text fallback, retry (Figma layout)'],
  ['D-06', 'P1', 'No cached greeting; every replay is a paid call', 'OWNER ACTION', 'Caching/playback fixed; shipped assets are placeholders'],
  ['D-07', 'P1', 'Hindi emergency body stays English', 'FIXED', 't.emergency.guidance; Hindi E2E'],
  ['D-08', 'P1', 'Production fixtures and credential-free doctor path', 'FIXED', 'Deleted from src; scan test; bundle scan clean'],
  ['D-09', 'P2', 'Processing screen not a real state', 'ANTIGRAVITY', 'Still fixture-only'],
  ['D-10', 'P1', 'Back from confirmation re-opens booking', 'FIXED', 'Terminal confirmations; duplicate booking refused'],
  ['D-11', 'P1', 'Back to consent resets the intake pointer', 'FIXED', 'Idempotent consent; state restored'],
  ['D-12', 'P1', 'Other symptoms cannot be corrected', 'FIXED', 'Row + editor added'],
  ['D-13', 'P2', 'Try another date does nothing', 'FIXED', 'Searches the next date with a free slot'],
  ['D-14', 'P2', 'All absences shown as Not provided', 'FIXED', 'Six distinct status labels'],
  ['D-15', 'P2', 'Missing information recomputed', 'FIXED', 'Reads report.missing_information'],
  ['D-16', 'P2', 'Booking layout differs from Figma', 'ANTIGRAVITY', 'Not rebuilt'],
  ['D-17', 'P2', 'Fixture dashboard/list mismatch', 'FIXED', 'Single data source; computed badges'],
  ['D-18', 'P2', 'Appointment headers do not match cells', 'FIXED', 'Relabelled Department / Reference'],
  ['D-19', 'P2', 'Play question again navigates away', 'FIXED', 'Replay handler wired'],
  ['D-20', 'P2', 'No More dates control', 'FIXED', '14-day window control'],
  ['D-21', 'P2', 'Slot times use the browser timezone', 'FIXED', 'Explicit Asia/Kolkata formatting'],
  ['D-22', 'P2', 'Slot load error looks like no slots', 'FIXED', 'Error state + retry'],
  ['D-23', 'P2', 'Refresh loses the session silently', 'FIXED', 'Restore-failure message'],
  ['D-24', 'P2', 'Hidden links are the first tab stops', 'FIXED', 'Removed from tab order'],
  ['D-25', 'P2', 'Doctor load errors swallowed', 'FIXED', 'Loading/error/retry; last good data kept'],
  ['D-26', 'P2', 'Hardcoded English on patient screens', 'JOINT / PARTIAL', 'Hindi labels adopted; some copy remains'],
  ['D-27', 'P3', 'No password reveal', 'FIXED', 'Eye toggle added'],
  ['D-28', 'P3', 'No in-flight disabling', 'FIXED', 'Submit/Book/Edit disabled while pending'],
  ['D-29', 'P2', 'Reports filter state lost on Back', 'FIXED', 'State lifted to the shell'],
  ['D-30', 'P2', 'Urgent review authority ambiguity', 'OWNER ACTION', 'Fail-closed: Emergency doctor only'],
  ['D-31', 'P2', 'Review row layout differs', 'JOINT / PARTIAL', 'Pencil icon adopted; 3-column layout not rebuilt'],
  ['D-32', 'P2', 'Reviewed-by name hardcoded', 'FIXED', 'Resolved from reviewed_by'],
  ['D-33', 'P2', 'Source chip hardcoded', 'FIXED', 'Derived from report + input modes'],
  ['D-34', 'P2', 'Consent bubble copy divergence', 'OWNER ACTION', 'Decision not recorded'],
  ['D-35', 'P2', 'Urgent detail content hardcoded', 'FIXED', 'Uses report data and routing snapshot'],
  ['D-36', 'P3', 'canReview fails open', 'FIXED', 'Deny by default'],
  ['D-37', 'P2', 'Submitted report shown as draft after Back', 'FIXED', 'Read-only submitted summary'],
  ['D-38', 'P3', 'Language choice not persisted', 'FIXED', 'localStorage + documentElement.lang'],
  ['D-39', 'P2', 'Conversation dead end', 'FIXED', 'Explicit end-of-session panel'],
  ['D-40', 'P3', 'Silent microphone re-capture', 'FIXED', 'Reported instead of re-recording'],
  ['D-41', 'P3', 'Navigate before the answer is accepted', 'FIXED', 'Await then navigate'],
  ['D-42', 'P3', 'Appointments default to Today', 'FIXED', 'Upcoming default'],
  ['D-43', 'P2', 'Assistant avatar glyph/container', 'JOINT / PARTIAL', 'Exact vector adopted; container remains'],
  ['D-44', 'P2', 'Patient avatar glyph/container', 'JOINT / PARTIAL', 'Exact vector adopted; container remains'],
  ['D-45', 'P3', 'Brand plus metrics', 'ANTIGRAVITY', 'Unchanged'],
  ['D-46', 'P3', 'Gender prints lower-case', 'FIXED', 'Capitalised / mapped'],
  ['D-47', 'P2', 'Reports list is a table, not Figma rows', 'ANTIGRAVITY', 'Not rebuilt'],
  ['D-48', 'P2', 'No dedicated no-slots/slot-taken screens', 'ANTIGRAVITY', 'Inline states only'],
  ['D-49', 'P2', 'Confirmation layout differs', 'FIXED', 'Note + 92 px circle adopted'],
  ['D-50', 'P3', 'Severity chip always dark', 'FIXED', 'Selection-driven styling'],
  ['N-01', 'P1', 'Uncommitted branch fabricated demographics and a fallback date', 'FIXED IN CANDIDATE', 'Rejected at merge; data-driven behaviour retained'],
  ['N-02', 'P1', 'Prompt audio assets are 1-second placeholders', 'OWNER ACTION', 'All 11 files byte-identical, no speech'],
  ['N-03', 'P2', 'Antigravity work is uncommitted', 'OWNER ACTION', 'Patch hash recorded; commit required'],
];

const suites = [
  ['TypeScript', 'npx tsc --noEmit', '—', '0', '0', 'strict mode'],
  ['Mock unit/integration', 'npm run test:mock', '121', '0', '0', '19 suites'],
  ['Supabase contract (simulated)', 'npm run test:supabase', '7', '0', '0', 'not a real round trip'],
  ['Browser E2E', 'npm run test:e2e', '16/16', '0', '0', 'headless Chrome'],
  ['Visual / QA', 'npm run test:visual', '7 viewports', '0', '0', '23 screenshots'],
  ['Production build', 'npm run build:mock', 'pass', '0', '0', '111 modules'],
  ['Backend Deno', 'deno test _shared/', '181', '0', '0', 'mocked providers'],
  ['Local Supabase API', 'npm run test:api', '0', '3 (load)', '0', 'BLOCKED: no local stack'],
];

const shots = [
  ['Welcome (mobile)', 'docs/screenshots/welcome-mobile-standard-390x844.png'],
  ['Consent + cached greeting', 'docs/screenshots/consent-screen-390x844.png'],
  ['Conversation (Hindi)', 'docs/screenshots/conversation-screen-390x844.png'],
  ['Emergency (112, no Back)', 'docs/screenshots/emergency-screen-390x844.png'],
  ['Booking confirmation (IST)', 'docs/screenshots/booking-confirmation-390x844.png'],
  ['Urgent detail (real flags)', 'docs/screenshots/doctor-urgent-warning-flags-1280x820.png'],
  ['Doctor dashboard', 'docs/screenshots/doctor-dashboard-1280x820.png'],
  ['Reports list', 'docs/screenshots/doctor-reports-1280x820.png'],
  ['Report detail', 'docs/screenshots/doctor-report-detail-1280x820.png'],
  ['Appointments', 'docs/screenshots/doctor-appointments-1280x820.png'],
  ['Doctor login', 'docs/screenshots/doctor-login-1280x820.png'],
  ['Welcome (360 px)', 'docs/screenshots/welcome-mobile-small-360x800.png'],
];

const badgeClass = (status) =>
  status.startsWith('FIXED') ? 'ok' : status.startsWith('JOINT') ? 'warn' : status === 'OWNER ACTION' ? 'owner' : 'open';

function buildHtml() {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Samvad HealthDesk AI — Final Regression and Release-Readiness Report</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm 16mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1e293b; font-size: 9.2pt; line-height: 1.45; }
  h1 { font-size: 26pt; line-height: 1.1; letter-spacing: -0.02em; color: #101a30; }
  h2 { font-size: 13pt; color: #101a30; margin: 16pt 0 6pt; padding-bottom: 3pt; border-bottom: 1.2pt solid #1f2a44; page-break-after: avoid; }
  h3 { font-size: 10.5pt; color: #1f2a44; margin: 10pt 0 4pt; page-break-after: avoid; }
  p { margin-bottom: 6pt; }
  ul, ol { margin: 0 0 7pt 14pt; } li { margin-bottom: 3pt; }
  table { width: 100%; border-collapse: collapse; margin: 5pt 0 10pt; font-size: 8pt; }
  th { background: #1f2a44; color: #fff; text-align: left; padding: 4pt 5pt; font-weight: 600; font-size: 7.8pt; }
  td { padding: 3.6pt 5pt; border-bottom: 0.5pt solid #dbe2ee; vertical-align: top; }
  tr:nth-child(even) td { background: #f5f7fb; }
  .reg th:first-child, .reg td:first-child,
  .reg th:nth-child(2), .reg td:nth-child(2) { white-space: nowrap; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .badge { display: inline-block; padding: 1pt 5pt; border-radius: 8pt; font-size: 6.9pt; font-weight: 700; letter-spacing: .02em; white-space: nowrap; }
  .ok { background: #d9f2e3; color: #14603a; }
  .warn { background: #fdf0d2; color: #8a5a10; }
  .owner { background: #e3e9fb; color: #2a3f86; }
  .open { background: #fbe0e0; color: #8f1f1f; }
  .cover { height: 250mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
  .cover .rule { height: 4pt; background: linear-gradient(90deg,#1f2a44,#4a7bd1); width: 100%; margin: 10pt 0 18pt; }
  .meta { font-size: 8.4pt; color: #475569; }
  .meta td { border: none; padding: 2.4pt 0; background: transparent !important; }
  .meta td:first-child { width: 46mm; color: #64748b; }
  .callout { border-left: 3pt solid #1f2a44; background: #f2f5fb; padding: 7pt 9pt; margin: 8pt 0 10pt; }
  .danger { border-left-color: #b42323; background: #fdf1f1; }
  .kpi { display: flex; gap: 6pt; margin: 8pt 0 10pt; }
  .kpi div { flex: 1; border: 0.6pt solid #d7dfec; border-radius: 6pt; padding: 6pt; background: #f8fafd; }
  .kpi b { display: block; font-size: 15pt; color: #101a30; line-height: 1.1; }
  .kpi span { font-size: 7pt; color: #5b6a83; text-transform: uppercase; letter-spacing: .04em; }
  .shots { display: grid; grid-template-columns: 1fr 1fr; gap: 7pt; }
  .shot { border: 0.6pt solid #d7dfec; border-radius: 5pt; overflow: hidden; page-break-inside: avoid; }
  .shot img { width: 100%; display: block; }
  .shot figcaption { font-size: 7pt; padding: 3pt 4pt; color: #475569; background: #f5f7fb; }
  .muted { color: #5b6a83; }
  .small { font-size: 7.8pt; }
  code { font-family: "SF Mono", Menlo, monospace; font-size: 7.8pt; background: #eef2f8; padding: 0.5pt 3pt; border-radius: 3pt; }
  .pagebreak { page-break-before: always; }
</style></head><body>

<section class="cover">
  <div>
    <div class="rule"></div>
    <p class="muted" style="font-size:8pt;letter-spacing:.14em;text-transform:uppercase;">Educational demo · synthetic data only</p>
    <h1 style="margin-top:8pt;">Samvad HealthDesk AI<br/>Final Regression &amp;<br/>Release-Readiness Report</h1>
    <p style="margin-top:12pt;font-size:11pt;color:#334155;">P0/P1 defect remediation, security hardening and combined-candidate validation</p>
    <div class="kpi" style="margin-top:18pt;">
      <div><b>1</b><span>P0 fixed</span></div>
      <div><b>11/12</b><span>P1 resolved</span></div>
      <div><b>121</b><span>mock tests</span></div>
      <div><b>16/16</b><span>E2E checks</span></div>
      <div><b>181</b><span>backend tests</span></div>
    </div>
    <div class="callout danger" style="margin-top:10pt;">
      <b>Not release-approved.</b> One P1 remains owner-blocked (real prompt audio), five visual
      findings remain with the design owner, and the combined candidate is a snapshot of
      uncommitted visual work.
    </div>
  </div>
  <table class="meta">
    <tr><td>Report date</td><td>3 November 2026</td></tr>
    <tr><td>Audit of record</td><td><code>audit/final-ui-logic-figma-review</code> @ <code>${AUDIT}</code></td></tr>
    <tr><td>Frontend base</td><td><code>feat/frontend-figma-parity</code> @ <code>${FRONTEND_BASE}</code></td></tr>
    <tr><td>OpenCode remediation</td><td><code>fix/opencode-audit-frontend</code> @ <code>${OPENCODE}</code></td></tr>
    <tr><td>Backend baseline</td><td><code>feat/backend</code> @ <code>${BACKEND}</code></td></tr>
    <tr><td>Combined candidate</td><td><code>validation/samvad-combined-release-audit</code> @ <code>${CANDIDATE}</code></td></tr>
    <tr><td>Disposition</td><td>Validation rehearsal only — not merged, not pushed, not deployed</td></tr>
  </table>
</section>

<h2>1. Executive summary</h2>
<p>The P0 defect and every OpenCode-owned P1 from the 50-item audit were corrected on an
isolated branch, then combined with the design owner's visual pass in a disposable worktree
and re-tested end to end.</p>
<div class="callout">
  <b>All executable suites pass on the combined candidate.</b> TypeScript is clean, the mock
  suite is 121/121, the simulated Supabase contract suite is 7/7, headless-Chrome E2E is
  16/16, visual QA covers 7 viewports, the production build succeeds with zero fixture or
  secret strings, and the unchanged backend Deno suite is 181/181.
</div>
<p><b>What changed most:</b> the doctor's warning-flag section now reads the report instead of
printing “None”; emergency and confirmation screens can no longer be navigated away from;
booking sends a real slot timestamp and renders an Asia/Kolkata date; the daily-cap
(<code>demo_busy</code>) response is handled instead of silently disabling consent; every
fixture bypass and the credential-free doctor path were deleted from shipped code.</p>
<p><b>What is still open:</b></p>
<ul>
  <li><b>D-06 / N-02 — placeholder audio.</b> Eleven files exist in <code>public/audio</code>, but
  all eleven are byte-identical 1-second 8 kHz WAVs. Playback and caching are correct and
  never call the paid provider; the greeting is still silent. Owner action.</li>
  <li><b>Five visual findings</b> remain with the design owner (processing screen, booking
  layout, reports list, dedicated slot-state screens, brand plus), plus three partial
  visual items (review row layout, avatar containers, remaining English copy).</li>
  <li><b>Two owner decisions</b> (urgent-review authority, consent copy) and one process gap
  (the visual corrections are uncommitted).</li>
  <li><b>Real RLS/JWT behaviour</b> could not be exercised: no local Supabase stack, and hosted
  access was out of scope.</li>
</ul>
<p><b>Recommendation:</b> suitable for an internal scripted demonstration. Not yet for hosted
evaluator access or permanent branch integration.</p>

<h2>2. Candidate identity</h2>
<table>
  <thead><tr><th>Role</th><th>Ref</th><th>Commit / identifier</th></tr></thead>
  <tbody>
    <tr><td>Audit of record</td><td>audit/final-ui-logic-figma-review</td><td><code>${AUDIT}</code></td></tr>
    <tr><td>Frontend base</td><td>feat/frontend-figma-parity</td><td><code>${FRONTEND_BASE}</code></td></tr>
    <tr><td>Design-owner visual work</td><td>uncommitted working tree on the base</td><td><code>patch sha256 ${ANTIGRAVITY_PATCH.slice(0, 32)}…</code></td></tr>
    <tr><td>OpenCode remediation</td><td>fix/opencode-audit-frontend</td><td><code>${OPENCODE}</code> (code d7a3248, report 77c9cc5)</td></tr>
    <tr><td>Backend baseline</td><td>feat/backend</td><td><code>${BACKEND}</code></td></tr>
    <tr><td>Combined validation candidate</td><td>validation/samvad-combined-release-audit</td><td><code>${CANDIDATE}</code></td></tr>
  </tbody>
</table>
<p class="small"><b>Process finding N-03:</b> the design owner's corrections were never committed,
so the candidate contains a working-tree snapshot identified only by the patch hash. The owner
should require a commit before permanent integration.</p>

<h2>3. Integration-validation scope</h2>
<table>
  <thead><tr><th>Executed</th><th>Not executed</th></tr></thead>
  <tbody><tr>
    <td>TypeScript · mock unit/integration · simulated Supabase contract · headless-Chrome E2E
    against the built bundle · visual capture at 7 viewports · production build inspection ·
    bundle secret/fixture scan · backend Deno tests · static RLS/RPC review</td>
    <td>Hosted Supabase / Vercel · live Groq, Prisma, Timbre · real RLS and JWT enforcement ·
    physical devices, Safari, Firefox · screen-reader and axe passes · 15-turn cap in the
    browser (unreachable in mock mode)</td>
  </tr></tbody>
</table>

<h2>4. Original Figma comparison coverage</h2>
<p>The audit inspected all <b>22/22</b> frames at native resolution, exported 16 vectors and
produced 22 comparison sheets. This validation re-uses that baseline and adds fresh captures
of the corrected screens. It does <b>not</b> claim a new parity score: the five frames the audit
rated as material mismatches are still materially different, and the processing screen is
still not a real state.</p>

<h2>5. Patient UI verification</h2>
<table>
  <thead><tr><th>Behaviour</th><th>Expected</th><th>Result</th></tr></thead>
  <tbody>
    <tr><td>Welcome</td><td>Language toggle, Start Talking, Type Instead</td><td><span class="badge ok">PASS</span></td></tr>
    <tr><td>Consent</td><td>On-screen Yes/No, versioned copy, cached greeting</td><td><span class="badge ok">PASS</span> greeting served from a static asset, no provider call; autoplay blocking is reported honestly with a tap-to-play control</td></tr>
    <tr><td>Consent declined</td><td>No health data, no report</td><td><span class="badge ok">PASS</span></td></tr>
    <tr><td>Intake</td><td>Fixed question order, chips, voice and text</td><td><span class="badge ok">PASS</span></td></tr>
    <tr><td>Transcript</td><td>Editable, confirms before accepting</td><td><span class="badge ok">PASS</span> navigates only after acceptance</td></tr>
    <tr><td>Review</td><td>All allow-listed fields correctable</td><td><span class="badge ok">PASS</span> incl. other symptoms</td></tr>
    <tr><td>Submit</td><td>Explicit action, then routing and slots</td><td><span class="badge ok">PASS</span></td></tr>
    <tr><td>Booking</td><td>Real slots, IST times, book / not now / more dates</td><td><span class="badge ok">PASS</span></td></tr>
    <tr><td>Confirmation</td><td>Reference, doctor, real date and time</td><td><span class="badge ok">PASS</span> “Wed, 04 Nov 2026 · 9:00 AM”</td></tr>
    <tr><td>Emergency</td><td>112 plain text, intake stopped, no booking, no Back</td><td><span class="badge ok">PASS</span></td></tr>
    <tr><td>Hindi</td><td>Devanagari throughout</td><td><span class="badge warn">PARTIAL</span> “Turn 0 of 15” keeps an English word</td></tr>
  </tbody>
</table>

<h2>6. Doctor portal verification</h2>
<table>
  <thead><tr><th>Behaviour</th><th>Result</th></tr></thead>
  <tbody>
    <tr><td>Login requires a real session; unmapped users rejected</td><td><span class="badge ok">PASS</span></td></tr>
    <tr><td>No fixture auto-open, even with legacy keys present</td><td><span class="badge ok">PASS</span> enforced by a source-scan test</td></tr>
    <tr><td>Dashboard statistics and recent reports from loaded data</td><td><span class="badge ok">PASS</span></td></tr>
    <tr><td>Reports tabs and search</td><td><span class="badge ok">PASS</span></td></tr>
    <tr><td>Report detail renders real fields and real warning flags</td><td><span class="badge ok">PASS</span></td></tr>
    <tr><td>Urgent detail reads the rule from the report row</td><td><span class="badge ok">PASS</span> captured</td></tr>
    <tr><td>Fail-closed review authority</td><td><span class="badge ok">PASS</span></td></tr>
    <tr><td>Stored-answer conversation reader</td><td><span class="badge ok">PASS</span></td></tr>
    <tr><td>Appointments: headers match cells, Upcoming default, IST</td><td><span class="badge ok">PASS</span></td></tr>
    <tr><td>Logout returns to login</td><td><span class="badge ok">PASS</span></td></tr>
  </tbody>
</table>

<h2>7. Button and action verification</h2>
<p>The repository control inventory reports 6 audited controls, 0 unlabelled, 0 dead links,
100% accessible names; the audit's 72-control matrix remains the broader reference. Controls
re-verified here include start/type-instead, consent yes/no, question chips, send, mic, done,
transcript send / speak again / play again, every review edit, submit, don't submit, date
chips, more dates, slot chips, book, not now, end demo, doctor login, password reveal, sidebar
navigation, report rows, tabs, search, mark reviewed, acknowledge triage and logout.</p>
<p>Previously decorative controls now behave: consent greeting, play question again, try
another date, more dates. Controls that previously did nothing now report honestly: consent
without a session, slot-load failure, session restore failure.</p>

<h2>8. Navigation verification</h2>
<table>
  <thead><tr><th>Transition</th><th>Result</th></tr></thead>
  <tbody>
    <tr><td>Welcome → Consent → Conversation → Review → Booking → Confirmation</td><td>forward flow intact</td></tr>
    <tr><td>Back from conversation / transcript / review / booking</td><td>allowed, state preserved</td></tr>
    <tr><td>Back from emergency</td><td><b>blocked</b>, no control rendered</td></tr>
    <tr><td>Back from confirmations</td><td><b>blocked</b>; submitted report renders read-only</td></tr>
    <tr><td>Back from session ended / consent declined</td><td><b>blocked</b></td></tr>
    <tr><td>Doctor list → detail → back</td><td>search and tab preserved</td></tr>
    <tr><td>Direct URL /doctor while logged out</td><td>login screen only</td></tr>
  </tbody>
</table>

<h2>9. Avatar, icon and asset audit</h2>
<p>Adopted from the design pass: Figma sidebar icon paths, assistant and patient line-art
vector paths (30×30 / 28×28), edit pencil on review rows, paper-plane send icon and the 92 px
confirmation check circle. Still open: the avatar <b>containers</b> (D-43/D-44 require removing
the white circle), the brand plus metrics (D-45) and a few rounded-square icon treatments.
No image or glyph was invented in this validation.</p>

<h2>10. Emergency behaviour verification</h2>
<ul>
  <li>Clear trigger stops routine intake, shows the emergency card with plain-text <b>112</b>
  (no <code>tel:</code> link) and the translated guidance, and suppresses booking.</li>
  <li>No Back affordance exists on the emergency screen; an E2E assertion enforces it.</li>
  <li>An <code>urgent_partial</code> report with the rule id and a null summary reaches the
  doctor's urgent queue for both mapped doctors.</li>
  <li>General Medicine sees read-only cross-visibility; only the Emergency doctor can acknowledge.</li>
</ul>

<h2>11. Appointment and booking verification</h2>
<ul>
  <li>Confirmation renders a real IST instant (captured); no “Invalid Date”.</li>
  <li><code>slot_start</code> must be an ISO instant; a slot id is rejected with <code>invalid_slot</code>.</li>
  <li>One confirmed appointment per report, in both mock and database; the UI reports that
  specific state instead of “slot taken”.</li>
  <li>Appointment tabs and rows derive from Asia/Kolkata; headers now match their cells.</li>
  <li>Booking hold for flagged reports, emergency ineligibility and the unique-slot
  constraint are unchanged in the backend.</li>
</ul>

<h2>12. Consent audio verification</h2>
<table>
  <thead><tr><th>Check</th><th>Result</th></tr></thead>
  <tbody>
    <tr><td>Greeting resolved from a cached asset</td><td><span class="badge ok">PASS</span> <code>/audio/en/greeting.mp3</code> → fallback <code>/audio/greeting_en.wav</code></td></tr>
    <tr><td>Paid provider used for the cached greeting</td><td><span class="badge ok">PASS</span> none; asserted in E2E</td></tr>
    <tr><td>Fake 2.5 s “Playing…” timer</td><td><span class="badge ok">PASS</span> removed</td></tr>
    <tr><td>Failure reporting</td><td><span class="badge ok">PASS</span> distinguishes “unavailable” from “browser blocked playback”</td></tr>
    <tr><td>Adaptive replay caching</td><td><span class="badge ok">PASS</span> one provider call per language+question per page session</td></tr>
    <tr><td>Speech actually present in shipped files</td><td><span class="badge open">FAIL</span> 11 byte-identical 1-second placeholders</td></tr>
  </tbody>
</table>

<h2>13. Provider integration status</h2>
<table>
  <thead><tr><th>Provider</th><th>Status</th></tr></thead>
  <tbody>
    <tr><td>Groq</td><td>Not called; server-side only; live model/structured-output check still owner-gated.</td></tr>
    <tr><td>Gnani Prisma (STT)</td><td>Not called; browser posts WAV to <code>chat-turn</code>; contract unchanged.</td></tr>
    <tr><td>Gnani Timbre (TTS)</td><td>Not called in validation; fixed prompts never reach it.</td></tr>
    <tr><td>Supabase</td><td>Not contacted; wiring validated against the simulated suite only.</td></tr>
  </tbody>
</table>

<h2>14. Security and RLS results</h2>
<p><b>Statically verified (unchanged):</b> JWT-derived identity; RLS on sessions, messages and
reports; doctor reads scoped through <code>doctor_profiles</code>; draft reports never visible;
<code>SECURITY DEFINER</code> limited to <code>book_appointment</code>,
<code>mark_report_reviewed</code> and <code>get_doctor_appointments</code> with a fixed
<code>search_path</code>; emergency rejected by <code>submit_report</code>; one appointment per
report.</p>
<p><b>Dynamically verified:</b> the doctor portal cannot be entered without authentication;
no fixture bypass survives in the bundle; the client never writes to protected tables.</p>
<p><b>Not dynamically verified:</b> real RLS enforcement, JWT expiry, hostile-client behaviour
(no local Supabase stack).</p>
<div class="callout danger"><b>Correction made during validation (N-01).</b> The uncommitted
visual branch mapped patient names to invented age/gender/concern values in the appointments
table and returned a hardcoded date when a slot timestamp was unparseable. Both were rejected
at merge so no invented clinical data reaches a clinician.</div>

<h2>15. Complete defect register</h2>
<p class="small">53 findings: the original 50 (IDs preserved) plus N-01…N-03 discovered during
validation. Status reflects the combined candidate.</p>
<table class="reg">
  <thead><tr><th>ID</th><th>Sev</th><th>Finding</th><th>Status</th><th>Evidence / note</th></tr></thead>
  <tbody>
    ${defects.map(([id, sev, title, status, note]) => `<tr><td><b>${id}</b></td><td>${sev}</td><td>${title}</td><td><span class="badge ${badgeClass(status)}">${status}</span></td><td>${note}</td></tr>`).join('')}
  </tbody>
</table>
<p class="small"><b>Totals</b> — P0 1 · P1 12 · P2 29 · P3 11. Fixed or verified <b>40</b>,
joint/partial <b>4</b>, design-owner <b>5</b>, owner action <b>4</b>.</p>

<div class="pagebreak"></div>
<h2>16. Full automated test results</h2>
<table>
  <thead><tr><th>Suite</th><th>Command</th><th>Passed</th><th>Failed</th><th>Skipped</th><th>Notes</th></tr></thead>
  <tbody>
    ${suites.map((row) => `<tr>${row.map((cell, i) => `<td>${i === 1 ? `<code>${cell}</code>` : cell}</td>`).join('')}</tr>`).join('')}
  </tbody>
</table>
<p class="small">Assertions added for this report: cached-greeting playback from a static asset
and no provider call; a real IST booking date/time with no “Invalid Date”; a data-driven
warning-flag chip on the urgent detail; no Back control on the emergency screen.</p>

<h2>17. Failed, skipped and blocked</h2>
<ul>
  <li><b>Blocked:</b> <code>npm run test:api</code> (3 files) — no local Supabase stack; Supabase
  CLI absent, Docker present but no project provisioned. Hosted access was not substituted.</li>
  <li><b>Not run by design:</b> live provider calls, hosted environments, device/browser matrix,
  screen-reader and axe passes.</li>
  <li><b>No failures</b> in any executed suite.</li>
  <li>Inherited harness blind spots: <code>test:visual</code> asserts document overflow rather
  than shell clipping, and the control inventory audits a small fixed list. Both are treated as
  supporting evidence only.</li>
</ul>

<h2>18. Known limitations</h2>
<ol>
  <li>Prompt audio is placeholder silence (N-02).</li>
  <li>RLS/JWT behaviour is statically verified only.</li>
  <li>The mock backend completes in ≤13 turns, so the 15-turn cap UI is not browser-tested.</li>
  <li>The doctor portal does not restore a session on refresh (refresh returns to login).</li>
  <li>Visual parity is unchanged for the five frames the audit rated as material mismatches.</li>
  <li>The candidate is a rehearsal snapshot of uncommitted visual work (N-03).</li>
  <li>Hindi copy improved but incomplete (D-26).</li>
</ol>

<h2>19. Remaining owner actions</h2>
<ol>
  <li>Generate real prompt audio for the ten documented files (reserve the Timbre budget first); do not ship the placeholders.</li>
  <li>Record D-30 (urgent-review authority; candidate is fail-closed) and D-34 (consent copy).</li>
  <li>Require the design owner to commit its corrections so the candidate has a reviewable hash.</li>
  <li>Provision a local Supabase stack and run <code>npm run test:api</code>, or accept static security verification explicitly.</li>
  <li>Decide whether the urgent queue includes <code>needs_human_review</code> reports.</li>
  <li>Approve permanent integration only after 1–4.</li>
</ol>

<h2>20. Deployability assessment</h2>
<table>
  <thead><tr><th>Gate</th><th>Verdict</th></tr></thead>
  <tbody>
    <tr><td>Internal scripted demo (mock mode)</td><td><span class="badge ok">PASS</span></td></tr>
    <tr><td>Owner visual acceptance</td><td><span class="badge open">FAIL</span> five visual findings open</td></tr>
    <tr><td>Frontend ↔ backend integration</td><td><span class="badge warn">CONDITIONAL</span> contract-tested, not stack-tested</td></tr>
    <tr><td>Security review</td><td><span class="badge ok">PASS WITH NOTES</span></td></tr>
    <tr><td>Hosted evaluator access</td><td><span class="badge open">NOT YET</span> placeholder audio, open decisions</td></tr>
    <tr><td>Permanent branch integration</td><td><span class="badge owner">BLOCKED</span> pending owner approval</td></tr>
  </tbody>
</table>

<h2>21. Screenshot evidence</h2>
<div class="shots">
  ${shots
    .filter(([, path]) => existsSync(resolve(ROOT, path)))
    .map(([caption, path]) => `<figure class="shot"><img src="/${path}" alt="${caption}"><figcaption>${caption}</figcaption></figure>`)
    .join('')}
</div>

<h2>22. Evidence index</h2>
<ul class="small">
  <li>Validation worktree: <code>../samvad-final-release-validation</code> (branch <code>validation/samvad-combined-release-audit</code> @ <code>${CANDIDATE}</code>).</li>
  <li>Screenshots: <code>docs/screenshots/</code> (23 files).</li>
  <li>OpenCode handoff: <code>docs/release-remediation/OPENCODE-REMEDIATION-REPORT.md</code>.</li>
  <li>Integration contract: <code>docs/release-remediation/OPENCODE-ANTIGRAVITY-INTEGRATION-CONTRACT.md</code>.</li>
  <li>Audit corpus: <code>docs/final-audit/</code> on <code>audit/final-ui-logic-figma-review</code>.</li>
</ul>
<p class="small muted">No secrets, keys or real patient data appear in this document. All patient
and doctor identities used by the application are synthetic demo data.</p>

</body></html>`;
}

async function main() {
  if (process.env.DUMP_HTML) writeFileSync('/tmp/report.html', buildHtml());

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/' || urlPath === '/report.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildHtml());
      return;
    }
    const filePath = resolve(ROOT, '.' + urlPath);
    if (existsSync(filePath)) {
      const ext = extname(filePath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' ? 'image/jpeg' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(readFileSync(filePath));
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });

  await new Promise((r) => server.listen(HTTP_PORT, '127.0.0.1', r));
  console.log(`HTTP report server on ${HTTP_PORT}`);

  const chrome = spawn(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/cdp-pdf-${Date.now()}`, '--no-sandbox', '--disable-gpu'],
    { stdio: 'ignore' },
  );

  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) { ready = true; break; }
    } catch {}
    await sleep(200);
  }
  if (!ready) throw new Error('Chrome CDP failed to start');

  const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 0;
  const send = (method, params = {}) =>
    new Promise((resolvePromise, reject) => {
      const msgId = ++id;
      const handler = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id === msgId) {
          ws.removeEventListener('message', handler);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolvePromise(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/report.html` });
  await send('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      const check = () => {
        const imgs = Array.from(document.querySelectorAll('img'));
        Promise.all(imgs.map((img) => img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; }))).then(resolve);
      };
      if (document.readyState === 'complete') check(); else window.addEventListener('load', check);
    })`,
    awaitPromise: true,
  });
  await sleep(700);

  const pdf = await send('Page.printToPDF', {
    printBackground: true,
    paperWidth: 8.27,
    paperHeight: 11.69,
    marginTop: 0.55,
    marginBottom: 0.63,
    marginLeft: 0.47,
    marginRight: 0.47,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div style="font-size:7px;color:#8a94a6;width:100%;padding:0 12mm;font-family:Helvetica,Arial,sans-serif;">Samvad HealthDesk AI · Final Regression &amp; Release-Readiness Report</div>',
    footerTemplate: '<div style="font-size:7px;color:#8a94a6;width:100%;padding:0 12mm;display:flex;justify-content:space-between;font-family:Helvetica,Arial,sans-serif;"><span>validation/samvad-combined-release-audit @ ' + CANDIDATE + '</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
    generateTaggedPDF: true,
  });

  mkdirSync(resolve(ROOT, 'docs/release-readiness'), { recursive: true });
  const buf = Buffer.from(pdf.data, 'base64');
  writeFileSync(OUTPUT, buf);
  console.log(`Wrote ${OUTPUT} (${buf.length} bytes)`);

  ws.close();
  chrome.kill();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
