import React from 'react';
import { useI18n } from '../../i18n';

interface SessionEndedViewProps {
  reason?: 'dont_submit' | 'incomplete_cap';
  onRestart: () => void;
}

export const SessionEndedView: React.FC<SessionEndedViewProps> = ({
  reason = 'dont_submit',
  onRestart,
}) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-full justify-between p-6 text-center">
      <div className="pt-2">
        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider">
          Session Closed
        </span>
      </div>

      <div className="my-auto py-8 flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-6">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-text-primary tracking-tight">
          Session Ended Privately
        </h2>

        <p className="text-xs text-text-secondary mt-3 max-w-xs leading-relaxed">
          {reason === 'dont_submit'
            ? t.review.dontSubmitConfirm
            : t.review.incompleteCapMessage}
        </p>

        <div className="mt-6 p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-500 max-w-xs text-left">
          <p className="font-medium text-slate-700">Privacy Status:</p>
          <p className="mt-0.5">
            Your draft intake was not sent to the hospital and will not appear on any doctor dashboard.
          </p>
        </div>
      </div>

      <div className="pt-4">
        <button
          onClick={onRestart}
          aria-label={t.welcome.startTalking}
          className="w-full h-btn-mobile rounded-pill bg-brand-navy text-white font-semibold text-sm shadow-md hover:bg-brand-navy-light active:scale-[0.99] transition-all focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          {t.welcome.startTalking}
        </button>
      </div>
    </div>
  );
};

