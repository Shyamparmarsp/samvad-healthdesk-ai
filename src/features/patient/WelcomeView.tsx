import React from 'react';
import { useI18n } from '../../i18n';
import { PatientHeader } from './PatientHeader';

interface WelcomeViewProps {
  onStartTalking: () => void;
  onTypeInstead: () => void;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  onStartTalking,
  onTypeInstead,
}) => {
  const { t, language } = useI18n();

  const features = language === 'hi'
    ? [
        { label: 'अपनी सेहत के बारे में बात करें' },
        { label: 'संरचित रिपोर्ट प्राप्त करें' },
        { label: 'डॉक्टर का अपॉइंटमेंट बुक करें' },
      ]
    : [
        { label: 'Talk about your health' },
        { label: 'Get a structured report' },
        { label: 'Book a doctor appointment' },
      ];

  return (
    <div className="flex flex-col h-full justify-between pb-4 select-none relative">
      {/* Top Header & Language Toggle */}
      <PatientHeader />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col justify-between px-5 py-2">
        {/* Title & Subtitle */}
        <div className="text-center pt-2">
          <h1 className="text-[23px] font-bold text-[#1d2433] leading-snug tracking-tight">
            {t.welcome.title}
          </h1>
          <p className="text-[13px] text-[#4a5470] mt-1.5 leading-normal max-w-[320px] mx-auto">
            {t.welcome.subtitle}
          </p>
        </div>

        {/* Features Card (Figma 81:13) */}
        <div className="my-auto backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[27px] p-5 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)] space-y-4">
          {features.map((feat, idx) => (
            <div key={idx} className="flex items-center gap-3.5">
              <div className="w-[52px] h-[52px] rounded-[26px] bg-[rgba(255,255,255,0.76)] backdrop-blur-[9px] border border-white shadow-[0px_4px_10px_-3px_rgba(41,51,79,0.08)] flex items-center justify-center flex-shrink-0 text-[#1f2a44]">
                {idx === 0 && (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                )}
                {idx === 1 && (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                {idx === 2 && (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
              </div>
              <span className="text-[14px] font-semibold text-[#1d2433] leading-snug">
                {feat.label}
              </span>
            </div>
          ))}
        </div>

        {/* Action Buttons (Figma 81:30 & 81:35) */}
        <div className="space-y-3 pt-2">
          {/* Start Talking Button (Primary Voice Action, h=58px) */}
          <button
            type="button"
            onClick={onStartTalking}
            aria-label={t.welcome.startTalking}
            className="w-full h-[58px] rounded-[29px] bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] active:scale-[0.99] transition-all flex items-center justify-center gap-3 focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
          >
            <svg className="w-5 h-5 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
            </svg>
            <span>{t.welcome.startTalking}</span>
          </button>

          {/* Type Instead Button (Alternative Action, h=54px) */}
          <button
            type="button"
            onClick={onTypeInstead}
            aria-label={t.welcome.typeInstead}
            className="w-full h-[54px] rounded-[27px] bg-[rgba(255,255,255,0.74)] backdrop-blur-[9px] border border-white text-[#1f2a44] font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.1)] hover:bg-white active:scale-[0.99] transition-all flex items-center justify-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
          >
            <svg className="w-4 h-4 text-[#1f2a44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>{t.welcome.typeInstead}</span>
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
