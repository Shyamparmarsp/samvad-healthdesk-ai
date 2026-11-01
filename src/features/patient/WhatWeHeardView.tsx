import React, { useState } from 'react';
import { useI18n } from '../../i18n';

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (transcript.trim()) {
      onConfirm(transcript.trim());
    }
  };

  return (
    <div className="flex flex-col h-full justify-between p-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-semibold tracking-wide uppercase">
            Voice Transcript
          </span>
          <button
            onClick={onCancel}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            {t.common.cancel}
          </button>
        </div>
        <h2 className="text-xl font-bold text-text-primary mt-2">
          {t.chat.whatWeHeard}
        </h2>
        <p className="text-xs text-text-secondary mt-0.5">
          You can edit the text before sending if something was misheard.
        </p>
      </div>

      {/* Editable Text Area */}
      <form onSubmit={handleSubmit} className="my-auto py-4">
        <div className="p-4 rounded-card bg-white border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-brand-navy">
          <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
            {t.chat.editTranscript}
          </label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={4}
            className="w-full text-base text-text-primary bg-transparent focus:outline-none resize-none leading-relaxed"
            placeholder="Edit your spoken words here..."
            autoFocus
          />
        </div>
      </form>

      {/* Actions */}
      <div className="space-y-3 pt-4">
        <button
          onClick={() => handleSubmit({ preventDefault: () => {} } as any)}
          disabled={!transcript.trim()}
          className="w-full h-btn-mobile rounded-pill bg-brand-navy text-white font-semibold text-sm shadow-md hover:bg-brand-navy-light disabled:opacity-50 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          {t.chat.confirmTranscript}
        </button>

        <button
          onClick={onCancel}
          className="w-full h-btn-mobile rounded-pill bg-white border border-slate-300 text-slate-600 font-medium text-sm hover:bg-slate-50 active:scale-[0.99] transition-all"
        >
          {t.common.cancel}
        </button>
      </div>
    </div>
  );
};

