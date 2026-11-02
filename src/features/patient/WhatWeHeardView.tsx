import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import { PatientHeader } from './PatientHeader';

interface WhatWeHeardViewProps {
  initialTranscript: string;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}

export const WhatWeHeardView: React.FC<WhatWeHeardViewProps> = ({
  initialTranscript,
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n();
  const [transcript, setTranscript] = useState(initialTranscript);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (transcript.trim()) {
      onConfirm(transcript.trim());
    }
  };

  return (
    <div className="flex flex-col h-full justify-between pb-4 select-none relative">
      {/* Top Header & Language Toggle */}
      <PatientHeader onBack={onCancel} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col justify-between px-5 py-4">
        {/* Title */}
        <div className="pt-1">
          <h1 className="text-[21px] font-bold text-[#1d2433] tracking-tight">
            {t.chat.whatWeHeard}
          </h1>
          <p className="text-[12px] text-[#4a5470] mt-0.5">
            You can edit the text before sending if something was misheard.
          </p>
        </div>

        {/* Editable Transcript Card (Figma 81:232) */}
        <div className="my-auto backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[24px] p-5 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)]">
          <label className="block text-[11px] font-semibold text-[#4a5470] mb-2 uppercase tracking-wider">
            {t.chat.editTranscript}
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={4}
            className="w-full text-[14px] text-[#1d2433] bg-white/80 rounded-[14px] p-3.5 border border-white focus:outline-none focus:ring-2 focus:ring-[#1f2a44] resize-none leading-relaxed shadow-inner"
            placeholder="Edit your spoken words here..."
            autoFocus
          />
        </div>

        {/* Action Buttons (Figma 81:236 & 81:241) */}
        <div className="space-y-3 pt-2">
          {/* Send Answer Button (Primary Action, h=54px) */}
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={!transcript.trim()}
            aria-label={t.chat.confirmTranscript}
            className="w-full h-[54px] rounded-[27px] bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
          >
            <svg className="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span>{t.chat.confirmTranscript}</span>
          </button>

          {/* Speak Again / Cancel Button (Secondary Action, h=52px) */}
          <button
            type="button"
            onClick={onCancel}
            aria-label={t.common.cancel}
            className="w-full h-[52px] rounded-[26px] bg-[rgba(255,255,255,0.74)] backdrop-blur-[9px] border border-white text-[#1f2a44] font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.1)] hover:bg-white active:scale-[0.99] transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
          >
            <svg className="w-4 h-4 text-[#1f2a44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Speak again</span>
          </button>

          {/* Footer Disclaimer */}
          <p className="text-[9px] text-center text-[#4a5470] pt-1 leading-normal font-normal">
            {t.welcome.disclaimer}
          </p>
        </div>
      </div>
    </div>
  );
};
