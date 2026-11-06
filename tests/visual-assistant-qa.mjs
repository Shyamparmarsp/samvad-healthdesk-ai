/**
 * Samwad Assistant (doctor) — visual + geometry QA for all six doctor pages.
 *
 * For every page at 1440, 1280, 1024, 768 and 390 px it:
 *   - asserts the approved Figma pill is in the upper-right of the page header,
 *     top-aligned with the page title, inside the header row, non-overlapping, and
 *     fully inside the viewport;
 *   - asserts the document has no horizontal overflow;
 *   - captures a screenshot for manual comparison with Figma `140:2` / `74:24`.
 *
 * It also captures each page with the assistant panel open at 1440 px so the Hindi
 * summary can be inspected, plus the dark palette.
 *
 * Usage: npm run build:mock && node tests/visual-assistant-qa.mjs
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../docs/screenshots/assistant');
const PORT = 4176;
const BASE = `http://127.0.0.1:${PORT}`;

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { width: 1440, height: 900, label: '1440' },
  { width: 1280, height: 820, label: '1280' },
  { width: 1024, height: 768, label: '1024' },
  { width: 768, height: 1024, label: '768' },
  { width: 390, height: 844, label: '390' },
];

const PAGES = ['dashboard', 'reports', 'report-detail', 'appointments', 'urgent-review', 'urgent-detail'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CdpClient {
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
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return res.result?.value;
  }
  async viewport(width, height, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await sleep(300);
  }
  async shot(filename) {
    const file = resolve(OUT_DIR, filename);
    mkdirSync(dirname(file), { recursive: true });
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(file, Buffer.from(res.data, 'base64'));
  }
  async waitFor(matcher, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const text = (await this.eval('document.body ? (document.body.innerText || "") : ""')) || '';
      if (typeof matcher === 'string' ? text.includes(matcher) : matcher.test(text)) return text;
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${matcher}`);
  }
}

const clickExact = (label) => `
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

const GEOMETRY = `
  (() => {
    const rect = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom), left: Math.round(b.left), width: Math.round(b.width), height: Math.round(b.height) };
    };
    const slot = document.querySelector('[data-assistant-slot]');
    // The page header is the one that owns the assistant slot; document.querySelector('header')
    // would pick the hidden programmatic nav header rendered by App.tsx.
    const header = slot ? slot.closest('header') : document.querySelector('main header');
    const pill = slot ? slot.querySelector('button[aria-haspopup="dialog"]') : null;
    return {
      pill: rect(pill),
      title: rect(header ? header.querySelector('h1') : null),
      header: rect(header),
      main: rect(document.querySelector('main')),
      vw: window.innerWidth,
      docW: document.documentElement.scrollWidth,
    };
  })()
`;

const closePanel = `(() => {
  const close = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === 'Close assistant');
  if (!close) return 'already-closed';
  close.click();
  return 'closed';
})()`;

function assertPillPlacement(page, vp, geometry) {
  const { pill, title, header, vw, docW } = geometry;
  assert.ok(pill, `${page}@${vp}: pill found`);
  assert.ok(title && header, `${page}@${vp}: title and header found`);
  assert.ok(docW <= vw + 2, `${page}@${vp}: no horizontal overflow (${docW} vs ${vw})`);
  assert.ok(pill.right <= vw + 1, `${page}@${vp}: pill inside viewport (right ${pill.right} of ${vw})`);
  assert.ok(pill.left > header.left, `${page}@${vp}: pill inside the header`);
  assert.ok(
    Math.abs(pill.top - header.top) <= 14,
    `${page}@${vp}: pill is at the top of the header (pill ${pill.top}, header ${header.top})`,
  );
  assert.ok(pill.top <= title.top + 8, `${page}@${vp}: pill is not below the title`);
  assert.ok(
    pill.left >= title.right - 1 || pill.top >= title.bottom,
    `${page}@${vp}: pill does not overlap the title`,
  );
  assert.ok(
    pill.right >= header.right - 4,
    `${page}@${vp}: pill is flush with the header's right edge (pill.right ${pill.right}, header.right ${header.right})`,
  );
}

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) break;
    } catch {}
    await sleep(200);
  }

  const chrome = spawn(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', '--remote-debugging-port=9231', `--user-data-dir=/tmp/cdp-assistant-${Date.now()}`, '--no-sandbox', '--disable-gpu'],
    { stdio: 'pipe' },
  );
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch('http://127.0.0.1:9231/json/version');
      if (res.ok) break;
    } catch {}
    await sleep(200);
  }

  const target = await (await fetch('http://127.0.0.1:9231/json/new', { method: 'PUT' })).json();
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const report = { placements: [], pages: PAGES, viewports: VIEWPORTS.map((v) => v.label) };

  const navigateTo = async (page) => {
    if (page === 'dashboard') {
      await cdp.eval(clickStartsWith('Dashboard'));
      await cdp.waitFor('Welcome');
      return;
    }
    if (page === 'reports') {
      await cdp.eval(clickStartsWith('Reports'));
      await cdp.waitFor('Patient Intake Reports');
      return;
    }
    if (page === 'appointments') {
      await cdp.eval(clickStartsWith('Appointments'));
      await cdp.waitFor('Patient consultations scheduled');
      return;
    }
    if (page === 'urgent-review') {
      await cdp.eval(clickStartsWith('Urgent'));
      await cdp.waitFor('Emergency Triage Queue');
      return;
    }
    if (page === 'report-detail') {
      await navigateTo('reports');
      await sleep(250);
      await cdp.eval(`
        (() => {
          const row = Array.from(document.querySelectorAll('[role="button"]')).find(el => (el.getAttribute('aria-label') || '').startsWith('View intake report'));
          if (!row) return 'not-found';
          row.click();
          return 'clicked';
        })()
      `);
      await cdp.waitFor('Patient Report');
      return;
    }
    if (page === 'urgent-detail') {
      await navigateTo('urgent-review');
      await sleep(250);
      await cdp.eval(clickExact('Open'));
      await cdp.waitFor('Urgent Triage Case');
      return;
    }
    throw new Error(`unknown page ${page}`);
  };

  try {
    await cdp.viewport(1440, 900);
    await cdp.send('Page.navigate', { url: `${BASE}/doctor` });
    await sleep(900);
    await cdp.waitFor('Log in');
    await cdp.eval(clickExact('Log in'));
    await cdp.waitFor('Welcome');
    await cdp.waitFor('डॉक्टर!');
    await cdp.shot('1-dashboard-briefing.png');

    // Geometry + screenshot matrix.
    for (const vp of VIEWPORTS) {
      await cdp.viewport(vp.width, vp.height, vp.width < 700);
      for (const page of PAGES) {
        await navigateTo(page);
        await sleep(350);
        await cdp.eval(closePanel);
        await sleep(150);
        const geometry = await cdp.eval(GEOMETRY);
        assertPillPlacement(page, vp.label, geometry);
        report.placements.push({ page, viewport: vp.label, ...geometry });
        await cdp.shot(`pages/${page}-${vp.label}.png`);
      }
    }

    // Panel-open captures at desktop width for all six pages.
    await cdp.viewport(1440, 900);
    for (const page of PAGES) {
      await navigateTo(page);
      await sleep(300);
      await cdp.eval(closePanel);
      await sleep(150);
      await cdp.eval(`document.querySelector('button[aria-haspopup="dialog"]').click(); 'opened'`);
      await cdp.waitFor('डॉक्टर');
      await sleep(500);
      await cdp.shot(`panel-${page}.png`);
    }

    // Panel header (mascot, title, language toggle, close) at every width.
    for (const vp of VIEWPORTS) {
      await cdp.viewport(vp.width, vp.height, vp.width < 700);
      await cdp.eval(clickStartsWith('Reports'));
      await cdp.waitFor('Patient Intake Reports');
      await sleep(350);
      await cdp.eval(closePanel);
      await sleep(150);
      await cdp.eval(`document.querySelector('button[aria-haspopup="dialog"]').click(); 'opened'`);
      await cdp.waitFor('डॉक्टर');
      await sleep(500);
      const header = await cdp.eval(`(() => {
        const group = document.querySelector('[aria-label="Summary language"]');
        const close = document.querySelector('button[aria-label="Close assistant"]');
        const title = document.getElementById('samwad-assistant-title');
        const panel = document.querySelector('[role="dialog"]');
        if (!group || !close || !title || !panel) return null;
        const g = group.getBoundingClientRect();
        const c = close.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        return {
          fits: g.left >= p.left - 0.5 && g.right <= c.left + 0.5 && c.right <= p.right + 0.5,
          labels: Array.from(group.querySelectorAll('button')).map((b) => b.innerText.trim()),
          toggleHeight: Math.round(g.height),
        };
      })()`);
      assert.ok(header, `panel header present at ${vp.label}`);
      assert.ok(header.fits, `language toggle and close button fit the header at ${vp.label}`);
      assert.deepEqual(header.labels, ['Hindi', 'English'], `toggle labels at ${vp.label}`);
      await cdp.shot(`panel-header-${vp.label}.png`);
      await cdp.eval(closePanel);
      await sleep(150);
    }

    // Dark palette sanity capture.
    await cdp.eval(`
      (() => {
        const toggle = document.querySelector('[role="switch"]');
        if (!toggle) return 'no-toggle';
        toggle.click();
        return 'toggled';
      })()
    `);
    await sleep(400);
    await cdp.eval(closePanel);
    await sleep(150);
    await cdp.eval(`document.querySelector('button[aria-haspopup="dialog"]').click(); 'opened'`);
    await sleep(600);
    await cdp.shot('7-dashboard-dark.png');

    // Dark palette on the reports page, including the delete control and its dialog.
    await cdp.eval(closePanel);
    await cdp.eval(clickStartsWith('Reports'));
    await cdp.waitFor('Patient Intake Reports');
    await sleep(350);
    await cdp.shot('8-reports-dark.png');
    await cdp.eval(`(() => {
      const trash = document.querySelector('button[aria-label^="Delete report"]');
      if (trash) trash.click();
      return trash ? 'opened' : 'none';
    })()`);
    await sleep(400);
    await cdp.shot('9-delete-dialog-dark.png');

    console.log(
      JSON.stringify(
        {
          checked: report.placements.length,
          pages: report.pages,
          viewports: report.viewports,
          sample: report.placements.slice(0, 2),
        },
        null,
        2,
      ),
    );
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
