import React, { useState } from 'react';
import { ReportRow } from '../../types/report';
import { markReportReviewed } from '../../lib/api';

interface DoctorReportDetailProps {
  report: ReportRow;
  onBack: () => void;
  onRefreshReport: () => void;
}

export const DoctorReportDetail: React.FC<DoctorReportDetailProps> = ({
  report,
  onBack,
  onRefreshReport,
}) => {
  const [isMarking, setIsMarking] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isConversationExpanded, setIsConversationExpanded] = useState(false);

  const isReviewed = Boolean(report.reviewed_at);

  const handleMarkReviewed = async () => {
    if (isMarking || isReviewed) return;
    setIsMarking(true);
    setReviewError(null);
    try {
      await markReportReviewed(report.id);
      onRefreshReport();
    } catch (err: any) {
      setReviewError(err?.message || 'Failed to mark report reviewed');
    } finally {
      setIsMarking(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Navigation & Status Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <button
          onClick={onBack}
          className="text-xs font-semibold text-slate-600 hover:text-brand-navy flex items-center gap-1.5 transition-colors"
        >
          &larr; Back to Reports
        </button>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-semibold">
            {report.intake_reference}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
            {report.status}
          </span>
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

      {/* Primary Action Header Card */}
      <div className="p-6 rounded-card bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
            Clinical Intake Summary
          </span>
          <h1 className="text-xl font-bold text-text-primary mt-1">
            {report.report.patient.name.value || 'Anonymous Patient'}
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            {report.report.patient.age.value ? `${report.report.patient.age.value} yrs` : 'Age unknown'} •{' '}
            {report.report.patient.gender.value || 'Gender unstated'} •{' '}
            Submitted on {new Date(report.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>

        {/* Mark Reviewed Action (AGENTS.md / docs/report-design.md §16) */}
        <div>
          {isReviewed ? (
            <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <div>
                <span className="font-bold block">Reviewed</span>
                <span className="text-[10px] text-emerald-700">
                  {new Date(report.reviewed_at!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ) : (
            <button
              onClick={handleMarkReviewed}
              disabled={isMarking}
              className="h-11 px-6 rounded-pill bg-brand-navy text-white text-xs font-semibold shadow hover:bg-brand-navy-light disabled:opacity-50 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              {isMarking ? 'Marking...' : 'Mark Reviewed'}
            </button>
          )}
        </div>
      </div>

      {/* Preliminary Department Recommendation Snapshot */}
      <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200/80 shadow-sm flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 block">
            Preliminary Department Suggestion
          </span>
          <span className="text-base font-bold text-brand-navy">
            {report.report.routing_snapshot.department_name}
          </span>
          <span className="text-xs text-indigo-800 ml-2">
            ({report.report.routing_snapshot.doctor_name})
          </span>
        </div>
        <span className="text-xs text-slate-500 italic">
          "Preliminary suggestion, not a diagnosis"
        </span>
      </div>

      {/* Main Clinical Details Card */}
      <div className="p-6 rounded-card bg-white border border-slate-200 shadow-sm space-y-6">
        {/* Primary Concern */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
            Patient Stated Primary Concern
          </h3>
          <p className="text-sm font-semibold text-text-primary bg-slate-50 p-3 rounded-lg border border-slate-100">
            {report.report.primary_concern.value || 'Not provided'}
          </p>
        </div>

        {/* Structured Clinical Facts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/50">
            <span className="text-slate-400 block font-medium">Duration</span>
            <span className="font-semibold text-slate-800 text-sm">
              {report.report.clinical_details.duration.value || 'Not provided'}
            </span>
          </div>

          <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/50">
            <span className="text-slate-400 block font-medium">Severity</span>
            <span className="font-semibold text-slate-800 text-sm">
              {report.report.clinical_details.severity.value || 'Not provided'}
            </span>
          </div>

          <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/50">
            <span className="text-slate-400 block font-medium">Existing Conditions</span>
            <span className="font-semibold text-slate-800">
              {report.report.clinical_details.conditions.value?.length
                ? report.report.clinical_details.conditions.value.join(', ')
                : 'None reported'}
            </span>
          </div>

          <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/50">
            <span className="text-slate-400 block font-medium">Current Medications</span>
            <span className="font-semibold text-slate-800">
              {report.report.clinical_details.medications.value?.length
                ? report.report.clinical_details.medications.value.join(', ')
                : 'None reported'}
            </span>
          </div>

          <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/50">
            <span className="text-slate-400 block font-medium">Known Allergies</span>
            <span className="font-semibold text-slate-800">
              {report.report.clinical_details.allergies.value?.length
                ? report.report.clinical_details.allergies.value.join(', ')
                : 'None reported'}
            </span>
          </div>

          <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/50">
            <span className="text-slate-400 block font-medium">Other Symptoms</span>
            <span className="font-semibold text-slate-800">
              {report.report.clinical_details.other_symptoms.value?.length
                ? report.report.clinical_details.other_symptoms.value.join(', ')
                : 'None reported'}
            </span>
          </div>
        </div>

        {/* AI-Generated Summary (Draft) */}
        {report.report.summary && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
              AI-Organized Summary
            </span>
            <p className="text-xs text-text-primary leading-relaxed">
              {report.report.summary.text}
            </p>
            <p className="text-[10px] text-slate-400 mt-2 italic">
              Label: AI-organized patient statement draft. Not a clinical diagnosis or treatment recommendation.
            </p>
          </div>
        )}
      </div>

      {/* Informational note: conversation history context */}
      <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-blue-900 flex items-start gap-2.5 shadow-sm">
        <svg className="w-4 h-4 text-brand-navy flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="leading-relaxed">
          Some intake responses may be available only in the conversation history and may not appear in the structured report.
        </p>
      </div>

      {/* Collapsed Full Conversation Log (D4 specification) */}
      <div className="rounded-card bg-white border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setIsConversationExpanded(!isConversationExpanded)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Verbatim Intake Conversation
          </span>
          <span className="text-xs font-semibold text-brand-navy">
            {isConversationExpanded ? 'Collapse ▲' : 'Expand Conversation ▼'}
          </span>
        </button>

        {isConversationExpanded && (
          <div className="px-6 pb-6 pt-2 border-t border-slate-100 space-y-3 bg-slate-50/50">
            <p className="text-[11px] text-slate-400 italic">
              Complete raw patient responses preserved for audit:
            </p>
            <div className="p-3 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 space-y-2 font-mono">
              <p><strong className="text-brand-navy">Concern:</strong> {report.report.primary_concern.value}</p>
              <p><strong className="text-brand-navy">Duration:</strong> {report.report.clinical_details.duration.value}</p>
              <p><strong className="text-brand-navy">Severity:</strong> {report.report.clinical_details.severity.value}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

