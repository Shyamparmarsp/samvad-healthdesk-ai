import React from 'react';
import { useI18n } from '../../i18n';
import { Appointment } from '../../types/doctor';
import { ReportRow } from '../../types/report';

interface ConfirmationViewProps {
  type: 'appointment' | 'report_only';
  report: ReportRow;
  appointment?: Appointment;
  onHome: () => void;
}

export const ConfirmationView: React.FC<ConfirmationViewProps> = ({
  type,
  report,
  appointment,
  onHome,
}) => {
  const { t } = useI18n();
  const isBooking = type === 'appointment';

  return (
    <div className="flex flex-col h-full justify-between p-6 bg-surface-mobile">
      {/* Top Tag */}
      <div className="text-center pt-2">
        <span className="text-xs px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-semibold tracking-wide uppercase">
          {isBooking ? t.confirmation.bookingConfirmedTitle : t.confirmation.reportSubmittedTitle}
        </span>
      </div>

      {/* Main Details Card (P9a or P9b) */}
      <div className="my-auto py-6 space-y-4">
        {/* Success Icon */}
        <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div className="text-center">
          <h2 className="text-xl font-bold text-text-primary tracking-tight">
            {isBooking ? t.confirmation.bookingConfirmedTitle : t.confirmation.reportSubmittedTitle}
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            {isBooking
              ? 'Your preliminary consultation slot has been reserved.'
              : t.confirmation.reportOnlyNotice}
          </p>
        </div>

        {/* Reference & Specialist Card */}
        <div className="p-5 rounded-card bg-white border border-slate-200/80 shadow-sm space-y-3">
          {/* Reference Code Box */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              {isBooking ? t.confirmation.appointmentReference : t.confirmation.intakeReference}
            </span>
            <span className="text-base font-black text-brand-navy tracking-wider font-mono">
              {isBooking && appointment ? appointment.reference_code : report.intake_reference}
            </span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            <div className="py-2 flex items-center justify-between">
              <span className="text-slate-400">{t.confirmation.doctorLabel}</span>
              <span className="font-semibold text-text-primary">
                {report.report.routing_snapshot.doctor_name}
              </span>
            </div>

            <div className="py-2 flex items-center justify-between">
              <span className="text-slate-400">{t.confirmation.departmentLabel}</span>
              <span className="font-semibold text-text-primary">
                {report.report.routing_snapshot.department_name}
              </span>
            </div>

            {isBooking && appointment && (
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-400">{t.confirmation.dateTimeLabel}</span>
                <span className="font-semibold text-brand-navy">
                  {new Date(appointment.slot_start).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  •{' '}
                  {new Date(appointment.slot_start).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            )}
          </div>
        </div>

        {isBooking && (
          <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-100 text-[11px] text-blue-900 leading-normal">
            {t.confirmation.instructions}
          </div>
        )}
      </div>

      {/* Footer Return Home Button */}
      <div className="pt-4">
        <button
          onClick={onHome}
          aria-label={t.confirmation.returnHome}
          className="w-full h-btn-mobile rounded-pill bg-brand-navy text-white font-semibold text-sm shadow-md hover:bg-brand-navy-light active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          {t.confirmation.returnHome}
        </button>
      </div>
    </div>
  );
};

