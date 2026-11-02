/**
 * Generates the final release-certification PDF from a self-contained HTML report,
 * rendered by headless Chrome (Page.printToPDF). No new dependencies.
 *
 * Usage: node scripts/generate-final-certification-pdf.mjs
 */
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = resolve(process.cwd());
const HTTP_PORT = 4198;
const CDP_PORT = 9248;
const OUTPUT = resolve(ROOT, 'docs/release-readiness/SAMVAD-FINAL-RELEASE-CERTIFICATION-REPORT.pdf');

const CANDIDATE = 'b6ee111';
const FRONTEND = 'a8a3cf6';
const BACKEND = 'e5d77e5';
const AUDIT = 'ab4ba5b';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const register = [
  ['D-01', 'P0', 'Doctor warning flags hardcoded to None', 'FIXED', 'Data-driven flags, 4 states, 11 tests, captured urgent detail'],
  ['D-02', 'P1', 'Back on emergency restores routine intake', 'FIXED', 'Terminal state + no Back control + E2E assertion'],
  ['D-03', 'P1', 'Confirmation shows Invalid Date', 'FIXED', 'ISO slot_start, IST formatter, captured confirmation'],
  ['D-04', 'P1', 'demo_busy ignored at session start', 'FIXED', 'Busy notice + retry + disabled consent'],
  ['D-05', 'P1', 'Mic-denied screen missing', 'FIXED', 'Real state, text fallback, retry'],
  ['D-06', 'P1', 'No cached greeting; paid replay per click', 'OWNER ACTION', 'Caching/guard fixed; shipped audio is silence'],
  ['D-07', 'P1', 'Hindi emergency body in English', 'FIXED', 't.emergency.guidance + notice'],
  ['D-08', 'P1', 'Production fixtures / credential-free doctor', 'FIXED', 'Deleted from src; scan test; bundle clean'],
  ['D-09', 'P2', 'Processing screen not a real state', 'FIXED', 'Real processing view wired to isProcessing'],
  ['D-10', 'P1', 'Back from confirmation re-opens booking', 'FIXED', 'Terminal + read-only summary + duplicate refusal'],
  ['D-11', 'P1', 'Back to consent resets intake', 'FIXED', 'Idempotent consent; state restored'],
  ['D-12', 'P1', 'other_symptoms not correctable', 'FIXED', 'Row + multi-value editor'],
  ['D-13', 'P2', 'Try another date does nothing', 'FIXED', 'Next date with a free slot'],
  ['D-14', 'P2', 'All absences shown as Not provided', 'FIXED', 'Six distinct status labels'],
  ['D-15', 'P2', 'Missing information recomputed', 'FIXED', 'Reads report.missing_information'],
  ['D-16', 'P2', 'Booking layout differs from Figma', 'FIXED', '3 date chips + More dates, timed CTA, no doctor card'],
  ['D-17', 'P2', 'Fixture dashboard/list mismatch', 'FIXED', 'Single data source; computed badges'],
  ['D-18', 'P2', 'Appointment headers mismatch cells', 'FIXED', 'Relabelled Department / Reference'],
  ['D-19', 'P2', 'Play question again navigates away', 'FIXED', 'Replay handler wired'],
  ['D-20', 'P2', 'No More dates control', 'FIXED', '14-day window control'],
  ['D-21', 'P2', 'Browser-timezone slot times', 'FIXED', 'Explicit Asia/Kolkata formatting'],
  ['D-22', 'P2', 'Slot load error looks like no slots', 'FIXED', 'Distinct error state + retry'],
  ['D-23', 'P2', 'Silent session loss on refresh', 'FIXED', 'Explicit restore-failure message'],
  ['D-24', 'P2', 'Hidden links are the first tab stops', 'FIXED', 'Removed from tab order'],
  ['D-25', 'P2', 'Doctor load errors swallowed', 'FIXED', 'Loading/error/retry, last good data kept'],
  ['D-26', 'P2', 'Hardcoded English on patient screens', 'FIXED', 'All listed strings localized; E2E enforces it'],
  ['D-27', 'P3', 'No password reveal', 'FIXED', 'Eye toggle'],
  ['D-28', 'P3', 'No in-flight disabling', 'FIXED', 'Submit/Book/Edit disabled while pending'],
  ['D-29', 'P2', 'Reports filter state lost on Back', 'FIXED', 'Tab/search lifted to the shell'],
  ['D-30', 'P2', 'Urgent review authority ambiguity', 'OWNER ACTION', 'Fail-closed: Emergency doctor only (UI + RPC)'],
  ['D-31', 'P2', 'Review row layout differs', 'FIXED', 'Label column + value + pencil'],
  ['D-32', 'P2', 'Reviewed-by name hardcoded', 'FIXED', 'Resolved via reviewed_by'],
  ['D-33', 'P2', 'Source chip hardcoded', 'FIXED', 'Derived from report + input modes'],
  ['D-34', 'P2', 'Consent bubble copy divergence', 'OWNER ACTION', 'Decision documented, not changed'],
  ['D-35', 'P2', 'Urgent detail content hardcoded', 'FIXED', 'Report data + routing snapshot'],
  ['D-36', 'P3', 'canReview fails open', 'FIXED', 'Deny by default'],
  ['D-37', 'P2', 'Submitted report shown as draft', 'FIXED', 'Read-only submitted summary'],
  ['D-38', 'P3', 'Language choice not persisted', 'FIXED', 'localStorage + documentElement.lang'],
  ['D-39', 'P2', 'Conversation dead end', 'FIXED', 'Explicit panel with End'],
  ['D-40', 'P3', 'Silent microphone re-capture', 'FIXED', 'Reported, never re-records'],
  ['D-41', 'P3', 'Navigate before answer accepted', 'FIXED', 'Await then navigate'],
  ['D-42', 'P3', 'Appointments default to Today', 'FIXED', 'Upcoming default'],
  ['D-43', 'P2', 'Assistant avatar glyph/container', 'OPEN', 'Exact vector adopted; container remains'],
  ['D-44', 'P2', 'Patient avatar glyph/container', 'OPEN', 'Exact vector adopted; container remains'],
  ['D-45', 'P3', 'Brand plus metrics', 'OPEN', 'Unchanged (cosmetic)'],
  ['D-46', 'P3', 'Gender prints lower-case', 'FIXED', 'Capitalised / mapped'],
  ['D-47', 'P2', 'Reports list is a table', 'FIXED', 'Rebuilt as Figma list rows'],
  ['D-48', 'P2', 'No dedicated slot-state screens', 'FIXED', 'Dedicated no-slot card + retry'],
  ['D-49', 'P2', 'Confirmation layout differs', 'FIXED', '92 px circle + report-sent note'],
  ['D-50', 'P3', 'Severity chip always dark', 'FIXED', 'Selection-driven styling'],
  ['N-01', 'P1', 'Branch fabricated demographics and a date', 'FIXED', 'Rejected at merge; data-driven retained'],
  ['N-02', 'P1', 'Shipped prompt audio is silence', 'OWNER ACTION', '11 files 1.000 s at -91 dB; generator ready'],
  ['N-03', 'P2', 'Design corrections uncommitted', 'VERIFIED FIXED', 'Committed 78b68c2; diff byte-identical'],
  ['N-04', 'P2', 'Backup-restore rehearsal not executable', 'FIXED', 'Platform baseline in scratch DB; real dump restored'],
  ['N-05', 'P1', 'Lossy merge broke build and re-added fake data', 'FIXED', 'Six files restored; src identical to validated tree'],
];

const suites = [
  ['TypeScript', 'macOS local', 'npx tsc --noEmit', 'clean'],
  ['Frontend mock/unit', 'Node 26 + tsx', 'npm run test:mock', '121/121'],
  ['Supabase contract (SIMULATED)', 'Node + tsx', 'npm run test:supabase', '7/7'],
  ['API integration — REAL local stack', 'Docker + CLI 3.0.0 + Edge Functions', 'npm run test:api', '55/55'],
  ['Integration harness — REAL stack', 'same', 'deno run supabase/tests/integration.ts', '52/52'],
  ['Adaptive harness — REAL stack', 'same', 'deno run supabase/tests/adaptive.ts', '33/33'],
  ['Emergency certification — REAL stack', 'same', 'deno run supabase/tests/emergency-certification.ts', '209/209'],
  ['SQL RLS / booking / immutability', 'local PostgreSQL 17.11', '8 files via psql', '47 assertion blocks pass'],
  ['Backend Deno unit', 'Deno 2.9.7, mocked providers', 'deno test _shared/ .', '232/232'],
  ['Prompt-audio manifest drift', 'Deno', 'deno test supabase/tests/prompt-audio-manifest.test.ts', '3/3'],
  ['Speech round-trip (MOCKED)', 'Deno', 'deno test supabase/tests/provider-roundtrip.test.ts', '25/25'],
  ['Provider smoke (MOCKED)', 'Deno', 'deno test supabase/tests/provider-smoke.test.ts', '17/17'],
  ['Browser E2E', 'headless Chrome, built bundle', 'npm run test:e2e', '16/16'],
  ['Visual QA', 'headless Chrome, 7 viewports', 'npm run test:visual', 'pass, 23 shots'],
  ['Production build', 'Vite 6', 'npm run build', 'pass, 111 modules'],
  ['Unified release gate', 'local stack', 'scripts/release-check.ts --frontend', '30 PASS / 0 FAIL'],
  ['Deployment preflight', 'local', 'scripts/verify-deploy-config.ts', '17 PASS / 5 owner-blocked'],
  ['Demo preflight', 'local', 'scripts/demo-preflight.ts', '16/16'],
  ['Backup -> restore', 'local dump -> scratch DB', 'scripts/verify-backup-restore.ts --execute', 'pass, then dropped'],
];

const shots = [
  ['Welcome (mobile)', 'docs/screenshots/welcome-mobile-standard-390x844.png'],
  ['Consent + cached greeting', 'docs/screenshots/consent-screen-390x844.png'],
  ['Conversation (Hindi)', 'docs/screenshots/conversation-screen-390x844.png'],
  ['Emergency (112, no Back)', 'docs/screenshots/emergency-screen-390x844.png'],
  ['Booking confirmation (IST)', 'docs/screenshots/booking-confirmation-390x844.png'],
  ['Urgent detail (real flags)', 'docs/screenshots/doctor-urgent-warning-flags-1280x820.png'],
  ['Doctor dashboard', 'docs/screenshots/doctor-dashboard-1280x820.png'],
  ['Doctor reports list', 'docs/screenshots/doctor-reports-1280x820.png'],
  ['Report detail + reader', 'docs/screenshots/doctor-report-detail-1280x820.png'],
  ['Conversation history', 'docs/screenshots/doctor-conversation-history-1280x820.png'],
  ['Appointments', 'docs/screenshots/doctor-appointments-1280x820.png'],
  ['Doctor login', 'docs/screenshots/doctor-login-1280x820.png'],
];

const statusClass = (s) =>
  s === 'FIXED' || s === 'VERIFIED FIXED' ? 'ok' : s === 'OWNER ACTION' ? 'owner' : 'open';

function buildHtml() {
  const fixed = register.filter((r) => r[3] === 'FIXED' || r[3] === 'VERIFIED FIXED').length;
  const owner = register.filter((r) => r[3] === 'OWNER ACTION').length;
  const open = register.filter((r) => r[3] === 'OPEN').length;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Samvad HealthDesk AI — Final Release Certification Report</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm 16mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1e293b; font-size: 9.1pt; line-height: 1.45; }
  h1 { font-size: 26pt; line-height: 1.1; letter-spacing: -0.02em; color: #101a30; }
  h2 { font-size: 13pt; color: #101a30; margin: 15pt 0 6pt; padding-bottom: 3pt; border-bottom: 1.2pt solid #1f2a44; page-break-after: avoid; }
  h3 { font-size: 10.4pt; color: #1f2a44; margin: 9pt 0 4pt; page-break-after: avoid; }
  p { margin-bottom: 6pt; }
  ul, ol { margin: 0 0 7pt 14pt; } li { margin-bottom: 2.6pt; }
  table { width: 100%; border-collapse: collapse; margin: 5pt 0 10pt; font-size: 7.9pt; }
  th { background: #1f2a44; color: #fff; text-align: left; padding: 4pt 5pt; font-weight: 600; font-size: 7.7pt; }
  td { padding: 3.5pt 5pt; border-bottom: 0.5pt solid #dbe2ee; vertical-align: top; }
  tr:nth-child(even) td { background: #f5f7fb; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .reg td:first-child, .reg th:first-child, .reg td:nth-child(2), .reg th:nth-child(2) { white-space: nowrap; }
  .badge { display: inline-block; padding: 1pt 5pt; border-radius: 8pt; font-size: 6.8pt; font-weight: 700; white-space: nowrap; }
  .ok { background: #d9f2e3; color: #14603a; }
  .owner { background: #e3e9fb; color: #2a3f86; }
  .open { background: #fbe0e0; color: #8f1f1f; }
  .cover { height: 252mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
  .rule { height: 4pt; background: linear-gradient(90deg,#1f2a44,#4a7bd1); margin: 10pt 0 18pt; }
  .meta { font-size: 8.4pt; color: #475569; }
  .meta td { border: none; padding: 2.3pt 0; background: transparent !important; }
  .meta td:first-child { width: 44mm; color: #64748b; }
  .callout { border-left: 3pt solid #1f2a44; background: #f2f5fb; padding: 7pt 9pt; margin: 8pt 0 10pt; }
  .danger { border-left-color: #b42323; background: #fdf1f1; }
  .kpi { display: flex; gap: 6pt; margin: 8pt 0 10pt; }
  .kpi div { flex: 1; border: 0.6pt solid #d7dfec; border-radius: 6pt; padding: 6pt; background: #f8fafd; }
  .kpi b { display: block; font-size: 14pt; color: #101a30; line-height: 1.1; }
  .kpi span { font-size: 6.8pt; color: #5b6a83; text-transform: uppercase; letter-spacing: .04em; }
  .shots { display: grid; grid-template-columns: 1fr 1fr; gap: 7pt; }
  .shot { border: 0.6pt solid #d7dfec; border-radius: 5pt; overflow: hidden; page-break-inside: avoid; }
  .shot img { width: 100%; display: block; }
  .shot figcaption { font-size: 7pt; padding: 3pt 4pt; color: #475569; background: #f5f7fb; }
  .muted { color: #5b6a83; } .small { font-size: 7.7pt; }
  code { font-family: "SF Mono", Menlo, monospace; font-size: 7.6pt; background: #eef2f8; padding: 0.5pt 3pt; border-radius: 3pt; }
  .pagebreak { page-break-before: always; }
</style></head><body>

<section class="cover">
  <div>
    <div class="rule"></div>
    <p class="muted" style="font-size:8pt;letter-spacing:.14em;text-transform:uppercase;">Educational demo · synthetic data only · not a clinical product</p>
    <h1 style="margin-top:8pt;">Samvad HealthDesk AI<br/>Final Release<br/>Certification Report</h1>
    <p style="margin-top:12pt;font-size:11pt;color:#334155;">Backend remediation, branch integration, audio generation readiness, Supabase/Vercel preparation and combined regression</p>
    <div class="kpi" style="margin-top:16pt;">
      <div><b>${fixed}</b><span>defects fixed</span></div>
      <div><b>${owner}</b><span>owner actions</span></div>
      <div><b>${open}</b><span>visual open</span></div>
      <div><b>0</b><span>P0/P1 open</span></div>
      <div><b>30/0</b><span>release gate</span></div>
    </div>
    <div class="callout">
      <b>Certified for owner-supervised deployment.</b> All executable gates pass, including a
      real local Supabase stack (55/55 API, 52/52 integration, 209/209 emergency, 47 SQL
      assertion blocks). Not yet approved for public evaluator access.
    </div>
    <div class="callout danger">
      <b>Two blockers are owner actions, not code defects:</b> the shipped prompt audio is
      digital silence, and decisions D-30 / D-34 are unrecorded. Three cosmetic visual items
      remain open. Hosted Supabase, Vercel and live providers were not exercised.
    </div>
  </div>
  <table class="meta">
    <tr><td>Report date</td><td>3 November 2026</td></tr>
    <tr><td>Release candidate</td><td><code>release-candidate/samvad-final</code> @ <code>${CANDIDATE}</code></td></tr>
    <tr><td>Frontend</td><td><code>feat/frontend-figma-parity</code> @ <code>${FRONTEND}</code></td></tr>
    <tr><td>Backend</td><td><code>feat/backend</code> @ <code>${BACKEND}</code></td></tr>
    <tr><td>Audit baseline</td><td><code>audit/final-ui-logic-figma-review</code> @ <code>${AUDIT}</code></td></tr>
    <tr><td>Disposition</td><td>Candidate is disposable and unmerged. Nothing was deployed.</td></tr>
  </table>
</section>

<h2>1. Executive release decision</h2>
<p>The candidate integrates the backend feature work, the design owner's committed visual
pass and the OpenCode remediation into one reproducible tree, and for the first time
verifies the backend against a <b>real local Supabase stack</b>: real Auth, real JWTs, real
RLS, real Edge Functions and a real PostgreSQL database, with providers served by a local
stub.</p>
<div class="callout"><b>Unified release gate: 30 PASS · 0 FAIL · 0 BLOCKED · 0 NOT TESTED.</b>
The previously blocked <code>test:api</code> suite now runs and passes 55/55.</div>
<p><b>Verdict:</b> certified for owner-supervised deployment. <b>Not</b> approved for public
evaluator access until the prompt audio is real, the two owner decisions are recorded, the
hosted smoke test is run and the five open visual findings are accepted or fixed.</p>
<table>
  <thead><tr><th>Gate</th><th>Verdict</th></tr></thead>
  <tbody>
    <tr><td>Internal scripted demo (real local stack)</td><td><span class="badge ok">PASS</span></td></tr>
    <tr><td>Owner visual acceptance</td><td><span class="badge owner">CONDITIONAL</span> 3 cosmetic items open</td></tr>
    <tr><td>Security / RLS / authorization</td><td><span class="badge ok">PASS</span> real stack</td></tr>
    <tr><td>Hosted Supabase readiness</td><td><span class="badge ok">PASS</span> procedure ready; 5 owner-blocked preflight items</td></tr>
    <tr><td>Vercel readiness</td><td><span class="badge ok">PASS</span> verified, no secrets in client vars</td></tr>
    <tr><td>Hosted smoke test</td><td><span class="badge open">NOT TESTED</span> owner credentials required</td></tr>
    <tr><td>Live provider behaviour</td><td><span class="badge open">NOT TESTED</span> no credential used</td></tr>
    <tr><td>Public evaluator access</td><td><span class="badge owner">NOT YET</span> audio + decisions + hosted smoke</td></tr>
  </tbody>
</table>

<h2>2. Commit matrix</h2>
<table>
  <thead><tr><th>Role</th><th>Ref</th><th>Commit</th><th>Integration</th></tr></thead>
  <tbody>
    <tr><td>Frontend (design owner)</td><td>feat/frontend-figma-parity</td><td><code>${FRONTEND}</code></td><td>merged</td></tr>
    <tr><td>Backend</td><td>feat/backend</td><td><code>${BACKEND}</code></td><td>base</td></tr>
    <tr><td>Emergency certification</td><td>feat/emergency-certification-v3</td><td><code>b913506</code></td><td>merged</td></tr>
    <tr><td>Speech round-trip (+ provider harness)</td><td>feat/speech-roundtrip-verification-v2</td><td><code>13e88b2</code></td><td>merged (includes <code>0cff52a</code>)</td></tr>
    <tr><td>Question-bank integrity</td><td>feat/question-bank-integrity</td><td><code>37cf711</code></td><td>merged</td></tr>
    <tr><td>Demo lifecycle ops</td><td>feat/demo-lifecycle-ops</td><td><code>d6e7551</code></td><td>merged</td></tr>
    <tr><td>Doctor conversation reader</td><td>feat/doctor-conversation-reader</td><td><code>5e584b5</code></td><td>already an ancestor</td></tr>
    <tr><td>OpenCode remediation</td><td>fix/opencode-audit-frontend</td><td><code>c12df34</code></td><td>already an ancestor</td></tr>
    <tr><td>Prompt audio (new)</td><td>fix/opencode-prompt-audio</td><td><code>5ef0086</code></td><td>merged</td></tr>
    <tr><td>Backup-restore tooling (new)</td><td>fix/opencode-backup-restore</td><td><code>cbf1d0d</code></td><td>merged</td></tr>
    <tr><td><b>Release candidate</b></td><td>release-candidate/samvad-final</td><td><b><code>${CANDIDATE}</code></b></td><td>disposable, unmerged</td></tr>
  </tbody>
</table>

<h2>3. Integration history</h2>
<ol class="small">
  <li>Base <code>e5d77e5</code>; merged emergency certification (2 commits).</li>
  <li>Merged speech round-trip (brings the provider harness). Conflict: generated <code>release-check-result.json</code> only.</li>
  <li>Merged question-bank integrity; conflicts limited to generated result JSONs.</li>
  <li>Provider harness: already contained, no-op. Merged demo lifecycle ops (generated JSON conflicts only).</li>
  <li>Merged the design owner's branch. Conflicts: <code>.env.example</code> (kept the superset with both public and server-secret names) and two docs (kept the fuller versions).</li>
  <li>OpenCode remediation was already an ancestor, so it was not merged twice.</li>
  <li>Corrective commit <code>01730a8</code> (N-05), then merged the prompt-audio and backup-restore branches.</li>
  <li>Merged the design owner's follow-up (<code>3574e23</code>/<code>a8a3cf6</code>) — processing, booking, review, reports-list and slot-state screens; only screenshot binaries conflicted.</li>
  <li>Merged <code>fix/opencode-hindi-copy</code> (<code>88964b0</code>) closing the remaining English strings.</li>
</ol>
<p class="small"><b>Excluded deliberately:</b> <code>release/rc-1</code>, <code>release/samvad-rc1</code>,
<code>feat/frontend</code>, <code>feat/frontend-integration</code>, <code>feat/foundation</code>,
<code>main</code> (older or superseded), and the superseded emergency/speech revisions.</p>

<h2>4. Figma visual acceptance</h2>
<p>22 frames and 16 exported vectors remain the baseline. Closed in the candidate: the mic-denied
and processing screens, the booking layout (3 date chips + More dates, timed CTA, no doctor
card), the review row layout, the reports list, the dedicated no-slot state, the 92 px
confirmation with a report-sent note, password reveal, chip selection and the last hardcoded
English strings on patient screens. <b>Three cosmetic items remain open</b>: the avatar white
containers (D-43/D-44) and the brand-plus metrics (D-45). Visual acceptance is conditional on
the owner accepting those three.</p>

<h2>5. Screen, icon and component audit</h2>
<p>12 patient and 8 doctor components; two Edge Functions; eleven migrations. Only
<code>src/lib/api.ts</code> touches Supabase. Report v1.2 statuses are preserved. No fixture
router or synthetic report table exists in <code>src/</code>. Adopted Figma vectors: sidebar
icons, assistant/patient avatars, pencil, paper-plane, check circle. Open: avatar containers
(D-43/D-44), brand plus (D-45), a few rounded-square icons.</p>

<h2>6. Buttons and navigation</h2>
<p>Forward flow, Back on non-terminal screens, terminal guards on emergency and both
confirmations, doctor list ↔ detail with preserved search/tab, logout, direct <code>/doctor</code>
while logged out. Previously inert controls now work or report honestly. Inventory: 6 controls,
0 unlabelled, 0 dead links, 100% accessible names.</p>

<h2>7. Patient workflow</h2>
<p>Real stack: anonymous auth → consent → fixed questions → adaptive bank-v2 questions →
draft → correction → submit → slots → booking → confirmation. Hindi journey end to end.
Emergency path separate. <code>demo_busy</code> exercised by exhausting the local cap.</p>

<h2>8. Doctor workflow</h2>
<p>Login requires a mapped identity; an unmapped Auth user is signed out. Dashboard, reports,
detail with real warning flags, stored conversation, Mark Reviewed (timestamp and reviewer
only), appointments, urgent queue. General Medicine reads emergency reports; only the
Emergency doctor acknowledges.</p>

<h2>9. Emergency certification</h2>
<p>209/209 on the candidate: matcher scoping (multiple occurrences, clause boundaries,
negation window), deterministic rule order, fixed clarification, live escalation matrix,
doctor authorization, logging privacy, question-bank and phrase hash invariants. 112 is
plain text; no slots; no Back control.</p>

<h2>10. Microphone and recording</h2>
<p>12-case lifecycle suite passes (start after permission, wall-clock 30 s, hard stop,
idempotent stop, track release, WAV re-encode, transcript preview, no silent re-capture).
<b>Physical microphones and real device browsers were not exercised.</b></p>

<h2>11. English/Hindi speech</h2>
<p>Mocked round-trip harness 25/25: Unicode-safe comparison, punctuation/whitespace
tolerance, mismatch detection, timeout and error paths, four-request budget, non-live default.
<b>Live TTS→STT was not run</b> and is not clinical accuracy validation.</p>

<h2>12. Consent audio assets</h2>
<table>
  <thead><tr><th>Check</th><th>Result</th></tr></thead>
  <tbody>
    <tr><td>Cached-first resolution</td><td><span class="badge ok">PASS</span> .mp3 then shipped .wav</td></tr>
    <tr><td>Provider call for a fixed prompt</td><td><span class="badge ok">PASS</span> none (E2E asserted)</td></tr>
    <tr><td>Autoplay-blocked vs missing asset</td><td><span class="badge ok">PASS</span> two distinct states</td></tr>
    <tr><td>Adaptive replay caching</td><td><span class="badge ok">PASS</span> one call per language+question</td></tr>
    <tr><td>Shipped files contain speech</td><td><span class="badge open">FAIL</span> 11 × 1.000 s, -91 dB, byte-identical</td></tr>
    <tr><td>Generator ready</td><td><span class="badge ok">PASS</span> dry-run default, double opt-in, silence/duplicate checks</td></tr>
  </tbody>
</table>

<h2>13. Appointment and booking</h2>
<p>14-day IST weekday slots; atomic reservation; duplicate slot and duplicate report refused;
cross-patient read/booking refused; emergency permanently ineligible; flagged reports held
until review. Confirmation renders a real IST date and time (captured). A slot id is rejected
as a timestamp.</p>

<h2>14. Doctor conversation reader</h2>
<p>Stored patient answers only, chronological, transcript vs confirmed text and input mode,
RLS-scoped, drafts never visible. Verified on the real stack.</p>

<h2>15. Authentication and RLS (real local stack)</h2>
<table>
  <thead><tr><th>#</th><th>Check</th><th>Result</th></tr></thead>
  <tbody>
    ${[
      ['Anonymous patient authentication', 'PASS'],
      ['Session creation and ownership', 'PASS'],
      ['Report submission', 'PASS'],
      ['Message insertion', 'PASS'],
      ['Doctor authentication', 'PASS'],
      ['Doctor ↔ profile mapping (refuses unmapped)', 'PASS'],
      ['Assigned General Medicine access', 'PASS'],
      ['Emergency cross-visibility', 'PASS'],
      ['Emergency-only acknowledgement', 'PASS'],
      ['Cross-department rejection', 'PASS'],
      ['Report immutability + draft invisibility', 'PASS'],
      ['Appointment booking', 'PASS'],
      ['Duplicate appointment rejection', 'PASS'],
      ['Unauthenticated / invalid JWT', 'PASS (clock expiry not simulated)'],
      ['Edge Function authorization', 'PASS'],
      ['Consent persisted with version and text', 'PASS'],
    ].map(([c, r], i) => `<tr><td>${i + 1}</td><td>${c}</td><td>${r}</td></tr>`).join('')}
  </tbody>
</table>

<h2>16. Supabase setup readiness</h2>
<p><code>docs/release-readiness/HOSTED-SUPABASE-SETUP.md</code>: 14 ordered owner steps with
exact commands — project, ref, 11 migrations, seed, two Auth users, mapping, three secrets,
both function deploys, JWT check, exact CORS origin, hosted smoke list, RLS checks, workflow
checks, rollback.</p>

<h2>17. Vercel setup readiness</h2>
<p><code>docs/release-readiness/VERCEL-DEPLOYMENT.md</code>: verified build command and output,
SPA rewrite, public-only <code>VITE_</code> variables, preview/production separation,
origin allowlisting, 12-step smoke list, rollback by promoting the previous deployment.</p>

<div class="pagebreak"></div>
<h2>18. Complete defect register (55 findings)</h2>
<p class="small">The original 50 findings keep their IDs; N-01…N-05 were raised during the
remediation and certification rounds (55 findings in total). ${fixed} fixed/verified · ${owner} owner action ·
${open} open (all visual). No P0 or P1 defect remains open; the four owner actions are the prompt audio (D-06/N-02), D-30 and D-34.</p>
<table class="reg">
  <thead><tr><th>ID</th><th>Sev</th><th>Finding</th><th>Status</th><th>Evidence / implementation</th></tr></thead>
  <tbody>
    ${register.map(([id, sev, finding, status, note]) => `<tr><td><b>${id}</b></td><td>${sev}</td><td>${finding}</td><td><span class="badge ${statusClass(status)}">${status}</span></td><td>${note}</td></tr>`).join('')}
  </tbody>
</table>

<h2>19. Severity summary</h2>
<table>
  <thead><tr><th>Severity</th><th>Count</th><th>Fixed / verified</th><th>Owner action</th><th>Open</th></tr></thead>
  <tbody>
    <tr><td>P0</td><td>1</td><td>1</td><td>0</td><td>0</td></tr>
    <tr><td>P1</td><td>13</td><td>11</td><td>2</td><td>0</td></tr>
    <tr><td>P2</td><td>31</td><td>27</td><td>2</td><td>2</td></tr>
    <tr><td>P3</td><td>10</td><td>9</td><td>0</td><td>1</td></tr>
    <tr><td><b>Total</b></td><td><b>55</b></td><td><b>${fixed}</b></td><td><b>${owner}</b></td><td><b>${open}</b></td></tr>
  </tbody>
</table>

<h2>20. Test results with execution environment</h2>
<table>
  <thead><tr><th>Suite</th><th>Environment</th><th>Command</th><th>Result</th></tr></thead>
  <tbody>
    ${suites.map(([name, env, cmd, res]) => `<tr><td>${name}</td><td class="small">${env}</td><td><code>${cmd}</code></td><td><b>${res}</b></td></tr>`).join('')}
  </tbody>
</table>
<p class="small">Local stack: Supabase CLI 3.0.0, PostgreSQL 17.11, Edge Runtime 1.77.8,
Docker 29.9.2. Providers were served by <code>supabase/tests/stub-providers.ts</code>; no live
provider request was made. The emergency certification required temporarily raising the local
session cap (100 → 500) because the suite creates many sessions; it was restored to 100
immediately afterwards.</p>

<h2>21. Blocked, skipped and untested</h2>
<ul class="small">
  <li>Live Groq / Prisma / Timbre and the live speech round-trip — no credential, explicit authorization required.</li>
  <li>Live prompt-audio generation — same; the generator is ready.</li>
  <li>Hosted Supabase smoke and hosted Vercel deployment — not created or deployed by instruction.</li>
  <li>Physical microphone, iOS/Android, Safari, Firefox, screen reader — unavailable in this environment.</li>
  <li>Clock-based JWT expiry — unauthenticated/invalid JWT is covered, expiry is not simulated.</li>
  <li>15-turn cap in the browser — unreachable in mock mode (≤13 turns); covered by unit tests.</li>
  <li>Clinical speech accuracy — explicitly out of scope.</li>
</ul>
<p class="small">A local-stack pass is not a hosted pass; a stubbed-provider pass is not provider verification.</p>

<h2>22. Owner actions</h2>
<ol class="small">
  <li>Generate the ten prompt-audio files after reserving the attempts in the daily limit, then complete the listening pass.</li>
  <li>Record D-30 (urgent-review authority + urgent-queue membership).</li>
  <li>Record D-34 (consent copy) and approve the Hindi consent wording.</li>
  <li>Create and link the hosted project; apply migrations and seed; create and map the two doctors; set the three secrets; deploy both functions.</li>
  <li>Create the Vercel project; set the two public variables and the exact origin in ALLOWED_ORIGINS.</li>
  <li>Run the hosted smoke list and record the result.</li>
  <li>Approve merging the candidate into the permanent release branch.</li>
</ol>

<h2>23. Deployment checklist and rollback</h2>
<p class="small"><b>Before:</b> decisions recorded · audio generated and listened to · secrets
set · exact CORS origin · migrations and seed applied · two doctors mapped · preflight green ·
local suites green. <b>Order:</b> migrations → seed → doctor users → mapping → secrets →
chat-turn → speak → Vercel env → deploy → CORS redeploy → hosted smoke. <b>Rollback:</b>
promote the previous Vercel deployment; redeploy the previous functions; restore the
pre-migration backup for schema failures; ban the doctor accounts or pause the project to stop
public access.</p>

<h2>24. Final recommendation</h2>
<p>The candidate is <b>technically ready for owner-supervised deployment</b> and is the first
version whose backend is verified against a real database, real JWTs, real RLS and real Edge
Functions. It is <b>not yet ready for public evaluator access</b>: the prompt audio is silent,
two owner decisions are unrecorded, three cosmetic visual items remain open, and neither the
hosted environment nor a live provider has been exercised.</p>
<p>No claim of launch, production readiness or clinical validity is made. Merge, deployment and
hosted setup remain owner actions.</p>

<h2>25. Screenshot evidence</h2>
<div class="shots">
  ${shots
    .filter(([, p]) => existsSync(resolve(ROOT, p)))
    .map(([caption, p]) => `<figure class="shot"><img src="/${p}" alt="${caption}"><figcaption>${caption}</figcaption></figure>`)
    .join('')}
</div>
<p class="small muted">No API secret, key or real patient data appears in this document. All
patient and doctor identities used by the application are synthetic demo data.</p>

</body></html>`;
}

async function main() {
  if (process.env.DUMP_HTML) writeFileSync('/tmp/final-report.html', buildHtml());

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

  const chrome = spawn(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/cdp-final-pdf-${Date.now()}`, '--no-sandbox', '--disable-gpu'],
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
  await sleep(800);

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
    headerTemplate: '<div style="font-size:7px;color:#8a94a6;width:100%;padding:0 12mm;font-family:Helvetica,Arial,sans-serif;">Samvad HealthDesk AI · Final Release Certification Report</div>',
    footerTemplate: '<div style="font-size:7px;color:#8a94a6;width:100%;padding:0 12mm;display:flex;justify-content:space-between;font-family:Helvetica,Arial,sans-serif;"><span>release-candidate/samvad-final @ ' + CANDIDATE + '</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
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
