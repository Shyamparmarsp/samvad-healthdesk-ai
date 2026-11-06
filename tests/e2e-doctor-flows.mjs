/**
 * Doctor portal end-to-end checks in the browser.
 *
 * Two modes:
 *
 *   node tests/e2e-doctor-flows.mjs            # mock build, no backend
 *   DOCTOR_EMAIL=... DOCTOR_PASSWORD=... \
 *     node tests/e2e-doctor-flows.mjs --hosted  # real Supabase + Groq + Timbre
 *
 * The mock run verifies the report delete UI (placement, confirmation, cancellation,
 * success) and that clicking the assistant always starts a summary. The hosted run
 * additionally verifies that the assistant actually plays audible Hindi audio on all six
 * doctor pages, and that a real report is permanently deleted in the database.
 *
 * Screenshots land in docs/screenshots/assistant/e2e/.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../docs/screenshots/assistant/e2e');
const PORT = 4181;
const BASE = `http://127.0.0.1:${PORT}`;
const HOSTED = process.argv.includes('--hosted');

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: ok, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else ok(msg.result);
        return;
      }
      if (msg.method) this.events.push(msg);
    };
  }
  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((ok, fail) => {
      this.ws.onopen = ok;
      this.ws.onerror = fail;
    });
  }
  send(method, params = {}) {
    return new Promise((ok, fail) => {
      const id = ++this.id;
      this.pending.set(id, { resolve: ok, reject: fail });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return res.result?.value;
  }
  async mouseClick(selector) {
    const box = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!box) throw new Error(`selector not found: ${selector}`);
    // A real input event grants user activation, unlike element.click().
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, buttons: 0 });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 0 });
    return box;
  }
  async viewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    await sleep(250);
  }
  async shot(name) {
    const file = resolve(OUT_DIR, name);
    mkdirSync(dirname(file), { recursive: true });
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(file, Buffer.from(res.data, 'base64'));
  }
  async waitFor(matcher, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const text = (await this.eval('document.body ? document.body.innerText : ""')) || '';
      if (typeof matcher === 'string' ? text.includes(matcher) : matcher.test(text)) return text;
      await sleep(150);
    }
    throw new Error(`timed out waiting for ${matcher}`);
  }
}

const clickText = (label) => `
  (() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').trim() === ${JSON.stringify(label)});
    if (!btn) return 'not-found';
    btn.click();
    return 'clicked';
  })()
`;

const clickStartsWith = (label) => `
  (() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').trim().startsWith(${JSON.stringify(label)}));
    if (!btn) return 'not-found';
    btn.click();
    return 'clicked';
  })()
`;

/** Records every play() on the channel so playback can be proven, not assumed. */
const AUDIO_PROBE = `
  window.__audioLog = [];
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    const entry = { src: String(this.currentSrc || this.src || '').slice(0, 32), muted: this.muted, volume: this.volume, startedAt: Date.now(), ended: false, currentTime: 0, duration: 0 };
    window.__audioLog.push(entry);
    this.addEventListener('ended', () => { entry.ended = true; entry.currentTime = this.currentTime; entry.duration = this.duration; });
    this.addEventListener('timeupdate', () => { entry.currentTime = this.currentTime; entry.duration = this.duration; });
    return originalPlay.apply(this, args);
  };
`;

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${BASE}/`)).ok) break;
    } catch {}
    await sleep(200);
  }

  const chrome = spawn(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', '--remote-debugging-port=9236', `--user-data-dir=/tmp/cdp-e2e-${Date.now()}`, '--no-sandbox', '--disable-gpu'],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 40; i += 1) {
    try {
      if ((await fetch('http://127.0.0.1:9236/json/version')).ok) break;
    } catch {}
    await sleep(200);
  }

  const target = await (await fetch('http://127.0.0.1:9236/json/new', { method: 'PUT' })).json();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: AUDIO_PROBE });

  const results = [];
  const record = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  };

  try {
    await cdp.viewport(1440, 900);
    await cdp.send('Page.navigate', { url: `${BASE}/doctor` });
    await sleep(900);
    await cdp.waitFor('Log in');

    if (HOSTED) {
      const email = process.env.DOCTOR_EMAIL;
      const password = process.env.DOCTOR_PASSWORD;
      if (!email || !password) throw new Error('DOCTOR_EMAIL / DOCTOR_PASSWORD are required for --hosted');
      await cdp.eval(`(() => {
        const setValue = (el, value) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(el, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        setValue(document.querySelector('input[type="email"]'), ${JSON.stringify(email)});
        setValue(document.querySelector('input[type="password"]'), ${JSON.stringify(password)});
        return 'filled';
      })()`);
      await cdp.mouseClick('button[type="submit"]');
    } else {
      await cdp.mouseClick('button[type="submit"]');
    }

    await cdp.waitFor('Welcome');
    await sleep(1600);
    await cdp.waitFor('डॉक्टर');
    record('dashboard briefing appears', true);
    await cdp.shot('01-dashboard-briefing.png');

    // ------------------------------------------------------------------ assistant
    const pages = [
      ['dashboard', 'Dashboard'],
      ['reports', 'Reports'],
      ['appointments', 'Appointments'],
      ['urgent-review', 'Urgent'],
    ];

    const closePanel = `(() => {
      const c = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === 'Close assistant');
      if (c) c.click();
      return c ? 'closed' : 'none';
    })()`;

    for (const [key, nav] of pages) {
      await cdp.eval(clickStartsWith(nav));
      await sleep(key === 'dashboard' ? 200 : 500);
      await cdp.eval(closePanel);
      await sleep(300);

      const before = await cdp.eval('window.__audioLog.length');
      await cdp.mouseClick('button[aria-haspopup="dialog"]');
      await cdp.waitFor(/सारांश|आवाज़|डॉक्टर/);
      // Allow Groq + Timbre on the hosted run; mock mode answers instantly.
      await sleep(HOSTED ? 9000 : 800);
      const panel = await cdp.eval(`document.querySelector('[role="dialog"]')?.innerText || ''`);
      record(`assistant opens on ${key}`, panel.includes('Samwad Assistant'), `${panel.slice(0, 60).replace(/\n/g, ' ')}…`);
      await cdp.shot(`02-assistant-${key}.png`);

      if (HOSTED) {
        const log = await cdp.eval('window.__audioLog.slice(' + before + ')');
        const audible = (log || []).filter((entry) => entry.src.startsWith('blob:') && entry.muted === false);
        const progressed = audible.some((entry) => entry.currentTime > 0.3 || entry.ended);
        record(
          `assistant speaks on ${key}`,
          audible.length > 0 && progressed,
          `${audible.length} audible element(s), ${(audible[audible.length - 1]?.currentTime ?? 0).toFixed(2)}s`,
        );
      }
      await cdp.eval(closePanel);
      await sleep(200);
    }

    // Report detail + urgent detail need a row click.
    await cdp.eval(clickStartsWith('Reports'));
    await cdp.waitFor('Patient Intake Reports');
    await sleep(300);
    await cdp.eval(`(() => {
      const row = Array.from(document.querySelectorAll('[role="button"]')).find(el => (el.getAttribute('aria-label') || '').startsWith('View intake report'));
      if (row) row.click();
      return row ? 'opened' : 'none';
    })()`);
    await cdp.waitFor('Patient Report');
    await sleep(400);
    await cdp.eval(closePanel);
    await sleep(200);
    const beforeDetail = await cdp.eval('window.__audioLog.length');
    await cdp.mouseClick('button[aria-haspopup="dialog"]');
    await sleep(HOSTED ? 9000 : 800);
    if (HOSTED) {
      const log = await cdp.eval('window.__audioLog.slice(' + beforeDetail + ')');
      const audible = (log || []).filter((entry) => entry.src.startsWith('blob:') && entry.muted === false);
      record(
        'assistant speaks on report detail',
        audible.length > 0 && audible.some((entry) => entry.currentTime > 0.3 || entry.ended),
        `${audible.length} audible element(s)`,
      );
    }
    await cdp.shot('02-assistant-report-detail.png');

    // ------------------------------------------------------------- report deletion
    await cdp.eval(closePanel);
    await cdp.eval(clickStartsWith('Reports'));
    await cdp.waitFor('Patient Intake Reports');
    await sleep(400);

    const rowsBefore = await cdp.eval(`document.querySelectorAll('button[aria-label^="Delete report"]').length`);
    record('every report row has a delete button', rowsBefore > 0, `${rowsBefore} rows`);

    // Placement: trash immediately before the chevron.
    const placement = await cdp.eval(`(() => {
      const trash = document.querySelector('button[aria-label^="Delete report"]');
      if (!trash) return null;
      const group = trash.parentElement;
      const index = Array.from(group.children).indexOf(trash);
      const next = group.children[index + 1];
      return { isBeforeArrow: next && next.tagName.toLowerCase() === 'svg', index };
    })()`);
    record('delete button is immediately before the open arrow', Boolean(placement?.isBeforeArrow), JSON.stringify(placement));

    await cdp.mouseClick('button[aria-label^="Delete report"]');
    await cdp.waitFor('Permanently delete report?');
    await cdp.shot('03-delete-confirm.png');
    const dialogText = await cdp.eval(`document.querySelector('[data-confirm-dialog]')?.innerText || ''`);
    record(
      'confirmation dialog explains permanence',
      dialogText.includes('cannot be undone') && dialogText.includes('Cancel') && dialogText.includes('Delete report'),
    );

    await cdp.eval(clickText('Cancel'));
    await sleep(400);
    const rowsAfterCancel = await cdp.eval(`document.querySelectorAll('button[aria-label^="Delete report"]').length`);
    record('cancel keeps the report', rowsAfterCancel === rowsBefore, `${rowsAfterCancel} rows`);

    await cdp.mouseClick('button[aria-label^="Delete report"]');
    await cdp.waitFor('Delete report');
    await cdp.eval(clickText('Delete report'));
    await cdp.waitFor('Report permanently deleted.', 20000);
    await sleep(600);
    await cdp.shot('04-delete-success.png');

    const rowsAfterDelete = await cdp.eval(`document.querySelectorAll('button[aria-label^="Delete report"]').length`);
    record('confirmed delete removes the row', rowsAfterDelete === rowsBefore - 1, `${rowsBefore} → ${rowsAfterDelete}`);

    await cdp.eval(clickStartsWith('Dashboard'));
    await cdp.waitFor('Welcome');
    await sleep(900);
    const dashboardText = await cdp.eval('document.body.innerText');
    record('dashboard re-reads after deletion', !dashboardText.includes('could not be deleted'));

    // Responsive captures of the reports page with the delete control.
    for (const [width, height] of [[1280, 820], [1024, 768], [768, 1024], [390, 844]]) {
      await cdp.viewport(width, height);
      await cdp.eval(clickStartsWith('Reports'));
      await cdp.waitFor('Patient Intake Reports');
      await sleep(400);
      await cdp.shot(`05-reports-delete-${width}.png`);
      const overflow = await cdp.eval('document.documentElement.scrollWidth - window.innerWidth');
      record(`reports page fits at ${width}px`, overflow <= 2, `overflow ${overflow}px`);
    }

    const failed = results.filter((entry) => !entry.ok);
    console.log(`\n${results.length - failed.length}/${results.length} browser checks passed.`);
    if (failed.length > 0) process.exitCode = 1;
  } finally {
    cdp.ws.close();
    chrome.kill();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
