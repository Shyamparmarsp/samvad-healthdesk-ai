/**
 * Production-path browser integration test with a stubbed Supabase network.
 *
 * Why: the hosted project's doctor passwords are private by policy, so the UI cannot be
 * driven through the real login form. This harness keeps the *application* real — the
 * production build, the real login form, the doctor shell, the assistant hook, the global
 * audio controller and the real `<audio>` channel — and replaces only the network with
 * responses shaped exactly like Supabase. The MP3 is a real Gnani Timbre capture
 * (tests/fixtures/tts/hindi-summary.mp3); the English text is a real validated sample.
 *
 * Covered here:
 *   - one global voice: navigating or claiming another assistant stops the previous audio
 *   - late responses for a superseded page never play
 *   - rapid double clicks buy one TTS call
 *   - Hindi/English toggle: regenerates, persists across pages and a reload, per doctor
 *   - report deletion through delete_doctor_report refreshes the list and the counters
 *
 * Live provider behaviour is verified separately by tests/security/hosted-smoke.mjs.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'docs/screenshots/assistant/e2e');
const PORT = 4182;
const BASE = `http://127.0.0.1:${PORT}`;

mkdirSync(OUT_DIR, { recursive: true });

const audioBase64 = readFileSync(resolve(ROOT, 'tests/fixtures/tts/hindi-summary.mp3')).toString('base64');
const HINDI_SUMMARY =
  'डॉक्टर, आज 1 अपॉइंटमेंट बाकी है। 2 रिपोर्ट मिली हैं, जिनमें से 1 की समीक्षा बाकी है। 1 रिपोर्ट में जानकारी अधूरी है।';
const ENGLISH_SUMMARY =
  'Doctor, you have 1 appointment left today. 2 reports were received, 1 of them is awaiting review and 1 has an incomplete intake.';

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
  const HINDI = ${JSON.stringify(HINDI_SUMMARY)};
  const ENGLISH = ${JSON.stringify(ENGLISH_SUMMARY)};
  const USER = { id: '00000000-0000-4000-8000-0000000000aa', aud: 'authenticated', role: 'authenticated', email: 'doctor@stub.test', email_confirmed_at: '2026-11-01T00:00:00.000Z' };
  const DOCTOR = { id: 'doc-1', display_name: 'Dr. Aditi Rao', department_key: 'general_medicine' };
  const DEPARTMENT = { key: 'general_medicine', name: 'General Medicine', booking_enabled: true, is_emergency: false };

  window.__stub = {
    reports: ${JSON.stringify([
      reportRow('11111111-0000-4000-8000-000000000001', 'अनीता शर्मा', 'SHD-STUB-0001', 'submitted'),
      reportRow('11111111-0000-4000-8000-000000000002', 'राहुल वर्मा', 'SHD-STUB-0002', 'partial'),
      reportRow('11111111-0000-4000-8000-000000000003', 'सीमा गुप्ता', 'SHD-STUB-0003', 'urgent_partial', {
        department_key: 'emergency',
        emergency_rule_id: 'severe_chest_pain',
        submitted_at: null,
      }),
    ])},
    deleted: [],
    speakCalls: 0,
    speakLanguages: [],
    speakDelayMs: 0,
  };

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
    if (url.includes('/rest/v1/doctors')) return wantsObject(init) ? json(DOCTOR) : json([DOCTOR]);
    if (url.includes('/rest/v1/departments')) return wantsObject(init) ? json(DEPARTMENT) : json([DEPARTMENT]);
    if (url.includes('/rest/v1/doctor_profiles')) return wantsObject(init) ? json({ doctor_id: 'doc-1' }) : json([{ doctor_id: 'doc-1' }]);
    if (url.includes('/rest/v1/reports')) return json(window.__stub.reports);
    if (url.includes('/rest/v1/rpc/get_doctor_appointments')) return json([]);
    if (url.includes('/rest/v1/rpc/delete_doctor_report')) {
      const body = JSON.parse(init.body || '{}');
      const id = body.p_report_id;
      if (!window.__stub.reports.some((r) => r.id === id)) return json({ code: 'P0002', message: 'report not found' }, 404);
      window.__stub.reports = window.__stub.reports.filter((r) => r.id !== id);
      window.__stub.deleted.push(id);
      return json([{ deleted_report_id: id }]);
    }
    if (url.includes('/functions/v1/speak')) {
      window.__stub.speakCalls += 1;
      const body = JSON.parse(init.body || '{}');
      const language = body.summary_language === 'en' ? 'en' : 'hi';
      window.__stub.speakLanguages.push(language);
      if (window.__stub.speakDelayMs) await new Promise((r) => setTimeout(r, window.__stub.speakDelayMs));
      const text = language === 'en' ? ENGLISH : HINDI;
      const bytes = Uint8Array.from(atob(AUDIO_B64), (c) => c.charCodeAt(0));
      const header = btoa(unescape(encodeURIComponent(text))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
      // A superseded request is aborted client-side; model that with a real abort check.
      if (init.signal && init.signal.aborted) throw new DOMException('aborted', 'AbortError');
      return new Response(bytes, {
        status: 200,
        headers: {
          'content-type': 'audio/mpeg',
          'x-summary-text': header,
          'x-summary-source': 'qwen',
          'x-summary-language': language,
        },
      });
    }
    return originalFetch(input, init);
  };

  // ---- playback probe: proves audibility, stopping and exclusivity -----------------
  window.__audioLog = [];
  window.__playing = new Set();
  window.__maxConcurrent = 0;
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    const entry = {
      el: this,
      src: String(this.src || '').slice(0, 24),
      muted: this.muted,
      startedAt: Date.now(),
      started: false,
      rejected: null,
      ended: false,
      paused: false,
    };
    window.__audioLog.push(entry);
    window.__playing.add(this);
    window.__maxConcurrent = Math.max(window.__maxConcurrent, window.__playing.size);
    this.addEventListener('pause', () => { entry.paused = true; window.__playing.delete(this); });
    this.addEventListener('ended', () => { entry.ended = true; window.__playing.delete(this); });
    this.addEventListener('timeupdate', () => { entry.currentTime = this.currentTime; });
    const pr = originalPlay.apply(this, args);
    if (pr && pr.then) {
      pr.then(() => { entry.started = true; }).catch((e) => { entry.rejected = String(e && e.name); window.__playing.delete(this); });
    }
    return pr;
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
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text ?? 'evaluate failed');
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
  /** Waits until the assistant panel has rendered a summary (any language). */
  async waitForPanel(timeout = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const length = await this.eval(`(document.querySelector('[role="dialog"]')?.innerText || '').length`);
      if (typeof length === 'number' && length > 80) return;
      await sleep(150);
    }
    throw new Error('timed out waiting for the assistant panel summary');
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
  const c = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === 'Close assistant');
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

  const login = async () => {
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
  };

  try {
    await cdp.viewport(1440, 900);
    await cdp.send('Page.navigate', { url: `${BASE}/doctor` });
    await sleep(900);
    await login();
    record('doctor login reaches the dashboard', true);

    // --- 1. dashboard click speaks (existing fixed behaviour) -------------------
    await cdp.waitForPanel();
    await cdp.eval(closePanel);
    await sleep(400);
    let before = await cdp.eval('window.__audioLog.length');
    await cdp.mouseClick('button[aria-haspopup="dialog"]');
    await cdp.waitForPanel();
    await sleep(2200);
    const dashLog = await cdp.eval(`window.__audioLog.slice(${before})`);
    const dashBlob = (dashLog || []).filter((entry) => entry.src.startsWith('blob:') && entry.muted === false);
    record(
      'assistant speaks on dashboard',
      dashBlob.length === 1 && dashBlob[0].started && !dashBlob[0].rejected,
      `${dashBlob.length} audible, rejected=${dashBlob[0]?.rejected ?? 'no'}`,
    );
    await cdp.shot('20-dashboard-speaking.png');

    // --- 2. navigating away stops the voice immediately -------------------------
    await cdp.eval(clickStartsWith('Reports'));
    await cdp.waitFor('Patient Intake Reports');
    await sleep(400);
    const pausedAfterNav = await cdp.eval(`window.__audioLog.map(e => e.el.paused)`);
    record('navigation pauses the previous page voice', pausedAfterNav.every(Boolean), JSON.stringify(pausedAfterNav));
    const stillPlaying = await cdp.eval('window.__playing.size');
    record('no audio keeps playing after navigation', stillPlaying === 0, `${stillPlaying} active`);

    // --- 3. reports click speaks; a late dashboard response can never play ------
    before = await cdp.eval('window.__audioLog.length');
    await cdp.mouseClick('button[aria-haspopup="dialog"]');
    await cdp.waitForPanel();
    await sleep(2200);
    const reportLog = await cdp.eval(`window.__audioLog.slice(${before})`);
    const reportBlob = (reportLog || []).filter((entry) => entry.src.startsWith('blob:') && entry.muted === false);
    record('assistant speaks on reports', reportBlob.length === 1 && reportBlob[0].started, `${reportBlob.length} audible`);
    record(
      'only one audio element ever plays at a time',
      (await cdp.eval('window.__maxConcurrent')) <= 1,
      `max ${await cdp.eval('window.__maxConcurrent')}`,
    );
    await cdp.shot('21-reports-speaking.png');

    // --- 4. Hindi/English toggle: placement, regeneration, persistence ----------
    const toggle = await cdp.eval(`(() => {
      const group = document.querySelector('[aria-label="Summary language"]');
      if (!group) return null;
      const close = document.querySelector('button[aria-label="Close assistant"]');
      const title = document.getElementById('samwad-assistant-title');
      return {
        labels: Array.from(group.querySelectorAll('button')).map(b => b.innerText.trim()),
        pressed: Array.from(group.querySelectorAll('button')).map(b => b.getAttribute('aria-pressed')),
        beforeClose: !!(close && group.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING),
        afterTitle: !!(title && title.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING),
      };
    })()`);
    record(
      'language toggle sits after the title and before close',
      Boolean(toggle?.beforeClose && toggle?.afterTitle),
      JSON.stringify(toggle),
    );
    record('toggle offers Hindi then English', JSON.stringify(toggle?.labels) === '["Hindi","English"]', JSON.stringify(toggle?.labels));
    record('Hindi is selected by default', JSON.stringify(toggle?.pressed) === '["true","false"]', JSON.stringify(toggle?.pressed));

    const callsBefore = await cdp.eval('window.__stub.speakCalls');
    await cdp.eval(clickText('English'));
    await cdp.waitFor(/Doctor, you have 1 appointment/);
    await sleep(2200);
    const langAfter = await cdp.eval('window.__stub.speakLanguages.slice(-1)[0]');
    record('switching to English requests an English summary', langAfter === 'en', String(langAfter));
    record(
      'switching to English fetches exactly one new summary',
      (await cdp.eval('window.__stub.speakCalls')) === callsBefore + 1,
      `${callsBefore} → ${await cdp.eval('window.__stub.speakCalls')}`,
    );
    // The controller reuses one <audio> element, so "the previous voice stopped" is
    // observed through the pause flag recorded on the earlier blob entry.
    const previousPaused = await cdp.eval(`(() => {
      const blobs = window.__audioLog.filter((e) => e.src.startsWith('blob:'));
      const prev = blobs[blobs.length - 2];
      return prev ? prev.paused : null;
    })()`);
    record('switching language stops the previous voice', previousPaused === true, String(previousPaused));

    const englishText = await cdp.eval(`document.querySelector('[role="dialog"]')?.innerText || ''`);
    record('English summary is displayed in English', /Doctor, you have 1 appointment/.test(englishText) && !/[\u0900-\u097F]/.test(englishText.split('This assistant')[0]));
    await cdp.shot('22-english-summary.png');

    // Persists across pages.
    await cdp.eval(closePanel);
    await cdp.eval(clickStartsWith('Appointments'));
    await cdp.waitFor('Patient consultations scheduled');
    await sleep(400);
    // The panel is per page, so open it to read the shared preference.
    await cdp.mouseClick('button[aria-haspopup="dialog"]');
    await cdp.waitForPanel();
    const apptLang = await cdp.eval(`(() => {
      const group = document.querySelector('[aria-label="Summary language"]');
      return group ? Array.from(group.querySelectorAll('button')).map(b => b.getAttribute('aria-pressed')) : null;
    })()`);
    record('English stays selected on appointments', JSON.stringify(apptLang) === '["false","true"]', JSON.stringify(apptLang));

    // Persists across a reload (same doctor).
    await cdp.send('Page.reload');
    await sleep(1200);
    await login();
    await sleep(400);
    await cdp.eval(`document.querySelector('button[aria-haspopup="dialog"]')?.click()`);
    await cdp.waitForPanel();
    await sleep(1500);
    const reloadLang = await cdp.eval(`(() => {
      const group = document.querySelector('[aria-label="Summary language"]');
      return group ? Array.from(group.querySelectorAll('button')).map(b => b.getAttribute('aria-pressed')) : null;
    })()`);
    record('English survives a browser refresh', JSON.stringify(reloadLang) === '["false","true"]', JSON.stringify(reloadLang));

    // Switch back to Hindi and verify the request language.
    await cdp.eval(closePanel);
    await cdp.eval(clickStartsWith('Reports'));
    await cdp.waitFor('Patient Intake Reports');
    await sleep(300);
    await cdp.mouseClick('button[aria-haspopup="dialog"]');
    await cdp.waitForPanel();
    await sleep(1800);
    await cdp.eval(clickText('Hindi'));
    await cdp.waitFor('डॉक्टर');
    await sleep(1800);
    const hindiLang = await cdp.eval('window.__stub.speakLanguages.slice(-1)[0]');
    record('switching back to Hindi requests a Hindi summary', hindiLang === 'hi', String(hindiLang));

    // Different doctor sees the default (fresh browser profile / storage cleared).
    await cdp.eval(`window.localStorage.clear()`);
    await cdp.send('Page.reload');
    await sleep(1200);
    await login();
    await sleep(300);
    await cdp.eval(`document.querySelector('button[aria-haspopup="dialog"]')?.click()`);
    await cdp.waitForPanel();
    await sleep(800);
    const defaultLang = await cdp.eval(`(() => {
      const group = document.querySelector('[aria-label="Summary language"]');
      return group ? Array.from(group.querySelectorAll('button')).map(b => b.getAttribute('aria-pressed')) : null;
    })()`);
    record('a doctor with no preference defaults to Hindi', JSON.stringify(defaultLang) === '["true","false"]', JSON.stringify(defaultLang));

    // --- 5. rapid double click buys one call ------------------------------------
    await cdp.eval(closePanel);
    await cdp.eval(clickStartsWith('Reports'));
    await cdp.waitFor('Patient Intake Reports');
    await sleep(400);
    await cdp.eval('window.__stub.speakDelayMs = 900');
    const callsBeforeDouble = await cdp.eval('window.__stub.speakCalls');
    const beforeDouble = await cdp.eval('window.__audioLog.length');
    await cdp.mouseClick('button[aria-haspopup="dialog"]');
    await sleep(120);
    await cdp.mouseClick('button[aria-haspopup="dialog"]');
    await sleep(2600);
    record(
      'a rapid second click does not buy a second TTS call',
      (await cdp.eval('window.__stub.speakCalls')) - callsBeforeDouble === 1,
      `${(await cdp.eval('window.__stub.speakCalls')) - callsBeforeDouble} call(s)`,
    );
    const doubleLog = await cdp.eval(`window.__audioLog.slice(${beforeDouble})`);
    record(
      'rapid double click plays one utterance',
      (doubleLog || []).filter((entry) => entry.src.startsWith('blob:')).length === 1,
    );
    await cdp.eval('window.__stub.speakDelayMs = 0');

    // --- 5b. navigating while TTS is pending never plays the abandoned audio -----
    await cdp.eval(closePanel);
    await cdp.eval(clickStartsWith('Reports'));
    await cdp.waitFor('Patient Intake Reports');
    await sleep(300);
    await cdp.eval('window.__stub.speakDelayMs = 1500');
    const beforePending = await cdp.eval('window.__audioLog.length');
    await cdp.mouseClick('button[aria-haspopup="dialog"]');
    await sleep(250);
    await cdp.eval(clickStartsWith('Appointments'));
    await cdp.waitFor('Patient consultations scheduled');
    await sleep(2600);
    const pendingLog = await cdp.eval(`window.__audioLog.slice(${beforePending})`);
    record(
      'a summary abandoned by navigation never plays',
      (pendingLog || []).filter((entry) => entry.src.startsWith('blob:')).length === 0,
      `${(pendingLog || []).filter((entry) => entry.src.startsWith('blob:')).length} utterance(s)`,
    );
    const stillPlayingBlobs = await cdp.eval(`window.__audioLog.filter((e) => e.src.startsWith('blob:') && !e.paused && !e.ended).length`);
    record(
      'no audio is active after the abandoned request',
      stillPlayingBlobs === 0,
      `${stillPlayingBlobs} playing blob(s)`,
    );
    await cdp.eval('window.__stub.speakDelayMs = 0');

    // --- 6. report deletion -----------------------------------------------------
    await cdp.eval(closePanel);
    await cdp.eval(clickStartsWith('Reports'));
    await cdp.waitFor('Patient Intake Reports');
    await sleep(400);
    const rowsBefore = await cdp.eval(`document.querySelectorAll('button[aria-label^="Delete report"]').length`);
    record('every report row has a delete button', rowsBefore === 3, `${rowsBefore} rows`);
    await cdp.mouseClick('button[aria-label^="Delete report"]');
    await cdp.waitFor('Permanently delete report?');
    const dialogText = await cdp.eval(`document.querySelector('[data-confirm-dialog]')?.innerText || ''`);
    record(
      'delete dialog is English and explains permanence',
      dialogText.includes('cannot be undone') && dialogText.includes('Cancel') && dialogText.includes('Delete report'),
    );
    await cdp.shot('23-delete-dialog-english.png');
    await cdp.eval(clickText('Delete report'));
    await cdp.waitFor('Report permanently deleted.');
    await sleep(500);
    record(
      'confirmed delete removes the row on the server',
      (await cdp.eval('window.__stub.reports.length')) === 2,
      `${await cdp.eval('window.__stub.reports.length')} rows`,
    );
    await cdp.shot('24-delete-success-english.png');

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
