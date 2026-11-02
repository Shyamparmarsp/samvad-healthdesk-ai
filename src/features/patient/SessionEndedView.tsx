import React from 'react';
import { useI18n } from '../../i18n';
import { PatientHeader } from './PatientHeader';
import { BackButton } from '../common/BackButton';

interface SessionEndedViewProps {
  reason?: 'dont_submit' | 'incomplete_cap';
  onRestart: () => void;
  onBack?: () => void;
}

export const SessionEndedView: React.FC<SessionEndedViewProps> = ({
  reason = 'dont_submit',
  onRestart,
  onBack,
}) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-full justify-between pb-4 select-none relative overflow-hidden">
      {/* Top Header & Language Toggle */}
      <PatientHeader />

      <div className="px-5 pt-0.5 pb-1 flex items-center">
        <BackButton onClick={onBack ?? onRestart} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col justify-between px-5 py-4 text-center">
        <div className="my-auto py-6 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-white/80 border border-white shadow-sm flex items-center justify-center text-[#1f2a44] mb-4">
            <svg className="w-8 h-8 text-[#1f2a44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>

          <h1 className="text-[21px] font-bold text-[#1d2433] tracking-tight">
            Session Ended Privately
          </h1>

          <p className="text-[13px] text-[#4a5470] mt-2 max-w-[280px] leading-relaxed">
            {reason === 'dont_submit'
              ? t.review.dontSubmitConfirm
              : t.review.incompleteCapMessage}
          </p>

          <div className="mt-4 p-3.5 rounded-[16px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.65)] border border-white text-[11px] text-[#4a5470] max-w-xs text-left shadow-sm">
            <p className="font-semibold text-[#1d2433]">Privacy Status:</p>
            <p className="mt-0.5">
              Your draft intake was not sent to the hospital and will not appear on any doctor dashboard.
            </p>
          </div>
        </div>

        {/* Footer Action */}
        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={onRestart}
            aria-label={t.welcome.startTalking}
            className="w-full h-[54px] rounded-[27px] bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] active:scale-[0.99] transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
          >
            {t.welcome.startTalking}
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
