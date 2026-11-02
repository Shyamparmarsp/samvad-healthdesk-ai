/**
 * Samvad HealthDesk AI — Final audit capture harness (audit-only tooling).
 *
 * Read-only with respect to application source. Produces evidence into
 * docs/final-audit/evidence/ and a machine-readable log for the audit reports.
 *
 * Usage: node docs/final-audit/scripts/audit-capture.mjs
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const EVIDENCE = resolve(ROOT, 'docs/final-audit/evidence');
const PORT = 4188;
const CDP_PORT = 9333;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const dir of ['implementation', 'responsive', 'doctor', 'states', 'interaction']) {
  const p = resolve(EVIDENCE, dir);
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.console = [];
    this.errors = [];
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Runtime.consoleAPICalled') {
        const text = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
        this.console.push({ type: m.params.type, text });
      }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        this.errors.push(d?.exception?.description || d?.text || 'unknown');
      }
      if (m.id && this.pending.has(m.id)) {
        const { resolve: res, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(m.error.message || JSON.stringify(m.error)));
        else res(m.result);
      }
    };
  }
  ready() {
    if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
  }
  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = ++this.id;
      this.pending.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result?.value;
  }
  async viewport(width, height, mobile) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
    await sleep(150);
  }
  async goto(path = '/') {
    await this.send('Page.navigate', { url: BASE + path });
    await sleep(700);
  }
  async shot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(EVIDENCE, file), Buffer.from(r.data, 'base64'));
    return file;
  }
  async text() {
    return (await this.eval('document.body.innerText || ""')) || '';
  }
  async waitFor(pattern, timeout = 7000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const t = await this.text();
      const ok = typeof pattern === 'string' ? t.includes(pattern) : pattern.test(t);
      if (ok) return t;
      await sleep(120);
    }
    throw new Error(`timeout waiting for ${pattern}; body=${(await this.text()).slice(0, 220)}`);
  }
  async clickByText(pattern, tag = 'button') {
    const src = pattern instanceof RegExp ? pattern.source : pattern;
    const flags = pattern instanceof RegExp ? pattern.flags : '';
    return this.eval(`(() => {
      const re = new RegExp(${JSON.stringify(src)}, ${JSON.stringify(flags)});
      const els = Array.from(document.querySelectorAll(${JSON.stringify(tag)}));
      const el = els.find(e => re.test((e.innerText||'').trim()) || re.test(e.getAttribute('aria-label')||''));
      if (!el) return { clicked: false, candidates: els.map(e => (e.innerText||'').trim()).slice(0,40) };
      el.click();
      return { clicked: true, label: (el.innerText||'').trim().slice(0,60) };
    })()`);
  }
  async clickLabel(label) {
    return this.eval(`(() => {
      const els = Array.from(document.querySelectorAll('button, a'));
      const el = els.find(e => (e.getAttribute('aria-label')||'') === ${JSON.stringify(label)});
      if (!el) return { clicked: false, candidates: els.map(e => e.getAttribute('aria-label')).filter(Boolean).slice(0,60) };
      el.click();
      return { clicked: true };
    })()`);
  }
  /** Rect + computed style for the smallest element whose trimmed text matches. */
  async rect(re, tag = '*') {
    const src = re instanceof RegExp ? re.source : re;
    const flags = re instanceof RegExp ? re.flags : '';
    return this.eval(`(() => {
      const rx = new RegExp(${JSON.stringify(src)}, ${JSON.stringify(flags)});
      const els = Array.from(document.querySelectorAll(${JSON.stringify(tag)}));
      const matches = els.filter(e => rx.test((e.innerText||'').trim()));
      if (!matches.length) return null;
      // deepest match: prefer an element with no matching descendant
      const deepest = matches.filter(e => !matches.some(o => o !== e && e.contains(o)));
      const el = deepest[0] || matches[matches.length - 1];
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        fontSize: s.fontSize, fontWeight: s.fontWeight, color: s.color, bg: s.backgroundColor,
        radius: s.borderRadius, tag: el.tagName, text: (el.innerText||'').trim().slice(0,60) };
    })()`);
  }
  async metrics() {
    return this.eval(`(() => {
      const de = document.documentElement;
      const shell = document.querySelector('#root > div > div');
      const sr = shell ? shell.getBoundingClientRect() : null;
      return {
        innerWidth: window.innerWidth, innerHeight: window.innerHeight,
        scrollWidth: de.scrollWidth, scrollHeight: de.scrollHeight,
        bodyScrollWidth: document.body.scrollWidth,
        hasHorizontalOverflow: de.scrollWidth > window.innerWidth + 2,
        horizontalOverflowPx: Math.max(0, de.scrollWidth - window.innerWidth),
        shell: sr ? { x: Math.round(sr.x), y: Math.round(sr.y), w: Math.round(sr.width), h: Math.round(sr.height) } : null,
        buttons: document.querySelectorAll('button').length,
        links: document.querySelectorAll('a').length,
        audioElements: document.querySelectorAll('audio').length,
        inlineSvg: document.querySelectorAll('svg').length,
        images: Array.from(document.images).map(i => i.getAttribute('src')),
      };
    })()`);
  }
  async setStore(obj) {
    await this.eval(`(() => { sessionStorage.clear(); const o = ${JSON.stringify(obj)};
      for (const [k,v] of Object.entries(o)) sessionStorage.setItem(k, v); return Object.keys(o); })()`);
  }
  async clearStore() {
    await this.eval('sessionStorage.clear()');
  }
}

const log = { startedAt: new Date().toISOString(), steps: [], measurements: {}, interactions: [], consoleErrors: [] };
function record(section, name, data) {
  log.steps.push({ section, name, at: new Date().toISOString(), ...data });
  console.log(`  · ${section}/${name}`, data.note || data.screenshot || '');
}
function interaction(id, expected, actual, pass, evidence) {
  log.interactions.push({ id, expected, actual, pass, evidence });
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${id}: ${actual}`);
}

// ---------------------------------------------------------------- text answers
const answerByText = async (cdp, value) => {
  // The Type switch is an icon-only button; its aria-label is localised.
  await cdp.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => {
      const l = ((b.getAttribute('aria-label')||'') + ' ' + (b.title||'')).toLowerCase();
      return l.includes('type') || l.includes('लिख') || l.includes('टाइप');
    });
    if (btn) btn.click();
  })()`);
  await sleep(250);
  const filled = await cdp.eval(`(() => {
    const input = document.querySelector('input[type="text"]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(120);
  const sent = await cdp.eval(`(() => {
    const form = document.querySelector('form');
    if (!form) return false;
    const b = form.querySelector('button[type="submit"]');
    if (!b || b.disabled) return 'disabled';
    b.click();
    return 'clicked';
  })()`);
  await sleep(450);
  return { filled, sent };
};

const clickChip = async (cdp, label) => {
  const r = await cdp.eval(`(() => {
    const els = Array.from(document.querySelectorAll('button'));
    const el = els.find(e => (e.getAttribute('aria-label')||'') === ${JSON.stringify(label)});
    if (!el) return { clicked:false, labels: els.map(e=>e.getAttribute('aria-label')).filter(Boolean).slice(0,50) };
    el.click(); return { clicked:true };
  })()`);
  await sleep(450);
  return r;
};

async function run() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
    cwd: ROOT, stdio: 'ignore',
  });
  let up = false;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/')).ok) { up = true; break; } } catch {}
    await sleep(200);
  }
  if (!up) throw new Error('preview server failed');

  const profile = `/tmp/samvad-audit-chrome-${Date.now()}`;
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1440,900',
  ], { stdio: 'pipe' });

  let cdpReady = false;
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok) { cdpReady = true; break; } } catch {}
    await sleep(200);
  }
  if (!cdpReady) throw new Error('chrome cdp failed');
  const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' })).json();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  try {
    await cdp.send('Browser.grantPermissions', { permissions: ['audioCapture'], origin: BASE });
  } catch {}

  try {
    // =========================================================== RESPONSIVE
    console.log('\n[1] Responsive matrix (welcome)');
    const viewports = [
      ['360x800', 360, 800, true],
      ['390x844', 390, 844, true],
      ['430x932', 430, 932, true],
      ['768x1024', 768, 1024, false],
      ['1024x768', 1024, 768, false],
      ['1280x820', 1280, 820, false],
      ['1440x900', 1440, 900, false],
    ];
    for (const [name, w, h, mobile] of viewports) {
      await cdp.viewport(w, h, mobile);
      await cdp.goto('/');
      await cdp.waitFor(/Start Talking/);
      const m = await cdp.metrics();
      await cdp.shot(`responsive/welcome-${name}.png`);
      log.measurements[`welcome-${name}`] = m;
      record('responsive', name, {
        screenshot: `responsive/welcome-${name}.png`,
        note: `overflow=${m.horizontalOverflowPx}px shell=${m.shell ? m.shell.w + 'x' + m.shell.h : 'n/a'} scrollH=${m.scrollHeight}`,
      });
    }

    // =========================================================== PATIENT
    console.log('\n[2] Patient journey — welcome / consent');
    await cdp.viewport(390, 844, true);
    await cdp.clearStore();
    await cdp.goto('/');
    await cdp.waitFor(/Start Talking/);
    await cdp.shot('implementation/P1-welcome-en.png');
    log.measurements['P1-welcome'] = {
      title: await cdp.rect(/Welcome to Samvad/),
      card: await cdp.rect(/Talk about your health/),
      start: await cdp.rect(/Start Talking/),
      type: await cdp.rect(/Type Instead/),
    };

    await cdp.clickByText(/हिंदी/);
    await sleep(400);
    await cdp.shot('implementation/P1-welcome-hi.png');
    await cdp.clickByText(/^English$/);
    await sleep(300);

    await cdp.clickByText(/Start Talking/);
    await cdp.waitFor(/Yes, I agree/);
    await cdp.shot('implementation/P2-consent.png');
    log.measurements['P2-consent'] = {
      bubble: await cdp.rect(/I understand that Samvad/),
      yes: await cdp.rect(/Yes, I agree/),
      no: await cdp.rect(/^No, do not proceed$/),
    };

    // Consent audio control probe: does clicking play any audio?
    const audioProbe = await cdp.eval(`(() => {
      const before = { audioEls: document.querySelectorAll('audio').length, played: 0 };
      const origPlay = window.HTMLMediaElement.prototype.play;
      window.__auditPlayCalls = 0;
      window.HTMLMediaElement.prototype.play = function() { window.__auditPlayCalls++; return origPlay.apply(this, arguments); };
      const btn = Array.from(document.querySelectorAll('button')).find(b => /replay|play/i.test((b.getAttribute('aria-label')||'') + ' ' + (b.innerText||'')));
      if (!btn) return { found: false, before };
      btn.click();
      return { found: true, label: (btn.innerText||'').trim(), before };
    })()`);
    await sleep(900);
    const audioProbeAfter = await cdp.eval(`({ playCalls: window.__auditPlayCalls || 0,
      audioEls: document.querySelectorAll('audio').length,
      label: Array.from(document.querySelectorAll('button')).map(b=>b.innerText.trim()).filter(Boolean).slice(0,10) })`);
    interaction('CONSENT-AUDIO-01', 'Consent greeting actually plays pre-generated audio',
      `media.play() calls=${audioProbeAfter.playCalls}, <audio> elements=${audioProbeAfter.audioEls}, control label after click="${audioProbeAfter.label.join(' | ')}"`,
      audioProbeAfter.playCalls > 0, 'screenshot implementation/P2-consent.png');
    record('patient', 'consent-audio-probe', { probe: audioProbe, after: audioProbeAfter });

    // Consent decline path (separate session)
    await cdp.goto('/');
    await cdp.waitFor(/Start Talking/);
    await cdp.clickByText(/Start Talking/);
    await cdp.waitFor(/Yes, I agree/);
    await cdp.clickByText(/No, do not proceed/);
    await cdp.waitFor(/No problem/);
    await cdp.shot('implementation/P15-consent-declined.png');
    interaction('CONSENT-DECLINE-01', 'Decline ends intake and shows no-data confirmation',
      'consent_declined screen shown: ' + (await cdp.text()).includes('No problem. We have not saved any health information.'),
      true, 'screenshot implementation/P15-consent-declined.png');

    // =========================================================== REAL JOURNEY
    console.log('\n[3] Patient journey — text intake to booking');
    await cdp.goto('/');
    await cdp.waitFor(/Start Talking/);
    await cdp.clickByText(/Start Talking/);
    await cdp.waitFor(/Yes, I agree/);
    await cdp.clickByText(/Yes, I agree/);
    await cdp.waitFor(/full name|What is your full name/);
    await cdp.shot('implementation/P3-conversation-name.png');
    log.measurements['P3-conversation'] = {
      header: await cdp.rect(/Samvad HealthDesk AI/),
      turn: await cdp.rect(/Turn 0 of 15/),
      mic: await cdp.rect(/Tap to speak/, 'button'),
      type: await cdp.rect(/^Type instead$/, 'button'),
    };

    // ---- microphone denial probe (deterministic override)
    const micDenied = await cdp.eval(`(async () => {
      const orig = navigator.mediaDevices.getUserMedia ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices) : null;
      navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
      const btn = Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('aria-label')||'') === 'Tap to speak');
      if (!btn) return { found: false };
      btn.click();
      await new Promise(r => setTimeout(r, 800));
      const fakeStream = () => {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          return ctx.createMediaStreamDestination().stream;
        } catch {
          return new MediaStream();
        }
      };
      navigator.mediaDevices.getUserMedia = (constraints) => {
        if (orig) return orig(constraints).catch(() => fakeStream());
        return Promise.resolve(fakeStream());
      };
      return {
        found: true,
        body: document.body.innerText,
        hasMicDeniedScreen: /Microphone is off/i.test(document.body.innerText),
        hasInlineBanner: /Microphone access is unavailable/i.test(document.body.innerText),
        retryButton: /Try microphone again/i.test(document.body.innerText),
      };
    })()`);
    await cdp.shot('states/mic-denied-inline.png');
    interaction('MIC-DENIED-01', 'Denied microphone shows the approved MicDenied screen (Figma 72:209) with Try microphone again',
      `Figma screen present=${micDenied.hasMicDeniedScreen}, inline banner present=${micDenied.hasInlineBanner}, retry action present=${micDenied.retryButton}`,
      micDenied.hasMicDeniedScreen === true, 'screenshot states/mic-denied-inline.png');
    record('patient', 'mic-denied', micDenied);

    // dismiss banner
    await cdp.clickLabel('Dismiss error');
    await sleep(200);

    // ---- recording lifecycle: start, timer, 30s auto-stop
    console.log('   recording lifecycle');
    await cdp.eval(`document.querySelector('button[aria-label="Tap to speak"]').click()`);
    await sleep(1200);
    const listening1 = await cdp.text();
    await cdp.shot('states/recording-listening-2s.png');
    await sleep(2000);
    const listening2 = await cdp.text();
    log.measurements['recording-timer'] = {
      at1200ms: (listening1.match(/Listening[^\n]*/) || [null])[0],
      at3200ms: (listening2.match(/Listening[^\n]*/) || [null])[0],
    };
    interaction('REC-TIMER-01', 'Visible countdown timer advances while recording',
      `t≈1.2s "${log.measurements['recording-timer'].at1200ms}" → t≈3.2s "${log.measurements['recording-timer'].at3200ms}"`,
      listening1 !== listening2 && /Listening/.test(listening2), 'screenshot states/recording-listening-2s.png');

    // Wait for the 30 s cut-off and inspect post-stop state
    await sleep(29000);
    const afterStop = await cdp.text();
    await cdp.shot('states/after-first-recording.png');
    const reachedTranscript = /What we heard/i.test(afterStop);
    interaction('REC-AUTOSTOP-01', 'Recording stops automatically at 30 s and hands the audio to the transcript step',
      `after 32 s the transcript-confirmation screen is shown=${reachedTranscript}; body head="${afterStop.replace(/\n/g, ' | ').slice(0, 160)}"`,
      reachedTranscript, 'screenshot states/after-first-recording.png');

    // return to the conversation and check the microphone control can be used again
    await cdp.clickByText(/Speak again/);
    await sleep(800);
    const micUsable = await cdp.eval(`(() => {
      const b = document.querySelector('button[aria-label="Tap to speak"]');
      return { present: !!b, disabled: b ? b.disabled : null, aria: b ? b.getAttribute('aria-label') : null,
        status: (document.body.innerText.match(/Maximum recording time: 30 seconds|Recording complete/) || [null])[0],
        doneDisabled: (document.querySelector('button[aria-label="Done"]')||{}).disabled };
    })()`);
    await cdp.shot('states/mic-after-completed-recording.png');
    interaction('REC-REUSE-01', 'Microphone control is usable again after a completed recording (multi-turn voice)',
      `mic button present=${micUsable.present}, disabled=${micUsable.disabled}, status caption="${micUsable.status}"`,
      micUsable.present === true && micUsable.disabled === false, 'screenshot states/mic-after-completed-recording.png');
    record('patient', 'mic-after-recording', micUsable);

    // ---- complete the intake by text
    await cdp.goto('/');
    await cdp.waitFor(/Start Talking/);
    await cdp.clickByText(/Start Talking/);
    await cdp.waitFor(/Yes, I agree/);
    await cdp.clickByText(/Yes, I agree/);
    await cdp.waitFor(/name/);

    const answers = [
      ['name', 'Aarav Sharma'],
      ['age', '28'],
      ['gender', null],
      ['primary_concern', 'Headache for three days'],
      ['duration', '3 days'],
      ['severity', null],
      ['conditions', 'none'],
      ['medications', 'none'],
      ['allergies', 'none'],
      ['other_symptoms', 'none'],
    ];
    for (const [q, value] of answers) {
      if (value === null && q === 'gender') {
        const body = await cdp.text();
        if (/gender/i.test(body)) { await cdp.shot('implementation/P4-gender-question.png'); }
        await clickChip(cdp, 'Male');
      } else if (value === null && q === 'severity') {
        await cdp.shot('implementation/P3-conversation-severity.png');
        await clickChip(cdp, 'Moderate');
      } else {
        const r = await answerByText(cdp, value);
        if (r.sent === 'disabled') throw new Error('send disabled for ' + q);
      }
    }

    await cdp.waitFor(/Your Health Report/);
    await cdp.shot('implementation/P8-report-review.png');
    log.measurements['P8-review'] = {
      title: await cdp.rect(/Your Health Report/),
      draftBadge: await cdp.rect(/Draft Preview/),
      nameRow: await cdp.rect(/Aarav Sharma/),
      submit: await cdp.rect(/Submit to hospital/i),
      dontSubmit: await cdp.rect(/Don't submit/i),
      editButtons: await cdp.eval(`Array.from(document.querySelectorAll('button')).filter(b=>/^edit$/i.test(b.innerText.trim())).length`),
      declinedVsNotProvided: await cdp.eval(`({
        notProvided: (document.body.innerText.match(/Not provided/g)||[]).length,
        declined: (document.body.innerText.match(/Declined/g)||[]).length,
        unknown: (document.body.innerText.match(/Unknown/g)||[]).length
      })`),
    };
    record('patient', 'review-missing-value-labels', log.measurements['P8-review'].declinedVsNotProvided);

    // review: open edit modal for name
    await cdp.eval(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(b => /^edit$/i.test((b.innerText||'').trim()));
      if (b) b.click();
    })()`);
    await sleep(500);
    const editProbe = await cdp.eval(`({
      dialog: /Edit Name/i.test(document.body.innerText),
      overlay: !!document.querySelector('.fixed.inset-0'),
      value: (document.querySelector('.fixed input[type="text"]')||{}).value
    })`);
    await cdp.shot('interaction/review-edit-modal.png');
    interaction('REVIEW-EDIT-01', 'Per-field edit control opens the field editor (Figma pencil icon affordance)',
      `modal=${editProbe.dialog}, fullscreen overlay=${editProbe.overlay}, prefilled value="${editProbe.value}"`,
      editProbe.dialog === true, 'screenshot interaction/review-edit-modal.png');
    await cdp.eval(`(() => { const b = Array.from(document.querySelectorAll('.fixed button')).find(b => /cancel/i.test(b.innerText)); if (b) b.click(); })()`);
    await sleep(300);

    // submit -> booking
    const submitClick = await cdp.clickByText(/Submit to Hospital/i);
    await cdp.waitFor(/Book an appointment/);
    await cdp.shot('implementation/P9-booking.png');
    log.measurements['P9-booking'] = {
      submitClick,
      title: await cdp.rect(/Book an appointment/),
      doctorCard: await cdp.rect(/Assigned doctor/i),
      dateLabel: await cdp.rect(/Select date/i),
      timeLabel: await cdp.rect(/Select time/i),
      bookBtn: await cdp.rect(/Book Appointment/i),
      notNow: await cdp.rect(/Not now/),
      moreDates: await cdp.eval(`Array.from(document.querySelectorAll('button,a')).some(e=>/more dates/i.test(e.innerText||''))`),
      dateChips: await cdp.eval(`document.querySelectorAll('button[aria-label^="Select date"]').length`),
      slotChips: await cdp.eval(`document.querySelectorAll('button[aria-label$="available"]').length`),
    };

    // book the selected slot
    const bookClick = await cdp.clickByText(/Book Appointment/i);
    await sleep(900);
    const afterBook = await cdp.text();
    await cdp.shot('implementation/P12-booking-confirmation.png');
    interaction('BOOK-01', 'Confirm appointment creates a booking and shows confirmation with reference code',
      `clicked=${bookClick.clicked}, confirmation="${/Appointment confirmed/.test(afterBook)}", reference shown=${/APT-/.test(afterBook)}`,
      /Appointment confirmed/.test(afterBook), 'screenshot implementation/P12-booking-confirmation.png');

    // ---- Not now path
    console.log('\n[4] Patient journey — Not now / no-slots / slot-taken / emergency');
    await cdp.clearStore();
    await cdp.goto('/');
    await cdp.waitFor(/Start Talking/);
    await cdp.clickByText(/Start Talking/);
    await cdp.waitFor(/Yes, I agree/);
    await cdp.clickByText(/Yes, I agree/);
    await cdp.waitFor(/name/);
    for (const [q, value] of answers) {
      if (value === null && q === 'gender') await clickChip(cdp, 'Male');
      else if (value === null && q === 'severity') await clickChip(cdp, 'Moderate');
      else await answerByText(cdp, value);
    }
    await cdp.waitFor(/Your Health Report/);
    await cdp.clickByText(/Submit to Hospital/i);
    await cdp.waitFor(/Book an appointment/);
    await cdp.clickByText(/Not now/);
    await cdp.waitFor(/Report sent/);
    await cdp.shot('implementation/P13-report-sent.png');
    interaction('BOOK-NOTNOW-01', 'Not now ends booking without an appointment and keeps the report submitted',
      'report-only confirmation shown: ' + (await cdp.text()).includes('Report sent'), true, 'screenshot implementation/P13-report-sent.png');

    // ---- slot-taken / no-slots fixtures (approved Figma states)
    await cdp.setStore({ FIGMA_PATIENT_VIEW: 'no_slots', FIGMA_PARITY_NO_SLOTS: '1' });
    await cdp.goto('/');
    await sleep(900);
    await cdp.shot('implementation/P10-slot-unavailable.png');
    const noSlotBody = await cdp.text();
    const tryAnother = await cdp.eval(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(b => /Try another date/i.test(b.innerText||''));
      if (!b) return { found:false };
      const before = document.body.innerText;
      b.click();
      return { found:true, disabled: b.disabled, label: b.innerText.trim() };
    })()`);
    await sleep(700);
    const afterTryAnother = await cdp.text();
    await cdp.shot('interaction/no-slots-after-try-another.png');
    interaction('BOOK-TRYANOTHER-01', 'No-slot state: "Try another date" advances to another date / reloads slots',
      `button found=${tryAnother.found}, screen changed=${afterTryAnother !== noSlotBody}, still shows no-slot copy=${/No slots available/i.test(afterTryAnother)}`,
      afterTryAnother !== noSlotBody, 'screenshot interaction/no-slots-after-try-another.png');

    await cdp.setStore({ FIGMA_PATIENT_VIEW: 'slot_taken', FIGMA_PARITY_SLOT_TAKEN: '1' });
    await cdp.goto('/');
    await sleep(900);
    await cdp.shot('implementation/P11-slot-taken.png');
    record('patient', 'slot-taken-state', { note: 'rendered from FIGMA_PATIENT_VIEW fixture', text: (await cdp.text()).slice(0, 300) });

    // ---- emergency: real deterministic trigger
    await cdp.clearStore();
    await cdp.goto('/');
    await cdp.waitFor(/Start Talking/);
    await cdp.clickByText(/Start Talking/);
    await cdp.waitFor(/Yes, I agree/);
    await cdp.clickByText(/Yes, I agree/);
    await cdp.waitFor(/name/);
    await answerByText(cdp, 'Vikram Kumar');
    await answerByText(cdp, '45');
    const genderShown = /gender/i.test(await cdp.text());
    if (genderShown) await clickChip(cdp, 'Male');
    // emergency phrase as the primary concern answer
    await answerByText(cdp, 'I have severe chest pain and pressure in my chest');
    await sleep(900);
    const emg = await cdp.text();
    await cdp.shot('implementation/P14-emergency-en.png');
    interaction('EMERGENCY-01', 'Deterministic chest-pain phrase stops intake and shows 112 guidance',
      `emergency screen=${/This may be urgent/.test(emg)}, 112 shown=${/\b112\b/.test(emg)}, no slots offered=${!/Book an appointment/.test(emg)}`,
      /This may be urgent/.test(emg) && /\b112\b/.test(emg), 'screenshot implementation/P14-emergency-en.png');
    record('patient', 'emergency-en', { note: 'English emergency guidance', text: emg.slice(0, 400) });

    // emergency in Hindi
    await cdp.clearStore();
    await cdp.goto('/');
    await cdp.waitFor(/Start Talking/);
    await cdp.clickByText(/हिंदी/);
    await sleep(300);
    await cdp.clickByText(/बोलकर|Start Talking/);
    await cdp.waitFor(/सहमत|Yes, I agree/);
    await cdp.clickByText(/सहमत|Yes, I agree/);
    await cdp.waitFor(/नाम|name/);
    await answerByText(cdp, 'विक्रम कुमार');
    await answerByText(cdp, '45');
    if (/लिंग|gender/i.test(await cdp.text())) await clickChip(cdp, 'पुरुष (Male)');
    await answerByText(cdp, 'सीने में बहुत तेज दर्द है');
    await sleep(900);
    const emgHi = await cdp.text();
    await cdp.shot('implementation/P14-emergency-hi.png');
    interaction('EMERGENCY-HI-01', 'Hindi emergency guidance renders in Devanagari (title + body + 112)',
      `title Hindi=${/यह स्थिति गंभीर हो सकती है/.test(emgHi)}, 112 present=${/\b112\b/.test(emgHi)}, body still English=${/Your answer may indicate an urgent situation/.test(emgHi)}`,
      !/Your answer may indicate an urgent situation/.test(emgHi), 'screenshot implementation/P14-emergency-hi.png');
    record('patient', 'emergency-hi', { note: 'Hindi emergency screen', text: emgHi.slice(0, 500) });

    // ---- What we heard fixture: button semantics
    await cdp.setStore({ FIGMA_PATIENT_VIEW: 'what_we_heard' });
    await cdp.goto('/');
    await sleep(900);
    await cdp.shot('implementation/P5-what-we-heard.png');
    const playProbe = await cdp.eval(`(() => {
      window.__auditPlayCalls = 0;
      const orig = window.HTMLMediaElement.prototype.play;
      window.HTMLMediaElement.prototype.play = function(){ window.__auditPlayCalls++; return orig.apply(this, arguments); };
      const b = Array.from(document.querySelectorAll('button')).find(b => /Play question again/i.test(b.innerText||''));
      if (!b) return { found:false };
      const before = document.body.innerText;
      b.click();
      return { found:true, before };
    })()`);
    await sleep(800);
    const playAfter = await cdp.eval(`({ playCalls: window.__auditPlayCalls||0, body: document.body.innerText, screen: document.body.innerText.includes('What we heard') })`);
    interaction('HEARD-REPLAY-01', '“Play question again” replays the question audio',
      `media.play() calls=${playAfter.playCalls}, left the transcript screen=${!playAfter.screen}`,
      playAfter.playCalls > 0 && playAfter.screen, 'screenshot implementation/P5-what-we-heard.png');

    // ---- Processing / Mic-denied Figma screens exist only as fixtures?
    await cdp.setStore({ FIGMA_PARITY_P3B_FIXTURE: '1' });
    await cdp.goto('/');
    await sleep(800);
    await cdp.shot('implementation/P6-processing-fixture.png');
    await cdp.setStore({ FIGMA_PARITY_P4B_FIXTURE: '1' });
    await cdp.goto('/');
    await sleep(800);
    await cdp.shot('implementation/P7-mic-denied-fixture.png');

    // =========================================================== DOCTOR
    console.log('\n[5] Doctor portal');
    await cdp.viewport(1280, 820, false);
    await cdp.clearStore();
    await cdp.goto('/doctor');
    await sleep(1200);
    await cdp.shot('doctor/D1-login.png');
    log.measurements['D1-login'] = {
      title: await cdp.rect(/Doctor Login/),
      form: await cdp.rect(/Evaluator access/),
      eyeToggle: await cdp.eval(`document.querySelectorAll('button[aria-label*="password" i]').length`),
      backToPatient: await cdp.eval(`Array.from(document.querySelectorAll('a,button')).filter(e=>/patient|back|return/i.test((e.innerText||'')+(e.getAttribute('aria-label')||''))).map(e=>e.innerText.trim())`),
    };
    interaction('LOGIN-EYE-01', 'Password field offers the Figma show/hide (eye) control',
      `password visibility buttons=${log.measurements['D1-login'].eyeToggle}`, log.measurements['D1-login'].eyeToggle > 0, 'screenshot doctor/D1-login.png');
    interaction('LOGIN-BACK-01', 'Doctor Login offers return navigation to the patient side',
      `candidate links=${JSON.stringify(log.measurements['D1-login'].backToPatient)}`,
      log.measurements['D1-login'].backToPatient.some(t => /patient/i.test(t)), 'screenshot doctor/D1-login.png');

    // invalid credentials
    await cdp.eval(`(() => {
      const email = document.querySelector('input[type="email"]');
      const pass = document.querySelector('input[type="password"]');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(email, 'nobody@hospital.demo'); email.dispatchEvent(new Event('input',{bubbles:true}));
      set.call(pass, 'wrong-password'); pass.dispatchEvent(new Event('input',{bubbles:true}));
      document.querySelector('form').querySelector('button[type=submit]').click();
    })()`);
    await sleep(700);
    const invalid = await cdp.text();
    await cdp.shot('doctor/D1-login-invalid.png');
    interaction('LOGIN-INVALID-01', 'Invalid credentials show an understandable error and keep the user on login',
      `error shown=${/Invalid credentials/i.test(invalid)}, still on login=${/Doctor Login/.test(invalid)}`,
      /Invalid credentials/i.test(invalid), 'screenshot doctor/D1-login-invalid.png');

    // valid login via fixture-free real flow
    await cdp.eval(`(() => {
      const email = document.querySelector('input[type="email"]');
      const pass = document.querySelector('input[type="password"]');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(email, 'aditi.rao@hospital.demo'); email.dispatchEvent(new Event('input',{bubbles:true}));
      set.call(pass, 'demo-password'); pass.dispatchEvent(new Event('input',{bubbles:true}));
      document.querySelector('form').querySelector('button[type=submit]').click();
    })()`);
    await sleep(1200);
    const dash = await cdp.text();
    await cdp.shot('doctor/D2-dashboard-realdata.png');
    interaction('LOGIN-VALID-01', 'Valid demo credentials open the dashboard',
      `dashboard=${/Welcome/.test(dash)}, reports list rows=${await cdp.eval(`document.querySelectorAll('[role=button]').length`)}`,
      /Welcome/.test(dash), 'screenshot doctor/D2-dashboard-realdata.png');

    // deterministic fixture for Figma-state screenshots
    await cdp.setStore({ FIGMA_PARITY_FIXTURE: '1' });
    await cdp.goto('/doctor');
    await sleep(1400);
    await cdp.shot('doctor/D2-dashboard.png');

    // go to the Reports list via the sidebar (the fixture lands on the dashboard)
    await cdp.eval(`(() => { const b = Array.from(document.querySelectorAll('nav button')).find(b => /Reports/.test(b.innerText||'')); if (b) b.click(); })()`);
    await sleep(900);
    await cdp.shot('doctor/D3-reports-list.png');

    // Reports list tabs + search
    const tabProbe = {};
    for (const t of ['All', 'Urgent', 'Booked', 'Not booked']) {
      await cdp.eval(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => (b.innerText||'').trim() === ${JSON.stringify(t)}); if (b) b.click(); })()`);
      await sleep(450);
      tabProbe[t] = await cdp.eval(`document.querySelectorAll('tbody tr').length`);
    }
    await cdp.eval(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => (b.innerText||'').trim() === 'All'); if (b) b.click(); })()`);
    await sleep(400);
    await sleep(500);
    interaction('REPORTS-TABS-01', 'Reports tabs filter the list (All/Urgent/Booked/Not booked)',
      `row counts per tab=${JSON.stringify(tabProbe)}`,
      Object.values(tabProbe).some(v => v > 0), 'screenshot doctor/D3-reports-list.png');
    await cdp.shot('doctor/D3-reports-list-taball.png');

    const searchProbe = await cdp.eval(`(() => {
      const input = Array.from(document.querySelectorAll('input')).find(i => /Search/i.test(i.placeholder||''));
      if (!input) return { found:false };
      const rowsBefore = document.querySelectorAll('tbody tr').length;
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      set.call(input, 'Rohan');
      input.dispatchEvent(new Event('input',{bubbles:true}));
      return { found:true, rowsBefore };
    })()`);
    await sleep(500);
    const searchRows = await cdp.eval(`document.querySelectorAll('tbody tr').length`);
    await cdp.shot('interaction/reports-search.png');
    interaction('REPORTS-SEARCH-01', 'Reports search filters by patient/ref/concern',
      `rows before=${searchProbe.rowsBefore}, after "Rohan"=${searchRows}`,
      searchRows === 1, 'screenshot interaction/reports-search.png');

    // open a report detail
    await cdp.eval(`(() => { const input = Array.from(document.querySelectorAll('input')).find(i => /Search/i.test(i.placeholder||'')); if (input) { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; set.call(input,''); input.dispatchEvent(new Event('input',{bubbles:true})); } })()`);
    await sleep(400);
    await cdp.eval(`(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const row = rows.find(r => /Rohan/i.test(r.innerText||'')) || rows[0];
      if (row) row.click();
    })()`);
    await sleep(1100);
    await cdp.shot('doctor/D4-report-detail.png');
    log.measurements['D4-detail'] = {
      opened: /Patient Report/.test(await cdp.text()),
      title: await cdp.rect(/Patient Report/, 'h1'),
      backButton: await cdp.eval(`Array.from(document.querySelectorAll('button')).filter(b=>/back/i.test(b.getAttribute('aria-label')||'')).map(b=>{const r=b.getBoundingClientRect();const s=getComputedStyle(b);return {label:b.getAttribute('aria-label'),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),bg:s.backgroundColor,radius:s.borderRadius,svg:b.querySelector('svg')?.getAttribute('class')}})`)
    };

    // back to list, open the needs-review (possible_urgent) report
    await cdp.eval(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b=>/back/i.test(b.getAttribute('aria-label')||'')); if (b) b.click(); })()`);
    await sleep(800);
    await cdp.eval(`(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const row = rows.find(r => /Rohan|Asha/i.test(r.innerText||''));
      if (row) row.click();
    })()`);
    await sleep(1000);
    const detailBody = await cdp.text();
    await cdp.shot('doctor/D4-report-detail-warningflags.png');
    interaction('DETAIL-WARNFLAGS-01', 'A report with possible_urgent / needs_human_review shows those warning flags',
      `screen text mentions review warning=${/Urgent review|Needs review|possible_urgent|needs_human_review|Warning flags\s*\n\s*(?!None)/i.test(detailBody)}; warning section="${(detailBody.match(/Warning flags[\s\S]{0,80}/) || [''])[0].replace(/\n/g,' | ')}"`,
      /possible_urgent|needs_human_review|Urgent review/i.test(detailBody), 'screenshot doctor/D4-report-detail-warningflags.png');
    record('doctor', 'detail-warning-flags', { text: detailBody.slice(0, 800) });

    // conversation reader
    const convOpen = await cdp.eval(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b=>/Expand/i.test(b.innerText||'')); if(!b) return {found:false}; b.click(); return {found:true}; })()`);
    await sleep(900);
    await cdp.shot('doctor/D4-report-detail-conversation.png');
    const convBody = await cdp.text();
    interaction('DETAIL-CONV-01', 'Patient responses expand and come from the messages integration',
      `disclosure found=${convOpen.found}, answered=${/recorded/.test(convBody)}, error state=${/could not be loaded/i.test(convBody)}, empty=${/No patient responses/i.test(convBody)}`,
      convOpen.found === true, 'screenshot doctor/D4-report-detail-conversation.png');

    // mark reviewed
    const markProbe = await cdp.eval(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b=>/Mark Reviewed/i.test(b.innerText||'')); if(!b) return {found:false}; b.click(); return {found:true}; })()`);
    await sleep(900);
    const reviewedBody = await cdp.text();
    await cdp.shot('doctor/D4-report-detail-reviewed.png');
    interaction('DETAIL-REVIEW-01', 'Mark Reviewed writes the review fields and reflects the new state',
      `button found=${markProbe.found}, reviewed state shown=${/Reviewed|Reviewed by/i.test(reviewedBody)}`,
      markProbe.found === true && /Reviewed/i.test(reviewedBody), 'screenshot doctor/D4-report-detail-reviewed.png');

    // appointments
    await cdp.eval(`(() => { const b = Array.from(document.querySelectorAll('nav button')).find(b => /Appointments/.test(b.innerText||'')); if (b) b.click(); })()`);
    await sleep(1000);
    await cdp.shot('doctor/D6-appointments.png');
    const apptTable = await cdp.eval(`(() => {
      const heads = Array.from(document.querySelectorAll('thead th')).map(t=>t.innerText.trim());
      const first = Array.from(document.querySelectorAll('tbody tr')[0]?.querySelectorAll('td')||[]).map(t=>t.innerText.trim());
      return { heads, first };
    })()`);
    await cdp.shot('doctor/D6-appointments-table.png');
    record('doctor', 'appointments-table', apptTable);
    interaction('APPT-COLUMNS-01', 'Appointments table header labels match the cell contents',
      `headers=${JSON.stringify(apptTable.heads)} firstRow=${JSON.stringify(apptTable.first)}`,
      apptTable.heads.length === apptTable.first.length &&
        apptTable.heads[3] === 'Age / Gender' && /^\d+ · /.test(apptTable.first[3] || ''),
      'screenshot doctor/D6-appointments.png');

    // urgent list / detail
    await cdp.eval(`(() => { const b = Array.from(document.querySelectorAll('nav button')).find(b => /\\bUrgent\\b/.test(b.innerText||'')); if (b) b.click(); })()`);
    await sleep(1000);
    await cdp.shot('doctor/D7-urgent-review.png');
    const urgentRows = await cdp.eval(`document.querySelectorAll('[aria-label^="Open urgent triage report"]').length`);
    log.measurements['D7-urgent'] = { rows: urgentRows, body: (await cdp.text()).slice(0, 400) };
    await cdp.eval(`(() => { const el = document.querySelector('[aria-label^="Open urgent triage report"]'); if (el) el.click(); })()`);
    await sleep(900);
    await cdp.shot('doctor/D5-urgent-detail.png');
    const urgentDetail = await cdp.text();
    interaction('URGENT-REVIEW-AUTH-01', 'General Medicine doctor sees read-only cross-visibility on an Emergency report',
      `read-only shown=${/Read-only cross-visibility/.test(urgentDetail)}, acknowledge button=${/Acknowledge Triage/.test(urgentDetail)}`,
      /Read-only cross-visibility/.test(urgentDetail), 'screenshot doctor/D5-urgent-detail.png');

    // sidebar navigation + logout
    await cdp.clickByText(/Dashboard/);
    await sleep(700);
    const homeOk = /Welcome,/.test(await cdp.text());
    await cdp.clickByText(/Log out/);
    await sleep(900);
    const loggedOut = /Doctor Login/.test(await cdp.text());
    await cdp.shot('doctor/D1-after-logout.png');
    interaction('AUTH-01', 'Sidebar navigation returns to dashboard and Log out ends the session',
      `dashboard reachable=${homeOk}, login shown after logout=${loggedOut}`,
      homeOk && loggedOut, 'screenshot doctor/D1-after-logout.png');

    // history back behaviour on doctor detail (direct URL + refresh fallback)
    await cdp.setStore({ FIGMA_PARITY_FIXTURE: '1', FIGMA_DOCTOR_VIEW: 'report_detail' });
    await cdp.goto('/doctor');
    await sleep(1200);
    const directDetail = await cdp.text();
    const backProbe = await cdp.eval(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(b=>/back/i.test(b.getAttribute('aria-label')||''));
      if (!b) return { found:false };
      b.click();
      return { found:true, label:b.getAttribute('aria-label') };
    })()`);
    await sleep(700);
    const afterBack = await cdp.text();
    await cdp.shot('interaction/doctor-detail-back.png');
    interaction('NAV-DOCTOR-BACK-01', 'Doctor detail back button returns to the reports list from a direct URL',
      `direct detail loaded=${/Patient Report/.test(directDetail)}, back button=${backProbe.found}, reports list shown=${/Reports/.test(afterBack) && !/Patient Report/.test(afterBack)}`,
      backProbe.found === true && !/Patient Report/.test(afterBack), 'screenshot interaction/doctor-detail-back.png');

    // =========================================================== PATIENT BACK
    console.log('\n[6] Patient back-navigation inventory');
    await cdp.viewport(390, 844, true);
    await cdp.clearStore();
    await cdp.goto('/');
    await cdp.waitFor(/Start Talking/);
    const welcomeBack = await cdp.eval(`Array.from(document.querySelectorAll('button')).filter(b=>/back/i.test(b.getAttribute('aria-label')||'')).length`);
    await cdp.clickByText(/Start Talking/);
    await cdp.waitFor(/Yes, I agree/);
    const consentBack = await cdp.eval(`Array.from(document.querySelectorAll('button')).filter(b=>/back/i.test((b.getAttribute('aria-label')||'')+(b.innerText||''))).length`);
    await cdp.clickByText(/Yes, I agree/);
    await cdp.waitFor(/full name/);
    const conversationBack = await cdp.eval(`Array.from(document.querySelectorAll('button')).filter(b=>/back/i.test((b.getAttribute('aria-label')||'')+(b.innerText||''))).length`);
    await cdp.shot('interaction/conversation-back-inventory.png');

    await cdp.setStore({ FIGMA_DOCTOR_VIEW: 'reports' });
    await cdp.goto('/doctor');
    await sleep(1000);
    await cdp.setStore({ FIGMA_PATIENT_VIEW: 'review' });
    await cdp.goto('/');
    await sleep(800);
    const reviewBack = await cdp.eval(`Array.from(document.querySelectorAll('button')).filter(b=>/back/i.test((b.getAttribute('aria-label')||'')+(b.innerText||''))).length`);
    await cdp.shot('interaction/review-back-inventory.png');
    await cdp.setStore({ FIGMA_PATIENT_VIEW: 'booking' });
    await cdp.goto('/');
    await sleep(900);
    const bookingBack = await cdp.eval(`Array.from(document.querySelectorAll('button')).filter(b=>/back/i.test((b.getAttribute('aria-label')||'')+(b.innerText||''))).length`);
    await cdp.setStore({ FIGMA_PATIENT_VIEW: 'confirmed_booking' });
    await cdp.goto('/');
    await sleep(800);
    const confirmBack = await cdp.eval(`Array.from(document.querySelectorAll('button')).filter(b=>/back/i.test((b.getAttribute('aria-label')||'')+(b.innerText||''))).length`);
    await cdp.setStore({ FIGMA_PATIENT_VIEW: 'emergency' });
    await cdp.goto('/');
    await sleep(800);
    const emergencyBack = await cdp.eval(`Array.from(document.querySelectorAll('button')).filter(b=>/back/i.test((b.getAttribute('aria-label')||'')+(b.innerText||''))).length`);
    await cdp.setStore({ FIGMA_PATIENT_VIEW: 'what_we_heard' });
    await cdp.goto('/');
    await sleep(800);
    const heardBack = await cdp.eval(`Array.from(document.querySelectorAll('button')).filter(b=>/back/i.test((b.getAttribute('aria-label')||'')+(b.innerText||''))).length`);
    await cdp.shot('interaction/heard-back-inventory.png');

    log.measurements['back-buttons'] = { welcomeBack, consentBack, conversationBack, reviewBack, bookingBack, confirmBack, emergencyBack, heardBack };
    interaction('NAV-BACK-MATRIX-01', 'Every non-home patient screen exposes a visible back control',
      JSON.stringify(log.measurements['back-buttons']),
      [consentBack, conversationBack, reviewBack, bookingBack, confirmBack, emergencyBack].every(n => n > 0), 'screenshots interaction/*-back-inventory.png');

    // =========================================================== KEYBOARD
    console.log('\n[7] Keyboard / focus checks');
    await cdp.setStore({ FIGMA_PATIENT_VIEW: 'welcome' });
    await cdp.goto('/');
    await sleep(700);
    const focusables = await cdp.eval(`(() => {
      const els = Array.from(document.querySelectorAll('button,input,a,[tabindex]')).filter(e=>!e.disabled && e.offsetParent !== null);
      return { count: els.length, first: els.slice(0,6).map(e=>((e.getAttribute('aria-label')||e.innerText||e.placeholder||'').trim().slice(0,40))) };
    })()`);
    await cdp.eval(`document.body.focus()`);
    for (let i = 0; i < 4; i++) { await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await sleep(80); }
    const focusNow = await cdp.eval(`(() => { const a = document.activeElement; return { tag:a.tagName, label:(a.getAttribute('aria-label')||a.innerText||'').trim().slice(0,50), outline:getComputedStyle(a).outlineStyle, width:Math.round(a.getBoundingClientRect().width), height:Math.round(a.getBoundingClientRect().height) } })()`);
    await cdp.shot('states/focus-ring-welcome.png');
    log.measurements['focus'] = { focusables, focusNow };
    interaction('A11Y-FOCUS-01', 'Buttons are keyboard-reachable with a visible focus indicator',
      `focusables=${focusables.count}, after 4x Tab active=${JSON.stringify(focusNow)}`,
      focusNow.outline !== 'none', 'screenshot states/focus-ring-welcome.png');

    // touch target audit on patient conversation
    await cdp.setStore({ FIGMA_PATIENT_VIEW: 'review' });
    await cdp.goto('/');
    await sleep(800);
    const smallTargets = await cdp.eval(`(() => {
      const small = [];
      for (const b of document.querySelectorAll('button')) {
        const r = b.getBoundingClientRect();
        if (r.width < 44 || r.height < 44) small.push({ label: (b.getAttribute('aria-label')||b.innerText||'').trim().slice(0,40), w: Math.round(r.width), h: Math.round(r.height) });
      }
      return small;
    })()`);
    log.measurements['small-targets-review'] = smallTargets;
    record('a11y', 'small-touch-targets', { note: `${smallTargets.length} controls under 44x44 on review` });

    log.finishedAt = new Date().toISOString();
    log.consoleErrors = cdp.errors;
    log.consoleLog = cdp.console.filter(c => c.type === 'error').slice(0, 100);
  } finally {
    writeFileSync(resolve(EVIDENCE, 'audit-run.json'), JSON.stringify(log, null, 2));
    try { cdp.ws.close(); } catch {}
    try { chrome.kill('SIGKILL'); } catch {}
    try { server.kill('SIGKILL'); } catch {}
    try { rmSync(`/tmp/samvad-audit-chrome-*`, { recursive: true, force: true }); } catch {}
  }
}

run().then(() => {
  console.log('\nAudit capture complete. Log: docs/final-audit/evidence/audit-run.json');
  process.exit(0);
}).catch((err) => {
  console.error('\nAudit capture failed:', err);
  process.exit(1);
});
