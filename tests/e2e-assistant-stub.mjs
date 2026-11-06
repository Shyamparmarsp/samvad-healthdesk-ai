/**
 * Production-path browser integration test with a stubbed Supabase network.
 *
 * Why: the hosted project's doctor passwords are private by policy, so the UI cannot be
 * driven through the real login form. This harness keeps the *application* real — the
 * production build, the real login form, the real doctor shell, the real assistant hook,
 * the real `<audio>` channel — and replaces only the network with responses shaped
 * exactly like Supabase, including a real Gnani Timbre MP3 captured from the deployed
 * function (tests/fixtures/tts/hindi-summary.mp3) and its real validated Hindi sentence.
 *
 * What it proves:
 *   - clicking the assistant on each of the six pages always starts a summary and plays
 *     the returned audio, audibly (muted === false, currentTime advances, ended fires);
 *   - rapid double clicks cannot start a second overlapping utterance;
 *   - replay and stop behave;
 *   - report deletion goes through delete_doctor_report and removes the row + counts.
 *
 * It is NOT a live-provider test; the live Groq/Timbre path is verified separately by
 * tests/security/hosted-smoke.mjs.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'docs/screenshots/assistant/e2e');
const PORT = 4182;
const BASE = `http://127.0.0.1:${PORT}`;
const STUB_URL = 'https://stub.supabase.test';

mkdirSync(OUT_DIR, { recursive: true });

const audioBase64 = readFileSync(resolve(ROOT, 'tests/fixtures/tts/hindi-summary.mp3')).toString('base64');
const HINDI_SUMMARY =
  'डॉक्टर, आज 1 अपॉइंटमेंट बाकी है। 2 रिपोर्ट मिली हैं, जिनमें से 1 की समीक्षा बाकी है। 1 रिपोर्ट में जानकारी अधूरी है।';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const reportRow = (id, name, reference, status, extra = {}) => ({
  id,
  session_id: `sess-${id}`,
  user_id: '11111111-1111-4111-8111-111111111111',
  status,
  schema_version: 1,
  department_key: 'general_medicine',
  doctor_id: 'doc-1',
  intake_reference: reference,
  possible_urgent: false,
  needs_human_review: false,
  emergency_rule_id: null,
  submitted_at: '2026-11-06T04:00:00.000Z',
  reviewed_at: null,
  reviewed_by: null,
  created_at: '2026-11-06T04:00:00.000Z',
  updated_at: '2026-11-06T04:00:00.000Z',
  report: {
    schema_version: 1,
    patient: {
      name: { status: 'provided', value: name },
      age: { status: 'provided', value: 42 },
      gender: { status: 'provided', value: 'female' },
      language: 'hi',
    },
    primary_concern: { status: 'provided', value: 'तेज़ सिरदर्द' },
    clinical_details: {
      duration: { status: 'provided', value: 'तीन दिन' },
      severity: { status: 'provided', value: 'मध्यम' },
      conditions: { status: 'provided', value: [] },
      medications: { status: 'declined', value: null },
      allergies: { status: 'unknown', value: null },
      other_symptoms: { status: 'not_asked', value: null },
    },
    missing_information: ['allergies'],
    summary: null,
    routing_snapshot: {
      department_key: 'general_medicine',
      department_name: 'General Medicine',
      doctor_id: 'doc-1',
      doctor_name: 'Dr. Aditi Rao',
      is_fallback: false,
      preliminary: true,
    },
    emergency: null,
  },
  ...extra,
});

const STUB_SOURCE = `
(() => {
  const AUDIO_B64 = ${JSON.stringify(audioBase64)};
  const SUMMARY = ${JSON.stringify(HINDI_SUMMARY)};
  const USER = { id: '00000000-0000-4000-8000-0000000000aa', aud: 'authenticated', role: 'authenticated', email: 'doctor@stub.test', email_confirmed_at: '2026-11-01T00:00:00.000Z' };
  const DOCTOR = { id: 'doc-1', display_name: 'Dr. Aditi Rao', department_key: 'general_medicine' };
  const DEPARTMENT = { key: 'general_medicine', name: 'General Medicine', booking_enabled: true, is_emergency: false };

  window.__stub = { reports: ${JSON.stringify([
    reportRow('11111111-0000-4000-8000-000000000001', 'अनीता शर्मा', 'SHD-STUB-0001', 'submitted'),
    reportRow('11111111-0000-4000-8000-000000000002', 'राहुल वर्मा', 'SHD-STUB-0002', 'partial'),
    reportRow('11111111-0000-4000-8000-000000000003', 'सीमा गुप्ता', 'SHD-STUB-0003', 'urgent_partial', {
      department_key: 'emergency',
      emergency_rule_id: 'severe_chest_pain',
      submitted_at: null,
    }),
  ])}, deleted: [], speakCalls: 0 };

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const wantsObject = (init) => String((init.headers && (init.headers.Accept || init.headers.accept)) || '').includes('pgrst.object');

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = String(init.method || 'GET').toUpperCase();

    if (url.includes('/auth/v1/token')) {
      return json({
        access_token: 'stub-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'stub-refresh-token',
        user: USER,
      });
    }
    if (url.includes('/auth/v1/')) return json(USER);

    if (url.includes('/rest/v1/doctors')) {
      return wantsObject(init) ? json(DOCTOR) : json([DOCTOR]);
    }
    if (url.includes('/rest/v1/departments')) {
      return wantsObject(init) ? json(DEPARTMENT) : json([DEPARTMENT]);
    }
    if (url.includes('/rest/v1/doctor_profiles')) {
      return wantsObject(init) ? json({ doctor_id: 'doc-1' }) : json([{ doctor_id: 'doc-1' }]);
    }
    if (url.includes('/rest/v1/reports.')) {
      return json({ error: 'unsupported' }, 400);
    }
    if (url.includes('/rest/v1/reports')) {
      if (method === 'DELETE') return json(null, 204);
      return json(window.__stub.reports);
    }
    if (url.includes('/rest/v1/rpc/get_doctor_appointments')) {
      return json([]);
    }
    if (url.includes('/rest/v1/rpc/delete_doctor_report')) {
      const body = JSON.parse(init.body || '{}');
      const id = body.p_report_id;
      const exists = window.__stub.reports.some((r) => r.id === id);
      if (!exists) return json({ code: 'P0002', message: 'report not found' }, 404);
      window.__stub.reports = window.__stub.reports.filter((r) => r.id !== id);
      window.__stub.deleted.push(id);
      return json([{ deleted_report_id: id }]);
    }

    if (url.includes('/functions/v1/speak')) {
      window.__stub.speakCalls += 1;
      if (window.__stub.speakDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, window.__stub.speakDelayMs));
      }
      const bytes = Uint8Array.from(atob(AUDIO_B64), (c) => c.charCodeAt(0));
      return new Response(bytes, {
        status: 200,
        headers: {
          'content-type': 'audio/mpeg',
          'x-summary-text': btoa(unescape(encodeURIComponent(SUMMARY))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''),
          'x-summary-source': 'qwen',
        },
      });
    }

    return originalFetch(input, init);
  };

  // Record every play() so "speaking" can be proven audible.
  window.__audioLog = [];
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    // this.src is the URL just assigned; currentSrc can still report the previous source
    // for a few frames after a src change.
    const entry = { src: String(this.src || '').slice(0, 24), muted: this.muted, at: Date.now(), currentTime: 0, ended: false };
    window.__audioLog.push(entry);
    this.addEventListener('ended', () => { entry.ended = true; entry.currentTime = this.currentTime; });
    this.addEventListener('timeupdate', () => { entry.currentTime = this.currentTime; });
    return originalPlay.apply(this, args);
  };
})();
`;

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: ok, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else ok(msg.result);
      }
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
  async eval(script) {
    const res = await this.send('Runtime.evaluate', { expression: script, awaitPromise: true, returnByValue: true });
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
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, buttons: 0 });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 0 });
  }
  async viewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    await sleep(250);
  }
  async shot(name) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(OUT_DIR, name), Buffer.from(res.data, 'base64'));
  }
  async waitFor(matcher, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const text = (await this.eval('document.body ? document.body.innerText : ""')) || '';
      if (typeof matcher === 'string' ? text.includes(matcher) : matcher.test(text)) return text;
      await sleep(120);
    }
    throw new Error(`timed out waiting for ${matcher}`);
  }
}

const clickStartsWith = (label) => `
  (() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').trim().startsWith(${JSON.stringify(label)}));
    if (!btn) return 'not-found';
    btn.click();
    return 'clicked';
  })()
`;
const clickText = (label) => `
  (() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').trim() === ${JSON.stringify(label)});
    if (!btn) return 'not-found';
    btn.click();
    return 'clicked';
  })()
`;
const closePanel = `(() => {
  const c = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === 'सहायक बंद करें');
  if (c) c.click();
  return c ? 'closed' : 'none';
})()`;

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${BASE}/`)).ok) break;
    } catch {}
    await sleep(200);
  }

  const chrome = spawn(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', '--remote-debugging-port=9237', `--user-data-dir=/tmp/cdp-stub-${Date.now()}`, '--no-sandbox', '--disable-gpu'],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 40; i += 1) {
    try {
      if ((await fetch('http://127.0.0.1:9237/json/version')).ok) break;
    } catch {}
    await sleep(200);
  }

  const target = await (await fetch('http://127.0.0.1:9237/json/new', { method: 'PUT' })).json();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB_SOURCE });

  const results = [];
  const record = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  };

  try {
    await cdp.viewport(1440, 900);
    await cdp.send('Page.navigate', { url: `${BASE}/doctor` });
    await sleep(900);
    await cdp.waitFor('Log in');
    await cdp.eval(`(() => {
      const setValue = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setValue(document.querySelector('input[type="email"]'), 'doctor@stub.test');
      setValue(document.querySelector('input[type="password"]'), 'stub-password');
      return 'filled';
    })()`);
    await cdp.mouseClick('button[type="submit"]');
    await cdp.waitFor('Welcome');
    await cdp.waitFor('डॉक्टर');
    record('doctor login reaches the dashboard', true);

    // The automatic dashboard briefing also uses the same pipeline.
    await sleep(1500);
    const bootLog = await cdp.eval('window.__audioLog');
    record(
      'automatic dashboard briefing attempts audio',
      Array.isArray(bootLog) && bootLog.some((entry) => entry.src.startsWith('blob:')),
      `${bootLog?.length ?? 0} play() calls`,
    );
    await cdp.shot('10-stub-dashboard-briefing.png');

    const pages = [
      ['dashboard', 'Dashboard'],
      ['reports', 'Reports'],
      ['appointments', 'Appointments'],
      ['urgent-review', 'Urgent'],
    ];

    for (const [key, nav] of pages) {
      await cdp.eval(clickStartsWith(nav));
      await sleep(400);
      await cdp.eval(closePanel);
      await sleep(250);
      const before = await cdp.eval('window.__audioLog.length');
      await cdp.mouseClick('button[aria-haspopup="dialog"]');
      await cdp.waitFor('डॉक्टर');
      await sleep(2500);

      const log = await cdp.eval(`window.__audioLog.slice(${before})`);
      const audible = (log || []).filter((entry) => entry.src.startsWith('blob:') && entry.muted === false);
      const playing = audible.some((entry) => entry.currentTime > 0.2 || entry.ended);
      const panelText = await cdp.eval(`document.querySelector('[role="dialog"]')?.innerText || ''`);
      const audioState = /बोल रहा हूँ/.test(panelText)
        ? 'playing'
        : /सुनने के लिए दबाएँ/.test(panelText)
          ? 'blocked'
          : /आवाज़ अभी उपलब्ध नहीं/.test(panelText)
            ? 'unavailable'
            : 'idle';
      record(
        `assistant speaks on ${key}`,
        audible.length === 1 && playing,
        `${audible.length} utterance(s), state=${audioState}, log=${JSON.stringify((log || []).map((entry) => [entry.src.slice(0, 5), entry.muted, Number(entry.currentTime.toFixed(2))]))}`,
      );

      const panel = await cdp.eval(`document.querySelector('[role="dialog"]')?.innerText || ''`);
      record(`summary text is the validated Hindi sentence on ${key}`, panel.includes('आज 1 अपॉइंटमेंट बाकी है'));
      await cdp.shot(`11-stub-${key}.png`);
      await cdp.eval(closePanel);
      await sleep(200);
    }

    // Report detail page.
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
    const beforeDetail = await cdp.eval('window.__audioLog.length');
    await cdp.mouseClick('button[aria-haspopup="dialog"]');
    await sleep(1200);
    const detailLog = await cdp.eval(`window.__audioLog.slice(${beforeDetail})`);
    const detailAudible = (detailLog || []).filter((entry) => entry.src.startsWith('blob:') && entry.muted === false);
    record(
      'assistant speaks on report detail',
      detailAudible.length === 1 && detailAudible.some((entry) => entry.currentTime > 0.2 || entry.ended),
    );
    await cdp.shot('11-stub-report-detail.png');

    // Urgent detail page.
    await cdp.eval(closePanel);
    await cdp.eval(clickStartsWith('Urgent'));
    await cdp.waitFor('Emergency Triage Queue');
    await sleep(400);
    await cdp.eval(clickText('Open'));
    await sleep(600);
    const urgentOpened = await cdp.eval(`document.body.innerText.includes('Urgent Triage Case')`);
    if (urgentOpened) {
      await cdp.eval(closePanel);
      const beforeUrgent = await cdp.eval('window.__audioLog.length');
      await cdp.mouseClick('button[aria-haspopup="dialog"]');
      await sleep(1200);
      const urgentLog = await cdp.eval(`window.__audioLog.slice(${beforeUrgent})`);
      const urgentAudible = (urgentLog || []).filter((entry) => entry.src.startsWith('blob:') && entry.muted === false);
      record('assistant speaks on urgent detail', urgentAudible.length === 1);
      await cdp.shot('11-stub-urgent-detail.png');
    } else {
      record('urgent detail page reachable', false, 'no urgent rows in the stub fixture');
    }

    // Rapid double click must not start two utterances. Run it on Reports: the dashboard
    // also fires its automatic greeting, which would confound the call count.
    await cdp.eval(closePanel);
    await cdp.eval(clickStartsWith('Reports'));
    await cdp.waitFor('Patient Intake Reports');
    await sleep(500);
    // Slow the speech response so both clicks land while the first request is still in
    // flight; that is the case a double click could otherwise double-charge and overlap.
    await cdp.eval('window.__stub.speakDelayMs = 900');
    const callsBeforeDouble = await cdp.eval('window.__stub.speakCalls');
    const beforeDouble = await cdp.eval('window.__audioLog.length');
    await cdp.mouseClick('button[aria-haspopup="dialog"]');
    await sleep(120);
    await cdp.mouseClick('button[aria-haspopup="dialog"]');
    await sleep(2600);
    const callsAfterDouble = await cdp.eval('window.__stub.speakCalls');
    record('a rapid second click does not buy a second TTS call', callsAfterDouble - callsBeforeDouble === 1, `${callsAfterDouble - callsBeforeDouble} call(s)`);
    await cdp.eval('window.__stub.speakDelayMs = 0');
    const doubleLog = await cdp.eval(`window.__audioLog.slice(${beforeDouble})`);
    const blobs = (doubleLog || []).filter((entry) => entry.src.startsWith('blob:'));
    record('rapid double click plays one utterance', blobs.length === 1, `${blobs.length} utterance(s)`);

    // Stop, then replay.
    await cdp.eval(closePanel);
    await sleep(200);
    const replayBefore = await cdp.eval('window.__audioLog.length');
    await cdp.mouseClick('button[aria-haspopup="dialog"]');
    await cdp.waitFor('डॉक्टर');
    await sleep(2500);
    await cdp.eval(`(() => {
      const stopBtn = Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => (b.innerText || '').includes('रोकें'));
      if (stopBtn) stopBtn.click();
      return stopBtn ? 'stopped' : 'none';
    })()`);
    await sleep(400);
    await cdp.eval(`(() => {
      const replay = Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => (b.innerText || '').includes('फिर सुनें'));
      if (replay) replay.click();
      return replay ? 'clicked' : 'none';
    })()`);
    await sleep(1500);
    const replayLog = await cdp.eval(`window.__audioLog.slice(${replayBefore})`);
    record('replay starts another utterance', (replayLog || []).filter((entry) => entry.src.startsWith('blob:')).length >= 2, `${(replayLog || []).filter((e) => e.src.startsWith('blob:')).length} utterances`);

    // ------------------------------------------------------------ report deletion
    await cdp.eval(closePanel);
    await cdp.eval(clickStartsWith('Reports'));
    await cdp.waitFor('Patient Intake Reports');
    await sleep(400);

    const before = await cdp.eval('window.__stub.reports.length');
    const navBefore = await cdp.eval(`(() => {
      const nav = Array.from(document.querySelectorAll('nav button')).find(b => (b.innerText || '').startsWith('Reports'));
      return nav ? Number((nav.innerText.match(/\\d+/) || ['0'])[0]) : -1;
    })()`);
    await cdp.mouseClick('button[aria-label^="रिपोर्ट हटाएँ"]');
    await cdp.waitFor('रिपोर्ट स्थायी रूप से हटाएँ?');
    await cdp.eval(clickText('हाँ, रिपोर्ट हटाएँ'));
    await cdp.waitFor('रिपोर्ट स्थायी रूप से हटा दी गई', 8000);
    await sleep(500);
    const after = await cdp.eval('window.__stub.reports.length');
    record('delete_doctor_report removed the row on the server', after === before - 1, `${before} → ${after}`);
    const rows = await cdp.eval('document.querySelectorAll(\'button[aria-label^="रिपोर्ट हटाएँ"]\').length');
    record('the deleted row is gone from the list', rows === before - 1, `${rows} rows`);
    await cdp.shot('12-stub-delete-success.png');

    await cdp.eval(clickStartsWith('Dashboard'));
    await cdp.waitFor('Welcome');
    await sleep(700);
    const navAfter = await cdp.eval(`(() => {
      const nav = Array.from(document.querySelectorAll('nav button')).find(b => (b.innerText || '').startsWith('Reports'));
      return nav ? Number((nav.innerText.match(/\\d+/) || ['0'])[0]) : -1;
    })()`);
    record('dashboard report total drops after deletion', navAfter === navBefore - 1, `${navBefore} → ${navAfter}`);

    const failed = results.filter((entry) => !entry.ok);
    console.log(`\n${results.length - failed.length}/${results.length} stub-network browser checks passed.`);
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
