import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setAppMode,
  startSession,
  recordConsent,
  chatTurn,
  submitReport,
  getDoctorReports,
  FICTIONAL_DOCTORS,
} from '../src/lib/api';
import { filterReportsByTab } from '../src/features/doctor/DoctorReportsList';
import { CONSENT_VERSION } from '../src/types/consent';
import type { ReportRow } from '../src/types/report';

/**
 * v1.3 early finish, end to end through the API layer in mock mode.
 *
 * The threshold, the status and the doctor visibility are the same rules the backend
 * enforces; these tests pin the behaviour the UI depends on.
 */

async function sessionWithAnswers(count: number) {
  const started = await startSession('en');
  await recordConsent(started.session_id, true, 'en', CONSENT_VERSION);
  const script: Array<[string, string]> = [
    ['name', 'Synthetic Patient'],
    ['age', '44'],
    ['gender', 'Female'],
    ['primary_concern', 'knee pain when walking'],
    ['duration', 'two weeks'],
  ];
  let last = started;
  for (let i = 0; i < count; i += 1) {
    last = await chatTurn({
      action: 'submit_turn',
      session_id: started.session_id,
      question_id: script[i][0] as never,
      text: script[i][1],
    });
  }
  return { sessionId: started.session_id, last };
}

describe('v1.3 early finish — eligibility', () => {
  beforeEach(() => setAppMode('mock'));

  it('1. a partial report cannot be previewed before three accepted answers', async () => {
    const { sessionId } = await sessionWithAnswers(2);
    await assert.rejects(
      async () => await submitReport({ action: 'submit_report', session_id: sessionId, report_id: '', partial: true, preview: true }),
      (error: any) => error?.code === 'invalid_state',
    );
  });

  it('2. three answers unlock the preview and it sends nothing', async () => {
    const { sessionId } = await sessionWithAnswers(3);
    const preview = await submitReport({
      action: 'submit_report',
      session_id: sessionId,
      report_id: '',
      partial: true,
      preview: true,
    });
    assert.ok(preview.draft_report, 'preview document returned');
    assert.equal(preview.submitted_report, undefined, 'nothing was sent');
    assert.equal(preview.can_finish_partial, true, 'still eligible');
    assert.equal(preview.draft_report?.patient.name.value, 'Synthetic Patient');
    assert.equal(preview.draft_report?.clinical_details.allergies.status, 'not_asked', 'unanswered stays explicit');
  });

  it('3. sending produces a partial report, never urgent_partial', async () => {
    const { sessionId } = await sessionWithAnswers(3);
    const sent = await submitReport({
      action: 'submit_report',
      session_id: sessionId,
      report_id: '',
      partial: true,
    });
    assert.equal(sent.submitted_report?.status, 'partial');
    assert.notEqual(sent.submitted_report?.status, 'urgent_partial');
    assert.ok(sent.submitted_report?.submitted_at, 'submitted timestamp present');
    assert.equal(sent.submitted_report?.possible_urgent, false, 'not marked urgent');
    assert.equal(sent.session_status, 'submitted');
  });

  it('4. sending twice is idempotent (one report)', async () => {
    const { sessionId } = await sessionWithAnswers(3);
    const first = await submitReport({ action: 'submit_report', session_id: sessionId, report_id: '', partial: true });
    const second = await submitReport({ action: 'submit_report', session_id: sessionId, report_id: '', partial: true });
    assert.equal(second.submitted_report?.id, first.submitted_report?.id, 'same report returned');
  });

  it('5. five answers also work (the patient may keep answering)', async () => {
    const { sessionId } = await sessionWithAnswers(5);
    const sent = await submitReport({ action: 'submit_report', session_id: sessionId, report_id: '', partial: true });
    assert.equal(sent.submitted_report?.status, 'partial');
    assert.ok(sent.accepted_answer_count === undefined || sent.accepted_answer_count >= 3);
  });
});

describe('v1.3 early finish — doctor visibility', () => {
  beforeEach(() => setAppMode('mock'));

  const makeReport = (overrides: Partial<ReportRow>): ReportRow =>
    ({
      id: 'rep-1',
      session_id: 'sess-1',
      user_id: 'user-1',
      status: 'partial',
      schema_version: 1,
      department_key: 'general_medicine',
      doctor_id: FICTIONAL_DOCTORS.general_medicine.id,
      intake_reference: 'SHD-20261104-AAAAAA',
      possible_urgent: false,
      needs_human_review: false,
      emergency_rule_id: null,
      submitted_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      report: {
        schema_version: 1,
        patient: {
          name: { status: 'provided', value: 'Synthetic Patient' },
          age: { status: 'provided', value: 44 },
          gender: { status: 'provided', value: 'female' },
          language: 'en',
        },
        primary_concern: { status: 'not_asked', value: null },
        clinical_details: {
          duration: { status: 'not_asked', value: null },
          severity: { status: 'not_asked', value: null },
          conditions: { status: 'not_asked', value: null },
          medications: { status: 'not_asked', value: null },
          allergies: { status: 'not_asked', value: null },
          other_symptoms: { status: 'not_asked', value: null },
        },
        missing_information: ['primary_concern', 'clinical_details.allergies'],
        summary: null,
        routing_snapshot: {
          department_key: 'general_medicine',
          department_name: 'General Medicine',
          doctor_id: FICTIONAL_DOCTORS.general_medicine.id,
          doctor_name: 'Dr. Aditi Rao',
          is_fallback: true,
          preliminary: true,
        },
        emergency: null,
      },
      ...overrides,
    }) as ReportRow;

  it('6. a partial report appears in All and Not booked, never in Urgent', () => {
    const partial = makeReport({});
    assert.equal(filterReportsByTab([partial], 'all', new Set()).length, 1, 'visible in All');
    assert.equal(filterReportsByTab([partial], 'not_booked', new Set()).length, 1, 'visible in Not booked');
    assert.equal(filterReportsByTab([partial], 'urgent', new Set()).length, 0, 'never in the urgent queue');
    assert.equal(filterReportsByTab([partial], 'booked', new Set()).length, 0, 'not booked yet');
  });

  it('7. a booked partial report moves to Booked', () => {
    const partial = makeReport({});
    const booked = new Set([partial.id]);
    assert.equal(filterReportsByTab([partial], 'booked', booked).length, 1);
    assert.equal(filterReportsByTab([partial], 'not_booked', booked).length, 0);
  });

  it('8. an urgent_partial report stays urgent-only', () => {
    const urgent = makeReport({ status: 'urgent_partial' });
    assert.equal(filterReportsByTab([urgent], 'urgent', new Set()).length, 1);
    assert.equal(filterReportsByTab([urgent], 'not_booked', new Set()).length, 0);
  });

  it('9. the patient can see their sent partial report through the doctor list mock', async () => {
    const { sessionId } = await sessionWithAnswers(3);
    await submitReport({ action: 'submit_report', session_id: sessionId, report_id: '', partial: true });
    const reports = await getDoctorReports();
    assert.ok(reports.some((r) => r.status === 'partial'), 'partial report is doctor-visible');
    assert.equal(reports.some((r) => r.status === 'draft'), false, 'drafts stay private');
  });
});
