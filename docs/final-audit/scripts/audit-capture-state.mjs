/** Third audit pass: state preservation (search/filter across detail navigation) and refresh/resume behaviour. */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const EVIDENCE = resolve(ROOT, 'docs/final-audit/evidence');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4194, CDP = 9339, BASE = `http://127.0.0.1:${PORT}`;
const log = {};

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/')).ok) break; } catch {} await sleep(200); }
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=/tmp/samvad-state-${Date.now()}`,
  '--no-sandbox', '--disable-gpu', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--window-size=1440,900'], { stdio: 'pipe' });
for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${CDP}/json/version`)).ok) break; } catch {} await sleep(200); }
const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
const shot = async (f) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve(EVIDENCE, f), Buffer.from(r.data, 'base64')); };

try {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + '/doctor' }); await sleep(1200);
  await ev(`sessionStorage.clear(); sessionStorage.setItem('FIGMA_PARITY_FIXTURE','1')`);
  await send('Page.navigate', { url: BASE + '/doctor' }); await sleep(1400);
  await ev(`(() => { const b = Array.from(document.querySelectorAll('nav button')).find(b => /Reports/.test(b.innerText)); b.click(); })()`); await sleep(700);
  // set tab = Booked and search = Rohan, then open a report and come back
  const tabInfo = () => ev(`Array.from(document.querySelectorAll('button')).filter(b=>/^(All|Urgent|Booked|Not booked)$/.test(b.innerText.trim())).map(b=>({t:b.innerText.trim(), active: b.className.includes('bg-[#1f2a44]')}))`);
  const searchVal = () => ev(`(Array.from(document.querySelectorAll('input')).find(i=>/Search/.test(i.placeholder||''))||{}).value`);
  const rowCount = () => ev(`document.querySelectorAll('tbody tr').length`);
  await ev(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'All'); b.click(); })()`); await sleep(500);
  await ev(`(() => { const i = Array.from(document.querySelectorAll('input')).find(i => /Search/.test(i.placeholder||'')); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(i,'Rohan'); i.dispatchEvent(new Event('input',{bubbles:true})); })()`); await sleep(600);
  log.before = { tabs: await tabInfo(), search: await searchVal(), rows: await rowCount() };
  await shot('interaction/reports-filtered.png');
  await ev(`(() => { const r = document.querySelectorAll('tbody tr'); if (r[0]) r[0].click(); })()`); await sleep(1000);
  await ev(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b=>/back/i.test(b.getAttribute('aria-label')||'')); if (b) b.click(); })()`); await sleep(1000);
  log.afterBack = { tabs: await tabInfo(), search: await searchVal(), rows: await rowCount() };
  await shot('interaction/reports-after-back.png');

  // refresh / resume in mock mode: start a session, reach conversation, reload
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await ev(`sessionStorage.clear()`);
  await send('Page.navigate', { url: BASE + '/' }); await sleep(900);
  await ev(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b=>/Start Talking/.test(b.innerText)); b.click(); })()`); await sleep(900);
  await ev(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b=>/Yes, I agree/.test(b.innerText)); b.click(); })()`); await sleep(900);
  log.beforeReload = (await ev(`document.body.innerText`)).includes('What is your full name');
  log.storedSession = await ev(`sessionStorage.getItem('samvad_session_id')`);
  await send('Page.navigate', { url: BASE + '/' }); await sleep(1500);
  const afterReload = await ev(`document.body.innerText`);
  log.afterReload = { onWelcome: /Start Talking/.test(afterReload), onConversation: /What is your full name/.test(afterReload), storedSession: await ev(`sessionStorage.getItem('samvad_session_id')`), body: afterReload.replace(/\n/g, ' | ').slice(0, 180) };
  await shot('interaction/after-refresh-mock-mode.png');
} finally {
  writeFileSync(resolve(EVIDENCE, 'audit-run-state.json'), JSON.stringify(log, null, 2));
  try { ws.close(); } catch {}
  try { chrome.kill('SIGKILL'); } catch {}
  try { server.kill('SIGKILL'); } catch {}
  try { rmSync('/tmp/samvad-state-*', { recursive: true, force: true }); } catch {}
}
console.log(JSON.stringify(log, null, 2));
process.exit(0);
