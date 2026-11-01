/**
 * Safety, consent, adaptive-question and audio-preview behaviour over the real local
 * stack. All assertions are made against real chat-turn responses and, where a value is
 * not exposed on the wire, against the real local Postgres rows using the test-only
 * service key.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LocalStack, loadLocalConfig } from './harness';
import { COMPLETE_ANSWERS, defaultAnswer, driveIntake, isBankQuestion } from './drive';

const config = loadLocalConfig();
const api = await import('../../src/lib/api');
const { setSupabaseClient } = await import('../../src/lib/supabase');
const { CONSENT_VERSION } = await import('../../src/types/consent');

const stack = new LocalStack(config);
api.setAppMode('supabase');

type Patient = Awaited<ReturnType<LocalStack['createPatient']>>;

async function consentedSession(language: 'en' | 'hi' = 'en'): Promise<{ patient: Patient; sessionId: string }> {
  const patient = await stack.createPatient();
  setSupabaseClient(patient.client);
  const started = await api.startSession(language);
  await api.recordConsent(started.session_id, true, language, CONSENT_VERSION);
  return { patient, sessionId: started.session_id };
}

async function answer(
  sessionId: string,
  questionId: string,
  text: string,
) {
  return api.chatTurn({ action: 'submit_turn', session_id: sessionId, question_id: questionId, text });
}

/** Answers scripted questions until the session offers an adaptive bank question. */
async function driveUntilBankQuestion(sessionId: string, scripted: Record<string, string>) {
  let response = await api.resumeSession(sessionId);
  const seen: string[] = [];
  for (let step = 0; step < 20; step += 1) {
    const question = response.current_question;
    if (!question) break;
    if (isBankQuestion(question.id)) return { response, bankId: question.id, seen };
    seen.push(question.id);
    response = await api.chatTurn({
      action: 'submit_turn',
      session_id: sessionId,
      question_id: question.id,
      text: scripted[question.id] ?? defaultAnswer(question),
    });
    if (response.emergency_triggered) break;
  }
  return { response, bankId: null, seen };
}

async function reportRowFor(sessionId: string) {
  const rows = await stack.rest<
    Array<{
      id: string;
      status: string;
      department_key: string;
      possible_urgent: boolean;
      needs_human_review: boolean;
      emergency_rule_id: string | null;
      submitted_at: string | null;
    }>
  >(
    `reports?select=id,status,department_key,possible_urgent,needs_human_review,emergency_rule_id,submitted_at&session_id=eq.${sessionId}`,
  );
  return rows[0] ?? null;
}

describe('M4 frontend integration — safety, consent and adaptive (local Supabase)', () => {
  before(async () => {
    await stack.ensureSessionHeadroom();
  });

  after(async () => {
    setSupabaseClient(null);
    await stack.cleanup();
  });

  it('a declined consent ends the session and creates no report', async () => {
    const patient = await stack.createPatient();
    setSupabaseClient(patient.client);

    const started = await api.startSession('en');
    const declined = await api.recordConsent(started.session_id, false, 'en', CONSENT_VERSION);

    assert.equal(declined.session_status, 'declined');
    assert.equal(declined.current_question, undefined);
    assert.equal(declined.messages.length, 0);
    assert.equal(declined.can_submit, false);

    const resumed = await api.resumeSession(started.session_id);
    assert.equal(resumed.session_status, 'declined');

    const report = await reportRowFor(started.session_id);
    assert.equal(report, null, 'no clinical report may exist after consent is declined');

    const rows = await stack.rest<Array<{ id: string }>>(
      `messages?select=id&session_id=eq.${started.session_id}`,
    );
    assert.equal(rows.length, 0, 'no conversation rows may be collected without consent');
  });

  it('an unclear emergency statement sets needs_human_review and holds booking', async () => {
    const { patient, sessionId } = await consentedSession();

    await answer(sessionId, 'name', 'Ravi Unclear');
    await answer(sessionId, 'age', '41');
    await answer(sessionId, 'gender', 'Male');
    let response = await answer(sessionId, 'primary_concern', 'bleeding');

    assert.equal(response.emergency_triggered, undefined);
    assert.equal(response.current_question?.id, 'emergency_clarification');
    assert.deepEqual(response.current_question?.options, ['Yes', 'No']);

    // Neither confirmed nor negated: keep asking and never call the patient safe.
    response = await answer(sessionId, 'emergency_clarification', 'maybe sometimes');
    assert.equal(response.emergency_triggered, undefined);
    assert.equal(response.current_question?.id, 'emergency_clarification');

    const sessionRow = await stack.rest<Array<{ needs_human_review: boolean }>>(
      `sessions?select=needs_human_review&id=eq.${sessionId}`,
    );
    assert.equal(sessionRow[0]?.needs_human_review, true);

    // "No" negates only that candidate; the conservative review flag stays.
    await answer(sessionId, 'emergency_clarification', 'No');
    const { response: completed } = await driveIntake(api, sessionId, COMPLETE_ANSWERS);
    assert.equal(completed.is_complete, true);

    const submitted = await api.submitReport({
      action: 'submit_report',
      session_id: sessionId,
      report_id: 'draft',
    });
    const report = await reportRowFor(sessionId);
    assert.equal(report?.needs_human_review, true);
    assert.equal(report?.status, 'submitted');
    assert.equal(report?.department_key, 'general_medicine');

    await assert.rejects(
      () => api.getAvailableSlots(submitted.submitted_report!.id),
      (error: unknown) => (error as { code?: string }).code === 'review_hold',
    );

    // Mark Reviewed releases a routine hold for a normal submitted report.
    const doctor = await stack.signInDoctor('general_medicine');
    setSupabaseClient(doctor.client);
    await api.markReportReviewed(submitted.submitted_report!.id);
    setSupabaseClient(patient.client);

    const slots = await api.getAvailableSlots(submitted.submitted_report!.id);
    assert.ok(slots.length > 0, 'Mark Reviewed releases a routine hold');
  });

  it('a clear emergency phrase escalates and never produces routine slots', async () => {
    const { patient, sessionId } = await consentedSession();

    await answer(sessionId, 'name', 'Vikas Emergency');
    await answer(sessionId, 'age', '52');
    await answer(sessionId, 'gender', 'Male');
    const emergency = await answer(
      sessionId,
      'primary_concern',
      'I cannot breathe and my chest is crushing',
    );

    assert.equal(emergency.emergency_triggered, true);
    assert.equal(emergency.session_status, 'emergency');
    assert.equal(emergency.can_submit, false);
    assert.notEqual(emergency.draft_report?.emergency, null);

    const report = await reportRowFor(sessionId);
    assert.equal(report?.status, 'urgent_partial');
    assert.equal(report?.department_key, 'emergency');
    assert.equal(report?.submitted_at, null);
    assert.ok(report?.emergency_rule_id);

    await assert.rejects(
      () => api.getAvailableSlots(report!.id),
      (error: unknown) => (error as { code?: string }).code === 'not_bookable',
    );

    // Mark Reviewed never unlocks an emergency report.
    const emergencyDoctor = await stack.signInDoctor('emergency');
    setSupabaseClient(emergencyDoctor.client);
    const review = await api.markReportReviewed(report!.id);
    assert.equal(review.success, true);
    setSupabaseClient(patient.client);

    await assert.rejects(
      () => api.getAvailableSlots(report!.id),
      (error: unknown) => (error as { code?: string }).code === 'not_bookable',
    );
  });

  it('answering Yes to the clarification enters the urgent flow', async () => {
    const { sessionId } = await consentedSession();
    await answer(sessionId, 'name', 'Neha Ambiguous');
    await answer(sessionId, 'age', '29');
    await answer(sessionId, 'gender', 'Female');
    const ambiguous = await answer(sessionId, 'primary_concern', 'chest pain');
    assert.equal(ambiguous.current_question?.id, 'emergency_clarification');

    const confirmed = await answer(sessionId, 'emergency_clarification', 'Yes');
    assert.equal(confirmed.emergency_triggered, true);
    assert.equal(confirmed.session_status, 'emergency');

    const report = await reportRowFor(sessionId);
    assert.equal(report?.status, 'urgent_partial');
  });

  it('answering No negates only that candidate and keeps routine intake going', async () => {
    const { sessionId } = await consentedSession();
    await answer(sessionId, 'name', 'Amit No');
    await answer(sessionId, 'age', '37');
    await answer(sessionId, 'gender', 'Male');
    await answer(sessionId, 'primary_concern', 'chest pain');
    const negated = await answer(sessionId, 'emergency_clarification', 'No');

    assert.equal(negated.emergency_triggered, undefined);
    assert.equal(negated.session_status, 'in_progress');
    assert.notEqual(negated.current_question?.id, 'emergency_clarification');

    const sessionRow = await stack.rest<Array<{ needs_human_review: boolean; clarification_answer: string }>>(
      `sessions?select=needs_human_review,clarification_answer&id=eq.${sessionId}`,
    );
    // "No" is not a safety clearance, but it does not invent a review flag either.
    assert.equal(sessionRow[0]?.clarification_answer, 'No');
  });

  it('an audio turn returns transcript_preview without consuming a turn', async () => {
    const { sessionId } = await consentedSession();
    const before = await api.resumeSession(sessionId);
    const audioBase64 = Buffer.from('RIFF0000WAVEfmt ').toString('base64');

    const preview = await api.chatTurn({
      action: 'submit_turn',
      session_id: sessionId,
      question_id: 'name',
      audio_base64: audioBase64,
      audio_format: 'audio/wav',
    });

    assert.equal(preview.transcript_preview?.state, 'transcript_preview');
    assert.equal(preview.transcript_preview?.question_id, 'name');
    assert.ok((preview.transcript_preview?.text.length ?? 0) > 0);
    assert.equal(preview.turn_count, before.turn_count, 'a preview is not an accepted turn');

    const confirmed = await api.chatTurn({
      action: 'submit_turn',
      session_id: sessionId,
      question_id: 'name',
      text: preview.transcript_preview!.text,
    });
    assert.equal(confirmed.turn_count, before.turn_count + 1);
    assert.equal(confirmed.current_question?.id, 'age');

    const rows = await stack.rest<
      Array<{ original_text: string | null; final_text: string; input_mode: string }>
    >(`messages?select=original_text,final_text,input_mode&session_id=eq.${sessionId}&turn_index=eq.1`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].input_mode, 'voice');
    assert.equal(rows[0].original_text, preview.transcript_preview!.text);
  });

  it('audio/webm is rejected before any provider call', async () => {
    const { sessionId } = await consentedSession();
    const before = await stack.stubStats();

    await assert.rejects(
      () =>
        api.chatTurn({
          action: 'submit_turn',
          session_id: sessionId,
          question_id: 'name',
          audio_base64: Buffer.from('webm').toString('base64'),
          audio_format: 'audio/webm',
        }),
      (error: unknown) => (error as { code?: string }).code === 'invalid_request',
    );

    const after = await stack.stubStats();
    assert.equal(after.prismaCalls, before.prismaCalls, 'no Prisma attempt for webm');
  });

  it('resume_session clears a pending preview so the patient can retype', async () => {
    const { sessionId } = await consentedSession();
    await api.chatTurn({
      action: 'submit_turn',
      session_id: sessionId,
      question_id: 'name',
      audio_base64: Buffer.from('RIFF0000WAVEfmt ').toString('base64'),
      audio_format: 'audio/wav',
    });

    const resumed = await api.resumeSession(sessionId);
    assert.equal(resumed.transcript_preview, undefined);
    assert.equal(resumed.turn_count, 0);

    const typed = await answer(sessionId, 'name', 'Typed Instead');
    assert.equal(typed.turn_count, 1);
  });

  it('an unclear answer still leaves intake incomplete at the adaptive budget', async () => {
    const { sessionId } = await consentedSession();
    // An unparseable age leaves a required field "unclear": every scripted and adaptive
    // question has been asked, the report is still incomplete, so the bank is consulted.
    const { response, questions } = await driveIntake(api, sessionId, {
      ...COMPLETE_ANSWERS,
      age: 'forty something',
    });

    const bankQuestions = questions.filter(isBankQuestion);
    assert.ok(bankQuestions.length > 0, `expected an adaptive bank question, got ${questions.join(',')}`);
    assert.ok(bankQuestions.length <= 3, 'adaptive budget is 3 per session');

    assert.equal(response.is_complete, false);
    assert.equal(response.can_submit, false);
    assert.equal(response.is_cap_reached, false);
  });

  it('a pending adaptive question survives resume_session', async () => {
    const { sessionId } = await consentedSession();
    const { bankId } = await driveUntilBankQuestion(sessionId, {
      ...COMPLETE_ANSWERS,
      age: 'forty something',
    });
    assert.ok(bankId, 'expected a bank question to be selected');

    const resumed = await api.resumeSession(sessionId);
    assert.equal(resumed.current_question?.id, bankId);
    assert.ok(resumed.current_question?.text_hi, 'bank questions carry Hindi text');
  });

  it('speak synthesises the current adaptive bank question (real Timbre stub)', async () => {
    const { sessionId } = await consentedSession();
    const { bankId } = await driveUntilBankQuestion(sessionId, {
      ...COMPLETE_ANSWERS,
      age: 'forty something',
    });
    assert.ok(bankId);

    const speech = await api.speak(sessionId, bankId!);
    // The stub returns bytes, so the adaptive path must produce an object URL. Before
    // the M4-S16-B fix `speak` rejected every bank id with a 400 and the paid path was
    // unreachable in the shipped flow.
    assert.ok(speech.audioUrl, 'expected synthesised audio for a bank question');
    assert.match(speech.audioUrl!, /^blob:/);
  });

  it('speak refuses a question that is not the session current question', async () => {
    const { sessionId } = await consentedSession();
    const speech = await api.speak(sessionId, 'allergies');
    assert.equal(speech.audioUrl, undefined);
  });

  it('demo_busy is returned when the local session cap is reached', async () => {
    const patient = await stack.createPatient();
    setSupabaseClient(patient.client);
    const usage = await stack.sessionUsage();
    await stack.setSessionLimit(usage.used);

    try {
      const response = await api.startSession('en');
      assert.equal(response.demo_busy, true);
      assert.equal(response.error, 'demo_busy');
      assert.equal(response.session_id, '');
    } finally {
      await stack.setSessionLimit(usage.used + 50);
    }

    const afterwards = await api.startSession('en');
    assert.equal(afterwards.demo_busy, undefined);
  });

  it('"Not now" leaves the submitted report visible with no appointment', async () => {
    const { patient, sessionId } = await consentedSession();
    await driveIntake(api, sessionId, COMPLETE_ANSWERS);
    const submitted = await api.submitReport({
      action: 'submit_report',
      session_id: sessionId,
      report_id: 'draft',
    });
    const reportId = submitted.submitted_report!.id;

    // No booking call: this is the "Not now" path.
    const appointments = await stack.rest<Array<{ id: string }>>(
      `appointments?select=id&report_id=eq.${reportId}`,
    );
    assert.equal(appointments.length, 0);

    const doctor = await stack.signInDoctor('general_medicine');
    setSupabaseClient(doctor.client);
    const visible = await api.getDoctorReportDetail(reportId);
    assert.ok(visible, 'the report stays visible to the assigned doctor');
    assert.equal(visible!.status, 'submitted');
    setSupabaseClient(patient.client);
  });
});
