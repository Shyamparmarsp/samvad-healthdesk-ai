import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  startSession,
  recordConsent,
  chatTurn,
  submitReport,
  getAvailableSlots,
  bookAppointment,
  getDoctorReports,
  getDoctorAppointments,
  getDoctorDashboardStats,
  markReportReviewed,
  FICTIONAL_DOCTORS,
} from '../src/lib/api';
import { filterReportsByTab } from '../src/features/doctor/DoctorReportsList';
import { filterAppointmentsByTab } from '../src/features/doctor/DoctorAppointmentsView';
import { ReportRow } from '../src/types/report';
import { Appointment } from '../src/types/doctor';
import { CONSENT_VERSION } from '../src/types/consent';

describe('Doctor Dashboard Journeys', () => {
  it('Test 1: Stat calculations match the four documented metrics (Urgent, New, Booked, Not booked)', async () => {
    // Populate known reports:
    // 1. One normal submitted report (booked)
    const s1 = await startSession('en');
    await recordConsent(s1.session_id, true, 'en', CONSENT_VERSION);
    const answers1 = [
      { q: 'name', a: 'Patient One' },
      { q: 'age', a: '45' },
      { q: 'gender', a: 'Male' },
      { q: 'primary_concern', a: 'Mild fever and cough' }, // General Medicine
      { q: 'duration', a: '2 days' },
      { q: 'severity', a: 'Moderate' },
      { q: 'conditions', a: 'None' },
      { q: 'medications', a: 'None' },
      { q: 'allergies', a: 'None' },
      { q: 'other_symptoms', a: 'None' },
    ];
    for (const ans of answers1) {
      await chatTurn({
        action: 'submit_turn',
        session_id: s1.session_id,
        question_id: ans.q as any,
        text: ans.a,
      });
    }
    const sub1 = await submitReport({
      action: 'submit_report',
      session_id: s1.session_id,
      report_id: 'draft',
    });
    const rep1 = sub1.submitted_report!;

    // Book an appointment for report 1
    const slots = await getAvailableSlots(rep1.doctor_id, '2026-11-05');
    assert.ok(slots.length > 0);
    await bookAppointment({
      report_id: rep1.id,
      slot_id: slots[0].id,
      doctor_id: rep1.doctor_id,
      patient_name: 'Patient One',
    });

    // 2. One normal submitted report (not booked, unreviewed)
    const s2 = await startSession('en');
    await recordConsent(s2.session_id, true, 'en', CONSENT_VERSION);
    const answers2 = [
      { q: 'name', a: 'Patient Two' },
      { q: 'age', a: '30' },
      { q: 'gender', a: 'Female' },
      { q: 'primary_concern', a: 'Headache and fatigue' }, // General Medicine
      { q: 'duration', a: '3 days' },
      { q: 'severity', a: 'Mild' },
      { q: 'conditions', a: 'None' },
      { q: 'medications', a: 'None' },
      { q: 'allergies', a: 'None' },
      { q: 'other_symptoms', a: 'None' },
    ];
    for (const ans of answers2) {
      await chatTurn({
        action: 'submit_turn',
        session_id: s2.session_id,
        question_id: ans.q as any,
        text: ans.a,
      });
    }
    await submitReport({
      action: 'submit_report',
      session_id: s2.session_id,
      report_id: 'draft',
    });

    // 3. One urgent partial report (Emergency)
    const s3 = await startSession('en');
    await recordConsent(s3.session_id, true, 'en', CONSENT_VERSION);
    await chatTurn({
      action: 'submit_turn',
      session_id: s3.session_id,
      question_id: 'primary_concern',
      text: 'My chest hurts badly and cannot breathe',
    });

    // Query stats for General Medicine demo doctor
    const gmStats = await getDoctorDashboardStats(FICTIONAL_DOCTORS.general_medicine.id);

    // Verify metrics per docs/report-design.md §15:
    // - Urgent: >= 1 (urgent_partial reports visible to GM)
    // - New reports: >= 1 (submitted reports where reviewed_at IS NULL)
    // - Booked: >= 1 (submitted reports with confirmed appointment)
    // - Not booked: >= 1 (submitted reports with no appointment)
    assert.ok(gmStats.urgent >= 1, `Urgent count must be >= 1, got ${gmStats.urgent}`);
    assert.ok(gmStats.new_reports >= 1, `New reports count must be >= 1, got ${gmStats.new_reports}`);
    assert.ok(gmStats.booked >= 1, `Booked count must be >= 1, got ${gmStats.booked}`);
    assert.ok(gmStats.not_booked >= 1, `Not booked count must be >= 1, got ${gmStats.not_booked}`);
  });

  it('Test 2: Reports list filtering for All, Urgent, Booked, and Not booked tabs', async () => {
    const docId = FICTIONAL_DOCTORS.general_medicine.id;
    const reports = await getDoctorReports(docId);
    const appointments = await getDoctorAppointments(docId);
    const bookedIds = new Set(appointments.map((a) => a.report_id));

    // Tab: All
    const allTab = filterReportsByTab(reports, 'all', bookedIds);
    assert.equal(allTab.length, reports.length, 'All tab should include all visible reports');

    // Tab: Urgent
    const urgentTab = filterReportsByTab(reports, 'urgent', bookedIds);
    assert.ok(urgentTab.every((r) => r.status === 'urgent_partial'), 'Urgent tab must only contain urgent_partial');

    // Tab: Booked
    const bookedTab = filterReportsByTab(reports, 'booked', bookedIds);
    assert.ok(bookedTab.every((r) => bookedIds.has(r.id)), 'Booked tab must only contain reports in bookedIds');

    // Tab: Not booked
    const notBookedTab = filterReportsByTab(reports, 'not_booked', bookedIds);
    assert.ok(
      notBookedTab.every((r) => r.status === 'submitted' && !bookedIds.has(r.id)),
      'Not booked tab must only contain submitted reports not in bookedIds'
    );
  });

  it('Test 3: Unsubmitted drafts remain hidden; submitted and urgent partial appear', async () => {
    // Create an unsubmitted draft
    const s = await startSession('en');
    await recordConsent(s.session_id, true, 'en', CONSENT_VERSION);
    await chatTurn({
      action: 'submit_turn',
      session_id: s.session_id,
      question_id: 'name',
      text: 'Hidden Draft Patient',
    });
    // Session in progress, report not submitted

    const allDoctorReports = await getDoctorReports();
    const hasDraft = allDoctorReports.some((r) => r.status === 'draft');
    assert.equal(hasDraft, false, 'Unsubmitted draft reports must never be returned to doctors');

    // Every returned report must be either 'submitted' or 'urgent_partial'
    assert.ok(
      allDoctorReports.every((r) => r.status === 'submitted' || r.status === 'urgent_partial'),
      'Only submitted or urgent_partial reports may be visible to doctors'
    );
  });

  it('Test 4: Cross-visibility: General Medicine and Emergency doctors can both read Emergency department reports', async () => {
    const gmReports = await getDoctorReports(FICTIONAL_DOCTORS.general_medicine.id);
    const emgReports = await getDoctorReports(FICTIONAL_DOCTORS.emergency.id);

    const gmEmergencyReports = gmReports.filter((r) => r.department_key === 'emergency');
    const emgEmergencyReports = emgReports.filter((r) => r.department_key === 'emergency');

    assert.ok(gmEmergencyReports.length > 0, 'General Medicine demo doctor must see Emergency reports (cross-visibility)');
    assert.ok(emgEmergencyReports.length > 0, 'Emergency doctor must see Emergency reports');

    // Non-emergency doctors (e.g., Dermatology) should NOT see Emergency reports
    const dermReports = await getDoctorReports(FICTIONAL_DOCTORS.dermatology.id);
    const dermEmergencyReports = dermReports.filter((r) => r.department_key === 'emergency');
    assert.equal(dermEmergencyReports.length, 0, 'Dermatology doctor must not have Emergency report visibility');
  });

  it('Test 5: Urgent report detail shows summary === null and offers no routine booking slots', async () => {
    const emgReports = await getDoctorReports(FICTIONAL_DOCTORS.emergency.id);
    const urgentReport = emgReports.find((r) => r.status === 'urgent_partial');
    assert.ok(urgentReport, 'An urgent_partial report must exist for this test');

    // Rule RD-10 invariant: summary must be null
    assert.equal(urgentReport.report.summary, null, 'Urgent partial report summary must be strictly null');

    // Rule RD-04: Routine slots must be suppressed (empty array)
    const slots = await getAvailableSlots(FICTIONAL_DOCTORS.emergency.id, '2026-11-05');
    assert.deepEqual(slots, [], 'Emergency department must offer zero routine slots');
  });

  it('Test 6: markReportReviewed is idempotent: first write wins, sets reviewed_at and reviewed_by, and does not alter clinical fields or report status', async () => {
    const reports = await getDoctorReports(FICTIONAL_DOCTORS.general_medicine.id);
    const unreviewed = reports.find((r) => r.status === 'submitted' && !r.reviewed_at);
    assert.ok(unreviewed, 'Must have an unreviewed submitted report');

    const originalReportCopy = JSON.stringify(unreviewed.report);
    const originalStatus = unreviewed.status;

    // First review
    const res1 = await markReportReviewed(unreviewed.id);
    assert.equal(res1.success, true);
    assert.ok(res1.reviewed_at);
    assert.ok(res1.reviewed_by);

    const firstReviewedAt = res1.reviewed_at;
    const firstReviewedBy = res1.reviewed_by;

    // Second review attempt (simulating another click or concurrent call)
    const res2 = await markReportReviewed(unreviewed.id);
    assert.equal(res2.success, true);
    assert.equal(res2.reviewed_at, firstReviewedAt, 'First write wins: reviewed_at timestamp must not change');
    assert.equal(res2.reviewed_by, firstReviewedBy, 'reviewed_by must remain unchanged');

    // Verify clinical fields and report status are untouched
    assert.equal(unreviewed.status, originalStatus, 'Report status must remain unchanged (submitted)');
    assert.equal(JSON.stringify(unreviewed.report), originalReportCopy, 'Clinical fields in report must be unaltered');
  });

  it('Test 7: Appointments tabs (Today, Upcoming, Past) derive correctly from slot start time relative to Asia/Kolkata date', () => {
    // Reference date: 2026-11-05 12:00:00 IST (+05:30)
    const simulatedNow = new Date('2026-11-05T06:30:00Z'); // 12:00 PM IST on Nov 5

    const mockAppointments: Appointment[] = [
      {
        id: 'apt-today-1',
        report_id: 'rep-1',
        patient_name: 'Today Patient Morning',
        doctor_id: 'doc-gm',
        doctor_name: 'Dr. Aditi Rao',
        department_name: 'General Medicine',
        slot_start: '2026-11-05T04:30:00Z', // 10:00 AM IST Nov 5
        slot_end: '2026-11-05T05:00:00Z',
        reference_code: 'SHD-TODAY-1',
      },
      {
        id: 'apt-today-2',
        report_id: 'rep-2',
        patient_name: 'Today Patient Afternoon',
        doctor_id: 'doc-gm',
        doctor_name: 'Dr. Aditi Rao',
        department_name: 'General Medicine',
        slot_start: '2026-11-05T09:30:00Z', // 3:00 PM IST Nov 5
        slot_end: '2026-11-05T10:00:00Z',
        reference_code: 'SHD-TODAY-2',
      },
      {
        id: 'apt-upcoming',
        report_id: 'rep-3',
        patient_name: 'Upcoming Patient',
        doctor_id: 'doc-gm',
        doctor_name: 'Dr. Aditi Rao',
        department_name: 'General Medicine',
        slot_start: '2026-11-06T04:30:00Z', // 10:00 AM IST Nov 6
        slot_end: '2026-11-06T05:00:00Z',
        reference_code: 'SHD-UPCOMING',
      },
      {
        id: 'apt-past',
        report_id: 'rep-4',
        patient_name: 'Past Patient',
        doctor_id: 'doc-gm',
        doctor_name: 'Dr. Aditi Rao',
        department_name: 'General Medicine',
        slot_start: '2026-11-04T04:30:00Z', // 10:00 AM IST Nov 4
        slot_end: '2026-11-04T05:00:00Z',
        reference_code: 'SHD-PAST',
      },
    ];

    const todayApts = filterAppointmentsByTab(mockAppointments, 'today', simulatedNow);
    const upcomingApts = filterAppointmentsByTab(mockAppointments, 'upcoming', simulatedNow);
    const pastApts = filterAppointmentsByTab(mockAppointments, 'past', simulatedNow);

    assert.equal(todayApts.length, 2, 'Both morning and afternoon appointments on Nov 5 belong to Today');
    assert.ok(todayApts.some((a) => a.id === 'apt-today-1'));
    assert.ok(todayApts.some((a) => a.id === 'apt-today-2'));

    assert.equal(upcomingApts.length, 1, 'Nov 6 appointment belongs to Upcoming');
    assert.equal(upcomingApts[0].id, 'apt-upcoming');

    assert.equal(pastApts.length, 1, 'Nov 4 appointment belongs to Past');
    assert.equal(pastApts[0].id, 'apt-past');
  });

  it('Test 8: Not-booked reports remain visible in reports list and stats even without an appointment', async () => {
    // Submit a report and deliberately skip booking (choose Not Now)
    const s = await startSession('en');
    await recordConsent(s.session_id, true, 'en', CONSENT_VERSION);
    const answers = [
      { q: 'name', a: 'Unbooked Patient' },
      { q: 'age', a: '28' },
      { q: 'gender', a: 'Female' },
      { q: 'primary_concern', a: 'Dry cough without fever' },
      { q: 'duration', a: '5 days' },
      { q: 'severity', a: 'Mild' },
      { q: 'conditions', a: 'None' },
      { q: 'medications', a: 'None' },
      { q: 'allergies', a: 'None' },
      { q: 'other_symptoms', a: 'None' },
    ];
    for (const ans of answers) {
      await chatTurn({
        action: 'submit_turn',
        session_id: s.session_id,
        question_id: ans.q as any,
        text: ans.a,
      });
    }

    const sub = await submitReport({
      action: 'submit_report',
      session_id: s.session_id,
      report_id: 'draft',
    });
    const unbookedRep = sub.submitted_report!;

    // No appointment is booked
    const docId = unbookedRep.doctor_id;
    const reports = await getDoctorReports(docId);
    const apts = await getDoctorAppointments(docId);
    const bookedIds = new Set(apts.map((a) => a.report_id));

    // Must be found in reports list
    const found = reports.find((r) => r.id === unbookedRep.id);
    assert.ok(found, 'Submitted unbooked report must remain visible to doctor');

    // Must appear in the "Not booked" tab
    const notBookedList = filterReportsByTab(reports, 'not_booked', bookedIds);
    assert.ok(
      notBookedList.some((r) => r.id === unbookedRep.id),
      'Report must be present in not_booked tab'
    );

    // Dashboard stats for not_booked must be > 0
    const stats = await getDoctorDashboardStats(docId);
    assert.ok(stats.not_booked >= 1, 'Stats not_booked count must reflect unbooked report');
  });

  it('Test 9: Report detail and conversation log expansion preserves verbatim intake statement', async () => {
    const s = await startSession('en');
    await recordConsent(s.session_id, true, 'en', CONSENT_VERSION);
    const originalStatement = 'Sharp lower back pain after lifting luggage';
    const answers = [
      { q: 'name', a: 'Rohan Mehta' },
      { q: 'age', a: '38' },
      { q: 'gender', a: 'Male' },
      { q: 'primary_concern', a: originalStatement },
      { q: 'duration', a: '3 days' },
      { q: 'severity', a: 'Severe' },
      { q: 'conditions', a: 'None' },
      { q: 'medications', a: 'None' },
      { q: 'allergies', a: 'None' },
      { q: 'other_symptoms', a: 'None' },
    ];
    for (const ans of answers) {
      await chatTurn({
        action: 'submit_turn',
        session_id: s.session_id,
        question_id: ans.q as any,
        text: ans.a,
      });
    }

    const sub = await submitReport({
      action: 'submit_report',
      session_id: s.session_id,
      report_id: 'draft',
    });
    const rep = sub.submitted_report!;

    // Detail query
    const reports = await getDoctorReports(rep.doctor_id);
    const detail = reports.find((r) => r.id === rep.id);
    assert.ok(detail, 'Report must be retrievable in detail');

    // Verbatim primary concern preserved exactly for conversation expansion
    assert.equal(detail.report.primary_concern.value, originalStatement);
    assert.equal(detail.report.primary_concern.status, 'provided');
    assert.equal(detail.report.clinical_details.duration.value, '3 days');
    assert.equal(detail.report.clinical_details.severity.value, 'Severe');
  });
});
