import React from 'react';
import { useI18n } from '../../i18n';
import { PatientHeader } from './PatientHeader';
import { BackButton } from '../common/BackButton';

interface ConsentDeclinedViewProps {
  onRestart: () => void;
  onBack?: () => void;
}

export const ConsentDeclinedView: React.FC<ConsentDeclinedViewProps> = ({ onRestart, onBack }) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-full justify-between pb-4 select-none relative overflow-hidden">
      {/* Top Header & Language Toggle (Figma 72:452) */}
      <PatientHeader />

      <div className="px-5 pt-0.5 pb-1 flex items-center">
        <BackButton onClick={onBack ?? onRestart} />
      </div>

      {/* Main Content Area (Figma 72:452) */}
      <div className="flex-1 flex flex-col justify-between px-5 py-4">
        {/* Center Frosted Card */}
        <div className="my-auto backdrop-blur-[9px] bg-[rgba(255,255,255,0.65)] border border-white rounded-[28px] p-6 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)] text-center flex flex-col items-center">
          <h1 className="sr-only">{t.consent.declinedTitle}</h1>

          <p className="text-[16px] font-semibold text-[#1d2433] leading-relaxed my-2">
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
            <span>{t.common.backToStart}</span>
            <span className="sr-only"> · {t.consent.restart}</span>
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
