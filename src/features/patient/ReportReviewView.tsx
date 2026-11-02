import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import { CorrectableField, ReportDocumentV1 } from '../../types/report';
import { PatientHeader } from './PatientHeader';
import { BackButton } from '../common/BackButton';

interface ReportReviewViewProps {
  report: ReportDocumentV1;
  isCapReached?: boolean;
  canSubmit?: boolean;
  onCorrectField: (field: CorrectableField, patch: { value: any; status: 'provided' | 'declined' }) => void;
  onSubmit: () => void;
  onDontSubmit: () => void;
  onEndSessionCap: () => void;
  onBack?: () => void;
}

export const ReportReviewView: React.FC<ReportReviewViewProps> = ({
  report,
  isCapReached = false,
  canSubmit = true,
  onCorrectField,
  onSubmit,
  onDontSubmit,
  onEndSessionCap,
  onBack,
}) => {
  const { t, language } = useI18n();
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
    <div className="flex flex-col h-full justify-between pb-4 select-none relative overflow-hidden">
      {/* Top Header & Language Toggle & Progress (Figma 72:235) */}
      <PatientHeader progress={1} />

      {onBack && (
        <div className="px-5 pt-0.5 pb-1 flex items-center">
          <BackButton onClick={onBack} />
        </div>
      )}

      {/* Main Scrolling Content Area */}
      <div className="flex-1 overflow-y-auto px-5 py-2 space-y-3.5">
        {/* Title & Subtitle */}
        <div className="flex items-start justify-between gap-2 pt-1">
          <div>
            <h1 className="text-[20px] font-bold text-[#1d2433] tracking-tight">
              <span>{language === 'hi' ? 'अपनी इनटेक रिपोर्ट की समीक्षा करें' : 'Your Health Report'}</span>
              <span className="sr-only"> · Review Your Intake Report</span>
            </h1>
            <p className="text-[12px] text-[#4a5470] mt-0.5">
              {t.review.subtitle}
            </p>
          </div>
          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold uppercase tracking-wider flex-shrink-0 mt-1">
            Draft Preview
          </span>
        </div>

        {/* Incomplete 15-Turn Cap Banner (D9 Copy) */}
        {isCapReached && !canSubmit && (
          <div className="p-3.5 rounded-[18px] bg-amber-50/90 border border-amber-200 text-xs text-amber-900 shadow-sm leading-relaxed">
            <p className="font-bold text-sm mb-1">{t.review.incompleteCapTitle}</p>
            <p>{t.review.incompleteCapMessage}</p>
          </div>
        )}

        {/* Allowlisted Patient Details Card (Figma 81:306) */}
        <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[24px] p-4 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)]">
          <div className="divide-y divide-slate-200/60 text-xs">
            {/* Name */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[#4a5470] block">{t.review.name}</span>
                <span className="font-semibold text-[13px] text-[#1d2433]">
                  {report.patient.name.value || t.review.notProvided}
                </span>
              </div>
              <button
                type="button"
                onClick={() => startEdit('patient.name', report.patient.name.value)}
                className="text-xs font-semibold text-[#1f2a44] hover:underline px-2 py-1"
              >
                {t.common.edit}
              </button>
            </div>

            {/* Age */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[#4a5470] block">{t.review.age}</span>
                <span className="font-semibold text-[13px] text-[#1d2433]">
                  {report.patient.age.value ? `${report.patient.age.value} yrs` : t.review.notProvided}
                </span>
              </div>
              <button
                type="button"
                onClick={() => startEdit('patient.age', report.patient.age.value)}
                className="text-xs font-semibold text-[#1f2a44] hover:underline px-2 py-1"
              >
                {t.common.edit}
              </button>
            </div>

            {/* Gender */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[#4a5470] block">{t.review.gender}</span>
                <span className="font-semibold text-[13px] text-[#1d2433] capitalize">
                  {report.patient.gender.status === 'declined' ? 'Prefer not to say' : (report.patient.gender.value || t.review.notProvided)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => startEdit('patient.gender', report.patient.gender.value)}
                className="text-xs font-semibold text-[#1f2a44] hover:underline px-2 py-1"
              >
                {t.common.edit}
              </button>
            </div>

            {/* Primary Concern */}
            <div className="py-2.5 flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] text-[#4a5470] block">{t.review.primaryConcern}</span>
                <span className="font-semibold text-[13px] text-[#1d2433] leading-snug">
                  {report.primary_concern.value || t.review.notProvided}
                </span>
              </div>
              <button
                type="button"
                onClick={() => startEdit('primary_concern', report.primary_concern.value)}
                className="text-xs font-semibold text-[#1f2a44] hover:underline px-2 py-1"
              >
                {t.common.edit}
              </button>
            </div>

            {/* Duration */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[#4a5470] block">{t.review.duration}</span>
                <span className="font-medium text-[13px] text-[#1d2433]">
                  {report.clinical_details.duration.value || t.review.notProvided}
                </span>
              </div>
              <button
                type="button"
                onClick={() => startEdit('clinical_details.duration', report.clinical_details.duration.value)}
                className="text-xs font-semibold text-[#1f2a44] hover:underline px-2 py-1"
              >
                {t.common.edit}
              </button>
            </div>

            {/* Severity */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[#4a5470] block">{t.review.severity}</span>
                <span className="font-medium text-[13px] text-[#1d2433]">
                  {report.clinical_details.severity.value || t.review.notProvided}
                </span>
              </div>
              <button
                type="button"
                onClick={() => startEdit('clinical_details.severity', report.clinical_details.severity.value)}
                className="text-xs font-semibold text-[#1f2a44] hover:underline px-2 py-1"
              >
                {t.common.edit}
              </button>
            </div>

            {/* Conditions */}
            <div className="py-2.5 flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] text-[#4a5470] block">{t.review.conditions}</span>
                <span className="font-medium text-[12px] text-[#1d2433]">
                  {report.clinical_details.conditions.value?.length
                    ? report.clinical_details.conditions.value.join(', ')
                    : t.review.notProvided}
                </span>
              </div>
              <button
                type="button"
                onClick={() => startEdit('clinical_details.conditions', report.clinical_details.conditions.value)}
                className="text-xs font-semibold text-[#1f2a44] hover:underline px-2 py-1"
              >
                {t.common.edit}
              </button>
            </div>

            {/* Medications */}
            <div className="py-2.5 flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] text-[#4a5470] block">{t.review.medications}</span>
                <span className="font-medium text-[12px] text-[#1d2433]">
                  {report.clinical_details.medications.value?.length
                    ? report.clinical_details.medications.value.join(', ')
                    : t.review.notProvided}
                </span>
              </div>
              <button
                type="button"
                onClick={() => startEdit('clinical_details.medications', report.clinical_details.medications.value)}
                className="text-xs font-semibold text-[#1f2a44] hover:underline px-2 py-1"
              >
                {t.common.edit}
              </button>
            </div>

            {/* Allergies */}
            <div className="py-2.5 flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] text-[#4a5470] block">{t.review.allergies}</span>
                <span className="font-medium text-[12px] text-[#1d2433]">
                  {report.clinical_details.allergies.value?.length
                    ? report.clinical_details.allergies.value.join(', ')
                    : t.review.notProvided}
                </span>
              </div>
              <button
                type="button"
                onClick={() => startEdit('clinical_details.allergies', report.clinical_details.allergies.value)}
                className="text-xs font-semibold text-[#1f2a44] hover:underline px-2 py-1"
              >
                {t.common.edit}
              </button>
            </div>
          </div>
        </div>

        {/* Suggested Department Card (Figma 81:360) */}
        <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[20px] p-4 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)]">
          <span className="text-[11px] font-semibold uppercase text-[#4a5470] tracking-wider block">
            {t.review.departmentRecommendation}
          </span>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="px-3 py-1 rounded-[14px] bg-[#e1ebfd] text-[#284c91] font-semibold text-[11px] inline-block shadow-sm">
              {report.routing_snapshot.department_name} (preliminary)
            </span>
          </div>
          <p className="text-[11px] text-[#4a5470] mt-1.5 leading-snug">
            {report.routing_snapshot.doctor_name} · "{t.review.departmentDisclaimer}"
          </p>
        </div>
      </div>

      {/* Inline Field Edit Modal / Sheet */}
      {editingField && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-sm rounded-[24px] backdrop-blur-[9px] bg-white/95 p-5 shadow-2xl border border-white"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-[#1d2433] capitalize">
                Edit {editingField.replace('clinical_details.', '').replace('patient.', '').replace('_', ' ')}
              </h4>
              <button
                type="button"
                onClick={() => setEditingField(null)}
                className="text-xs text-[#4a5470] hover:text-[#1d2433]"
              >
                {t.common.cancel}
              </button>
            </div>

            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full h-11 px-3.5 rounded-[13px] border border-slate-300 text-sm text-[#1d2433] focus:outline-none focus:ring-2 focus:ring-[#1f2a44] mb-4 bg-white"
              autoFocus
            />

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 h-10 rounded-[20px] bg-[#1f2a44] text-white text-xs font-semibold hover:bg-[#2a3a5c]"
              >
                {t.common.save}
              </button>
              <button
                type="button"
                onClick={() => setEditingField(null)}
                className="flex-1 h-10 rounded-[20px] bg-slate-100 text-[#4a5470] text-xs font-medium hover:bg-slate-200"
              >
                {t.common.cancel}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Action Footer (Figma 81:365 & 81:367) */}
      <div className="px-5 pt-2 space-y-2">
        {canSubmit ? (
          <>
            {/* Submit to hospital (Figma 81:365) */}
            <button
              type="button"
              onClick={onSubmit}
              aria-label={t.review.submitToHospital}
              className="w-full h-[50px] rounded-[25px] bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] active:scale-[0.99] transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
            >
              <svg className="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span>{t.review.submitToHospital}</span>
            </button>

            {/* Don't submit (Figma 81:367) */}
            <button
              type="button"
              onClick={onDontSubmit}
              aria-label={t.review.dontSubmit}
              className="w-full h-[40px] rounded-[20px] bg-transparent text-[#4a5470] hover:text-[#1d2433] font-semibold text-[13px] transition-colors flex items-center justify-center focus:outline-none"
            >
              {t.review.dontSubmit}
            </button>
          </>
        ) : (
          /* Incomplete Cap Action: Exactly ONE "End session" action button */
          <div>
            <button
              type="button"
              onClick={onEndSessionCap}
              aria-label={t.review.endSession}
              className="w-full h-[50px] rounded-[25px] bg-[#1f2a44] text-white font-semibold text-[14px] shadow hover:bg-[#2a3a5c] active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
            >
              {t.review.endSession}
            </button>
          </div>
        )}

        {/* Footer Disclaimer */}
        <p className="text-[9px] text-center text-[#4a5470] pt-0.5 leading-tight font-normal">
          {t.welcome.disclaimer}
        </p>
      </div>
    </div>
  );
};
