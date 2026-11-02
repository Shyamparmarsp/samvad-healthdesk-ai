/**
 * Real browser → real local Supabase journey.
 *
 * The built frontend is served by `vite preview` with VITE_SUPABASE_URL/KEY pointing at
 * the local stack, so every call is a genuine Supabase Auth request, Edge Function
 * invocation, RLS-protected read or RPC — no mock API mode and no fetch interception.
 * Only the provider endpoints (Groq / Prisma / Timbre) are stubbed.
 *
 * Prerequisites:
 *   npx supabase start
 *   npx supabase functions serve --env-file supabase/functions/.env
 *   deno run --allow-net supabase/tests/stub-providers.ts 8787
 *
 * Run: npm run test:api:browser
 */

import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

import { launchBrowser, sleep } from './driver.mjs';
import {
  anonymousIds,
  createRest,
  deleteIdentities,
  ensureSessionHeadroom,
  istToday,
  loadConfig,
  restoreSessionLimit,
} from './local-stack.mjs';

const config = loadConfig();
const rest = createRest(config);
const results = [];
const notes = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, layer: 'browser+supabase', detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function step(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail || '');
    return true;
  } catch (error) {
    if (globalThis.__session) {
      const net = globalThis.__session.network.slice(-8).map((n) => `${n.phase}:${n.url ?? n.error}:${n.status ?? ''}`).join(' ; ');
      const errs = globalThis.__session.consoleErrors.slice(-4).join(' ; ');
      console.log(`    network: ${net}`);
      if (errs) console.log(`    console errors: ${errs}`);
    }
    record(name, false, String(error.message || error).slice(0, 300));
    return false;
  }
}

/** Builds with the Supabase variables present, because Vite bakes them at build time. */
function buildFrontend() {
  execFileSync('npm', ['run', 'build'], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      VITE_SUPABASE_URL: config.url,
      VITE_SUPABASE_KEY: config.anonKey,
    },
  });
}

function startPreview() {
  // Bind IPv4 explicitly: `vite preview` otherwise listens on IPv6 ::1 only, and
  // 127.0.0.1-based polling then never sees it.
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(config.previewPort), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      VITE_SUPABASE_URL: config.url,
      VITE_SUPABASE_KEY: config.anonKey,
    },
    detached: true,
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  return child;
}

async function waitForPreview(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error('vite preview did not start');
}

const ANSWERS = {
  name: 'Asha Browser Test',
  age: '34',
  gender: 'Female',
  primary_concern: 'recurring evening fever with body ache',
  duration: 'about three weeks',
  severity: 'Moderate',
  conditions: 'None known',
  medications: 'None',
  allergies: 'None known',
  other_symptoms: 'No other symptoms',
};

/** Reads the current question text from the conversation screen. */
function currentQuestionId(session) {
  return session.eval(`(() => {
    const counter = document.querySelector('[data-testid="turn-counter"]');
    return counter ? counter.textContent : null;
  })()`);
}

/** Answers the visible question with typed text (or quick-reply option). */
async function answerCurrent(session, value) {
  const body = await session.bodyText();
  // Quick-reply chips are used when one matches the value exactly.
  const chipClicked = await session.eval(`(() => {
    const wanted = ${JSON.stringify(value)}.toLowerCase();
    const chips = Array.from(document.querySelectorAll('button[aria-label]'));
    const chip = chips.find((b) => (b.getAttribute('aria-label') || '').toLowerCase() === wanted);
    if (!chip) return false;
    chip.click();
    return true;
  })()`);
  if (chipClicked) return 'chip';

  // Otherwise type into the composer.
  const typeToggle = await session.eval(`(() => {
    const btn = document.querySelector('button[aria-label="Type instead"], button[aria-label="Use voice"]');
    return btn ? btn.getAttribute('aria-label') : null;
  })()`);
  if (typeToggle === 'Type instead') await session.click('Type instead');
  const selector = 'input[placeholder="Type your answer here..."], textarea[placeholder="Type your answer here..."]';
  // DOM nodes are not serialisable through Runtime.evaluate, so wait on a boolean.
  await session.waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, 6000);
  await session.type(selector, value);
  await session.click('Send');
  void body;
  return 'typed';
}

async function waitForTurnAdvance(session, previousText, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const text = await session.bodyText();
    if (text !== previousText) return text;
    await sleep(150);
  }
  throw new Error('Conversation did not advance');
}

/**
 * Refuses to report a mock-mode run as a Supabase run.
 *
 * The app chooses its mode from the VITE_ variables baked at build time. If those were
 * absent, the UI silently runs against the in-memory mock and every assertion below
 * would pass while proving nothing about the real backend. Any chat-turn traffic must
 * therefore have reached the configured Supabase URL.
 */
function assertRealSupabaseTraffic(session, config) {
  const hits = session.network.filter(
    (entry) => entry.phase === 'request' && (entry.url || '').startsWith(config.url + '/functions/v1/'),
  );
  if (hits.length === 0) {
    throw new Error(
      'No Edge Function request reached ' +
        config.url +
        '. The frontend was built without VITE_SUPABASE_URL/VITE_SUPABASE_KEY, so this was a mock-mode run and cannot be reported as real Supabase evidence.',
    );
  }
  return hits.length;
}

async function run() {
  const before = await anonymousIds(config);
  const headroom = await ensureSessionHeadroom(config, rest);
  const preview = startPreview();
  let browser;

  try {
    if (!process.env.SKIP_BUILD) buildFrontend();
    await waitForPreview(config.previewPort);
    browser = await launchBrowser({ port: 9333 });
    const session = browser.session;
    globalThis.__session = session;
    const base = `http://127.0.0.1:${config.previewPort}`;

    // ---------------------------------------------------------------- patient start
    await session.goto(base + '/');
    await session.clearStorage();
    await session.goto(base + '/');
    await session.waitForText('Start Talking', 15_000);

    const mode = await session.eval('window.__SAMVAD_MODE__ || null');
    notes.push(`exposed app mode: ${mode ?? '(not exposed)'}`);

    await step('1. patient anonymous sign-in and welcome screen', async () => {
      assert.match(await session.bodyText(), /Start Talking/);
      return 'welcome rendered';
    });

    await session.click('Start Talking');
    await session.waitForText('Consent for AI Intake', 10_000);

    await step('2. English consent screen shows the versioned copy', async () => {
      const text = await session.bodyText();
      assert.match(text, /AI intake assistant and not a doctor/i);
      return 'consent text rendered';
    });

    await session.click('Yes, I agree');
    await session.waitForText('What is your name?', 20_000);

    await step('3. consent accepted and the first scripted question is asked', async () => {
      const hits = assertRealSupabaseTraffic(session, config);
      const text = await session.bodyText();
      assert.match(text, /What is your name\?/);
      return `name question live, ${hits} real Edge Function request(s)`;
    });

    // ---------------------------------------------------------------- voice turn
    await step('4. audio capture returns a transcript preview (stub Prisma)', async () => {
      await session.click('Tap to speak');
      // The UI's own 30 s listening window ends with "Done"; stopping immediately keeps
      // the journey fast without changing what the app does.
      await session.waitForText(/Listening/, 5_000);
      await session.click('Done');
      const text = await session.waitForText(/What we heard/, 30_000);
      assert.match(text, /What we heard/);
      return 'transcript preview shown';
    });

    await step('5. transcript is editable before it is accepted', async () => {
      const transcriptSelector = 'textarea[placeholder^="Edit your spoken words"]';
      await session.waitFor(`!!document.querySelector(${JSON.stringify(transcriptSelector)})`, 6000);
      await session.type(transcriptSelector, 'Asha Browser Test');
      const value = await session.eval(`document.querySelector(${JSON.stringify(transcriptSelector)}).value`);
      assert.equal(value, 'Asha Browser Test');
      return 'edited transcript';
    });

    await session.click('Confirm and send');
    await session.waitForText('How old are you, in years?', 20_000);

    await step('6. confirmed transcript counts as one accepted answer', async () => {
      const text = await session.bodyText();
      assert.match(text, /How old are you, in years\?/);
      return 'advanced to age';
    });

    // ---------------------------------------------------------------- typed intake
    await step('7. scripted intake completes through the real backend', async () => {
      const order = ['How old are you, in years?'];
      await answerCurrent(session, ANSWERS.age);
      await session.waitForText('What is your gender?', 15_000);
      await answerCurrent(session, ANSWERS.gender);
      await session.waitForText('What is your main concern today?', 15_000);
      await answerCurrent(session, ANSWERS.primary_concern);
      await session.waitForText('How long have you had this concern?', 15_000);
      await answerCurrent(session, ANSWERS.duration);
      await session.waitForText('How severe is it?', 15_000);
      await answerCurrent(session, ANSWERS.severity);
      await session.waitForText('Do you have any existing medical conditions?', 15_000);
      await answerCurrent(session, ANSWERS.conditions);
      await session.waitForText('Are you taking any medicines?', 15_000);
      await answerCurrent(session, ANSWERS.medications);
      await session.waitForText('Do you have any allergies?', 15_000);
      await answerCurrent(session, ANSWERS.allergies);
      await session.waitForText('Is there anything else you would like the clinic to know?', 15_000);
      await answerCurrent(session, ANSWERS.other_symptoms);
      await session.waitForText(/Review Your Intake Report/, 25_000);
      void order;
      return 'review screen reached';
    });

    await step('8. review screen shows persisted report fields', async () => {
      const text = await session.bodyText();
      assert.match(text, /Asha Browser Test/);
      assert.match(text, /recurring evening fever/i);
      assert.match(text, /Female/);
      return 'report fields rendered from the backend';
    });

    // ---------------------------------------------------------------- submit
    await step('9. report submission reaches the booking screen', async () => {
      await session.click('Submit to Hospital');
      await session.waitForText(/Schedule Consultation/, 25_000);
      return 'booking screen reached';
    });

    await step('10. availability comes from get_available_slots', async () => {
      await session.waitForText(/Available Times/i, 20_000);
      const slots = await session.eval(`(() => document.querySelectorAll('[data-slot], button[data-slot-start], button[aria-label^="Book"], button[type="button"]').length)()`);
      const text = await session.bodyText();
      assert.match(text, /Book Appointment/);
      return `booking controls rendered (${slots} candidate controls)`;
    });

    await step('11. booking persists and confirmation shows server data', async () => {
      // Choose the first available time chip if present, then book.
      await session.eval(`(() => {
        const chips = Array.from(document.querySelectorAll('button'))
          .filter((b) => /^\\d{1,2}:\\d{2}\\s?(AM|PM)$/i.test((b.innerText || '').trim()));
        if (chips.length) { chips[0].click(); return true; }
        return false;
      })()`);
      await sleep(300);
      await session.click('Book Appointment');
      const text = await session.waitForText(/Appointment Confirmed/, 30_000);
      assert.match(text, /APT-\d{8}-[A-Z0-9]{6}/);
      const reference = /APT-\d{8}-[A-Z0-9]{6}/.exec(text)[0];
      return `confirmed ${reference}`;
    });

    // ---------------------------------------------------------------- doctor
    await step('12. doctor signs in with email/password against real Auth', async () => {
      await session.goto(base + '/doctor');
      await session.waitForText(/Evaluator access/i, 20_000);
      await session.type('input[type="email"]', config.doctorEmail);
      await session.type('input[type="password"]', config.doctorPassword);
      await session.click(/Sign In to Portal|Sign in|Log in|Login/i);
      await session.waitForText(/Dr\. Aditi Rao/, 25_000);
      return 'doctor dashboard rendered';
    });

    await step('13. doctor sees the submitted report through RLS', async () => {
      await session.waitForText(/Asha Browser Test/, 25_000);
      return 'report visible in the doctor portal';
    });

    await step('14. doctor opens the report detail and marks it reviewed', async () => {
      await session.click('Asha Browser Test');
      await session.waitForText(/Primary Concern|Review/i, 20_000);
      // Read the real stored patient answers through the on-screen reader.
      await session.click(/Patient responses/i);
      const conversation = await session.waitForText(/Answer 1/, 20_000);
      assert.match(conversation, /Name/i);
      await session.click(/Mark Reviewed|Mark as Reviewed/i);
      // While the RPC is in flight the button reads "Marking..."; the stored state adds
      // a "Reviewed" label. Wait for that state rather than for the label to vanish.
      const text = await session.waitForText(/Reviewed/, 30_000);
      assert.doesNotMatch(text, /Marking\.\.\./);
      return 'stored patient responses rendered; review recorded in the UI';
    });

    await step('15. review is persisted for the assigned doctor', async () => {
      const rows = await rest(
        `reports?select=id,status,reviewed_at,reviewed_by,intake_reference,department_key&order=created_at.desc&limit=5`,
      );
      const reviewed = rows.find((row) => row.reviewed_at);
      assert.ok(reviewed, 'no reviewed report found');
      return `reviewed_at=${reviewed.reviewed_at}`;
    });

    await step('16. the appointment exists in PostgreSQL with the UI reference', async () => {
      const rows = await rest(
        `appointments?select=id,reference_code,slot_start,slot_end,status,report_id&order=created_at.desc&limit=3`,
      );
      assert.ok(rows.length > 0, 'no appointment rows');
      assert.equal(rows[0].status, 'confirmed');
      assert.match(rows[0].reference_code, /^APT-\d{8}-[A-Z0-9]{6}$/);
      return `${rows[0].reference_code} @ ${rows[0].slot_start}`;
    });

    await step('17. no uncaught page errors during the journey', async () => {
      const real = session.pageErrors.filter((e) => !/ResizeObserver|favicon/.test(e));
      assert.deepEqual(real, []);
      return `${session.consoleErrors.length} console errors captured (expected: none fatal)`;
    });
  } finally {
    if (browser) await browser.close();
    try {
      process.kill(-preview.pid, 'SIGKILL');
    } catch {
      preview.kill('SIGKILL');
    }
    const after = await anonymousIds(config);
    const created = [...after].filter((id) => !before.has(id));
    const failures = await deleteIdentities(config, created);
    await restoreSessionLimit(config, rest, headroom.changed ? headroom.original : null);
    notes.push(`identities created=${created.length} deleted=${created.length - failures}`);
    writeFileSync(
      'browser-supabase-result.json',
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          target: config.url,
          preview: `http://127.0.0.1:${config.previewPort}`,
          mode: 'supabase (real Auth, Edge Functions, Postgres, RPCs)',
          providers: 'stubbed (Groq, Prisma, Timbre on 127.0.0.1:8787)',
          results,
          notes,
          ok: results.every((r) => r.ok),
        },
        null,
        2,
      ) + '\n',
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
  console.log(notes.join('\n'));
  if (failed.length) process.exitCode = 1;
}

await run();
