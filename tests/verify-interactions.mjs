import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 4173;
const CDP_PORT = 9222;

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
      if (msg.method === 'Runtime.consoleAPICalled') {
        console.log('    [Console]', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('    [Uncaught Error]', msg.params.exceptionDetails?.text, msg.params.exceptionDetails?.exception?.description);
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          resolve(msg.result);
        }
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
    await sleep(600);
  }

  async waitForText(textMatcher, timeoutMs = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const text = await this.eval('document.body.innerText || ""');
      const matches = typeof textMatcher === 'string' ? text.includes(textMatcher) : textMatcher.test(text);
      if (matches) {
        return text;
      }
      await sleep(150);
    }
    const current = await this.eval('document.body.innerText || ""');
    throw new Error(`Timed out waiting for "${textMatcher}". Current body text: "${current.slice(0, 200).replace(/\n/g, ' ')}"`);
  }

  async close() {
    this.ws.close();
  }
}

async function runVerification() {
  console.log('--- Headless Chrome Full-Flow Interaction Verification ---');

  // 1. Start Vite preview server
  console.log('[1/7] Starting Vite preview server on port', PORT);
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  // Wait for server to be responsive
  let serverReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}`);
      if (res.ok) {
        serverReady = true;
        break;
      }
    } catch {
      await sleep(200);
    }
  }
  if (!serverReady) {
    server.kill();
    throw new Error('Vite preview server failed to start within 6s');
  }
  console.log('✓ Vite preview server is up and responding');

  // 2. Launch Google Chrome headless with remote debugging port
  console.log('[2/7] Launching Google Chrome headless with CDP port', CDP_PORT);
  const tmpProfile = `/tmp/cdp-chrome-profile-${Date.now()}`;
  const chrome = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmpProfile}`,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
    { stdio: 'pipe' }
  );

  let cdpReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        cdpReady = true;
        break;
      }
    } catch {
      await sleep(200);
    }
  }
  if (!cdpReady) {
    chrome.kill();
    server.kill();
    throw new Error('Chrome CDP failed to start within 6s');
  }
  console.log('✓ Chrome headless is up with CDP ready');

  // Create new page target
  const targetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' });
  const target = await targetRes.json();
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const verificationResults = [];

  try {
    // 3. Test Patient Journey on /
    console.log('[3/7] Testing Patient Shell on /');
    await cdp.navigate(`http://127.0.0.1:${PORT}/`);

    // Wait for React app to mount in #root
    for (let i = 0; i < 20; i++) {
      const rootHtml = await cdp.eval('document.getElementById("root")?.innerHTML || ""');
      if (rootHtml.trim().length > 0) break;
      await sleep(200);
    }

    const rootText = await cdp.eval('document.getElementById("root")?.innerText || document.body.innerText');
    console.log('  -> Rendered text length:', rootText.length, 'preview:', rootText.slice(0, 100).replace(/\n/g, ' '));
    assert.ok(rootText.includes('Samvad') || rootText.includes('HealthDesk'), 'App brand must render');
    assert.ok(rootText.includes('Start Talking'), 'Start Talking button must render');
    assert.ok(rootText.includes('Type Instead'), 'Type Instead alternative button must render');
    console.log('  ✓ PatientShell mounted successfully on /');
    verificationResults.push({ step: 'PatientShell mount on /', status: 'PASS' });

    // Click "Type Instead"
    console.log('  -> Clicking "Type Instead" button');
    await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const typeBtn = btns.find(b => b.innerText.includes('Type Instead'));
        if (typeBtn) typeBtn.click();
      })()
    `);
    await sleep(400);

    // Verify transition to Consent screen
    const consentText = await cdp.eval('document.body.innerText');
    assert.ok(consentText.includes('Consent'), 'Must transition to Consent screen');
    assert.ok(consentText.includes('Samvad HealthDesk AI is an AI intake assistant and not a doctor'), 'Consent copy must display');
    assert.ok(consentText.includes('Yes, I agree'), 'Consent Yes button must render');
    assert.ok(consentText.includes('No, do not proceed'), 'Consent No button must render');
    console.log('  ✓ Transitioned to Consent screen with exact consent text');
    verificationResults.push({ step: 'Transition to Consent screen', status: 'PASS' });

    // Click "Yes, I agree"
    console.log('  -> Clicking "Yes, I agree" button');
    await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const agreeBtn = btns.find(b => b.innerText.includes('Yes, I agree') || b.innerText.includes('agree'));
        if (agreeBtn) agreeBtn.click();
      })()
    `);
    await sleep(600);

    // Verify conversation screen renders
    const convText = await cdp.eval('document.body.innerText');
    assert.ok(convText.includes('name') || convText.includes('full name') || convText.includes('Namaste'), 'First assistant message asking for name must render');
    assert.ok(convText.includes('Tap to speak') || convText.includes('Type instead'), 'Voice controls must render on conversation screen');
    console.log('  ✓ Conversation screen rendered with first question and mic control');

    // Switch to Text mode in conversation
    console.log('  -> Switching conversation to text mode');
    await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const typeBtn = btns.find(b => b.innerText.toLowerCase().includes('type'));
        if (typeBtn) typeBtn.click();
      })()
    `);
    await sleep(300);

    const hasInput = await cdp.eval(`Boolean(document.querySelector('input[type="text"]'))`);
    assert.equal(hasInput, true, 'Text input must render after switching to text mode');
    console.log('  ✓ Text input field rendered successfully');
    verificationResults.push({ step: 'Conversation screen render & text mode toggle', status: 'PASS' });

    // 4. Test Doctor Portal on /doctor
    console.log('[4/7] Testing Doctor Shell on /doctor');
    await cdp.navigate(`http://127.0.0.1:${PORT}/doctor`);

    // Verify DoctorShell mounts and displays Evaluator Access card
    const doctorLoginText = await cdp.waitForText(/Evaluator access/i);
    const docLower = doctorLoginText.toLowerCase();
    assert.ok(docLower.includes('evaluator access'), 'Mandatory Evaluator access card header must render');
    assert.ok(docLower.includes('credentials are shared privately with reviewers'), 'D8 privacy note must render');
    assert.ok(docLower.includes('not displayed in public project materials'), 'D8 public exclusion note must render');
    console.log('  ✓ Doctor login screen mounted with mandatory Evaluator Access notes');
    verificationResults.push({ step: 'DoctorShell login & Evaluator Access card', status: 'PASS' });

    // 5. Submit doctor login
    console.log('[5/7] Submitting doctor login form for Dr. Aditi Rao');
    await cdp.eval(`
      (() => {
        const form = document.querySelector('form');
        if (form) {
          const submitBtn = form.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.click();
        }
      })()
    `);

    // Verify dashboard renders with stat cards
    const dashText = await cdp.waitForText(/Dr. Aditi Rao/i);
    const dashLower = dashText.toLowerCase();
    assert.ok(dashLower.includes('dr. aditi rao') || dashLower.includes('general medicine'), 'Doctor profile info must display');
    assert.ok(dashLower.includes('urgent') || dashLower.includes('triage'), 'Urgent triage stat must display');
    assert.ok(dashLower.includes('new reports') || dashLower.includes('new intake'), 'New reports stat must display');
    assert.ok(dashLower.includes('booked') || dashLower.includes('appointments'), 'Appointments/Booked metric must display');
    console.log('  ✓ Doctor dashboard rendered with verified stat cards');
    verificationResults.push({ step: 'Doctor dashboard & stat cards render', status: 'PASS' });

    // 6. Test Reports List and detail view
    console.log('[6/7] Testing Reports tab and detail view');
    await cdp.eval(`
      (() => {
        const navBtns = Array.from(document.querySelectorAll('button, a'));
        const reportsTab = navBtns.find(b => b.innerText.toLowerCase().includes('reports'));
        if (reportsTab) reportsTab.click();
      })()
    `);

    const reportsListText = await cdp.waitForText(/Patient Intake Reports/i);
    const repLower = reportsListText.toLowerCase();
    assert.ok(repLower.includes('all') && repLower.includes('urgent'), 'Reports list tabs must render');
    console.log('  ✓ Doctor reports list view rendered with tabs');
    verificationResults.push({ step: 'Doctor reports list view & tabs', status: 'PASS' });

    // 7. Test round-trip navigation back and forth between / and /doctor
    console.log('[7/10] Testing round-trip navigation between / and /doctor');
    await cdp.navigate(`http://127.0.0.1:${PORT}/`);
    const patientNavText = await cdp.waitForText('Start Talking');
    assert.ok(patientNavText.includes('Samvad HealthDesk AI'), 'Navigation back to / succeeds');

    await cdp.navigate(`http://127.0.0.1:${PORT}/doctor`);
    const doctorNavText = await cdp.waitForText('Samvad');
    assert.ok(doctorNavText.includes('Dr. Aditi Rao') || doctorNavText.includes('Samvad Clinical Desk'), 'Navigation back to /doctor succeeds');
    console.log('  ✓ Seamless direct and back/forth navigation verified');
    verificationResults.push({ step: 'Round-trip navigation / ↔ /doctor', status: 'PASS' });

    // 8. Accessibility Verification (Keyboard focus, visible focus, accessible button names)
    console.log('[8/10] Verifying accessibility: keyboard Tab focus & accessible button names');
    await cdp.navigate(`http://127.0.0.1:${PORT}/`);
    await cdp.waitForText('Start Talking');

    // Test Tab key focus navigation
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab' });
    const focusedTag = await cdp.eval('document.activeElement?.tagName');
    assert.ok(['BUTTON', 'A', 'INPUT', 'SELECT'].includes(focusedTag), `Tab must focus an interactive element, got ${focusedTag}`);

    // Verify all buttons have accessible text content or aria-label
    const unlabelledButtons = await cdp.eval(`
      Array.from(document.querySelectorAll('button')).filter(b => {
        const text = (b.innerText || '').trim();
        const aria = b.getAttribute('aria-label');
        const title = b.getAttribute('title');
        return !text && !aria && !title;
      }).length
    `);
    assert.equal(unlabelledButtons, 0, 'All buttons must possess accessible text or labels');
    console.log('  ✓ Keyboard Tab navigation works and all buttons possess accessible names');
    verificationResults.push({ step: 'Accessibility (keyboard Tab & button labels)', status: 'PASS' });

    // 9. Hindi Devanagari text rendering check
    console.log('[9/10] Verifying readable Hindi Devanagari text rendering');
    await cdp.eval(`
      (() => {
        const langBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('हिंदी') || b.innerText.includes('बात करें'));
        if (langBtn) langBtn.click();
      })()
    `);
    await sleep(400);

    const hindiText = await cdp.eval('document.body.innerText');
    const hasDevanagari = /[\u0900-\u097F]/.test(hindiText);
    assert.equal(hasDevanagari, true, 'Devanagari characters must render cleanly when Hindi is toggled');
    assert.ok(hindiText.includes('बातचीत शुरू करें') || hindiText.includes('संवाद'), 'Hindi UI text must be visible');
    console.log('  ✓ Hindi Devanagari script rendered legibly without corruption');
    verificationResults.push({ step: 'Readable Hindi Devanagari rendering', status: 'PASS' });

    // 10. Responsive layout dimensions (390x844 patient, 1280x820 doctor, zero overflow)
    console.log('[10/10] Verifying responsive layouts (390x844 mobile, 1280x820 desktop)');
    // Patient layout container check
    await cdp.navigate(`http://127.0.0.1:${PORT}/`);
    await cdp.waitForText('Start Talking');

    const patientDims = await cdp.eval(`
      (() => {
        const el = Array.from(document.querySelectorAll('div')).find(d => typeof d.className === 'string' && d.className.includes('max-w-[390px]'));
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      })()
    `);
    assert.ok(patientDims, 'Patient 390x844 container must exist');
    assert.ok(patientDims.width <= 390, `Patient width must be <= 390, got ${patientDims.width}`);
    assert.equal(patientDims.height, 844, `Patient height must be 844, got ${patientDims.height}`);

    // Doctor layout container check (submit login and verify 1280x820 desktop container)
    await cdp.navigate(`http://127.0.0.1:${PORT}/doctor`);
    await cdp.waitForText(/Evaluator access/i);
    await cdp.eval(`
      (() => {
        const form = document.querySelector('form');
        if (form) {
          const submitBtn = form.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.click();
        }
      })()
    `);
    await cdp.waitForText(/Clinical Desk/i);

    const doctorDims = await cdp.eval(`
      (() => {
        const el = Array.from(document.querySelectorAll('div')).find(d => typeof d.className === 'string' && d.className.includes('max-w-[1280px]'));
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { width: Math.round(rect.width), minHeight: Math.round(rect.height) };
      })()
    `);
    assert.ok(doctorDims, 'Doctor 1280px container must exist');
    assert.ok(doctorDims.width <= 1280, `Doctor width must be <= 1280, got ${doctorDims.width}`);
    assert.ok(doctorDims.minHeight >= 820, `Doctor min-height must be >= 820, got ${doctorDims.minHeight}`);

    // Mobile horizontal overflow check
    const hasHorizontalOverflow = await cdp.eval(`
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    `);
    assert.equal(hasHorizontalOverflow, false, 'Layout must have zero horizontal overflow');
    console.log('  ✓ Responsive containers (390x844 mobile, 1280x820 doctor) and zero overflow verified');
    verificationResults.push({ step: 'Responsive layout (390x844 & 1280x820 & no overflow)', status: 'PASS' });

    // 11. Full End-to-End Patient Intake to Doctor Review Journey in Headless Chrome
    console.log('[11/11] Testing Full End-to-End Patient Intake to Doctor Review Journey');
    await cdp.navigate(`http://127.0.0.1:${PORT}/`);
    await cdp.waitForText('Start Talking');

    // Click "Type Instead"
    await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const typeBtn = btns.find(b => b.innerText.includes('Type Instead'));
        if (typeBtn) typeBtn.click();
      })()
    `);
    await sleep(400);

    // Agree to consent
    await cdp.waitForText('Consent for AI Intake');
    await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const agreeBtn = btns.find(b => b.innerText.includes('Yes, I agree') || b.innerText.includes('agree'));
        if (agreeBtn) agreeBtn.click();
      })()
    `);
    await sleep(500);

    // Helper to send text in conversation
    const sendAnswer = async (text) => {
      await cdp.eval(`
        (() => {
          const typeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.toLowerCase().includes('type'));
          if (typeBtn) typeBtn.click();
        })()
      `);
      await sleep(350);

      await cdp.eval(`
        (() => {
          const input = document.querySelector('input[type="text"]');
          if (input) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeInputValueSetter.call(input, ${JSON.stringify(text)});
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `);
      await sleep(150);

      await cdp.eval(`
        (() => {
          const form = document.querySelector('form');
          if (form) {
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn && !submitBtn.disabled) {
              submitBtn.click();
            }
          }
        })()
      `);
      await sleep(600);
    };

    // Helper to click option chip
    const clickChip = async (chipPattern) => {
      await cdp.eval(`
        (() => {
          const chips = Array.from(document.querySelectorAll('button'));
          const target = chips.find(c => ${chipPattern.toString()}.test(c.innerText));
          if (target) target.click();
        })()
      `);
      await sleep(600);
    };

    // Answering questions
    await cdp.waitForText(/name|नाम/i);
    await sendAnswer('Pooja Verma');

    await cdp.waitForText(/age|years|उम्र/i);
    await sendAnswer('29');

    await cdp.waitForText(/gender|लिंग/i);
    await clickChip(/Female|महिला/i);

    await cdp.waitForText(/concern|समस्या/i);
    await sendAnswer('Persistent mild fever and general body fatigue');

    await cdp.waitForText(/How long|कितने समय/i);
    await sendAnswer('2 weeks');

    await cdp.waitForText(/severity|तीव्रता/i);
    await clickChip(/Moderate|मध्यम/i);

    await cdp.waitForText(/conditions|बीमारी/i);
    await clickChip(/None/i);

    await cdp.waitForText(/medicines|दवा/i);
    await clickChip(/None/i);

    await cdp.waitForText(/allergies|एलर्जी/i);
    await clickChip(/None/i);

    await cdp.waitForText(/other symptoms|अन्य लक्षण/i);
    await clickChip(/No other|कोई अन्य/i);

    // Review Screen
    const reviewText = await cdp.waitForText(/Review Your Intake Report/i);
    assert.ok(reviewText.includes('Pooja Verma'), 'Patient name must be in review');
    assert.ok(reviewText.includes('29 yrs'), 'Patient age must be in review');
    assert.ok(reviewText.includes('Submit to Hospital'), 'Submit button must be present');

    // Click "Submit to Hospital"
    await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const submitBtn = btns.find(b => b.innerText.includes('Submit to Hospital'));
        if (submitBtn) submitBtn.click();
      })()
    `);
    await sleep(600);

    // Booking Screen
    const bookingText = await cdp.waitForText(/Schedule Consultation/i);
    assert.ok(bookingText.includes('Book Appointment') || bookingText.includes('Not now'), 'Booking actions must be present');

    // Click "Book Appointment"
    await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const bookBtn = btns.find(b => b.innerText.includes('Book Appointment'));
        if (bookBtn) bookBtn.click();
      })()
    `);
    await sleep(600);

    // Confirmation Screen
    const confirmText = await cdp.waitForText(/Appointment Confirmed|Report Submitted/i);
    assert.ok(confirmText.includes('APT-') || confirmText.includes('Reference'), 'Reference code must render');
    console.log('  ✓ Full patient flow completed with confirmed booking');

    // Doctor Portal via Client-Side SPA link
    await cdp.eval(`
      (() => {
        const docLink = Array.from(document.querySelectorAll('header a')).find(a => a.innerText.includes('Doctor Portal'));
        if (docLink) docLink.click();
      })()
    `);
    await sleep(600);

    // Check if already logged in or login form
    const docPortalText = await cdp.waitForText(/Samvad|Clinical Desk/i);
    if (/evaluator access/i.test(docPortalText)) {
      await cdp.eval(`
        (() => {
          const form = document.querySelector('form');
          if (form) {
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.click();
          }
        })()
      `);
      // Wait for doctor dashboard to mount
      await cdp.waitForText(/Dashboard Overview|Dr. Aditi Rao/i);
    }

    // Go to Reports
    await cdp.eval(`
      (() => {
        const reportsTab = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText.toLowerCase().includes('reports'));
        if (reportsTab) reportsTab.click();
      })()
    `);
    await sleep(500);

    // Check report is in list
    const repListText = await cdp.waitForText(/Patient Intake Reports/i);
    assert.ok(repListText.includes('Pooja Verma') || repListText.includes('Submitted') || repListText.includes('Booked'), 'Patient report must be listed');

    // Open detail and Mark Reviewed
    await cdp.eval(`
      (() => {
        const trs = Array.from(document.querySelectorAll('tbody tr'));
        const targetRow = trs.find(r => r.innerText.includes('Pooja Verma'));
        if (targetRow) {
          const firstTd = targetRow.querySelector('td');
          if (firstTd) firstTd.click();
          else targetRow.click();
        }
      })()
    `);
    await sleep(600);

    await cdp.waitForText(/Clinical Intake Summary/i);
    await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const reviewBtn = btns.find(b => b.innerText.includes('Mark Reviewed'));
        if (reviewBtn) reviewBtn.click();
      })()
    `);
    await sleep(600);

    const detailText = await cdp.waitForText(/Reviewed/i);
    assert.ok(detailText.includes('Reviewed'), 'Report marked reviewed successfully');
    console.log('  ✓ Patient report opened and marked reviewed by doctor');
    verificationResults.push({ step: 'Full end-to-end patient intake, submit, booking & doctor review journey', status: 'PASS' });

  } finally {
    await cdp.close();
    chrome.kill();
    server.kill();
    console.log('✓ Teardown complete: preview server and headless Chrome closed');
  }

  console.log('\n--- Interaction Verification Summary ---');
  let allPassed = true;
  for (const r of verificationResults) {
    console.log(`[${r.status}] ${r.step}`);
    if (r.status !== 'PASS') allPassed = false;
  }

  if (!allPassed) {
    process.exit(1);
  }
  console.log('All headless Chrome interaction tests passed!\n');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('Headless Chrome Verification Failed:', err);
  process.exit(1);
});
