import React from 'react';
import { useI18n } from '../../i18n';
import { PatientHeader } from './PatientHeader';

interface EmergencyViewProps {
  onEndDemo: () => void;
}

export const EmergencyView: React.FC<EmergencyViewProps> = ({ onEndDemo }) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-full justify-between pb-4 select-none relative overflow-hidden">
      {/* Top Header & Language Toggle (Figma 72:436) */}
      <PatientHeader />

      {/* Main Urgent Guidance Card */}
      <div className="flex-1 flex flex-col justify-between px-5 py-3">
        <div className="my-auto py-2 text-center flex flex-col items-center">
          {/* Large Plain Text 112 Display — NO tap-to-call link per G3 / docs */}
          <div className="my-3 p-5 rounded-[24px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.75)] border-2 border-red-200 shadow-md w-full max-w-xs">
            <span className="text-[11px] font-bold text-red-600 uppercase tracking-widest block mb-1">
              Emergency Helpline
            </span>
            <div className="text-5xl font-black text-red-700 tracking-wider py-1 font-mono">
              {t.emergency.plainEmergencyNumber}
            </div>
            <p className="text-[11px] text-[#4a5470] mt-1.5">
              {t.emergency.subtext}
            </p>
          </div>

          <h1 className="text-[22px] font-bold text-red-950 tracking-tight mt-1">
            {t.emergency.title}
          </h1>

          <div className="p-4 rounded-[18px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.75)] border border-red-100 text-xs text-red-900 leading-relaxed text-left mt-3 shadow-sm w-full max-w-xs">
            <p className="font-medium">
              {t.emergency.guidance}
            </p>
          </div>

          <p className="text-[11px] text-[#4a5470] mt-3 leading-normal max-w-xs">
            {t.emergency.notice}
          </p>
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
