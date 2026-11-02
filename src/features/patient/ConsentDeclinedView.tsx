import React from 'react';
import { useI18n } from '../../i18n';
import { PatientHeader } from './PatientHeader';

interface ConsentDeclinedViewProps {
  onRestart: () => void;
}

export const ConsentDeclinedView: React.FC<ConsentDeclinedViewProps> = ({ onRestart }) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-full justify-between pb-4 select-none relative overflow-hidden">
      {/* Top Header & Language Toggle (Figma 72:452) */}
      <PatientHeader />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col justify-between px-5 py-4 text-center">
        <div className="my-auto py-6 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-white/80 border border-white shadow-sm flex items-center justify-center text-[#1f2a44] mb-4">
            <svg className="w-8 h-8 text-[#1f2a44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>

          <h1 className="text-[21px] font-bold text-[#1d2433] tracking-tight">
            {t.consent.declinedTitle}
          </h1>

          <p className="text-[13px] text-[#4a5470] mt-2 max-w-[280px] leading-relaxed">
            {t.consent.declinedMessage}
          </p>
        </div>

        {/* Footer Action */}
        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={onRestart}
            aria-label={t.consent.restart}
            className="w-full h-[54px] rounded-[27px] bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] active:scale-[0.99] transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
          >
            {t.consent.restart}
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
