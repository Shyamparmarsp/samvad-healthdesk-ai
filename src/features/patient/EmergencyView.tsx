import React from 'react';
import { useI18n } from '../../i18n';

interface EmergencyViewProps {
  onEndDemo: () => void;
}

export const EmergencyView: React.FC<EmergencyViewProps> = ({ onEndDemo }) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-full justify-between p-6 bg-red-50/50">
      {/* Header Warning Badge */}
      <div className="flex items-center justify-between">
        <span className="text-xs px-3 py-1 rounded-full bg-red-100 text-red-800 font-bold uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
          Urgent Notice
        </span>
        <span className="text-xs font-semibold text-slate-500">
          Demo Safety
        </span>
      </div>

      {/* Main Urgent Guidance Card */}
      <div className="my-auto py-4 text-center flex flex-col items-center">
        {/* Large Plain Text 112 Display — NO tap-to-call link per G3 / docs */}
        <div className="my-4 p-6 rounded-card bg-white border-2 border-red-200 shadow-md w-full max-w-xs">
          <span className="text-xs font-semibold text-red-600 uppercase tracking-widest block mb-1">
            Emergency Helpline
          </span>
          <div className="text-5xl font-black text-red-700 tracking-wider py-1 font-mono">
            {t.emergency.plainEmergencyNumber}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {t.emergency.subtext}
          </p>
        </div>

        <h1 className="text-2xl font-bold text-red-950 tracking-tight mt-2">
          {t.emergency.title}
        </h1>

        <div className="p-4 rounded-xl bg-white/90 border border-red-100 text-xs text-red-900 leading-relaxed text-left mt-4 shadow-sm">
          <p className="font-medium">
            {t.emergency.guidance}
          </p>
        </div>

        <p className="text-[11px] text-slate-500 mt-4 leading-normal max-w-xs">
          {t.emergency.notice}
        </p>
      </div>

      {/* Footer End Demo Action */}
      <div className="pt-4">
        <button
          onClick={onEndDemo}
          className="w-full h-btn-mobile rounded-pill bg-slate-800 text-white font-semibold text-sm shadow hover:bg-slate-900 active:scale-[0.99] transition-all"
        >
          {t.emergency.returnHome}
        </button>
      </div>
    </div>
  );
};

