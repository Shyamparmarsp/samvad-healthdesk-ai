import React, { useState } from 'react';
import { ReportRow } from '../../types/report';
import { markReportReviewed } from '../../lib/api';

interface DoctorUrgentDetailProps {
  report: ReportRow;
  onBack: () => void;
  onRefreshReport: () => void;
}

export const DoctorUrgentDetail: React.FC<DoctorUrgentDetailProps> = ({
  report,
  onBack,
  onRefreshReport,
}) => {
  const [isMarking, setIsMarking] = useState(false);
  const isReviewed = Boolean(report.reviewed_at);

  const handleMarkReviewed = async () => {
    if (isMarking || isReviewed) return;
    setIsMarking(true);
    try {
      await markReportReviewed(report.id);
      onRefreshReport();
    } catch (err) {
      console.error('Failed to mark urgent report reviewed', err);
    } finally {
      setIsMarking(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Navigation */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <button
          onClick={onBack}
          className="text-xs font-semibold text-slate-600 hover:text-brand-navy flex items-center gap-1.5 transition-colors"
        >
          &larr; Back to Triage Queue
        </button>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-semibold">
            {report.intake_reference}
          </span>
          <span className="text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider bg-red-100 text-red-800 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
            Urgent Partial
          </span>
        </div>
      </div>

      {/* Emergency Rule Match Citation Banner (D5) */}
      <div className="p-6 rounded-card bg-red-50 border-2 border-red-200 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-red-900">
            Emergency Trigger Fired
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-red-200/80 text-red-950 font-mono font-bold">
            Rule: {report.emergency_rule_id || 'Deterministic Rule'}
          </span>
        </div>

        <h2 className="text-lg font-bold text-red-950">
          Routine Intake Terminated Immediately
        </h2>

        <div className="mt-4 p-4 rounded-xl bg-white/90 border border-red-200 text-xs text-red-950 space-y-1.5">
          <p className="font-semibold text-red-800 uppercase tracking-wide text-[10px]">
            Triggering Statement Captured:
          </p>
          <p className="text-sm font-medium italic">
            "{report.report.emergency?.patient_statement || report.report.primary_concern.value}"
          </p>
        </div>

        <p className="text-[11px] text-red-800 mt-3 leading-relaxed">
          Demo Safety Invariant: Patient was instructed in plain text to call 112 or visit the nearest ER. Routine appointments are permanently suppressed.
        </p>
      </div>

      {/* Patient Intake Fragment */}
      <div className="p-6 rounded-card bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <span className="text-xs text-slate-400 block font-medium">Patient Identifier</span>
            <span className="text-base font-bold text-text-primary">
              {report.report.patient.name.value || 'Anonymous Patient'}
            </span>
            <span className="text-xs text-slate-500 ml-2">
              ({report.report.patient.age.value ? `${report.report.patient.age.value} yrs` : 'Age unstated'} • {report.report.patient.gender.value || 'Gender unstated'})
            </span>
          </div>

          <div>
            {isReviewed ? (
              <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200">
                Acknowledged by Doctor
              </span>
            ) : (
              <button
                onClick={handleMarkReviewed}
                disabled={isMarking}
                className="h-10 px-5 rounded-pill bg-slate-900 text-white text-xs font-semibold hover:bg-black transition-all"
              >
                {isMarking ? 'Updating...' : 'Acknowledge Triage'}
              </button>
            )}
          </div>
        </div>

        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Primary Concern Reported
          </span>
          <p className="text-xs font-medium text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-100">
            {report.report.primary_concern.value}
          </p>
        </div>

        {/* Note on Summary nullability per RD-10 */}
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-700">Audit Rule (RD-10):</span> Summary is explicitly null for urgent_partial reports to avoid LLM hallucinations during safety crises.
        </div>
      </div>
    </div>
  );
};

