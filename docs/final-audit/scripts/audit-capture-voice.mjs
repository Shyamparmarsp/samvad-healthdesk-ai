/**
 * Second-pass audit capture: real voice-mode conversation states (no text-mode
 * substitution) and Hindi conversation/localisation evidence.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const EVIDENCE = resolve(ROOT, 'docs/final-audit/evidence');
const PORT = 4190;
const CDP_PORT = 9335;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const d of ['implementation', 'states']) {
  const p = resolve(EVIDENCE, d);
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

class Cdp {
  constructor(ws) { this.ws = new WebSocket(ws); this.id = 0; this.pending = new Map();
    this.ws.onmessage = (e) => { const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) { const { resolve: r, reject } = this.pending.get(m.id); this.pending.delete(m.id);
        if (m.error) reject(new Error(m.error.message)); else r(m.result); } }; }
  ready() { if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; }); }
  send(method, params = {}) { return new Promise((r, j) => { const id = ++this.id; this.pending.set(id, { resolve: r, reject: j }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result?.value; }
  async viewport(w, h, m) { await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: m }); await sleep(150); }
  async goto(p = '/') { await this.send('Page.navigate', { url: BASE + p }); await sleep(700); }
  async shot(f) { const r = await this.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve(EVIDENCE, f), Buffer.from(r.data, 'base64')); }
  async text() { return (await this.eval('document.body.innerText || ""')) || ''; }
  async waitFor(p, t = 8000) { const s = Date.now(); while (Date.now() - s < t) { const x = await this.text(); if (new RegExp(p, 'i').test(x)) return x; await sleep(120); } throw new Error('timeout ' + p); }
  async click(re, tag = 'button') { return this.eval(`(() => { const rx = new RegExp(${JSON.stringify(re)}, 'i'); const els = Array.from(document.querySelectorAll(${JSON.stringify(tag)})); const el = els.find(e => rx.test(e.innerText||'') || rx.test(e.getAttribute('aria-label')||'')); if (!el) return false; el.click(); return true; })()`); }
}

const log = { steps: [] };

const voiceAnswer = async (cdp, label) => {
  await cdp.eval(`document.querySelector('button[aria-label="${label}"]').click()`);
  await sleep(1400);
  await cdp.eval(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('aria-label')||'') === 'Done'); if (b) b.click(); })()`);
  await cdp.waitFor('What we heard');
  await sleep(300);
  await cdp.eval(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => /Send/.test(b.innerText||'')); if (b) b.click(); })()`);
  await sleep(700);
};

async function run() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/')).ok) break; } catch {} await sleep(200); }
  const profile = `/tmp/samvad-audit2-${Date.now()}`;
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--no-sandbox', '--disable-gpu', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required', '--window-size=1440,900'], { stdio: 'pipe' });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok) break; } catch {} await sleep(200); }
  const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' })).json();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');

  try {
    await cdp.viewport(390, 844, true);
    await cdp.goto('/');
    await cdp.eval('sessionStorage.clear()');
    await cdp.goto('/');
    await cdp.waitFor('Start Talking');
    await cdp.click('Start Talking');
    await cdp.waitFor('Yes, I agree');
    await cdp.click('Yes, I agree');
    await cdp.waitFor('full name');

    // answer the first five questions by real voice (mic -> done -> transcript -> send)
    for (let i = 0; i < 5; i++) {
      const before = await cdp.text();
      const label = i === 3 ? 'Tap to speak' : 'Tap to speak';
      await voiceAnswer(cdp, label);
      const after = await cdp.text();
      log.steps.push({ i, beforeQ: (before.match(/What is your|How long|What health/) || [null])[0], next: (after.match(/What is your|How long|How would you/) || [null])[0] });
    }

    // severity question should now be active, voice control card visible
    const body = await cdp.text();
    await cdp.shot('implementation/P3-conversation-voice-mode.png');
    log.steps.push({ severityStep: true, hasSeverity: /severity/i.test(body), hasTurn: /Turn \d+ of 15/.test(body) });

    // listening state with visible timer
    await cdp.eval(`document.querySelector('button[aria-label="Tap to speak"]').click()`);
    await sleep(2400);
    await cdp.shot('states/voice-listening-timer.png');
    const listening = await cdp.text();
    log.steps.push({ listeningTimer: (listening.match(/Listening[^\n]*/) || [null])[0] });

    // stop -> transcript preview from the real provider path (mock STT)
    await cdp.eval(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('aria-label')||'') === 'Done'); if (b) b.click(); })()`);
    await cdp.waitFor('What we heard');
    await cdp.shot('implementation/P5-what-we-heard-voice.png');
    const transcript = await cdp.eval(`(document.querySelector('textarea')||{}).value`);
    log.steps.push({ transcript });

    // Hindi conversation localisation
    await cdp.eval('sessionStorage.clear()');
    await cdp.goto('/');
    await cdp.waitFor('Start Talking');
    await cdp.click('हिंदी');
    await sleep(300);
    await cdp.click('बोलकर बात करें|Start Talking');
    await cdp.waitFor('मैं सहमत');
    await cdp.click('मैं सहमत');
    await cdp.waitFor('नाम');
    await cdp.shot('implementation/P3-conversation-hi.png');
    const hi = await cdp.text();
    log.steps.push({
      hindi: {
        englishLeaks: ['Turn ', 'Type', 'Done', 'Maximum recording time'].filter((s) => hi.includes(s)),
        body: hi.replace(/\n/g, ' | ').slice(0, 500),
      },
    });
    await cdp.shot('implementation/P3-conversation-hi-voice-card.png');

    // consent in Hindi
    await cdp.eval('sessionStorage.clear()');
    await cdp.goto('/');
    await cdp.waitFor('बोलकर बात करें');
    await cdp.click('हिंदी');
    await sleep(300);
    await cdp.click('बोलकर बात करें|Start Talking');
    await cdp.waitFor('मैं सहमत');
    await cdp.shot('implementation/P2-consent-hi.png');
  } finally {
    writeFileSync(resolve(EVIDENCE, 'audit-run-voice.json'), JSON.stringify(log, null, 2));
    try { cdp.ws.close(); } catch {}
    try { chrome.kill('SIGKILL'); } catch {}
    try { server.kill('SIGKILL'); } catch {}
    try { rmSync('/tmp/samvad-audit2-*', { recursive: true, force: true }); } catch {}
  }
}

run().then(() => { console.log(JSON.stringify(log, null, 2)); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
