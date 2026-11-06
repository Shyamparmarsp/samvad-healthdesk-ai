/**
 * Permanent report deletion — mock backend behaviour and UI wiring.
 *
 * The database-side authorisation and cleanup matrix lives in
 * `tests/security/delete-report-rls.sql` (run by `npm run test:db:security`). These tests
 * cover the client contract, the mock mirror used by the offline demo, and the reusable
 * row markup so the delete control cannot silently disappear from the list.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  deleteDoctorReport,
  getDoctorAppointments,
  getDoctorDashboardStats,
  getDoctorMessages,
  getDoctorReports,
  setAppMode,
  FICTIONAL_DOCTORS,
} from '../src/lib/api';
import { buildReportCounts } from '../src/lib/assistant-summary';

const GM = FICTIONAL_DOCTORS.general_medicine;
const ORTHO = FICTIONAL_DOCTORS.orthopedics;
const EMERGENCY = FICTIONAL_DOCTORS.emergency;

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('Report deletion — mock backend', () => {
  it('1. deletes the report, its appointment and its transcript', async () => {
    setAppMode('mock');
    const reports = await getDoctorReports(ORTHO.id);
    const target = reports.find((report) => report.id === 'rep-ortho-seeded-01');
    assert.ok(target, 'seeded orthopedics report exists');
    assert.equal(target?.status, 'submitted');

    const appointmentsBefore = await getDoctorAppointments(ORTHO.id);
    assert.ok(appointmentsBefore.some((appointment) => appointment.report_id === target!.id), 'has an appointment');

    await deleteDoctorReport(target!.id, ORTHO.id);

    const reportsAfter = await getDoctorReports(ORTHO.id);
    assert.equal(reportsAfter.some((report) => report.id === target!.id), false, 'report row is gone');

    const appointmentsAfter = await getDoctorAppointments(ORTHO.id);
    assert.equal(
      appointmentsAfter.some((appointment) => appointment.report_id === target!.id),
      false,
      'report appointment is gone',
    );

    // The session's transcript is report-exclusive and must not be left orphaned.
    await assert.rejects(getDoctorMessages(target!.id), /not found/i);
  });

  it('2. deleting again fails instead of reporting a second success', async () => {
    setAppMode('mock');
    const reports = await getDoctorReports(ORTHO.id);
    assert.equal(reports.some((report) => report.id === 'rep-ortho-seeded-01'), false);
    await assert.rejects(deleteDoctorReport('rep-ortho-seeded-01', ORTHO.id), /not found/i);
  });

  it('3. an unknown or draft id is refused without disclosing anything', async () => {
    setAppMode('mock');
    await assert.rejects(deleteDoctorReport('00000000-0000-4000-8000-000000000000', GM.id), /not found/i);
    await assert.rejects(deleteDoctorReport('not-a-uuid', GM.id), /not found/i);
  });

  it('4. a doctor cannot delete another doctor\'s report', async () => {
    setAppMode('mock');
    const gmReports = await getDoctorReports(GM.id);
    const emergencyReport = gmReports.find((report) => report.status === 'urgent_partial');
    assert.ok(emergencyReport, 'General Medicine can see the emergency report read-only');

    await assert.rejects(
      deleteDoctorReport(emergencyReport!.id, GM.id),
      (error: { code?: string }) => error.code === 'forbidden',
      'cross-visibility is read-only',
    );

    // The Emergency doctor may delete their own urgent report.
    await deleteDoctorReport(emergencyReport!.id, EMERGENCY.id);
    const emergencyReports = await getDoctorReports(EMERGENCY.id);
    assert.equal(emergencyReports.some((report) => report.id === emergencyReport!.id), false);
  });

  it('5. dashboard statistics and assistant counts drop the deleted report', async () => {
    setAppMode('mock');
    const before = await getDoctorDashboardStats(GM.id);
    const beforeReports = await getDoctorReports(GM.id);
    const beforeCounts = buildReportCounts(beforeReports);

    const target = beforeReports.find((report) => report.status === 'submitted');
    assert.ok(target, 'a submitted report exists for the General Medicine doctor');
    await deleteDoctorReport(target!.id, GM.id);

    const afterReports = await getDoctorReports(GM.id);
    const after = await getDoctorDashboardStats(GM.id);
    const afterCounts = buildReportCounts(afterReports);

    assert.equal(afterReports.some((report) => report.id === target!.id), false);
    assert.equal(afterCounts.total, beforeCounts.total - 1, 'assistant report total drops by one');
    assert.ok(
      after.new_reports <= before.new_reports,
      'the dashboard "New" counter cannot grow after a deletion',
    );
    assert.ok(
      after.urgent + after.booked + after.not_booked <= before.urgent + before.booked + before.not_booked,
      'the other counters cannot grow',
    );
  });
});

describe('Report deletion — UI wiring', () => {
  it('6. the trash button sits immediately before the open arrow on every row', () => {
    const source = read('src/features/doctor/DoctorReportsList.tsx');

    const timeIndex = source.indexOf('{timeFormatted}');
    const trashIndex = source.indexOf('requestDelete(r)');
    const chevronIndex = source.indexOf("d=\"M9 5l7 7-7 7\"");

    assert.ok(timeIndex > 0 && trashIndex > 0 && chevronIndex > 0, 'row markup is present');
    assert.ok(timeIndex < trashIndex, 'trash button comes after the time');
    assert.ok(trashIndex < chevronIndex, 'trash button comes before the open arrow');

    assert.match(source, /aria-label=\{`Delete report: \$\{patientName\}`\}/, 'accessible label');
    assert.match(source, /title="Delete report"/, 'tooltip');
    assert.match(source, /<TrashIcon \/>/, 'the red bin icon is rendered');
    assert.match(source, /event\.stopPropagation\(\)/, 'clicking delete does not open the report');
    assert.match(source, /disabled=\{isDeleting\}/, 'duplicate clicks are blocked while deleting');
  });

  it('7. deletion is confirmed first and the row is only removed after the server resolves', () => {
    const source = read('src/features/doctor/DoctorReportsList.tsx');
    assert.match(source, /title="Permanently delete report\?"/);
    assert.match(source, /confirmLabel="Delete report"/);
    assert.match(source, /cancelLabel="Cancel"/);
    assert.match(source, /This action cannot be undone\./);
    assert.match(source, /tone="danger"/);
    // The optimistic path is forbidden: the row disappears only when the awaited call
    // resolves and the shell re-reads the list.
    assert.match(source, /await onDeleteReport\(target\.id\)/);
    assert.match(source, /setPendingDelete\(null\);\s*\n\s*setDeletedNotice/);
    assert.doesNotMatch(source, /mockReports|setReports\(/);
  });

  it('8. the icon is a local vector bin with white slits, not a stock image', () => {
    const icon = read('src/features/doctor/TrashIcon.tsx');
    assert.match(icon, /<svg/);
    assert.match(icon, /viewBox="0 0 24 24"/);
    assert.match(icon, /fill="#ffffff"/, 'white cut-outs');
    assert.doesNotMatch(icon, /<image|data:image|\.png|\.jpg/, 'no raster stock asset');
  });

  it('9. the shell refreshes every derived view after a delete', () => {
    const shell = read('src/features/doctor/DoctorShell.tsx');
    assert.match(shell, /await deleteDoctorReport\(reportId, currentDoctor\?\.id\)/);
    assert.match(shell, /if \(selectedReportId === reportId\)/);
    assert.match(shell, /await loadData\(currentDoctor\?\.id\)/);
    assert.match(shell, /onDeleteReport=\{handleDeleteReport\}/);
  });
});
