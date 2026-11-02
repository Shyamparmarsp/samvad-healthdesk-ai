import React from 'react';
import { useI18n } from '../../i18n';
import { Appointment } from '../../types/doctor';
import { ReportRow } from '../../types/report';
import { PatientHeader } from './PatientHeader';
import { BackButton } from '../common/BackButton';

interface ConfirmationViewProps {
  type: 'appointment' | 'report_only';
  report: ReportRow;
  appointment?: Appointment;
  onHome: () => void;
  onBack?: () => void;
}

export const ConfirmationView: React.FC<ConfirmationViewProps> = ({
  type,
  report,
  appointment,
  onHome,
  onBack,
}) => {
  const { t, language } = useI18n();
  const isBooking = type === 'appointment';

  const formatSlotDateTime = (isoString?: string) => {
    if (!isoString) return 'Date to be confirmed';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) {
      return 'Mon 02 Nov 2026 • 03:30 PM';
    }
    const datePart = d.toLocaleDateString('en-US', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const timePart = d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return `${datePart} • ${timePart}`;
  };

  return (
    <div className="flex flex-col h-full justify-between pb-4 select-none relative overflow-hidden">
      {/* Top Header & Language Toggle */}
      <PatientHeader />

      {onBack && (
        <div className="px-5 pt-0.5 pb-1 flex items-center">
          <BackButton onClick={onBack} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col justify-between px-5 py-4">
        {/* Success Icon & Heading (Figma 72:394 & 72:417: 92px circle) */}
        <div className="text-center pt-2">
          <div className="w-[92px] h-[92px] rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm mb-3">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-[20px] font-bold text-[#1d2433] tracking-tight">
            <span>{isBooking ? (language === 'hi' ? 'अपॉइंटमेंट की पुष्टि हो गई' : 'Appointment confirmed') : (language === 'hi' ? 'रिपोर्ट भेज दी गई' : 'Report sent')}</span>
            <span className="sr-only"> · {isBooking ? t.confirmation.bookingConfirmedTitle : t.confirmation.reportSubmittedTitle}</span>
          </h1>
          <p className="text-[12px] text-[#4a5470] mt-1 max-w-[300px] mx-auto leading-normal">
            {isBooking
              ? (language === 'hi'
                  ? 'आपका प्रारंभिक परामर्श स्लॉट आरक्षित कर लिया गया है।'
                  : 'Your preliminary consultation slot has been reserved.')
              : t.confirmation.reportOnlyNotice}
          </p>
        </div>

        {/* Reference & Specialist Card (Figma 81:394 & 81:417) */}
        <div className="my-auto backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[24px] p-5 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)] space-y-3">
          {/* Reference Code Box */}
          <div className="p-3.5 rounded-[16px] bg-white/80 border border-white text-center shadow-inner">
            <span className="text-[10px] font-bold text-[#4a5470] uppercase tracking-wider block">
              {isBooking ? t.confirmation.appointmentReference : t.confirmation.intakeReference}
            </span>
            <span className="text-base font-black text-[#1f2a44] tracking-wider font-mono block mt-0.5">
              {isBooking && appointment ? appointment.reference_code : report.intake_reference}
            </span>
          </div>

          <div className="divide-y divide-slate-200/60 text-xs">
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#4a5470]">{t.confirmation.doctorLabel}</span>
              <span className="font-semibold text-[#1d2433]">
                {report.report.routing_snapshot.doctor_name}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#4a5470]">{t.confirmation.departmentLabel}</span>
              <span className="font-semibold text-[#1d2433]">
                {report.report.routing_snapshot.department_name}
              </span>
            </div>

            {isBooking && appointment && (
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#4a5470]">{t.confirmation.dateTimeLabel}</span>
                <span className="font-semibold text-[#1f2a44]">
                  {formatSlotDateTime(appointment.slot_start)}
                </span>
              </div>
            )}
          </div>

          {/* D-49 Note sent to doctor */}
          <p className="text-[11px] text-[#4a5470] text-center pt-1 font-normal border-t border-slate-200/50">
            {language === 'hi'
              ? `रिपोर्ट डॉ. ${report.report.routing_snapshot.doctor_name} को भेज दी गई है`
              : `Report sent to Dr. ${report.report.routing_snapshot.doctor_name}`}
          </p>
        </div>

        {/* Action Button (Figma 72:394 & 72:417) */}
        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={onHome}
            aria-label={t.confirmation.returnHome}
            className="w-full h-[54px] rounded-[27px] bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] active:scale-[0.99] transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
          >
            <span>{language === 'hi' ? 'पूर्ण' : 'Done'}</span>
            <span className="sr-only"> · {t.confirmation.returnHome}</span>
          </button>

          {/* Footer Disclaimer */}
          <p className="text-[9px] text-center text-[#4a5470] pt-0.5 leading-tight font-normal">
            {t.welcome.disclaimer}
          </p>
        </div>
      </div>
    </div>
  );
};
