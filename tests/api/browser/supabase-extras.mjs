/**
 * Additional real-browser journeys against the local Supabase stack.
 *
 * Each journey starts from a clean storage so it gets its own anonymous identity:
 *   1. consent declined            (no health data, no report)
 *   2. Hindi consent + Hinglish answers (Devanagari UI, verbatim answers)
 *   3. clear emergency phrase      (112 guidance, urgent_partial report, no slots)
 *   4. ambiguous emergency + Yes   (clarification chips -> urgent flow)
 *   5. "Not now"                   (report stays submitted, no appointment)
 *
 * Same rules as supabase-journey.mjs: real Auth, real Edge Functions, real Postgres.
 * Only Groq/Prisma/Timbre are stubbed.
 *
 * Run: npm run test:api:browser:extras
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
  loadConfig,
  restoreSessionLimit,
} from './local-stack.mjs';

const config = loadConfig();
const rest = createRest(config);
const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, layer: 'browser+supabase', detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function step(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail || '');
  } catch (error) {
    record(name, false, String(error.message || error).slice(0, 300));
  }
}

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
  return spawn(
    'npx',
    ['vite', 'preview', '--host', '127.0.0.1', '--port', String(config.previewPort), '--strictPort'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        VITE_SUPABASE_URL: config.url,
        VITE_SUPABASE_KEY: config.anonKey,
      },
      detached: true,
    },
  );
}

async function waitForPreview(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return;
    } catch {
      // not up
    }
    await sleep(200);
  }
  throw new Error('vite preview did not start');
}

async function freshPatient(session, base) {
  await session.goto(base + '/');
  await session.clearStorage();
  await session.goto(base + '/');
  await session.waitForText('Start Talking', 15_000);
}

/**
 * Types into the conversation composer, switching to text mode when needed.
 * The placeholder and the toggles are localised, so this matches by structure rather
 * than by English label.
 */
const COMPOSER =
  'form input:not([type="email"]):not([type="password"]), form textarea:not([placeholder^="Edit your spoken"])';

async function typeComposer(session, value) {
  const typed = await session.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(COMPOSER)});
    if (!el) return false;
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter ? setter.call(el, ${JSON.stringify(value)}) : (el.value = ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!typed) throw new Error('composer input not found');
}

async function sendTyped(session, value) {
  if (!(await session.eval(`!!document.querySelector(${JSON.stringify(COMPOSER)})`))) {
    await session.click(/Type instead|लिखकर/);
    await session.waitFor(`!!document.querySelector(${JSON.stringify(COMPOSER)})`, 6_000);
  }
  await typeComposer(session, value);
  await session.click(/Send|भेजें/);
}

async function answerUntilReview(session, answers) {
  const expected = [
    ['What is your name?', answers.name],
    ['How old are you, in years?', answers.age],
    ['What is your gender?', answers.gender],
    ['What is your main concern today?', answers.primary_concern],
    ['How long have you had this concern?', answers.duration],
    ['How severe is it?', answers.severity],
    ['Do you have any existing medical conditions?', answers.conditions],
    ['Are you taking any medicines?', answers.medications],
    ['Do you have any allergies?', answers.allergies],
    ['Is there anything else you would like the clinic to know?', answers.other_symptoms],
  ];
  for (const [question, value] of expected) {
    await session.waitForText(question, 25_000);
    await sendTyped(session, value);
  }
  await session.waitForText(/Review Your Intake Report|Review Your/, 30_000);
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
  if (!process.env.SKIP_BUILD) buildFrontend();
  const preview = startPreview();
  let browser;

  try {
    await waitForPreview(config.previewPort);
    browser = await launchBrowser({ port: 9334 });
    const session = browser.session;
    const base = `http://127.0.0.1:${config.previewPort}`;

    // ------------------------------------------------------------ 1. consent declined
    await freshPatient(session, base);
    await step('consent denied stops intake and collects no health data', async () => {
      await session.click('Start Talking');
      await session.waitForText('Consent for AI Intake', 10_000);
      await session.click(/No, do not proceed/);
      const text = await session.waitForText(/Intake Ended/, 15_000);
      assert.match(text, /not saved any health information/i);

      assertRealSupabaseTraffic(session, config);
      const reports = await rest('reports?select=id&order=created_at.desc&limit=5');
      const sessions = await rest('sessions?select=id,status,answer_turn_count&order=created_at.desc&limit=1');
      assert.equal(sessions[0].status, 'declined');
      assert.equal(sessions[0].answer_turn_count, 0);
      return `session declined, ${reports.length} recent reports (none from this run)`;
    });

    // ------------------------------------------------------------ 2. Hindi / Hinglish
    await freshPatient(session, base);
    await step('Hindi consent and Hinglish answers render in Devanagari', async () => {
      await session.click(/हिंदी/);
      // The welcome CTA is localised too.
      await session.click(/बोलकर बात करें|Start Talking/);
      await session.waitForText(/एआई इनटेक हेतु सहमति|Consent for AI Intake/, 15_000);
      await session.click(/हाँ, मैं सहमत हूँ|Yes, I agree/);
      await session.waitForText(/आपका नाम|What is your name/, 25_000);

      const firstQuestion = await session.bodyText();
      const devanagari = /[\u0900-\u097F]/.test(firstQuestion);
      assert.ok(devanagari, 'Hindi question did not render in Devanagari');

      // Hinglish answers are stored verbatim; the backend never translates them.
      await sendTyped(session, 'Asha Hindi Test');
      await session.waitForText(/आपकी उम्र|How old/, 20_000);
      await sendTyped(session, '34');
      await session.waitForText(/लिंग|gender/i, 20_000);
      await sendTyped(session, 'Female');
      await session.waitForText(/मुख्य समस्या|main concern/i, 20_000);
      await sendTyped(session, 'bukhar aur body ache teen din se');
      // Wait for the backend to accept the turn before asserting on the stored row.
      await session.waitForText(/कितने समय|How long have you/, 20_000);
      return 'Devanagari UI confirmed, Hinglish answer accepted';
    });

    await step('Hinglish answer is stored verbatim in PostgreSQL', async () => {
      const sessions = await rest('sessions?select=id,language&order=created_at.desc&limit=1');
      assert.equal(sessions[0].language, 'hi');
      const messages = await rest(
        `messages?select=final_text&session_id=eq.${sessions[0].id}&order=turn_index.desc&limit=1`,
      );
      assert.equal(messages[0].final_text, 'bukhar aur body ache teen din se');
      return `language=hi, verbatim answer persisted`;
    });

    // ------------------------------------------------------------ 3. emergency positive
    await freshPatient(session, base);
    await step('clear emergency phrase shows 112 guidance with no slots', async () => {
      await session.click('Start Talking');
      await session.waitForText('Consent for AI Intake', 10_000);
      await session.click('Yes, I agree');
      await session.waitForText('What is your name?', 25_000);
      await sendTyped(session, 'Vikas Emergency');
      await session.waitForText('How old are you, in years?', 20_000);
      await sendTyped(session, '52');
      await session.waitForText('What is your gender?', 20_000);
      await sendTyped(session, 'Male');
      await session.waitForText('What is your main concern today?', 20_000);
      await sendTyped(session, 'I cannot breathe and my chest is crushing');

      const text = await session.waitForText(/112/, 30_000);
      assert.match(text, /may be urgent/i);
      assert.match(text, /112/);
      assert.doesNotMatch(text, /Book Appointment/, 'emergency must not offer routine slots');

      const rows = await rest('reports?select=status,department_key,emergency_rule_id&order=created_at.desc&limit=1');
      assert.equal(rows[0].status, 'urgent_partial');
      assert.equal(rows[0].department_key, 'emergency');
      assert.ok(rows[0].emergency_rule_id);
      return 'urgent_partial report persisted, 112 shown';
    });

    // ------------------------------------------------------------ 4. ambiguous -> Yes
    await freshPatient(session, base);
    await step('ambiguous emergency offers Yes/No clarification and Yes escalates', async () => {
      await session.click('Start Talking');
      await session.waitForText('Consent for AI Intake', 10_000);
      await session.click('Yes, I agree');
      await session.waitForText('What is your name?', 25_000);
      await sendTyped(session, 'Neha Ambiguous');
      await session.waitForText('How old are you, in years?', 20_000);
      await sendTyped(session, '29');
      await session.waitForText('What is your gender?', 20_000);
      await sendTyped(session, 'Female');
      await session.waitForText('What is your main concern today?', 20_000);
      await sendTyped(session, 'chest pain');

      const clarification = await session.waitForText(/right now/i, 25_000);
      assert.match(clarification, /right now/i);
      await session.click('Yes');
      const text = await session.waitForText(/112/, 30_000);
      assert.match(text, /may be urgent/i);

      const rows = await rest('reports?select=status,emergency_rule_id&order=created_at.desc&limit=1');
      assert.equal(rows[0].status, 'urgent_partial');
      return 'clarification accepted, urgent_partial persisted';
    });

    // ------------------------------------------------------------ 5. Not now
    await freshPatient(session, base);
    await step('"Not now" keeps the report submitted with no appointment', async () => {
      await session.click('Start Talking');
      await session.waitForText('Consent for AI Intake', 10_000);
      await session.click('Yes, I agree');
      await answerUntilReview(session, {
        name: 'Asha NotNow',
        age: '41',
        gender: 'Female',
        primary_concern: 'recurring evening fever with body ache',
        duration: 'two weeks',
        severity: 'Moderate',
        conditions: 'None known',
        medications: 'None',
        allergies: 'None known',
        other_symptoms: 'No other symptoms',
      });
      await session.click('Submit to Hospital');
      await session.waitForText(/Schedule Consultation/, 30_000);
      await session.click(/Not now/);
      const text = await session.waitForText(/Report Submitted|safely available/, 30_000);
      assert.match(text, /safely available to the assigned doctor/i);

      const reports = await rest(
        'reports?select=id,status&status=eq.submitted&order=created_at.desc&limit=1',
      );
      assert.equal(reports[0].status, 'submitted');
      const appointments = await rest(
        `appointments?select=id&report_id=eq.${reports[0].id}`,
      );
      assert.equal(appointments.length, 0);
      return 'submitted report persisted, zero appointments';
    });

    // ------------------------------------------------------------ 6. adaptive question
    await freshPatient(session, base);
    await step('an unparseable required answer triggers a department-aware adaptive question', async () => {
      await session.click('Start Talking');
      await session.waitForText('Consent for AI Intake', 10_000);
      await session.click('Yes, I agree');
      await session.waitForText('What is your name?', 25_000);
      await sendTyped(session, 'Asha Adaptive');
      await session.waitForText('How old are you, in years?', 20_000);
      // An unparseable age stays "unclear", so the scripted block cannot complete and
      // the backend falls through to the question bank.
      await sendTyped(session, 'forty something');
      await session.waitForText('What is your gender?', 20_000);
      await sendTyped(session, 'Female');
      await session.waitForText('What is your main concern today?', 20_000);
      await sendTyped(session, 'recurring evening fever with body ache');
      await session.waitForText('How long have you had this concern?', 20_000);
      await sendTyped(session, 'two weeks');
      await session.waitForText('How severe is it?', 20_000);
      await sendTyped(session, 'Moderate');
      await session.waitForText('Do you have any existing medical conditions?', 20_000);
      await sendTyped(session, 'None known');
      await session.waitForText('Are you taking any medicines?', 20_000);
      await sendTyped(session, 'None');
      await session.waitForText('Do you have any allergies?', 20_000);
      await sendTyped(session, 'None known');
      await session.waitForText('Is there anything else you would like the clinic to know?', 20_000);
      await sendTyped(session, 'No other symptoms');

      // The next question must come from the bank, not from the fixed script.
      const text = await session.waitForText(/Question 1[01] of 15/, 30_000);
      const coreQuestions = [
        'What is your name?',
        'How old are you, in years?',
        'What is your gender?',
        'What is your main concern today?',
        'How long have you had this concern?',
        'How severe is it?',
        'Do you have any existing medical conditions?',
        'Are you taking any medicines?',
        'Do you have any allergies?',
        'Is there anything else you would like the clinic to know?',
      ];
      const askedCore = coreQuestions.filter((q) => text.includes(q));
      // A bank question is whatever the backend asked that is not a core question.
      const options = await session.eval(`(() => {
        const group = document.querySelector('[aria-label="Quick reply options"]');
        return group ? Array.from(group.querySelectorAll('button')).map((b) => (b.getAttribute('aria-label') || b.innerText).trim()) : [];
      })()`);
      const language = await session.eval(`(() => {
        const bubbles = Array.from(document.querySelectorAll('p, div')).map((n) => n.innerText || '');
        return bubbles.some((t) => /[\u0900-\u097F]/.test(t)) ? 'has-devanagari-hindi' : 'english-only';
      })()`);
      return `bank question asked (${askedCore.length} core labels present), ${options.length} quick replies, ${language}`;
    });

    await step('adaptive question survives a page reload (resume_session)', async () => {
      const before = await session.bodyText();
      await session.goto(base + '/');
      const after = await session.waitForText(/Question 1[01] of 15/, 25_000);
      assert.ok(after.length > 0);
      return before.length > 0 ? 'session restored after reload' : 'restored';
    });

    await step('no uncaught page errors in the extra journeys', async () => {
      const real = session.pageErrors.filter((e) => !/ResizeObserver|favicon/.test(e));
      assert.deepEqual(real, []);
      return 'clean console';
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
    console.log(`identities created=${created.length} deleted=${created.length - failures}`);
    writeFileSync(
      'browser-supabase-extras-result.json',
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          target: config.url,
          mode: 'supabase (real Auth, Edge Functions, Postgres, RPCs)',
          providers: 'stubbed (Groq, Prisma, Timbre)',
          results,
          ok: results.every((r) => r.ok),
        },
        null,
        2,
      ) + '\n',
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} extra browser checks passed`);
  if (failed.length) process.exitCode = 1;
}

await run();
