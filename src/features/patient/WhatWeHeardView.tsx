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
      <div className="flex-1 flex flex-col justify-between px-5 py-3">
        {/* Screen Reader Header */}
        <h1 className="sr-only">{t.chat.whatWeHeard}</h1>

        {/* Editable Transcript Card (Figma 72:167) */}
        <div className="my-auto backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[24px] p-5 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)]">
          <label className="block text-[14px] font-bold text-[#1d2433] mb-3">
            What we heard. Tap to edit.
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

        {/* Action Buttons (Figma 72:167) */}
        <div className="space-y-3 pt-2">
          {/* Send Answer Button (Primary Action, h=54px) */}
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={!transcript.trim()}
            aria-label={t.chat.confirmTranscript}
            className="w-full h-[54px] rounded-[27px] bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
          >
            <span>→ Send</span>
            <span className="sr-only"> · {t.chat.confirmTranscript}</span>
          </button>

          {/* Speak Again / Cancel Button (Secondary Action, h=52px) */}
          <button
            type="button"
            onClick={onCancel}
            aria-label="Speak again"
            className="w-full h-[52px] rounded-[26px] bg-[rgba(255,255,255,0.74)] backdrop-blur-[9px] border border-white text-[#1f2a44] font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.1)] hover:bg-white active:scale-[0.99] transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
          >
            <svg className="w-4 h-4 text-[#1f2a44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
            </svg>
            <span>Speak again</span>
          </button>

          {/* Play question again link */}
          <div className="text-center pt-0.5">
            <button
              type="button"
              onClick={onCancel}
              className="text-[12px] font-medium text-[#4a5470] hover:text-[#1d2433] transition-colors"
            >
              Play question again
            </button>
          </div>

          {/* Footer Disclaimer */}
          <p className="text-[9px] text-center text-[#4a5470] pt-1 leading-normal font-normal">
            {t.welcome.disclaimer}
          </p>
        </div>
      </div>
    </div>
  );
};
