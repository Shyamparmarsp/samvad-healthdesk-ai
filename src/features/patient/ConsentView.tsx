import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import { CONSENT_TEXT } from '../../types/consent';

interface ConsentViewProps {
  onAgree: () => void;
  onDecline: () => void;
}

export const ConsentView: React.FC<ConsentViewProps> = ({ onAgree, onDecline }) => {
  const { t, language } = useI18n();
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const simulatePlayAudio = () => {
    setIsPlayingAudio(true);
    setTimeout(() => {
      setIsPlayingAudio(false);
    }, 3000);
  };

  return (
    <div className="flex flex-col h-full justify-between p-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-text-primary tracking-tight">
          {t.consent.title}
        </h2>
        <p className="text-xs text-text-secondary mt-1">
          {t.common.appName}
        </p>
      </div>

      {/* Greeting Bubble Card (P2 design with versioned consent copy) */}
      <div className="my-auto space-y-4">
        <div className="p-5 rounded-card bg-white/80 border border-white shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-semibold uppercase text-brand-navy tracking-wider">
              AI Assistant Notice
            </span>
          </div>

          {/* Official Versioned Consent Text */}
          <p className="text-sm text-text-primary leading-relaxed font-normal">
            {CONSENT_TEXT[language]}
          </p>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={simulatePlayAudio}
              className="text-xs font-medium text-brand-navy flex items-center gap-1.5 hover:underline"
            >
              <svg className={`w-4 h-4 ${isPlayingAudio ? 'text-indigo-600 animate-spin' : 'text-slate-500'}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              {isPlayingAudio ? 'Playing greeting...' : t.chat.replayQuestion}
            </button>
            <span className="text-[10px] text-slate-400 font-mono">v1</span>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200/60 text-[11px] text-amber-900 leading-normal">
          <span className="font-semibold">Note:</span> Your consent is required before any health details can be collected. You can stop or decline at any time.
        </div>
      </div>

      {/* On-Screen Yes / No Action Buttons (h=54px) */}
      <div className="space-y-3 pt-4">
        {/* Yes Button */}
        <button
          onClick={onAgree}
          className="w-full h-btn-mobile rounded-pill bg-brand-navy text-white font-semibold text-sm shadow-md hover:bg-brand-navy-light active:scale-[0.99] transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          {t.consent.agree}
        </button>

        {/* No Button */}
        <button
          onClick={onDecline}
          className="w-full h-btn-mobile rounded-pill bg-white/80 border border-slate-300 text-slate-600 font-medium text-sm hover:bg-white active:scale-[0.99] transition-all"
        >
          {t.consent.decline}
        </button>
      </div>
    </div>
  );
};
