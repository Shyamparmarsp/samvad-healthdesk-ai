import React, { useState } from 'react';
import { ReportRow } from '../../types/report';
import { DoctorProfile } from '../../types/doctor';
import { markReportReviewed } from '../../lib/api';
import { BackButton } from '../common/BackButton';

interface DoctorUrgentDetailProps {
  report: ReportRow;
  currentDoctor?: DoctorProfile | null;
  onBack: () => void;
  onRefreshReport: () => void;
}

function getInitials(name?: string): string {
  if (!name) return 'PT';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

export const DoctorUrgentDetail: React.FC<DoctorUrgentDetailProps> = ({
  report,
  currentDoctor,
  onBack,
  onRefreshReport,
}) => {
  const [isMarking, setIsMarking] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const isReviewed = Boolean(report.reviewed_at);

  // D-36: Deny by default when currentDoctor is null/undefined; Emergency doctor has review authority
  const canReview = Boolean(currentDoctor && currentDoctor.department_key === 'emergency');

  const handleMarkReviewed = async () => {
    if (isMarking || isReviewed || !canReview) return;
    setIsMarking(true);
    setReviewError(null);
    try {
      await markReportReviewed(report.id);
      onRefreshReport();
    } catch (err: any) {
      setReviewError(err?.message || 'Failed to acknowledge triage report');
    } finally {
      setIsMarking(false);
    }
  };

  const capitalize = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');
  const patient = report.report.patient;
  const patientName = patient.name.value || 'Anonymous Patient';
  const patientAge = patient.age.value ? `${patient.age.value} years` : 'Age unstated';
  const patientGender = patient.gender.value ? capitalize(patient.gender.value) : 'Gender unstated';

  return (
    <div className="space-y-6">
      {/* Top Navigation & Status Bar matching Figma D5 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} label="Back to Urgent List" />
          <div>
            <h1 className="text-[25px] font-bold text-[#1d2433] tracking-tight">
              Patient Report
            </h1>
            <p className="text-[11px] text-[#4a5470] mt-0.5">
              {report.intake_reference} · Urgent Triage Case
            </p>
          </div>
        </div>

        {/* Source & Status Chips matching Figma 84:8, 84:10 */}
        <div className="flex items-center gap-2">
          <div className="h-[28px] px-3.5 rounded-full bg-[rgba(225,235,253,0.8)] border border-white text-[#1f2a44] text-[10px] font-semibold flex items-center justify-center">
            Voice · English
          </div>
          <div className="h-[28px] px-3.5 rounded-full bg-[rgba(228,232,242,0.75)] border border-white text-[#3a4468] text-[10px] font-semibold flex items-center justify-center">
            {isReviewed ? 'Reviewed' : 'Pending review'}
          </div>
        </div>
      </div>

      {/* Review Error Alert */}
      {reviewError && (
        <div className="p-4 rounded-xl bg-red-100 border border-red-300 text-red-900 text-xs font-medium flex items-center gap-2">
          <svg className="w-4 h-4 text-red-700 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{reviewError}</span>
        </div>
      )}

      {/* Emergency banner matching Figma 82:351 */}
      <div className="p-4 rounded-[14px] bg-[rgba(253,226,226,0.85)] border border-white text-[#a12626] shadow-sm space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></span>
          <span className="text-[12px] font-semibold">
            Urgent: Emergency Trigger Fired
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-200/80 font-mono font-bold text-red-950">
            Rule: {report.emergency_rule_id || 'severe_chest_pain'}
          </span>
        </div>
        <p className="text-[13px] font-bold text-red-950">
          Routine Intake Terminated Immediately
        </p>
      </div>

      {/* Patient Banner Card matching Figma 82:353 */}
      <div className="rounded-[18px] bg-[rgba(255,255,255,0.55)] backdrop-blur-[9px] border border-white p-4 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-[40px] rounded-full bg-[#e4e8f2] border border-white text-[#1f2a44] font-semibold text-[11px] flex items-center justify-center shrink-0">
            {getInitials(patientName)}
          </div>
          <div>
            <h2 className="text-[14px] font-bold text-[#1d2433]">
              {patientName}
            </h2>
            <p className="text-[10px] text-[#4a5470]">
              {patientAge} · {patientGender}
            </p>
          </div>
        </div>

        <div className="h-[29px] px-4 rounded-full bg-[#fde2e2] text-[#a12626] text-[10px] font-semibold flex items-center justify-center">
          Partial report, intake stopped early
        </div>
      </div>

      {/* Two-Column Grid matching Figma 82:360 (details) & 82:361 (flags) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Column: Details Card */}
        <div className="rounded-[22px] bg-[rgba(255,255,255,0.55)] backdrop-blur-[9px] border border-white p-6 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] space-y-4">
          <div>
            <h3 className="text-[14px] font-bold text-[#1d2433] mb-1">
              Primary concern
            </h3>
            <p className="text-[13px] text-[#1d2433]">
              {report.report.primary_concern.value}
            </p>
          </div>

          <div>
            <h3 className="text-[13px] font-bold text-[#1d2433] mb-1.5">
              Warning flag
            </h3>
            <div className="inline-block px-3.5 py-1.5 rounded-full bg-[#fde2e2] text-[#a12626] text-[10px] font-semibold mb-2">
              {report.emergency_rule_id || 'severe_chest_pain'}
            </div>
            <p className="text-[13px] text-[#4a5470] italic">
              “{report.report.emergency?.patient_statement || report.report.primary_concern.value}”
            </p>
          </div>

          <div className="border-b border-[#dde3ee]/80" />

          <div>
            <h3 className="text-[13px] font-bold text-[#1d2433] mb-1">
              Missing information
            </h3>
            <p className="text-[11px] text-[#4a5470]">
              Duration, severity, relevant history, medications, allergies
            </p>
          </div>

          <div>
            <h3 className="text-[13px] font-bold text-[#1d2433] mb-1">
              Preliminary routing
            </h3>
            <p className="text-[11px] text-[#4a5470]">
              Emergency · Dr. Neha Verma
            </p>
          </div>
        </div>

        {/* Right Column: Appointment & Audit Card */}
        <div className="rounded-[22px] bg-[rgba(255,255,255,0.55)] backdrop-blur-[9px] border border-white p-6 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div>
              <h3 className="text-[14px] font-bold text-[#1d2433] mb-1">
                Appointment
              </h3>
              <p className="text-[12px] text-[#4a5470]">
                No appointment (urgent)
              </p>
              <p className="text-[11px] text-[#a12626] mt-2 leading-relaxed bg-[#fde2e2]/60 p-3 rounded-[14px] border border-red-200/50">
                Demo Safety Invariant: Patient was instructed in plain text to call 112 or visit the nearest ER. Routine appointments are permanently suppressed.
              </p>
            </div>

            {/* Note on Summary nullability per RD-10 */}
            <div className="p-3.5 rounded-[14px] bg-white/70 border border-white text-[11px] text-[#4a5470] leading-relaxed shadow-sm">
              <span className="font-semibold text-[#1d2433]">Audit Rule (RD-10):</span> Summary is explicitly null for urgent_partial reports to avoid LLM hallucinations during safety crises.
            </div>
          </div>

          {/* Action button / review authority */}
          <div>
            {isReviewed ? (
              <div className="h-[48px] rounded-[23px] bg-[#dcf3e6] border border-emerald-200 text-[#176a3b] font-semibold text-[13px] flex items-center justify-center gap-2">
                <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>Acknowledged by Emergency Doctor</span>
              </div>
            ) : canReview ? (
              <button
                type="button"
                onClick={handleMarkReviewed}
                disabled={isMarking}
                className="w-full h-[48px] rounded-[23px] bg-[#1f2a44] text-white font-semibold text-[13px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.18)] hover:bg-[#2b3a5d] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isMarking ? 'Updating...' : 'Acknowledge Triage'}
              </button>
            ) : (
              <div
                className="h-[48px] rounded-[23px] bg-[#e4e8f2] border border-white text-[#3a4468] text-xs font-semibold flex items-center justify-center px-4"
                title="OD-03: General Medicine has read cross-visibility only"
              >
                Read-only cross-visibility
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
