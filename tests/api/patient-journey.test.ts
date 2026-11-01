/**
 * Patient journey over the real local stack.
 *
 * Everything here is a real call: real anonymous Supabase Auth, real chat-turn HTTP,
 * real Postgres writes, real RLS-protected doctor reads, real RPCs. The only stub is the
 * provider HTTP endpoint (Prisma/Timbre/Groq) reachable on 127.0.0.1:8787.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LocalStack, loadLocalConfig } from './harness';
import { COMPLETE_ANSWERS, driveIntake } from './drive';

/** Corrections that deliberately break the allowlist, to prove the backend rejects them. */
function unsafeUpdates(value: Record<string, { status: 'provided' | 'declined'; value: unknown }>) {
  return value as unknown as import('../../src/types/api').CorrectDraftReportAction['updates'];
}

const config = loadLocalConfig();
const api = await import('../../src/lib/api');
const { setSupabaseClient } = await import('../../src/lib/supabase');
const { CONSENT_VERSION } = await import('../../src/types/consent');

const stack = new LocalStack(config);
api.setAppMode('supabase');

interface DoctorSession {
  client: import('@supabase/supabase-js').SupabaseClient;
  token: string;
  email: string;
  doctorId: string;
}

const state: {
  patient: Awaited<ReturnType<LocalStack['createPatient']>> | null;
  sessionId: string;
  submittedReportId: string;
  doctorId: string;
  referenceCode: string;
  slotStart: string;
  doctor: DoctorSession | null;
} = {
  patient: null,
  sessionId: '',
  submittedReportId: '',
  doctorId: '',
  referenceCode: '',
  slotStart: '',
  doctor: null,
};

describe('M4 frontend integration — patient journey (local Supabase)', () => {
  before(async () => {
    await stack.ensureSessionHeadroom();
    state.patient = await stack.createPatient();
    setSupabaseClient(state.patient.client);
  });

  after(async () => {
    setSupabaseClient(null);
    await stack.cleanup();
  });

  it('startSession creates a server-owned session for the anonymous identity', async () => {
    const response = await api.startSession('en');
    assert.equal(response.demo_busy, undefined);
    assert.match(response.session_id, /^[0-9a-f-]{36}$/);
    assert.equal(response.session_status, 'created');
    assert.equal(response.max_turns, 15);
    assert.equal(response.turn_count, 0);
    state.sessionId = response.session_id;
  });

  it('record_consent with the versioned copy advances to the first fixed question', async () => {
    const response = await api.recordConsent(state.sessionId, true, 'en', CONSENT_VERSION);
    assert.equal(response.session_status, 'consented');
    assert.equal(response.current_question?.id, 'name');
    assert.equal(response.can_submit, false);
  });

  it('rejects a consent version the server cannot attest to', async () => {
    const patient = await stack.createPatient();
    setSupabaseClient(patient.client);
    const created = await api.startSession('en');
    await assert.rejects(
      () => api.recordConsent(created.session_id, true, 'en', '1999-01-01.v0'),
      (error: unknown) => (error as { code?: string }).code === 'invalid_request',
    );
    setSupabaseClient(state.patient!.client);
  });

  it('answering a question that is no longer current returns invalid_question_state', async () => {
    await assert.rejects(
      () =>
        api.chatTurn({
          action: 'submit_turn',
          session_id: state.sessionId,
          question_id: 'age',
          text: '34',
        }),
      (error: unknown) => (error as { code?: string }).code === 'invalid_question_state',
    );
  });

  it('a completed intake returns a draft report with explicit field statuses', async () => {
    const { response, questions } = await driveIntake(api, state.sessionId, COMPLETE_ANSWERS);

    assert.equal(response.is_complete, true);
    assert.equal(response.can_submit, true);
    assert.equal(response.turn_count, 10);
    assert.deepEqual(questions, [
      'name',
      'age',
      'gender',
      'primary_concern',
      'duration',
      'severity',
      'conditions',
      'medications',
      'allergies',
      'other_symptoms',
    ]);

    const draft = response.draft_report;
    assert.ok(draft, 'draft_report must be present');
    assert.equal(draft!.patient.name.status, 'provided');
    assert.equal(draft!.patient.name.value, COMPLETE_ANSWERS.name);
    // "Prefer not to say" is a handled answer, never a value (report v1.2 invariant).
    assert.equal(draft!.patient.gender.status, 'declined');
    assert.equal(draft!.patient.gender.value, null);
    assert.equal(draft!.routing_snapshot.department_key, 'general_medicine');
    assert.equal(draft!.routing_snapshot.preliminary, true);
    assert.equal(draft!.emergency, null);
    assert.ok(Array.isArray(draft!.missing_information));
    state.doctorId = draft!.routing_snapshot.doctor_id;
  });

  it('resume_session returns the same draft without consuming a turn', async () => {
    const resumed = await api.resumeSession(state.sessionId);
    assert.equal(resumed.turn_count, 10);
    assert.equal(resumed.is_complete, true);
    assert.ok(resumed.draft_report);
    assert.equal(resumed.draft_report!.patient.age.value, 34);
  });

  it('a correction updates an allowlisted draft field', async () => {
    const response = await api.correctDraftReport({
      action: 'correct_draft_report',
      session_id: state.sessionId,
      // The real UI only knows the session, so it sends a placeholder. The API drops a
      // non-uuid report id and the backend resolves the session's single report.
      report_id: 'draft',
      updates: {
        'clinical_details.duration': { status: 'provided', value: 'four weeks' },
      },
    });
    assert.equal(response.draft_report?.clinical_details.duration.value, 'four weeks');
    assert.equal(response.can_submit, true);
  });

  it('declining a required field is rejected with invalid_field_status', async () => {
    await assert.rejects(
      () =>
        api.correctDraftReport({
          action: 'correct_draft_report',
          session_id: state.sessionId,
          report_id: 'draft',
          updates: { 'clinical_details.severity': { status: 'declined', value: null } },
        }),
      (error: unknown) => (error as { code?: string }).code === 'invalid_field_status',
    );
  });

  it('a protected field is rejected with field_not_editable', async () => {
    await assert.rejects(
      () =>
        api.correctDraftReport({
          action: 'correct_draft_report',
          session_id: state.sessionId,
          report_id: 'draft',
          updates: unsafeUpdates({
            routing_snapshot: { status: 'provided', value: { department_key: 'cardiology' } },
          }),
        }),
      (error: unknown) => (error as { code?: string }).code === 'field_not_editable',
    );
  });

  it('submitReport marks the report submitted and owned by the verified patient', async () => {
    const response = await api.submitReport({
      action: 'submit_report',
      session_id: state.sessionId,
      report_id: 'draft',
    });
    const submitted = response.submitted_report;
    assert.ok(submitted, 'submitted_report must be present');
    assert.equal(submitted!.status, 'submitted');
    assert.ok(submitted!.submitted_at);
    assert.equal(submitted!.possible_urgent, false);
    assert.equal(submitted!.reviewed_at, null);
    assert.equal(response.can_submit, false);
    state.submittedReportId = submitted!.id;
  });

  it('a draft that is already submitted cannot be corrected', async () => {
    await assert.rejects(
      () =>
        api.correctDraftReport({
          action: 'correct_draft_report',
          session_id: state.sessionId,
          report_id: 'draft',
          updates: { 'patient.name': { status: 'provided', value: 'Changed Name' } },
        }),
      (error: unknown) => (error as { code?: string }).code === 'invalid_state',
    );
  });

  it('getAvailableSlots returns real weekday slots from the seeded schedule', async () => {
    const slots = await api.getAvailableSlots(state.submittedReportId);
    assert.ok(slots.length > 0, 'expected routine slots for a submitted GM report');
    for (const slot of slots) {
      // PostgREST serialises timestamptz in UTC; the instant is Asia/Kolkata clinic time.
      assert.ok(!Number.isNaN(Date.parse(slot.start_time)));
      assert.ok(new Date(slot.end_time) > new Date(slot.start_time));
      const istHour = Number(
        new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
          .format(new Date(slot.start_time)),
      );
      assert.ok(istHour >= 9 && istHour < 17, `slot ${slot.start_time} is outside 09:00–17:00 IST`);
      assert.equal(slot.is_available, true);
    }
    state.slotStart = slots[0].start_time;
  });

  it('bookAppointment reserves the slot and returns a server-generated reference', async () => {
    const response = await api.bookAppointment({
      report_id: state.submittedReportId,
      slot_id: state.slotStart,
      slot_start: state.slotStart,
      patient_name: COMPLETE_ANSWERS.name,
    });
    assert.match(response.reference_code, /^APT-\d{8}-[A-Z0-9]{6}$/);
    assert.equal(response.already_booked, false, 'first booking is not an idempotent repeat');
    assert.equal(response.appointment.doctor_id, state.doctorId);
    // Display fields come from the reference tables, not the demo seed constants.
    assert.equal(response.appointment.doctor_name, 'Dr. Aditi Rao');
    assert.equal(response.appointment.department_name, 'General Medicine');
    assert.equal(response.appointment.patient_name, COMPLETE_ANSWERS.name);
    state.referenceCode = response.reference_code;
  });

  it('booking the same slot again is idempotent and returns the original appointment', async () => {
    const response = await api.bookAppointment({
      report_id: state.submittedReportId,
      slot_id: state.slotStart,
      slot_start: state.slotStart,
    });
    assert.equal(response.already_booked, true);
    assert.equal(response.reference_code, state.referenceCode);
  });

  it('booking a different slot for an already-booked report is a conflict', async () => {
    const slots = await api.getAvailableSlots(state.submittedReportId);
    assert.ok(slots.length > 0);
    await assert.rejects(
      () =>
        api.bookAppointment({
          report_id: state.submittedReportId,
          slot_start: slots[0].start_time,
        }),
      (error: unknown) => (error as { code?: string }).code === 'slot_taken',
    );
  });

  it('another patient cannot read or book this report', async () => {
    const other = await stack.createPatient();
    setSupabaseClient(other.client);
    try {
      await assert.rejects(
        () => api.getAvailableSlots(state.submittedReportId),
        (error: unknown) => (error as { code?: string }).code === 'not_found',
      );
      await assert.rejects(
        () =>
          api.bookAppointment({
            report_id: state.submittedReportId,
            slot_start: state.slotStart,
          }),
        (error: unknown) => (error as { code?: string }).code === 'not_found',
      );
      await assert.rejects(
        () => api.resumeSession(state.sessionId),
        (error: unknown) => (error as { code?: string }).code === 'not_found',
      );
    } finally {
      setSupabaseClient(state.patient!.client);
    }
  });

  it('doctorLogin resolves the mapped doctor identity', async () => {
    state.doctor = await stack.signInDoctor('general_medicine');
    setSupabaseClient(state.doctor.client);
    const login = await api.doctorLogin(state.doctor.email, config.doctorPassword);
    assert.equal(login.doctor.id, state.doctor.doctorId);
    assert.equal(login.doctor.name, 'Dr. Aditi Rao');
    assert.equal(login.doctor.department_key, 'general_medicine');
    assert.equal(login.doctor.routine_slots_enabled, true);
    assert.ok(login.token.length > 0);
  });

  it('doctorLogin refuses an Auth user with no doctor_profiles row', async () => {
    const patient = await stack.createPatient();
    setSupabaseClient(patient.client);
    // Anonymous identities have no password, so this also covers "not a mapped doctor".
    await assert.rejects(
      () => api.doctorLogin('doctor-gm@rls.test', 'wrong-password'),
      (error: unknown) => (error as { code?: string }).code === 'invalid_credentials',
    );
    setSupabaseClient(state.doctor!.client);
  });

  it('the assigned doctor sees the submitted report and its conversation', async () => {
    const reports = await api.getDoctorReports();
    const report = reports.find((row) => row.id === state.submittedReportId);
    assert.ok(report, 'assigned doctor must see the submitted report');
    assert.equal(report!.status, 'submitted');

    const detail = await api.getDoctorReportDetail(state.submittedReportId);
    assert.ok(detail);
    assert.equal(detail!.report.patient.name.value, COMPLETE_ANSWERS.name);
    assert.equal(detail!.report.routing_snapshot.department_key, 'general_medicine');
  });

  it('the doctor appointments read is now possible and includes the booking', async () => {
    const appointments = await api.getDoctorAppointments();
    const booking = appointments.find((row) => row.report_id === state.submittedReportId);
    assert.ok(booking, 'doctor must see their own confirmed appointment');
    assert.equal(booking!.reference_code, state.referenceCode);
    assert.equal(booking!.doctor_name, 'Dr. Aditi Rao');
    assert.equal(booking!.patient_name, COMPLETE_ANSWERS.name);
    assert.equal(booking!.status, 'confirmed');
  });

  it('dashboard statistics are derived from the visible reports and appointments', async () => {
    const stats = await api.getDoctorDashboardStats();
    assert.ok(stats.new_reports >= 1);
    assert.ok(stats.booked >= 1);
    assert.ok(stats.urgent >= 0);
    assert.ok(stats.not_booked >= 0);
  });

  it('markReportReviewed records only the review identity and timestamp', async () => {
    const review = await api.markReportReviewed(state.submittedReportId);
    assert.equal(review.success, true);
    assert.equal(review.report_id, state.submittedReportId);
    assert.ok(review.reviewed_at);
    assert.equal(review.reviewed_by, (await state.doctor!.client.auth.getUser()).data.user!.id);
    assert.equal(review.already_reviewed, false);

    const again = await api.markReportReviewed(state.submittedReportId);
    assert.equal(again.already_reviewed, true);
    assert.equal(again.reviewed_at, review.reviewed_at);

    const detail = await api.getDoctorReportDetail(state.submittedReportId);
    assert.equal(detail!.status, 'submitted', 'review must not change status');
    assert.equal(detail!.report.primary_concern.status, 'provided');
  });

  it('doctorLogout clears the doctor session', async () => {
    await api.doctorLogout();
    const session = await state.doctor!.client.auth.getSession();
    assert.equal(session.data.session, null);
    setSupabaseClient(state.patient!.client);
  });
});
