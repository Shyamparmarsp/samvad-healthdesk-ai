import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import { CorrectableField, InfoStatus, ReportDocumentV1 } from '../../types/report';
import { presentField } from '../../lib/report-presentation';
import { PatientHeader } from './PatientHeader';
import { BackButton } from '../common/BackButton';

interface ReportReviewViewProps {
  report: ReportDocumentV1;
  isCapReached?: boolean;
  canSubmit?: boolean;
  /**
   * D-37: once the report is submitted, the same screen renders a read-only summary so
   * Back from the booking screen cannot re-open the draft editor.
   */
  mode?: 'draft' | 'submitted';
  onCorrectField: (field: CorrectableField, patch: { value: any; status: 'provided' | 'declined' }) => void;
  onSubmit: () => void;
  onDontSubmit: () => void;
  onEndSessionCap: () => void;
  onBack?: () => void;
  onContinueBooking?: () => void;
  onFinish?: () => void;
  /** D-28: disable the actions while a request is in flight. */
  isSubmitting?: boolean;
}

export const ReportReviewView: React.FC<ReportReviewViewProps> = ({
  report,
  isCapReached = false,
  canSubmit = true,
  mode = 'draft',
  onCorrectField,
  onSubmit,
  onDontSubmit,
  onEndSessionCap,
  onBack,
  onContinueBooking,
  onFinish,
  isSubmitting = false,
}) => {
  const { t, language } = useI18n();
  const [editingField, setEditingField] = useState<CorrectableField | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const isReadOnly = mode === 'submitted';

  const EditIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4">
      <path d="M2.66663 10.6666L2.1333 13.8666L5.3333 13.3333L12.6666 5.99996C13.0203 5.64634 13.2189 5.16672 13.2189 4.66662C13.2189 4.16653 13.0203 3.68691 12.6666 3.33329C12.313 2.97967 11.8334 2.78101 11.3333 2.78101C10.8332 2.78101 10.3536 2.97967 9.99997 3.33329L2.66663 10.6666Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 4.33337L11.6667 7.00004" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

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

  /** D-14: every information status keeps its own label. */
  const statusLabel = (status: InfoStatus | 'unavailable'): string => {
    switch (status) {
      case 'declined':
        return t.review.statusDeclined;
      case 'unknown':
        return t.review.statusUnknown;
      case 'unclear':
        return t.review.statusUnclear;
      case 'not_asked':
        return t.review.statusNotAsked;
      case 'not_provided':
        return t.review.notProvided;
      default:
        return t.review.unavailable;
    }
  };

  const fieldText = (field: unknown): { text: string; isAbsent: boolean } => {
    const presented = presentField(field);
    if (presented.status === 'provided') return { text: presented.text, isAbsent: false };
    return { text: statusLabel(presented.status), isAbsent: true };
  };

  const name = fieldText(report.patient.name);
  const age = fieldText(report.patient.age);
  const gender = report.patient.gender?.status === 'declined'
    ? { text: t.review.statusDeclined, isAbsent: true }
    : fieldText(report.patient.gender);
  const primaryConcern = fieldText(report.primary_concern);
  const duration = fieldText(report.clinical_details.duration);
  const severity = fieldText(report.clinical_details.severity);
  const conditions = fieldText(report.clinical_details.conditions);
  const medications = fieldText(report.clinical_details.medications);
  const allergies = fieldText(report.clinical_details.allergies);
  const otherSymptoms = fieldText(report.clinical_details.other_symptoms);

  const rows: {
    key: string;
    label: string;
    text: string;
    isAbsent: boolean;
    field: CorrectableField;
    value: any;
  }[] = [
    { key: 'name', label: t.review.name, text: name.text, isAbsent: name.isAbsent, field: 'patient.name', value: report.patient.name.value },
    { key: 'age', label: t.review.age, text: age.isAbsent ? age.text : `${age.text} ${language === 'hi' ? 'वर्ष' : 'yrs'}`, isAbsent: age.isAbsent, field: 'patient.age', value: report.patient.age.value },
    { key: 'gender', label: t.review.gender, text: gender.text, isAbsent: gender.isAbsent, field: 'patient.gender', value: report.patient.gender.value },
    { key: 'concern', label: t.review.primaryConcern, text: primaryConcern.text, isAbsent: primaryConcern.isAbsent, field: 'primary_concern', value: report.primary_concern.value },
    { key: 'duration', label: t.review.duration, text: duration.text, isAbsent: duration.isAbsent, field: 'clinical_details.duration', value: report.clinical_details.duration.value },
    { key: 'severity', label: t.review.severity, text: severity.text, isAbsent: severity.isAbsent, field: 'clinical_details.severity', value: report.clinical_details.severity.value },
    { key: 'conditions', label: t.review.conditions, text: conditions.text, isAbsent: conditions.isAbsent, field: 'clinical_details.conditions', value: report.clinical_details.conditions.value },
    { key: 'medications', label: t.review.medications, text: medications.text, isAbsent: medications.isAbsent, field: 'clinical_details.medications', value: report.clinical_details.medications.value },
    { key: 'allergies', label: t.review.allergies, text: allergies.text, isAbsent: allergies.isAbsent, field: 'clinical_details.allergies', value: report.clinical_details.allergies.value },
    // D-12: other_symptoms is allow-listed by the backend and must be correctable.
    { key: 'other_symptoms', label: t.review.otherSymptoms, text: otherSymptoms.text, isAbsent: otherSymptoms.isAbsent, field: 'clinical_details.other_symptoms', value: report.clinical_details.other_symptoms.value },
  ];

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
              <span>{isReadOnly ? t.review.submittedTitle : language === 'hi' ? 'अपनी इनटेक रिपोर्ट की समीक्षा करें' : 'Your Health Report'}</span>
              <span className="sr-only"> · Review Your Intake Report</span>
            </h1>
            <p className="text-[12px] text-[#4a5470] mt-0.5">
              {isReadOnly ? t.review.submittedNote : t.review.subtitle}
            </p>
          </div>
          {!isReadOnly && (
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold uppercase tracking-wider flex-shrink-0 mt-1">
              Draft Preview
            </span>
          )}
        </div>

        {/* Incomplete 15-Turn Cap Banner (D9 Copy) */}
        {!isReadOnly && isCapReached && !canSubmit && (
          <div className="p-3.5 rounded-[18px] bg-amber-50/90 border border-amber-200 text-xs text-amber-900 shadow-sm leading-relaxed">
            <p className="font-bold text-sm mb-1">{t.review.incompleteCapTitle}</p>
            <p>{t.review.incompleteCapMessage}</p>
          </div>
        )}

        {/* Allowlisted Patient Details Card (Figma P6 / 81:306) */}
        <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[24px] p-4 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)]">
          <div className="divide-y divide-slate-200/60 text-xs">
            {rows.map((row) => (
              <div key={row.key} className="py-2.5 flex items-center justify-between gap-3">
                <span className="w-[110px] text-[13px] text-[#4a5470] flex-shrink-0 font-normal">
                  {row.label}
                </span>
                <span
                  className={`flex-1 text-[13px] font-bold ${
                    row.isAbsent ? 'text-[#4a5470] italic font-normal' : 'text-[#1d2433]'
                  }`}
                >
                  {row.text}
                </span>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => startEdit(row.field, row.value)}
                    disabled={isSubmitting}
                    aria-label={`Edit ${row.label}`}
                    className="p-1 rounded text-[#4a5470] hover:text-[#1f2a44] transition-colors disabled:opacity-50 focus:outline-none flex-shrink-0"
                  >
                    <EditIcon />
                    <span className="sr-only">{t.common.edit}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Suggested Department Card (Figma P6 / 81:360) */}
        <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[20px] p-4 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)]">
          <h3 className="text-[14px] font-bold text-[#1d2433]">
            {t.review.departmentRecommendation}
          </h3>
          <div className="mt-2">
            <span className="px-5 py-2 rounded-full bg-[#e6effc] text-[#1f2a44] font-semibold text-[13px] inline-block shadow-sm">
              {report.routing_snapshot.department_name}
            </span>
          </div>
          <p className="text-[11px] text-[#4a5470] mt-1.5 leading-snug">
            {t.review.departmentDisclaimer}
          </p>
        </div>
      </div>

      {/* Inline Field Edit Modal / Sheet */}
      {editingField && !isReadOnly && (
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

      {/* Action Footer (Figma P6 / 81:365 & 81:367) */}
      <div className="px-5 pt-2 space-y-2.5">
        {isReadOnly ? (
          <>
            {onContinueBooking && (
              <button
                type="button"
                onClick={onContinueBooking}
                className="w-full h-[52px] rounded-full bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] active:scale-[0.99] transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
              >
                {t.review.viewBooking}
              </button>
            )}
            <button
              type="button"
              onClick={onFinish ?? onDontSubmit}
              className="w-full h-[52px] rounded-full bg-[rgba(255,255,255,0.74)] backdrop-blur-[9px] border border-white text-[#1d2433] font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.1)] hover:bg-white active:scale-[0.99] transition-all flex items-center justify-center focus:outline-none"
            >
              {t.review.endAndFinish}
            </button>
          </>
        ) : canSubmit ? (
          <>
            {/* Submit to hospital (Figma 81:365) */}
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting}
              aria-label={t.review.submitToHospital}
              aria-busy={isSubmitting}
              className="w-full h-[52px] rounded-full bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] active:scale-[0.99] transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#1f2a44] disabled:opacity-50"
            >
              <span>{isSubmitting ? t.common.loading : t.review.submitToHospital}</span>
            </button>

            {/* Don't submit frosted pill button (Figma P6 / 81:367) */}
            <button
              type="button"
              onClick={onDontSubmit}
              disabled={isSubmitting}
              aria-label={t.review.dontSubmit}
              className="w-full h-[52px] rounded-full bg-[rgba(255,255,255,0.74)] backdrop-blur-[9px] border border-white text-[#1d2433] font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.1)] hover:bg-white active:scale-[0.99] transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#1f2a44] disabled:opacity-50"
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
              className="w-full h-[52px] rounded-full bg-[#1f2a44] text-white font-semibold text-[14px] shadow hover:bg-[#2a3a5c] active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
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
