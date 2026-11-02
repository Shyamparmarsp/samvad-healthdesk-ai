/**
 * Post-audit HEAD delta verification (back navigation + state-reset risk).
 *
 * Runs against the HEAD worktree, read-only:
 *   AUDIT_APP_ROOT=../samvad-final-audit-head node docs/final-audit/scripts/audit-capture-head.mjs
 *
 * Requires `npm install && npm run build:mock` in AUDIT_APP_ROOT first.
 * Writes evidence to docs/final-audit/evidence/head-<shortSHA>/.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIT_ROOT = resolve(__dirname, '../../..');
const APP_ROOT = resolve(AUDIT_ROOT, process.env.AUDIT_APP_ROOT || '.');
const SHA = execSync('git rev-parse HEAD', { cwd: APP_ROOT }).toString().trim();
const EVIDENCE = resolve(AUDIT_ROOT, 'docs/final-audit/evidence', `head-${SHA.slice(0, 7)}`);
if (!existsSync(EVIDENCE)) mkdirSync(EVIDENCE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = Number(process.env.AUDIT_PORT || 4211);
const CDP = Number(process.env.AUDIT_CDP || 9351);
const BASE = `http://127.0.0.1:${PORT}`;
const log = { head: SHA, appRoot: APP_ROOT, startedAt: new Date().toISOString(), checks: [], navigation: {} };

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { cwd: APP_ROOT, stdio: 'ignore' });
let up = false;
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/')).ok) { up = true; break; } } catch {} await sleep(200); }
if (!up) throw new Error(`preview server did not start on ${PORT}`);

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${CDP}`,
  `--user-data-dir=/tmp/samvad-head-${Date.now()}`, '--no-sandbox', '--disable-gpu', '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream', '--window-size=1440,900'], { stdio: 'pipe' });
for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${CDP}/json/version`)).ok) break; } catch {} await sleep(200); }
const target = await (await fetch(`http://127.0.0.1:${CDP}/json/new`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
const shot = async (f) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve(EVIDENCE, f), Buffer.from(r.data, 'base64')); };
const text = async () => (await ev('document.body.innerText')) || '';
const waitFor = async (re, t = 8000) => { const s = Date.now(); while (Date.now() - s < t) { if (new RegExp(re, 'i').test(await text())) return true; await sleep(120); } return false; };
const nav = async (p = '/') => { await send('Page.navigate', { url: BASE + p }); await sleep(1000); };
const backs = async () => ev(`Array.from(document.querySelectorAll('button')).filter(b=>/back/i.test((b.getAttribute('aria-label')||'')+(b.title||''))).map(b=>{const r=b.getBoundingClientRect();return {label:b.getAttribute('aria-label'),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}})`);
const clickBack = async () => ev(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b=>/back/i.test((b.getAttribute('aria-label')||'')+(b.title||''))); if(!b) return false; b.click(); return true; })()`);
const clickText = async (re) => ev(`(() => { const rx = new RegExp(${JSON.stringify(re)},'i'); const b = Array.from(document.querySelectorAll('button')).find(b=>rx.test(b.innerText||'')||rx.test(b.getAttribute('aria-label')||'')); if(!b) return false; b.click(); return true; })()`);
const store = async (o) => ev(`sessionStorage.clear(); ${Object.entries(o).map(([k, v]) => `sessionStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')}`);
const answer = async (v) => {
  await ev(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b=>/type|लिख/i.test((b.getAttribute('aria-label')||''))); if(b) b.click(); })()`);
  await sleep(220);
  await ev(`(() => { const i = document.querySelector('input[type=text]'); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(120);
  await ev(`(() => { const f = document.querySelector('form'); const b = f && f.querySelector('button[type=submit]'); if (b && !b.disabled) b.click(); })()`);
  await sleep(500);
};
const check = (name, expected, actual, pass, evidence) => {
  log.checks.push({ name, expected, actual, pass, evidence });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${actual}`);
};

try {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await nav('/'); await ev('sessionStorage.clear()'); await nav('/');

  // consent back
  await clickText('Start Talking'); await waitFor('Yes, I agree');
  let b = await backs(); log.navigation.consent = b; await shot('consent-with-back.png');
  check('BACK-P2 consent', 'visible back button', JSON.stringify(b), b.length > 0, 'consent-with-back.png');
  await clickBack(); await sleep(700);
  check('BACK-P2 destination', 'returns to Welcome', /Welcome to Samvad/.test(await text()), /Welcome to Samvad/.test(await text()));

  // conversation back + state
  await clickText('Start Talking'); await waitFor('Yes, I agree');
  await clickText('Yes, I agree'); await waitFor('full name');
  await answer('Aarav Sharma');
  const turnBefore = (await text()).match(/Turn (\d+) of 15/)?.[1];
  b = await backs(); log.navigation.conversation = b; await shot('conversation-with-back.png');
  check('BACK-P3 conversation', 'visible back button', JSON.stringify(b), b.length > 0, 'conversation-with-back.png');
  await clickBack(); await sleep(700);
  check('BACK-P3 destination', 'returns to Consent', /Yes, I agree/.test(await text()), /Yes, I agree/.test(await text()));
  await clickText('Yes, I agree'); await sleep(900);
  const resumed = await text();
  const turnAfter = (resumed.match(/Turn (\d+) of 15/) || [null])[0];
  await shot('conversation-after-back.png');
  check('BACK-P3 state', 'answer/turn progress preserved after back to consent',
    `turn before=${turnBefore}, after re-consent="${turnAfter}"`, new RegExp(`Turn ${turnBefore} of 15`).test(resumed), 'conversation-after-back.png');

  // review / booking / confirmed
  await store({ FIGMA_PATIENT_VIEW: 'review' }); await nav('/');
  b = await backs(); log.navigation.review = b; await shot('review-with-back.png');
  check('BACK-P8 review', 'visible back button', JSON.stringify(b), b.length > 0, 'review-with-back.png');

  await store({ FIGMA_PATIENT_VIEW: 'booking', FIGMA_PARITY_NO_SLOTS: '1' }); await nav('/');
  b = await backs(); log.navigation.booking = b;
  await clickBack(); await sleep(800);
  const afterBookingBack = await text();
  await shot('booking-back-to-review.png');
  check('BACK-P9 booking destination', 'returns to review', `review=${/Your Health Report/.test(afterBookingBack)} draftBadge=${/DRAFT PREVIEW/i.test(afterBookingBack)}`,
    /Your Health Report/.test(afterBookingBack), 'booking-back-to-review.png');

  await store({ FIGMA_PATIENT_VIEW: 'confirmed_booking' }); await nav('/');
  b = await backs(); log.navigation.confirmed = b; await shot('confirmed-with-back.png');
  await clickBack(); await sleep(800);
  const afterConfirm = await text();
  await shot('confirmed-back-to-booking.png');
  check('BACK-P12 confirmed booking', 'must not re-open a bookable grid', `bookable=${/Book Appointment/.test(afterConfirm)}`,
    !/Book Appointment/.test(afterConfirm), 'confirmed-back-to-booking.png');

  // emergency via real trigger
  await ev('sessionStorage.clear()'); await nav('/');
  await clickText('Start Talking'); await waitFor('Yes, I agree');
  await clickText('Yes, I agree'); await waitFor('full name');
  await answer('Vikram Kumar'); await answer('45');
  if (/gender/i.test(await text())) {
    await ev(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||'')==='Male'); if(b) b.click(); })()`);
    await sleep(500);
  }
  await answer('I have severe chest pain and pressure in my chest');
  await waitFor('This may be urgent');
  b = await backs(); log.navigation.emergency = b; await shot('emergency-with-back.png');
  check('BACK-P14 emergency', 'visible back button', JSON.stringify(b), b.length > 0, 'emergency-with-back.png');
  await clickBack(); await sleep(900);
  const afterEmg = await text();
  await shot('emergency-after-back.png');
  check('BACK-P14 emergency state', 'emergency state must not be reset into routine intake',
    `routine resumed=${/What is your|Tap to speak/.test(afterEmg)}, guidance=${/This may be urgent/.test(afterEmg)}`,
    /This may be urgent/.test(afterEmg), 'emergency-after-back.png');

  // doctor back buttons
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  for (const [view, file] of [['dashboard', 'doctor-dashboard.png'], ['reports', 'doctor-reports.png'], ['appointments', 'doctor-appointments.png'],
    ['urgent', 'doctor-urgent.png'], ['report_detail', 'doctor-detail.png'], ['urgent_detail', 'doctor-urgent-detail.png']]) {
    await store({ FIGMA_PARITY_FIXTURE: '1', FIGMA_DOCTOR_VIEW: view }); await nav('/doctor');
    await sleep(400);
    log.navigation[`doctor_${view}`] = await backs();
    await shot(file);
  }

  // login return navigation
  await ev('sessionStorage.clear()'); await nav('/doctor');
  const loginNav = await ev(`Array.from(document.querySelectorAll('a,button')).filter(e=>{
    const s = getComputedStyle(e); const r = e.getBoundingClientRect();
    return (s.opacity !== '0' && r.width > 0 && r.height > 0) && /patient|back|return|home/i.test((e.innerText||'')+(e.getAttribute('aria-label')||''));
  }).map(e=>({tag:e.tagName,label:(e.innerText||e.getAttribute('aria-label')||'').trim()}))`);
  log.navigation.doctor_login_visible_return = loginNav;
  check('BACK-D1 login', 'visible return to patient intake', JSON.stringify(loginNav), loginNav.length > 0, 'login-nav.png');

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await store({ FIGMA_PATIENT_VIEW: 'conversation' }); await nav('/');
  await shot('conversation-avatars-head.png');
} finally {
  log.finishedAt = new Date().toISOString();
  writeFileSync(resolve(EVIDENCE, 'delta-run.json'), JSON.stringify(log, null, 2));
  try { ws.close(); } catch {}
  try { chrome.kill('SIGKILL'); } catch {}
  try { server.kill('SIGKILL'); } catch {}
  try { rmSync('/tmp/samvad-head-*', { recursive: true, force: true }); } catch {}
}
console.log('\nEvidence:', EVIDENCE);
process.exit(0);
