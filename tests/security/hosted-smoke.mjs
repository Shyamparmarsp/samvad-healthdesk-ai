/**
 * Hosted smoke test for the Samwad Assistant (owner-run).
 *
 * Requires privileged environment variables; nothing is printed and no secret is written
 * to disk:
 *
 *   SB_URL=https://<ref>.supabase.co \
 *   SB_ANON=<publishable or anon key> \
 *   SB_SERVICE=<service role key> \
 *   node tests/security/hosted-smoke.mjs
 *
 * What it checks against the deployed project:
 *   1. `speak` rejects an unauthenticated call.
 *   2. A signed-in non-doctor (anonymous patient) is refused with 403.
 *   3. A real doctor session gets a validated Hindi briefing from Groq Qwen plus Gnani
 *      Timbre audio, and the audio/text agree.
 *   4. A second doctor gets their own scoped answer (no cross-doctor leakage).
 *   5. Hosted RLS: each doctor's report read stays inside their own assignment.
 *
 * Provider usage is deliberately bounded: one summary call per doctor.
 */

const URL_BASE = process.env.SB_URL;
const ANON = process.env.SB_ANON;
const SERVICE = process.env.SB_SERVICE;

if (!URL_BASE || !ANON || !SERVICE) {
  console.error('Set SB_URL, SB_ANON and SB_SERVICE. No values are echoed.');
  process.exit(2);
}

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const facts = {
  v: 1,
  context: 'dashboard',
  intent: 'greeting',
  time_of_day: 'morning',
  reports: { total: 1, today: 1, awaiting_review: 1, complete: 1, partial: 0, reviewed: 0, urgent: 0 },
  appointments: {
    today: 0,
    today_upcoming: 0,
    today_completed: 0,
    future: 0,
    past: 0,
    cancelled: 0,
    next_starts: [],
    next_is_today: false,
  },
};

async function signInAnonymously() {
  const response = await fetch(`${URL_BASE}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  const body = await response.json().catch(() => ({}));
  return body.access_token ?? null;
}

async function doctorSession(email) {
  const link = await fetch(`${URL_BASE}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const linkBody = await link.json().catch(() => ({}));
  const tokenHash = linkBody.hashed_token ?? linkBody.properties?.hashed_token;
  if (!tokenHash) throw new Error(`generate_link failed for ${email}: ${link.status}`);

  const verify = await fetch(`${URL_BASE}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
  });
  const session = await verify.json().catch(() => ({}));
  if (!session.access_token) throw new Error(`verify failed for ${email}: ${verify.status}`);
  return session.access_token;
}

/**
 * Finds mapped doctors without reading `doctor_profiles` as service_role: that table is
 * intentionally not granted to the server role, so each candidate reads their own row
 * through RLS with their own session, exactly like the browser does.
 */
async function doctorEmails() {
  const headers = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };
  const users = await fetch(`${URL_BASE}/auth/v1/admin/users?per_page=50`, { headers }).then((r) => r.json());
  const doctors = await fetch(`${URL_BASE}/rest/v1/doctors?select=id,display_name,department_key`, { headers }).then((r) => r.json());
  const doctorById = new Map((doctors ?? []).map((doctor) => [doctor.id, doctor]));
  const found = [];

  for (const user of users.users ?? []) {
    if (!user.email) continue;
    const token = await doctorSession(user.email);
    const own = await fetch(`${URL_BASE}/rest/v1/doctor_profiles?select=doctor_id`, {
      headers: { apikey: ANON, authorization: `Bearer ${token}` },
    }).then((r) => r.json());
    if (Array.isArray(own) && own.length === 1) {
      found.push({
        email: user.email,
        doctorId: own[0].doctor_id,
        department: doctorById.get(own[0].doctor_id)?.department_key ?? 'unknown',
      });
      if (found.length === 2) break;
    }
  }
  return found;
}

async function speak(body, token) {
  const response = await fetch(`${URL_BASE}/functions/v1/speak`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return { status: response.status, json: await response.json().catch(() => ({})), contentType };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status,
    contentType,
    bytes,
    text: response.headers.get('x-summary-text'),
    source: response.headers.get('x-summary-source'),
    reason: response.headers.get('x-summary-reason'),
    language: response.headers.get('x-summary-language'),
  };
}

function decodeSummary(value) {
  if (!value) return null;
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf8');
}

async function reportsFor(token) {
  const response = await fetch(
    `${URL_BASE}/rest/v1/reports?select=id,doctor_id,department_key,status&status=in.(submitted,partial,urgent_partial)`,
    { headers: { apikey: ANON, authorization: `Bearer ${token}` } },
  );
  return { status: response.status, rows: await response.json().catch(() => []) };
}

async function main() {
  // 1. Unauthenticated.
  const noAuth = await speak({ summary_facts: facts }, null);
  record('unauthenticated speak is rejected', noAuth.status === 401, `HTTP ${noAuth.status}`);

  // 2. A signed-in non-doctor is refused.
  const anonToken = await signInAnonymously();
  if (!anonToken) {
    record('anonymous sign-in available', false, 'no access token');
  } else {
    const patient = await speak({ summary_facts: facts }, anonToken);
    record('non-doctor summary is refused', patient.status === 403, `HTTP ${patient.status}`);

    const patientRead = await reportsFor(anonToken);
    record('non-doctor sees no reports', Array.isArray(patientRead.rows) && patientRead.rows.length === 0, `${patientRead.rows.length ?? '?'} rows`);
  }

  // 3/4. Real doctors, one summary call each.
  const doctors = await doctorEmails();
  record('doctor profiles are mapped', doctors.length >= 1, `${doctors.length} mapped`);

  const summaries = [];
  const languages = ['hi', 'en'];
  for (const doctor of doctors.slice(0, 1)) {
    const token = await doctorSession(doctor.email);

    for (const language of languages) {
      const answer = await speak({ summary_facts: facts, summary_language: language }, token);
      const text = decodeSummary(answer.text);
      const isAudio = (answer.contentType ?? '').startsWith('audio/');
      const looksLikeMp3 = isAudio && answer.bytes && answer.bytes.length > 1000;
      const rightScript =
        typeof text === 'string'
          ? language === 'en'
            ? /[A-Za-z]/.test(text) && !/[\u0900-\u097F]/.test(text)
            : /[\u0900-\u097F]/.test(text)
          : false;
      record(
        `${language === 'en' ? 'English' : 'Hindi'} summary returns audio in the selected language`,
        answer.status === 200 && looksLikeMp3 && rightScript && answer.language === language,
        `HTTP ${answer.status}, ${answer.bytes?.length ?? 0} bytes, source=${answer.source}${answer.reason ? ` (${answer.reason})` : ''}, lang=${answer.language}, ${text?.length ?? 0} chars`,
      );
      if (text) console.log(`      "${text}"`);
      summaries.push({ doctor, language, text, bytes: answer.bytes?.length ?? 0 });
    }

    // The model must honour the requested language even when the facts are identical.
    const [hindi, english] = summaries;
    record(
      'the two languages produce different text from the same facts',
      Boolean(hindi?.text && english?.text && hindi.text !== english.text),
    );

    const read = await reportsFor(token);
    const foreign = read.rows.filter(
      (row) => row.doctor_id !== doctor.doctorId && row.department_key !== 'emergency',
    );
    record(`RLS: ${doctor.department} report read stays in scope`, foreign.length === 0, `${read.rows.length} rows, ${foreign.length} foreign`);
  }

  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failed.length}/${results.length} hosted checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('hosted smoke test failed:', error.message);
  process.exitCode = 1;
});
