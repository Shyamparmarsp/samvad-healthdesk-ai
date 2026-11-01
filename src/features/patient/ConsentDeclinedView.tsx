import React from 'react';
import { useI18n } from '../../i18n';

interface ConsentDeclinedViewProps {
  onRestart: () => void;
}

export const ConsentDeclinedView: React.FC<ConsentDeclinedViewProps> = ({ onRestart }) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-full justify-between p-6 text-center">
      <div className="pt-4">
        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold uppercase tracking-wider">
          {t.consent.declinedTitle}
        </span>
      </div>

      <div className="my-auto py-8 flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-6">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-text-primary tracking-tight">
          {t.consent.declinedTitle}
        </h2>

        <p className="text-sm text-text-secondary mt-3 max-w-xs leading-relaxed">
          {t.consent.declinedMessage}
        </p>
      </div>

      <div className="pt-4">
        <button
          onClick={onRestart}
          aria-label={t.consent.restart}
          className="w-full h-btn-mobile rounded-pill bg-brand-navy text-white font-semibold text-sm shadow-md hover:bg-brand-navy-light active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          {t.consent.restart}
        </button>
      </div>
    </div>
  );
};

