import React from 'react';
import { useI18n } from '../../i18n';

interface WelcomeViewProps {
  onStartTalking: () => void;
  onTypeInstead: () => void;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  onStartTalking,
  onTypeInstead,
}) => {
  const { t, language, setLanguage } = useI18n();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'hi' : 'en');
  };

  return (
    <div className="flex flex-col h-full justify-between p-6">
      {/* Top Header & Language Toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-900 font-semibold tracking-wide uppercase">
          {t.common.demoBadge}
        </span>
        <button
          onClick={toggleLanguage}
          className="text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-300 bg-white/70 hover:bg-white text-slate-700 shadow-sm transition-all"
        >
          {t.welcome.languageToggle}
        </button>
      </div>

      {/* Main Hero Card */}
      <div className="my-auto py-8 text-center flex flex-col items-center">
        {/* Animated Avatar / Icon */}
        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-brand-navy to-indigo-600 flex items-center justify-center text-white shadow-lg mb-6 shadow-indigo-200">
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-text-primary tracking-tight leading-snug">
          {t.welcome.title}
        </h1>
        <p className="text-sm font-medium text-brand-navy/80 mt-1">
          {t.welcome.subtitle}
        </p>

        <p className="text-xs text-text-secondary mt-4 max-w-xs leading-relaxed">
          {t.welcome.description}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 pt-4">
        {/* Start Talking Button (Primary Voice Action, h=58px) */}
        <button
          onClick={onStartTalking}
          className="w-full h-btn-mobile-lg rounded-pill bg-brand-navy text-white font-semibold text-base shadow-md hover:bg-brand-navy-light active:scale-[0.99] transition-all flex items-center justify-center gap-3"
        >
          <svg className="w-5 h-5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
          </svg>
          {t.welcome.startTalking}
        </button>

        {/* Type Instead Button (Alternative Action, h=54px) */}
        <button
          onClick={onTypeInstead}
          className="w-full h-btn-mobile rounded-pill bg-white/80 border border-slate-300 text-text-primary font-medium text-sm hover:bg-white active:scale-[0.99] transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          {t.welcome.typeInstead}
        </button>

        <p className="text-[11px] text-center text-slate-400 pt-2 leading-tight">
          {t.welcome.disclaimer}
        </p>
      </div>
    </div>
  );
};

