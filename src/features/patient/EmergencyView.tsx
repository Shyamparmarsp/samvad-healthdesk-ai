import React from 'react';
import { useI18n } from '../../i18n';
import { PatientHeader } from './PatientHeader';
import { BackButton } from '../common/BackButton';

interface EmergencyViewProps {
  onEndDemo: () => void;
  onBack?: () => void;
}

export const EmergencyView: React.FC<EmergencyViewProps> = ({ onEndDemo, onBack }) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-full justify-between pb-4 select-none relative overflow-hidden">
      {/* Top Header & Language Toggle (Figma 72:436) */}
      <PatientHeader />

      <div className="px-5 pt-0.5 pb-1 flex items-center">
        <BackButton onClick={onBack ?? onEndDemo} />
      </div>

      {/* Main Urgent Guidance Card (Figma 72:436) */}
      <div className="flex-1 flex flex-col justify-between px-5 py-4">
        {/* Single Centered Frosted Emergency Card */}
        <div className="my-auto backdrop-blur-[9px] bg-[rgba(255,255,255,0.65)] border border-white rounded-[28px] p-6 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)] text-center flex flex-col items-center">
          <h1 className="text-[22px] font-bold text-red-600 tracking-tight mb-3">
            {t.emergency.title}
          </h1>

          <p className="text-[13px] text-[#1d2433] leading-relaxed mb-6 font-normal">
            {t.emergency.guidance}
          </p>

          {/* Plain Text 112 Display — NO tap-to-call link per G3 / docs */}
          <div className="text-[64px] font-black text-red-600 tracking-wider font-mono select-text leading-none py-2">
            112
          </div>
        </div>

        {/* Footer End Demo Action */}
        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={onEndDemo}
            aria-label={t.emergency.returnHome}
            className="w-full h-[54px] rounded-[27px] bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] active:scale-[0.99] transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
          >
            {t.emergency.returnHome}
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
