import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import { CorrectableField, ReportDocumentV1 } from '../../types/report';

interface ReportReviewViewProps {
  report: ReportDocumentV1;
  isCapReached?: boolean;
  canSubmit?: boolean;
  onCorrectField: (field: CorrectableField, patch: { value: any; status: 'provided' | 'declined' }) => void;
  onSubmit: () => void;
  onDontSubmit: () => void;
  onEndSessionCap: () => void;
}

export const ReportReviewView: React.FC<ReportReviewViewProps> = ({
  report,
  isCapReached = false,
  canSubmit = true,
  onCorrectField,
  onSubmit,
  onDontSubmit,
  onEndSessionCap,
}) => {
  const { t } = useI18n();
  const [editingField, setEditingField] = useState<CorrectableField | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const startEdit = (field: CorrectableField, currentVal: any) => {
    setEditingField(field);
    setEditValue(Array.isArray(currentVal) ? currentVal.join(', ') : String(currentVal || ''));
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingField) {
      if (editingField === 'patient.gender') {
        const valLower = editValue.trim().toLowerCase();
        if (valLower.includes('prefer') || valLower === 'declined') {
          // Report v1.2 rule: status = 'declined', value = null
          onCorrectField(editingField, { value: null, status: 'declined' });
        } else {
          onCorrectField(editingField, { value: valLower, status: 'provided' });
        }
      } else if (editingField.includes('conditions') || editingField.includes('medications') || editingField.includes('allergies') || editingField.includes('other_symptoms')) {
        const arr = editValue.split(',').map((s) => s.trim()).filter(Boolean);
        onCorrectField(editingField, { value: arr, status: 'provided' });
      } else if (editingField === 'patient.age') {
        const num = parseInt(editValue.replace(/\D/g, ''), 10) || 30;
        onCorrectField(editingField, { value: num, status: 'provided' });
      } else {
        onCorrectField(editingField, { value: editValue.trim(), status: 'provided' });
      }
      setEditingField(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-mobile">
      {/* Header */}
      <div className="px-6 py-4 bg-white/70 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-10">
        <h2 className="text-xl font-bold text-text-primary tracking-tight">
          {t.review.title}
        </h2>
        <p className="text-xs text-text-secondary mt-0.5">
          {t.review.subtitle}
        </p>
      </div>

      {/* Incomplete 15-Turn Cap Banner (D9 Copy) */}
      {isCapReached && !canSubmit && (
        <div className="mx-4 mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 shadow-sm leading-relaxed">
          <p className="font-bold text-sm mb-1">{t.review.incompleteCapTitle}</p>
          <p>{t.review.incompleteCapMessage}</p>
        </div>
      )}

      {/* Main Scrolling Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Preliminary Department Suggestion Card */}
        <div className="p-4 rounded-card bg-indigo-50/70 border border-indigo-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase text-indigo-900 tracking-wider">
              {t.review.departmentRecommendation}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-200/60 text-indigo-900 font-medium">
              Preliminary
            </span>
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-bold text-brand-navy">
              {report.routing_snapshot.department_name}
            </span>
            <span className="text-xs text-slate-500">
              • {report.routing_snapshot.doctor_name}
            </span>
          </div>

          <p className="text-[11px] text-indigo-800/80 mt-1 italic">
            "{t.review.departmentDisclaimer}"
          </p>
        </div>

        {/* Section 1: Patient Information */}
        <div className="p-4 rounded-card bg-white border border-slate-200/80 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            {t.review.patientSection}
          </h3>

          <div className="divide-y divide-slate-100 text-sm">
            {/* Name */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">{t.review.name}</span>
                <span className="font-semibold text-text-primary">
                  {report.patient.name.value || t.review.notProvided}
                </span>
              </div>
              <button
                onClick={() => startEdit('patient.name', report.patient.name.value)}
                className="text-xs font-medium text-brand-navy hover:underline"
              >
                {t.common.edit}
              </button>
            </div>

            {/* Age */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">{t.review.age}</span>
                <span className="font-semibold text-text-primary">
                  {report.patient.age.value ? `${report.patient.age.value} yrs` : t.review.notProvided}
                </span>
              </div>
              <button
                onClick={() => startEdit('patient.age', report.patient.age.value)}
                className="text-xs font-medium text-brand-navy hover:underline"
              >
                {t.common.edit}
              </button>
            </div>

            {/* Gender */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">{t.review.gender}</span>
                <span className="font-semibold text-text-primary capitalize">
                  {report.patient.gender.status === 'declined' ? 'Prefer not to say' : (report.patient.gender.value || t.review.notProvided)}
                </span>
              </div>
              <button
                onClick={() => startEdit('patient.gender', report.patient.gender.value)}
                className="text-xs font-medium text-brand-navy hover:underline"
              >
                {t.common.edit}
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Clinical Details */}
        <div className="p-4 rounded-card bg-white border border-slate-200/80 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            {t.review.clinicalSection}
          </h3>

          <div className="divide-y divide-slate-100 text-sm">
            {/* Primary Concern */}
            <div className="py-2.5 flex items-start justify-between gap-2">
              <div>
                <span className="text-xs text-slate-400 block">{t.review.primaryConcern}</span>
                <span className="font-semibold text-text-primary leading-snug">
                  {report.primary_concern.value || t.review.notProvided}
                </span>
              </div>
              <button
                onClick={() => startEdit('primary_concern', report.primary_concern.value)}
                className="text-xs font-medium text-brand-navy hover:underline pt-1"
              >
                {t.common.edit}
              </button>
            </div>

            {/* Duration */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">{t.review.duration}</span>
                <span className="font-medium text-text-primary">
                  {report.clinical_details.duration.value || t.review.notProvided}
                </span>
              </div>
              <button
                onClick={() => startEdit('clinical_details.duration', report.clinical_details.duration.value)}
                className="text-xs font-medium text-brand-navy hover:underline"
              >
                {t.common.edit}
              </button>
            </div>

            {/* Severity */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">{t.review.severity}</span>
                <span className="font-medium text-text-primary">
                  {report.clinical_details.severity.value || t.review.notProvided}
                </span>
              </div>
              <button
                onClick={() => startEdit('clinical_details.severity', report.clinical_details.severity.value)}
                className="text-xs font-medium text-brand-navy hover:underline"
              >
                {t.common.edit}
              </button>
            </div>

            {/* Conditions */}
            <div className="py-2.5 flex items-start justify-between gap-2">
              <div>
                <span className="text-xs text-slate-400 block">{t.review.conditions}</span>
                <span className="font-medium text-text-primary text-xs">
                  {report.clinical_details.conditions.value?.length
                    ? report.clinical_details.conditions.value.join(', ')
                    : t.review.notProvided}
                </span>
              </div>
              <button
                onClick={() => startEdit('clinical_details.conditions', report.clinical_details.conditions.value)}
                className="text-xs font-medium text-brand-navy hover:underline"
              >
                {t.common.edit}
              </button>
            </div>

            {/* Medications */}
            <div className="py-2.5 flex items-start justify-between gap-2">
              <div>
                <span className="text-xs text-slate-400 block">{t.review.medications}</span>
                <span className="font-medium text-text-primary text-xs">
                  {report.clinical_details.medications.value?.length
                    ? report.clinical_details.medications.value.join(', ')
                    : t.review.notProvided}
                </span>
              </div>
              <button
                onClick={() => startEdit('clinical_details.medications', report.clinical_details.medications.value)}
                className="text-xs font-medium text-brand-navy hover:underline"
              >
                {t.common.edit}
              </button>
            </div>

            {/* Allergies */}
            <div className="py-2.5 flex items-start justify-between gap-2">
              <div>
                <span className="text-xs text-slate-400 block">{t.review.allergies}</span>
                <span className="font-medium text-text-primary text-xs">
                  {report.clinical_details.allergies.value?.length
                    ? report.clinical_details.allergies.value.join(', ')
                    : t.review.notProvided}
                </span>
              </div>
              <button
                onClick={() => startEdit('clinical_details.allergies', report.clinical_details.allergies.value)}
                className="text-xs font-medium text-brand-navy hover:underline"
              >
                {t.common.edit}
              </button>
            </div>
          </div>
        </div>

        {/* Section 3: AI-Generated Summary (Draft) */}
        {report.summary && (
          <div className="p-4 rounded-card bg-white border border-slate-200/80 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
              {t.review.summarySection}
            </span>
            <p className="text-xs text-text-primary leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
              {report.summary.text}
            </p>
            <p className="text-[10px] text-slate-400 mt-2 italic">
              {t.review.summaryDisclaimer}
            </p>
          </div>
        )}
      </div>

      {/* Inline Field Edit Modal / Sheet */}
      {editingField && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-sm rounded-card bg-white p-5 shadow-2xl border border-slate-100"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-text-primary capitalize">
                Edit {editingField.replace('clinical_details.', '').replace('patient.', '').replace('_', ' ')}
              </h4>
              <button
                type="button"
                onClick={() => setEditingField(null)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                {t.common.cancel}
              </button>
            </div>

            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-navy mb-4"
              autoFocus
            />

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 h-10 rounded-pill bg-brand-navy text-white text-xs font-semibold hover:bg-brand-navy-light"
              >
                {t.common.save}
              </button>
              <button
                type="button"
                onClick={() => setEditingField(null)}
                className="flex-1 h-10 rounded-pill bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200"
              >
                {t.common.cancel}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Action Footer */}
      <div className="p-4 bg-white/80 border-t border-slate-200/60 backdrop-blur-md">
        {canSubmit && !isCapReached ? (
          /* Normal Submission Flow */
          <div className="space-y-2">
            <button
              onClick={onSubmit}
              className="w-full h-btn-mobile rounded-pill bg-brand-navy text-white font-semibold text-sm shadow-md hover:bg-brand-navy-light active:scale-[0.99] transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              {t.review.submitToHospital}
            </button>

            <button
              onClick={onDontSubmit}
              className="w-full py-2.5 text-xs text-slate-500 hover:text-red-600 font-medium transition-colors"
            >
              {t.review.dontSubmit}
            </button>
          </div>
        ) : (
          /* 15-Turn Cap Incomplete Action: Exactly ONE "End session" action button */
          <div>
            <button
              onClick={onEndSessionCap}
              className="w-full h-btn-mobile rounded-pill bg-slate-800 text-white font-semibold text-sm shadow hover:bg-slate-900 active:scale-[0.99] transition-all"
            >
              {t.review.endSession}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

