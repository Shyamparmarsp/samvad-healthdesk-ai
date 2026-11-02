import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const PARITY_DIR = resolve(ROOT_DIR, 'docs/design-parity');
const DESIGN_DIR = resolve(ROOT_DIR, 'docs/design');

if (!existsSync(PARITY_DIR)) {
  mkdirSync(PARITY_DIR, { recursive: true });
}

const PORT = 4178;
const CDP_PORT = 9233;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    return res.result?.value;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await sleep(700);
  }

  async setViewport(width, height, isMobile) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile,
    });
    await sleep(250);
  }

  async captureScreenshot(destPath, clip = null) {
    const params = { format: 'png' };
    if (clip) {
      params.clip = clip;
    }
    const res = await this.send('Page.captureScreenshot', params);
    const buffer = Buffer.from(res.data, 'base64');
    writeFileSync(destPath, buffer);
    console.log(`  ✓ Saved screenshot: ${destPath}`);
  }

  async waitForText(matcher, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const text = await this.eval('document.body.innerText || ""');
      const ok = typeof matcher === 'string' ? text.includes(matcher) : matcher.test(text);
      if (ok) return text;
      await sleep(150);
    }
    const current = await this.eval('document.body.innerText || ""');
    throw new Error(`Timed out waiting for ${matcher}. Body: ${current.slice(0, 150)}`);
  }

  async close() {
    this.ws.close();
  }
}

async function main() {
  console.log('=== Capturing Visual Evidence for Owner Acceptance (commit ff9b8cb) ===');

  // 1. Start Vite Preview Server
  console.log(`[1] Starting Vite preview on port ${PORT}`);
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
  });

  let serverUp = false;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.ok) {
        serverUp = true;
        break;
      }
    } catch {}
    await sleep(200);
  }
  if (!serverUp) throw new Error('Vite preview server failed to start');
  console.log('  ✓ Vite preview server is up');

  // 2. Launch Chrome Headless
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const tmpProfile = `/tmp/cdp-parity-profile-${Date.now()}`;
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmpProfile}`,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
    { stdio: 'ignore' },
  );

  let cdpReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        cdpReady = true;
        break;
      }
    } catch {}
    await sleep(200);
  }
  if (!cdpReady) throw new Error('Chrome CDP failed to start');
  console.log('  ✓ Chrome CDP is connected');

  const targetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' });
  const target = await targetRes.json();
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const p1ImplPath = resolve(PARITY_DIR, 'P1-welcome-implementation.png');
  const p3ImplPath = resolve(PARITY_DIR, 'P3-conversation-implementation.png');
  const d2ImplPath = resolve(PARITY_DIR, 'D2-dashboard-implementation.png');
  const d4ImplPath = resolve(PARITY_DIR, 'D4-report-detail-implementation.png');

  try {
    // -------------------------------------------------------------------------
    // Screen 1: Patient Welcome (Node 72:2, Viewport 390x844)
    // -------------------------------------------------------------------------
    console.log('[2] Capturing Patient Welcome (390x844)...');
    await cdp.setViewport(390, 844, true);
    await cdp.navigate(`http://127.0.0.1:${PORT}/`);
    await cdp.waitForText('Start Talking');
    await sleep(400);
    await cdp.captureScreenshot(p1ImplPath);

    // -------------------------------------------------------------------------
    // Screen 2: Patient Conversation (Node 72:66, Viewport 390x844)
    // -------------------------------------------------------------------------
    console.log('[3] Capturing Patient Conversation (390x844)...');
    await cdp.setViewport(390, 844, true);
    await cdp.navigate(`http://127.0.0.1:${PORT}/`);
    await sleep(200);
    await cdp.eval(`sessionStorage.setItem('FIGMA_PARITY_P3_FIXTURE', '1')`);
    await cdp.navigate(`http://127.0.0.1:${PORT}/`);
    await cdp.waitForText(/How would you describe the pain|describe your headache/i);
    await sleep(500);
    await cdp.captureScreenshot(p3ImplPath);
    await cdp.eval(`sessionStorage.removeItem('FIGMA_PARITY_P3_FIXTURE')`);

    // -------------------------------------------------------------------------
    // Screen 3: Doctor Dashboard (Node 74:24, Viewport 1280x820)
    // -------------------------------------------------------------------------
    console.log('[4] Capturing Doctor Dashboard (1280x820)...');
    await cdp.setViewport(1280, 820, false);
    await cdp.navigate(`http://127.0.0.1:${PORT}/doctor`);
    await sleep(200);
    await cdp.eval(`sessionStorage.setItem('FIGMA_PARITY_FIXTURE', '1')`);
    await cdp.waitForText(/Evaluator Access|Doctor Login/i);
    await sleep(300);
    // Click Dr. Aditi Rao demo identity and login
    await cdp.eval(`
      (() => {
        const aditiBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Dr. Aditi Rao'));
        if (aditiBtn) aditiBtn.click();
        const form = document.querySelector('form');
        if (form) {
          const submitBtn = form.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.click();
        }
      })()
    `);
    await sleep(700);
    await cdp.waitForText(/Dr. Aditi Rao/i);
    await sleep(500);
    await cdp.captureScreenshot(d2ImplPath);

    // -------------------------------------------------------------------------
    // Screen 4: Doctor Report Detail (Node 74:220, Viewport 1280x820)
    // -------------------------------------------------------------------------
    console.log('[5] Capturing Doctor Report Detail (1280x820)...');
    // Click on Aarav Sharma in recent reports
    await cdp.eval(`
      (() => {
        const rows = Array.from(document.querySelectorAll('div[role="button"]'));
        const aaravCard = rows.find(c => c.innerText.includes('Aarav Sharma'));
        if (aaravCard) {
          aaravCard.click();
        } else {
          const repNav = Array.from(document.querySelectorAll('nav button, a')).find(b => b.innerText.includes('Reports'));
          if (repNav) repNav.click();
        }
      })()
    `);
    await sleep(700);
    // If landed on reports list, click first row
    const isDetailMounted = await cdp.eval(`Boolean(document.querySelector('button') && document.body.innerText.includes('Patient Report'))`);
    if (!isDetailMounted) {
      await cdp.eval(`
        (() => {
          const rows = Array.from(document.querySelectorAll('tbody tr'));
          if (rows.length > 0) rows[0].click();
        })()
      `);
      await sleep(700);
    }
    await cdp.waitForText(/Patient Report/i);
    await sleep(500);
    await cdp.captureScreenshot(d4ImplPath);

    // -------------------------------------------------------------------------
    // Generate Side-by-Side Comparison HTML Renderings
    // -------------------------------------------------------------------------
    console.log('[6] Generating Side-by-Side Parity Comparison Images...');

    const renderComparison = async ({
      title,
      nodeId,
      viewportStr,
      figmaImgPath,
      implImgPath,
      outputPath,
      width,
      height,
      canvasWidth,
      canvasHeight,
    }) => {
      const figmaBase64 = readFileSync(figmaImgPath).toString('base64');
      const implBase64 = readFileSync(implImgPath).toString('base64');

      const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0b1120;
    color: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", "Segoe UI", Roboto, sans-serif;
    padding: 32px;
    display: inline-block;
  }
  .header-card {
    background: rgba(30, 41, 59, 0.7);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 18px;
    padding: 20px 28px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .title-area h1 {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #ffffff;
  }
  .title-area p {
    font-size: 13px;
    color: #94a3b8;
    margin-top: 4px;
  }
  .meta-badges {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .badge {
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .badge-figma {
    background: rgba(99, 102, 241, 0.2);
    border: 1px solid #818cf8;
    color: #c7d2fe;
  }
  .badge-impl {
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid #34d399;
    color: #a7f3d0;
  }
  .badge-commit {
    background: rgba(244, 63, 94, 0.18);
    border: 1px solid #fb7185;
    color: #fecdd3;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  .comparison-grid {
    display: flex;
    gap: 32px;
    align-items: flex-start;
  }
  .column {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .column-label-card {
    width: 100%;
    padding: 12px 18px;
    margin-bottom: 14px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
    font-size: 13px;
  }
  .col-figma {
    background: rgba(99, 102, 241, 0.15);
    border: 1px solid rgba(129, 140, 248, 0.4);
    color: #e0e7ff;
  }
  .col-impl {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(52, 211, 153, 0.4);
    color: #d1fae5;
  }
  .image-wrapper {
    width: ${width}px;
    height: ${height}px;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.15);
    background: #dde3ee;
  }
  .image-wrapper img {
    width: ${width}px;
    height: ${height}px;
    display: block;
    object-fit: cover;
  }
</style>
</head>
<body>
  <div class="header-card" style="width: ${width * 2 + 32}px;">
    <div class="title-area">
      <h1>${title} — Visual Parity Verification</h1>
      <p>Figma Node: ${nodeId} · Standard Viewport: ${viewportStr}</p>
    </div>
    <div class="meta-badges">
      <span class="badge badge-figma">Original Figma Reference (Left)</span>
      <span class="badge badge-impl">Running Implementation (Right)</span>
      <span class="badge badge-commit">commit ff9b8cb</span>
    </div>
  </div>

  <div class="comparison-grid">
    <!-- Left: Original Figma Reference -->
    <div class="column">
      <div class="column-label-card col-figma" style="width: ${width}px;">
        <span>ORIGINAL FIGMA DESIGN REFERENCE</span>
        <span>${viewportStr}</span>
      </div>
      <div class="image-wrapper">
        <img src="data:image/png;base64,${figmaBase64}" />
      </div>
    </div>

    <!-- Right: Actual Implemented Screen -->
    <div class="column">
      <div class="column-label-card col-impl" style="width: ${width}px;">
        <span>RUNNING CHROME IMPLEMENTATION (commit ff9b8cb)</span>
        <span>${viewportStr}</span>
      </div>
      <div class="image-wrapper">
        <img src="data:image/png;base64,${implBase64}" />
      </div>
    </div>
  </div>
</body>
</html>`;

      const tmpHtmlPath = `/tmp/parity-comp-${Date.now()}.html`;
      writeFileSync(tmpHtmlPath, htmlContent);

      await cdp.setViewport(canvasWidth, canvasHeight, false);
      await cdp.navigate(`file://${tmpHtmlPath}`);
      await sleep(400);

      const bodyRect = await cdp.eval(`(() => {
        const r = document.body.getBoundingClientRect();
        return { x: 0, y: 0, width: Math.ceil(r.width + 64), height: Math.ceil(r.height + 64) };
      })()`);

      await cdp.setViewport(bodyRect.width, bodyRect.height, false);
      await sleep(200);
      await cdp.captureScreenshot(outputPath, {
        x: 0,
        y: 0,
        width: bodyRect.width,
        height: bodyRect.height,
        scale: 1,
      });
    };

    // Comparison 1: P1 Welcome (390x844)
    console.log('[7] Rendering P1-welcome-comparison.png...');
    await renderComparison({
      title: 'Patient Welcome Screen',
      nodeId: '72:2',
      viewportStr: '390 × 844',
      figmaImgPath: resolve(DESIGN_DIR, 'P1-welcome.png'),
      implImgPath: p1ImplPath,
      outputPath: resolve(PARITY_DIR, 'P1-welcome-comparison.png'),
      width: 390,
      height: 844,
      canvasWidth: 900,
      canvasHeight: 1100,
    });

    // Comparison 2: P3 Conversation (390x844)
    console.log('[8] Rendering P3-conversation-comparison.png...');
    await renderComparison({
      title: 'Patient Conversation Screen (Turn 1 Intake)',
      nodeId: '72:66',
      viewportStr: '390 × 844',
      figmaImgPath: resolve(DESIGN_DIR, 'P3-conversation.png'),
      implImgPath: p3ImplPath,
      outputPath: resolve(PARITY_DIR, 'P3-conversation-comparison.png'),
      width: 390,
      height: 844,
      canvasWidth: 900,
      canvasHeight: 1100,
    });

    // Comparison 3: D2 Dashboard (1280x820)
    console.log('[9] Rendering D2-dashboard-comparison.png...');
    await renderComparison({
      title: 'Doctor Portal Dashboard Overview',
      nodeId: '74:24',
      viewportStr: '1280 × 820',
      figmaImgPath: resolve(DESIGN_DIR, 'D2-dashboard.png'),
      implImgPath: d2ImplPath,
      outputPath: resolve(PARITY_DIR, 'D2-dashboard-comparison.png'),
      width: 1280,
      height: 820,
      canvasWidth: 2700,
      canvasHeight: 1150,
    });

    // Comparison 4: D4 Report Detail (1280x820)
    console.log('[10] Rendering D4-report-detail-comparison.png...');
    await renderComparison({
      title: 'Doctor Portal Patient Report Detail',
      nodeId: '74:220',
      viewportStr: '1280 × 820',
      figmaImgPath: resolve(DESIGN_DIR, 'D4-report-detail.png'),
      implImgPath: d4ImplPath,
      outputPath: resolve(PARITY_DIR, 'D4-report-detail-comparison.png'),
      width: 1280,
      height: 820,
      canvasWidth: 2700,
      canvasHeight: 1150,
    });

    // -------------------------------------------------------------------------
    // Generate All Screens Overview (all-screens-overview.png)
    // -------------------------------------------------------------------------
    console.log('[11] Rendering all-screens-overview.png...');
    const allScreensHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #090e17;
    color: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", "Segoe UI", Roboto, sans-serif;
    padding: 36px;
    width: 2720px;
  }
  .hero-card {
    background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 20px;
    padding: 24px 36px;
    margin-bottom: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .hero-card h1 {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #ffffff;
  }
  .hero-card p {
    font-size: 15px;
    color: #94a3b8;
    margin-top: 6px;
  }
  .badges {
    display: flex;
    gap: 12px;
  }
  .badge {
    padding: 8px 18px;
    border-radius: 9999px;
    font-size: 13px;
    font-weight: 600;
  }
  .badge-figma { background: rgba(99, 102, 241, 0.2); border: 1px solid #818cf8; color: #c7d2fe; }
  .badge-impl { background: rgba(16, 185, 129, 0.2); border: 1px solid #34d399; color: #a7f3d0; }
  .badge-commit { background: rgba(244, 63, 94, 0.18); border: 1px solid #fb7185; color: #fecdd3; font-family: monospace; }

  .section-title {
    font-size: 18px;
    font-weight: 700;
    color: #cbd5e1;
    margin: 28px 0 16px 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .section-title::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 18px;
    background: #3b82f6;
    border-radius: 3px;
  }

  .patient-row {
    display: flex;
    gap: 28px;
    justify-content: flex-start;
  }
  .pair-card {
    background: rgba(30, 41, 59, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 18px;
    padding: 20px;
    display: flex;
    gap: 20px;
  }
  .item-col {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .item-label {
    width: 100%;
    padding: 8px 14px;
    margin-bottom: 10px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.03em;
    display: flex;
    justify-content: space-between;
  }
  .label-figma { background: rgba(99, 102, 241, 0.2); color: #c7d2fe; border: 1px solid rgba(129, 140, 248, 0.3); }
  .label-impl { background: rgba(16, 185, 129, 0.2); color: #a7f3d0; border: 1px solid rgba(52, 211, 153, 0.3); }

  .mobile-img {
    width: 390px;
    height: 844px;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 20px 35px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.12);
    display: block;
  }

  .desktop-row {
    display: flex;
    flex-direction: column;
    gap: 28px;
  }
  .desktop-pair-card {
    background: rgba(30, 41, 59, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 18px;
    padding: 20px;
    display: flex;
    gap: 24px;
  }
  .desktop-img {
    width: 1280px;
    height: 820px;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 20px 35px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.12);
    display: block;
  }
</style>
</head>
<body>
  <div class="hero-card">
    <div>
      <h1>Samvad HealthDesk AI — Complete Visual Parity Overview</h1>
      <p>Original Owner Figma Designs vs. Running Production Implementation · Exact 1:1 Pixel Dimensions</p>
    </div>
    <div class="badges">
      <span class="badge badge-figma">Original Figma Reference (Left)</span>
      <span class="badge badge-impl">Running Implementation (Right)</span>
      <span class="badge badge-commit">commit ff9b8cb</span>
    </div>
  </div>

  <div class="section-title">Patient Intake Journey (Mobile Viewport: 390 × 844)</div>
  <div class="patient-row">
    <!-- Screen 1: Welcome -->
    <div class="pair-card">
      <div class="item-col">
        <div class="item-label label-figma" style="width: 390px;">
          <span>P1: WELCOME SCREEN (FIGMA 72:2)</span>
          <span>390 × 844</span>
        </div>
        <img class="mobile-img" src="data:image/png;base64,${readFileSync(resolve(DESIGN_DIR, 'P1-welcome.png')).toString('base64')}" />
      </div>
      <div class="item-col">
        <div class="item-label label-impl" style="width: 390px;">
          <span>P1: RUNNING IMPLEMENTATION (ff9b8cb)</span>
          <span>390 × 844</span>
        </div>
        <img class="mobile-img" src="data:image/png;base64,${readFileSync(p1ImplPath).toString('base64')}" />
      </div>
    </div>

    <!-- Screen 2: Conversation -->
    <div class="pair-card">
      <div class="item-col">
        <div class="item-label label-figma" style="width: 390px;">
          <span>P3: CONVERSATION (FIGMA 72:66)</span>
          <span>390 × 844</span>
        </div>
        <img class="mobile-img" src="data:image/png;base64,${readFileSync(resolve(DESIGN_DIR, 'P3-conversation.png')).toString('base64')}" />
      </div>
      <div class="item-col">
        <div class="item-label label-impl" style="width: 390px;">
          <span>P3: RUNNING IMPLEMENTATION (ff9b8cb)</span>
          <span>390 × 844</span>
        </div>
        <img class="mobile-img" src="data:image/png;base64,${readFileSync(p3ImplPath).toString('base64')}" />
      </div>
    </div>
  </div>

  <div class="section-title">Doctor Portal Screens (Desktop Viewport: 1280 × 820)</div>
  <div class="desktop-row">
    <!-- Screen 3: Doctor Dashboard -->
    <div class="desktop-pair-card">
      <div class="item-col">
        <div class="item-label label-figma" style="width: 1280px;">
          <span>D2: DOCTOR DASHBOARD (FIGMA 74:24)</span>
          <span>1280 × 820</span>
        </div>
        <img class="desktop-img" src="data:image/png;base64,${readFileSync(resolve(DESIGN_DIR, 'D2-dashboard.png')).toString('base64')}" />
      </div>
      <div class="item-col">
        <div class="item-label label-impl" style="width: 1280px;">
          <span>D2: RUNNING IMPLEMENTATION (ff9b8cb)</span>
          <span>1280 × 820</span>
        </div>
        <img class="desktop-img" src="data:image/png;base64,${readFileSync(d2ImplPath).toString('base64')}" />
      </div>
    </div>

    <!-- Screen 4: Doctor Report Detail -->
    <div class="desktop-pair-card">
      <div class="item-col">
        <div class="item-label label-figma" style="width: 1280px;">
          <span>D4: DOCTOR REPORT DETAIL (FIGMA 74:220)</span>
          <span>1280 × 820</span>
        </div>
        <img class="desktop-img" src="data:image/png;base64,${readFileSync(resolve(DESIGN_DIR, 'D4-report-detail.png')).toString('base64')}" />
      </div>
      <div class="item-col">
        <div class="item-label label-impl" style="width: 1280px;">
          <span>D4: RUNNING IMPLEMENTATION (ff9b8cb)</span>
          <span>1280 × 820</span>
        </div>
        <img class="desktop-img" src="data:image/png;base64,${readFileSync(d4ImplPath).toString('base64')}" />
      </div>
    </div>
  </div>
</body>
</html>`;

    const allScreensHtmlPath = `/tmp/parity-all-${Date.now()}.html`;
    writeFileSync(allScreensHtmlPath, allScreensHtml);

    await cdp.setViewport(2760, 3100, false);
    await cdp.navigate(`file://${allScreensHtmlPath}`);
    await sleep(600);

    const allRect = await cdp.eval(`(() => {
      const r = document.body.getBoundingClientRect();
      return { x: 0, y: 0, width: Math.ceil(r.width + 64), height: Math.ceil(r.height + 64) };
    })()`);

    await cdp.setViewport(allRect.width, allRect.height, false);
    await sleep(250);
    await cdp.captureScreenshot(resolve(PARITY_DIR, 'all-screens-overview.png'), {
      x: 0,
      y: 0,
      width: allRect.width,
      height: allRect.height,
      scale: 1,
    });

    console.log('✓ All parity evidence images successfully generated in docs/design-parity!');
  } finally {
    await cdp.close();
    chrome.kill();
    preview.kill();
  }
}

main().catch((err) => {
  console.error('Failed to generate parity evidence:', err);
  process.exit(1);
});

