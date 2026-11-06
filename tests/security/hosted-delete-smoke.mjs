/**
 * Hosted verification of permanent report deletion (owner-run).
 *
 *   SB_URL=... SB_ANON=... SB_SERVICE=... node tests/security/hosted-delete-smoke.mjs
 *
 * Creates disposable synthetic rows with the service role (never real user data), then
 * exercises the deployed `delete_doctor_report` function through the REST API with real
 * doctor sessions obtained by short-lived magic links. Everything it creates is removed
 * again, including on failure.
 */

const BASE = process.env.SB_URL;
const ANON = process.env.SB_ANON;
const SERVICE = process.env.SB_SERVICE;

if (!BASE || !ANON || !SERVICE) {
  console.error('Set SB_URL, SB_ANON and SB_SERVICE. No values are echoed.');
  process.exit(2);
}

const H = {
  service: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' },
  anon: { apikey: ANON, 'content-type': 'application/json' },
};

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const rest = (path, init = {}) => fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: { ...H.service, ...(init.headers ?? {}) } });

async function signInAnonymously() {
  const response = await fetch(`${BASE}/auth/v1/signup`, { method: 'POST', headers: H.anon, body: '{}' });
  const body = await response.json().catch(() => ({}));
  if (!body.access_token || !body.user?.id) throw new Error('anonymous sign-in failed');
  return { token: body.access_token, userId: body.user.id };
}

async function doctorSession(email) {
  const link = await fetch(`${BASE}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: H.service,
    body: JSON.stringify({ type: 'magiclink', email }),
  }).then((r) => r.json());
  const hash = link.hashed_token ?? link.properties?.hashed_token;
  if (!hash) throw new Error(`generate_link failed for ${email}`);
  const session = await fetch(`${BASE}/auth/v1/verify`, {
    method: 'POST',
    headers: H.anon,
    body: JSON.stringify({ type: 'magiclink', token_hash: hash }),
  }).then((r) => r.json());
  if (!session.access_token) throw new Error(`verify failed for ${email}`);
  return session.access_token;
}

async function doctors() {
  const users = await fetch(`${BASE}/auth/v1/admin/users?per_page=50`, { headers: H.service }).then((r) => r.json());
  const doctors = await rest('doctors?select=id,display_name,department_key').then((r) => r.json());
  const byId = new Map(doctors.map((doctor) => [doctor.id, doctor]));
  const found = [];
  for (const user of users.users ?? []) {
    if (!user.email) continue;
    const token = await doctorSession(user.email);
    const own = await fetch(`${BASE}/rest/v1/doctor_profiles?select=doctor_id`, {
      headers: { apikey: ANON, authorization: `Bearer ${token}` },
    }).then((r) => r.json());
    if (Array.isArray(own) && own.length === 1) {
      found.push({ email: user.email, token, doctorId: own[0].doctor_id, department: byId.get(own[0].doctor_id)?.department_key });
      if (found.length === 2) break;
    }
  }
  return found;
}

/** Creates a disposable report with a transcript and returns its ids. */
async function createReport({ patientId, doctorId, department = 'general_medicine', status = 'submitted', suffix }) {
  const sessionId = crypto.randomUUID();
  const reportId = crypto.randomUUID();
  const reference = `SHD-QA-${suffix}`;

  let response = await rest('sessions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ id: sessionId, user_id: patientId, language: 'en', status: 'submitted', answer_turn_count: 2 }),
  });
  if (!response.ok) throw new Error(`session insert failed: ${response.status} ${await response.text()}`);

  response = await rest('reports', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: reportId,
      session_id: sessionId,
      user_id: patientId,
      status,
      schema_version: 1,
      department_key: department,
      doctor_id: doctorId,
      intake_reference: reference,
      submitted_at: new Date().toISOString(),
      report: { schema_version: 1 },
    }),
  });
  if (!response.ok) throw new Error(`report insert failed: ${response.status} ${await response.text()}`);

  response = await rest('messages', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([
      { session_id: sessionId, role: 'patient', question_id: 'name', turn_index: 1, final_text: 'QA Fixture' },
      { session_id: sessionId, role: 'patient', question_id: 'age', turn_index: 2, final_text: '40' },
    ]),
  });
  if (!response.ok) throw new Error(`messages insert failed: ${response.status} ${await response.text()}`);

  return { sessionId, reportId, reference };
}

const count = async (path) => {
  const response = await rest(`${path}&select=id`, { headers: { ...H.service, Prefer: 'count=exact' } });
  const range = response.headers.get('content-range') ?? '';
  return Number(range.split('/')[1] ?? (await response.json()).length);
};

/**
 * Removes any surviving synthetic reports through the same authorised function a doctor
 * uses. `service_role` deliberately has no DELETE grant on reports, so a direct REST
 * delete is not an option (and would be the wrong path to test anyway). The parent
 * session row is inert once its report and messages are gone.
 */
async function cleanup(survivors) {
  for (const survivor of survivors) {
    if (!survivor.reportId || !survivor.doctorToken) continue;
    const response = await fetch(`${BASE}/rest/v1/rpc/delete_doctor_report`, {
      method: 'POST',
      headers: { apikey: ANON, authorization: `Bearer ${survivor.doctorToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_report_id: survivor.reportId }),
    });
    if (response.status !== 200 && response.status !== 404) {
      console.warn(`cleanup could not delete ${survivor.reportId}: HTTP ${response.status}`);
    }
  }
}

async function main() {
  const survivors = [];
  try {
    const patient = await signInAnonymously();
    const mapped = await doctors();
    record('two mapped doctors available', mapped.length === 2, mapped.map((d) => d.department).join(', '));
    if (mapped.length < 2) return;

    const general = mapped.find((d) => d.department === 'general_medicine') ?? mapped[0];
    const other = mapped.find((d) => d.email !== general.email);

    // 1. Assigned doctor deletes a disposable report.
    const run = crypto.randomUUID().slice(0, 8).toUpperCase();
    const target = await createReport({ patientId: patient.userId, doctorId: general.doctorId, suffix: `DEL1-${run}` });
    survivors.push({ reportId: target.reportId, doctorToken: general.token });

    const before = await count(`reports?id=eq.${target.reportId}`);
    record('disposable report exists before deletion', before === 1, `${before} row`);

    const deleted = await fetch(`${BASE}/rest/v1/rpc/delete_doctor_report`, {
      method: 'POST',
      headers: { apikey: ANON, authorization: `Bearer ${general.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_report_id: target.reportId }),
    });
    record('assigned doctor delete returns 200', deleted.status === 200, `HTTP ${deleted.status}`);

    const rowsAfter = await count(`reports?id=eq.${target.reportId}`);
    const messagesAfter = await count(`messages?session_id=eq.${target.sessionId}`);
    const sessionAfter = await count(`sessions?id=eq.${target.sessionId}`);
    record('report row is permanently gone', rowsAfter === 0, `${rowsAfter} rows`);
    record('report transcript is gone', messagesAfter === 0, `${messagesAfter} rows`);
    record('parent session is retained', sessionAfter === 1, `${sessionAfter} row`);

    // 2. A different doctor cannot delete it.
    const guarded = await createReport({ patientId: patient.userId, doctorId: general.doctorId, suffix: `DEL2-${run}` });
    survivors.push({ reportId: guarded.reportId, doctorToken: general.token });

    const denied = await fetch(`${BASE}/rest/v1/rpc/delete_doctor_report`, {
      method: 'POST',
      headers: { apikey: ANON, authorization: `Bearer ${other.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_report_id: guarded.reportId }),
    });
    const deniedBody = await denied.json().catch(() => ({}));
    record(
      'another doctor is refused',
      denied.status === 403 || deniedBody?.code === '42501',
      `HTTP ${denied.status} ${deniedBody?.code ?? ''}`,
    );
    const stillThere = await count(`reports?id=eq.${guarded.reportId}`);
    record('the refused report still exists', stillThere === 1, `${stillThere} row`);

    // 3. Anonymous callers cannot execute the function.
    const anonAttempt = await fetch(`${BASE}/rest/v1/rpc/delete_doctor_report`, {
      method: 'POST',
      headers: { apikey: ANON, 'content-type': 'application/json' },
      body: JSON.stringify({ p_report_id: guarded.reportId }),
    });
    record('anonymous caller is refused', anonAttempt.status >= 400, `HTTP ${anonAttempt.status}`);

    // 4. The patient who owns the report cannot delete it either.
    const patientAttempt = await fetch(`${BASE}/rest/v1/rpc/delete_doctor_report`, {
      method: 'POST',
      headers: { apikey: ANON, authorization: `Bearer ${patient.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_report_id: guarded.reportId }),
    });
    record('patient caller is refused', patientAttempt.status >= 400, `HTTP ${patientAttempt.status}`);

    // 5. Unknown id is refused without disclosure.
    const unknown = await fetch(`${BASE}/rest/v1/rpc/delete_doctor_report`, {
      method: 'POST',
      headers: { apikey: ANON, authorization: `Bearer ${general.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_report_id: crypto.randomUUID() }),
    });
    record('unknown id is refused', unknown.status >= 400, `HTTP ${unknown.status}`);
  } finally {
    await cleanup(survivors);
    const leftover = await rest('reports?select=id&intake_reference=like.SHD-QA-*').then((r) => r.json());
    if (Array.isArray(leftover) && leftover.length > 0) {
      console.warn(`cleanup left ${leftover.length} synthetic report row(s)`);
    } else {
      console.log('\nSynthetic QA reports all removed.');
    }
  }

  const failed = results.filter((entry) => !entry.ok);
  console.log(`${results.length - failed.length}/${results.length} hosted deletion checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('hosted delete smoke failed:', error.message);
  process.exitCode = 1;
});
