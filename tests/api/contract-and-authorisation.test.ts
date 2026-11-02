/**
 * Contract and authorisation checks over the real local stack.
 *
 * Two kinds of assertion:
 *   [HTTP]  a real Edge Function request with a real (or deliberately missing) JWT
 *   [RLS]   a real PostgREST request evaluated by Postgres row-level security
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LocalStack, loadLocalConfig } from './harness';
import { COMPLETE_ANSWERS, driveIntake } from './drive';

const config = loadLocalConfig();
const api = await import('../../src/lib/api');
const { setSupabaseClient } = await import('../../src/lib/supabase');
const { CONSENT_VERSION } = await import('../../src/types/consent');

const stack = new LocalStack(config);
api.setAppMode('supabase');

interface Fixture {
  patient: Awaited<ReturnType<LocalStack['createPatient']>>;
  sessionId: string;
  reportId: string;
  emergencyReportId: string;
  emergencySessionId: string;
  draftReportId: string;
}

const fx = {} as Fixture;

async function consentedSession() {
  const patient = await stack.createPatient();
  setSupabaseClient(patient.client);
  const started = await api.startSession('en');
  await api.recordConsent(started.session_id, true, 'en', CONSENT_VERSION);
  return { patient, sessionId: started.session_id };
}

async function submittedReport(sessionId: string) {
  await driveIntake(api, sessionId, COMPLETE_ANSWERS);
  const submitted = await api.submitReport({
    action: 'submit_report',
    session_id: sessionId,
    report_id: 'draft',
  });
  return submitted.submitted_report!.id;
}

describe('M4 frontend integration — contract and authorisation (local Supabase)', () => {
  before(async () => {
    await stack.ensureSessionHeadroom();

    // A submitted GM report owned by patient A.
    const a = await consentedSession();
    fx.patient = a.patient;
    fx.sessionId = a.sessionId;
    fx.reportId = await submittedReport(a.sessionId);

    // An urgent_partial report owned by the same patient.
    const b = await consentedSession();
    await api.chatTurn({ action: 'submit_turn', session_id: b.sessionId, question_id: 'name', text: 'Urgent Owner' });
    fx.emergencySessionId = b.sessionId;
    await api.chatTurn({
      action: 'submit_turn',
      session_id: b.sessionId,
      question_id: 'age',
      text: '60',
    });
    await api.chatTurn({
      action: 'submit_turn',
      session_id: b.sessionId,
      question_id: 'gender',
      text: 'Female',
    });
    await api.chatTurn({
      action: 'submit_turn',
      session_id: b.sessionId,
      question_id: 'primary_concern',
      text: 'I cannot breathe',
    });
    const urgent = await stack.rest<Array<{ id: string }>>(
      `reports?select=id&session_id=eq.${b.sessionId}`,
    );
    fx.emergencyReportId = urgent[0].id;

    // A draft that was never submitted.
    const c = await consentedSession();
    await driveIntake(api, c.sessionId, COMPLETE_ANSWERS);
    const draft = await stack.rest<Array<{ id: string }>>(
      `reports?select=id&session_id=eq.${c.sessionId}`,
    );
    fx.draftReportId = draft[0].id;
  });

  after(async () => {
    setSupabaseClient(null);
    await stack.cleanup();
  });

  // ------------------------------------------------------------------ [HTTP]

  it('[HTTP] chat-turn without a JWT is rejected', async () => {
    const response = await stack.invokeRaw('chat-turn', { action: 'start_session', language: 'en' });
    assert.equal(response.status, 401);
  });

  it('[HTTP] speak without a JWT is rejected', async () => {
    const response = await stack.invokeRaw('speak', { session_id: fx.sessionId, question_id: 'name' });
    assert.equal(response.status, 401);
  });

  it('[HTTP] an unknown action and an unknown key are invalid_request', async () => {
    const unknownAction = await stack.invokeRaw('chat-turn', { action: 'drop_tables' }, fx.patient.token);
    assert.equal(unknownAction.status, 400);
    assert.deepEqual(unknownAction.body, { error: 'invalid_request' });

    const unknownKey = await stack.invokeRaw(
      'chat-turn',
      { action: 'start_session', language: 'en', user_id: 'forged' },
      fx.patient.token,
    );
    assert.equal(unknownKey.status, 400);
    assert.deepEqual(unknownKey.body, { error: 'invalid_request' });
  });

  it('[HTTP] a non-uuid session id is invalid_request', async () => {
    const response = await stack.invokeRaw(
      'chat-turn',
      { action: 'resume_session', session_id: 'not-a-uuid' },
      fx.patient.token,
    );
    assert.equal(response.status, 400);
  });

  it('[HTTP] sending both text and audio is invalid_request', async () => {
    const response = await stack.invokeRaw(
      'chat-turn',
      {
        action: 'submit_turn',
        session_id: fx.sessionId,
        question_id: 'name',
        text: 'hello',
        audio_base64: 'AAAA',
        audio_format: 'audio/wav',
      },
      fx.patient.token,
    );
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: 'invalid_request' });
  });

  it('[HTTP] resuming another identity\'s session is not_found, never a 403', async () => {
    const stranger = await stack.createPatient();
    const response = await stack.invokeRaw(
      'chat-turn',
      { action: 'resume_session', session_id: fx.sessionId },
      stranger.token,
    );
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: 'not_found' });
  });

  it('[HTTP] speak only answers for the caller\'s own session', async () => {
    const stranger = await stack.createPatient();
    const response = await stack.invokeRaw(
      'speak',
      { session_id: fx.sessionId, question_id: 'name' },
      stranger.token,
    );
    assert.equal(response.status, 404);
  });

  // ------------------------------------------------------------------ [RLS]

  it('[RLS] a patient cannot read the server-owned intake tables', async () => {
    const patientClient = fx.patient.client;

    // reports/messages keep a SELECT grant for doctors; RLS is what removes a patient.
    const reports = await patientClient.from('reports').select('id').limit(1);
    assert.equal(reports.error, null);
    assert.equal((reports.data ?? []).length, 0, 'a patient sees no report rows');

    const messages = await patientClient.from('messages').select('id').limit(1);
    assert.equal(messages.error, null);
    assert.equal((messages.data ?? []).length, 0, 'a patient sees no conversation rows');

    // sessions has no grant at all: browser access fails loudly instead of returning rows.
    const sessions = await patientClient.from('sessions').select('id').limit(1);
    assert.ok(sessions.error, 'sessions must not be readable by a patient');

    const usage = await patientClient.from('daily_usage_limits').select('counter_name').limit(1);
    assert.ok(usage.error, 'usage limits must never be readable by the browser');

    const reserve = await patientClient.rpc('reserve_daily_usage', { p_counter: 'sessions' });
    assert.ok(reserve.error, 'reserve_daily_usage must not be callable by the browser');

    // No browser write path to a server-owned table, under any identity.
    const forged = await patientClient
      .from('reports')
      .insert({ session_id: fx.sessionId, status: 'submitted' });
    assert.ok(forged.error, 'a patient must never insert a report');
  });

  it('[RLS] a patient cannot read appointment rows, even their own', async () => {
    // No browser grant at all: access fails loudly instead of returning rows.
    const rows = await fx.patient.client.from('appointments').select('id');
    assert.ok(rows.error, 'appointments must not be table-readable by a browser role');

    // The doctor-only read RPC returns nothing for a caller with no doctor_profiles row.
    const rpc = await fx.patient.client.rpc('get_doctor_appointments');
    assert.equal(rpc.error, null);
    assert.deepEqual(rpc.data, [], 'a non-doctor sees no appointments');
  });

  it('[RLS] the assigned doctor sees the submitted report, a draft never appears', async () => {
    const doctor = await stack.signInDoctor('general_medicine');
    setSupabaseClient(doctor.client);

    const reports = await api.getDoctorReports();
    assert.ok(reports.some((row) => row.id === fx.reportId));
    assert.ok(!reports.some((row) => row.id === fx.draftReportId), 'drafts are never visible');

    const draft = await api.getDoctorReportDetail(fx.draftReportId);
    assert.equal(draft, null);
    setSupabaseClient(fx.patient.client);
  });

  it('[RLS] doctor conversation reads follow report visibility', async () => {
    const gm = await stack.signInDoctor('general_medicine');
    setSupabaseClient(gm.client);

    const submittedMessages = await api.getDoctorMessages(fx.reportId);
    assert.ok(submittedMessages.length > 0, 'assigned doctor can read the submitted report conversation');
    assert.ok(
      submittedMessages.every((message) => message.role === 'patient'),
      'only stored patient answers are exposed'
    );

    const emergencyMessages = await api.getDoctorMessages(fx.emergencyReportId);
    assert.ok(emergencyMessages.length > 0, 'GM has the documented read-only emergency cross-visibility');

    await assert.rejects(
      () => api.getDoctorMessages(fx.draftReportId),
      (error: unknown) => (error as { code?: string }).code === 'not_found',
      'a draft report conversation must not be disclosed'
    );

    setSupabaseClient(fx.patient.client);
    await assert.rejects(
      () => api.getDoctorMessages(fx.reportId),
      (error: unknown) => (error as { code?: string }).code === 'not_found',
      'a patient must not read the doctor-facing conversation'
    );

    const emergencyDoctor = await stack.signInDoctor('emergency');
    setSupabaseClient(emergencyDoctor.client);
    await assert.rejects(
      () => api.getDoctorMessages(fx.reportId),
      (error: unknown) => (error as { code?: string }).code === 'not_found',
      'the Emergency doctor cannot read an unrelated general-medicine conversation'
    );
    const emergencyOwn = await api.getDoctorMessages(fx.emergencyReportId);
    assert.ok(emergencyOwn.length > 0, 'the Emergency doctor can read the emergency conversation');

    setSupabaseClient(fx.patient.client);
  });

  it('[RLS] the Emergency doctor cannot read an unrelated general-medicine report', async () => {
    const emergencyDoctor = await stack.signInDoctor('emergency');
    setSupabaseClient(emergencyDoctor.client);

    const reports = await api.getDoctorReports();
    assert.ok(!reports.some((row) => row.id === fx.reportId));
    // ...but the emergency report is visible to them.
    assert.ok(reports.some((row) => row.id === fx.emergencyReportId));
    setSupabaseClient(fx.patient.client);
  });

  it('[RLS] the General Medicine doctor sees emergency reports read-only', async () => {
    const doctor = await stack.signInDoctor('general_medicine');
    setSupabaseClient(doctor.client);

    const detail = await api.getDoctorReportDetail(fx.emergencyReportId);
    assert.ok(detail);
    assert.equal(detail!.status, 'urgent_partial');

    // OD-03 interim: read cross-visibility does not grant review authority.
    await assert.rejects(
      () => api.markReportReviewed(fx.emergencyReportId),
      (error: unknown) => (error as { code?: string }).code === 'forbidden',
    );
    setSupabaseClient(fx.patient.client);
  });

  it('[RLS] Mark Reviewed is refused for a draft and for a patient caller', async () => {
    const patientAttempt = await fx.patient.client.rpc('mark_report_reviewed', {
      p_report_id: fx.reportId,
    });
    assert.ok(patientAttempt.error, 'a patient must not be able to mark a report reviewed');

    const doctor = await stack.signInDoctor('general_medicine');
    setSupabaseClient(doctor.client);
    await assert.rejects(
      () => api.markReportReviewed(fx.draftReportId),
      (error: unknown) => ['not_found', 'invalid_state'].includes((error as { code?: string }).code ?? ''),
    );
    setSupabaseClient(fx.patient.client);
  });

  it('[RLS] a doctor cannot book a patient\'s report', async () => {
    const doctor = await stack.signInDoctor('general_medicine');
    setSupabaseClient(doctor.client);
    const attempt = await doctor.client.rpc('book_appointment', {
      p_report_id: fx.reportId,
      p_slot_start: new Date(Date.now() + 86_400_000).toISOString(),
    });
    assert.ok(attempt.error, 'ownership is derived from auth.uid(), not from a role');
    setSupabaseClient(fx.patient.client);
  });
});
