import React from 'react';
import { useI18n } from '../../i18n';
import { PatientHeader } from './PatientHeader';

interface WelcomeViewProps {
  onStartTalking: () => void;
  onTypeInstead: () => void;
  /** D-04: the global session cap was reached; show the demo-busy state. */
  demoBusy?: boolean;
  /** True while a start request is in flight (prevents duplicate sessions). */
  isStarting?: boolean;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  onStartTalking,
  onTypeInstead,
  demoBusy = false,
  isStarting = false,
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
    <div className="relative w-[390px] h-[844px] overflow-hidden select-none flex flex-col justify-between">
      {/* Top Brand Header (Figma 81:4 - 81:10) */}
      <PatientHeader />

      {/* Title & Subtitle (Figma 81:11 & 81:12) */}
      <div className="absolute top-[103px] left-[20px] right-[20px] text-center z-10 pointer-events-none">
        <h1 className="text-[25px] font-bold text-[#1d2433] leading-tight tracking-tight">
          {t.welcome.title}
        </h1>
        <p className="text-[13px] text-[#4a5470] mt-2 leading-snug max-w-[310px] mx-auto font-normal">
          {t.welcome.subtitle}
        </p>
      </div>

      {/* Features Card (Figma 81:13: w=350, h=300 at x=20, y=253) */}
      <div
        className="absolute left-[20px] top-[253px] w-[350px] h-[300px] rounded-[27px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)] p-5 flex flex-col justify-between z-10"
      >
        {features.map((feat, idx) => (
          <div key={idx} className="flex items-center gap-3.5">
            {/* Feature Icon Container (52x52 rounded-full) */}
            <div className="w-[52px] h-[52px] rounded-[26px] bg-[rgba(255,255,255,0.76)] backdrop-blur-[9px] border border-white shadow-[0px_4px_10px_-3px_rgba(41,51,79,0.08)] flex items-center justify-center flex-shrink-0 text-[#1f2a44]">
              {idx === 0 && (
                /* Microphone Icon (Figma 81:15) */
                <svg className="w-6 h-6 text-[#1f2a44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
              )}
              {idx === 1 && (
                /* Pencil Icon (Figma 81:20: welcome-pencil.svg) */
                <svg className="w-6 h-6 text-[#1f2a44]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 17.5V20H6.5L18 8.5L15.5 6L4 17.5Z" stroke="#1F2A44" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14.5 7L17 9.5" stroke="#1F2A44" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {idx === 2 && (
                /* Calendar Icon (Figma 81:25: welcome-calendar.svg) */
                <svg className="w-6 h-6 text-[#1f2a44]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 5H5C3.89543 5 3 5.89543 3 7V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V7C21 5.89543 20.1046 5 19 5Z" stroke="#1F2A44" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M16 3V7M8 3V7M3 10H21" stroke="#1F2A44" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="text-[14px] font-semibold text-[#1d2433] leading-snug">
              {feat.label}
            </span>
          </div>
        ))}
      </div>

      {/* Demo Busy Notice (D-04): shown instead of proceeding to Consent */}
      {demoBusy && (
        <div
          role="alert"
          aria-live="assertive"
          className="absolute left-[20px] top-[565px] w-[350px] rounded-[18px] bg-amber-50/95 border border-amber-300 text-amber-900 p-3.5 shadow-sm z-20"
        >
          <p className="text-[12px] font-bold">{t.welcome.demoBusyTitle}</p>
          <p className="text-[11px] mt-1 leading-snug">{t.welcome.demoBusyMessage}</p>
          <button
            type="button"
            onClick={onStartTalking}
            disabled={isStarting}
            className="mt-2 text-[11px] font-semibold underline disabled:opacity-50 focus:outline-none"
          >
            {t.welcome.retryStart}
          </button>
        </div>
      )}

      {/* Start Talking Button (Figma 81:30: w=350, h=58 at x=20, y=623) */}
      <button
        type="button"
        onClick={onStartTalking}
        disabled={isStarting}
        aria-label={t.welcome.startTalking}
        aria-busy={isStarting}
        className="absolute left-[20px] top-[623px] w-[350px] h-[58px] rounded-[29px] bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] active:scale-[0.99] transition-all flex items-center justify-center gap-3 z-20 focus:outline-none focus:ring-2 focus:ring-[#1f2a44] disabled:opacity-60"
      >
        <svg className="w-5 h-5 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
        </svg>
        <span>{isStarting ? t.common.loading : t.welcome.startTalking}</span>
      </button>

      {/* Type Instead Button (Figma 81:35: keyboard.svg vector) */}
      <button
        type="button"
        onClick={onTypeInstead}
        disabled={isStarting}
        aria-label={t.welcome.typeInstead}
        className="absolute left-[20px] top-[694px] w-[350px] h-[54px] rounded-[27px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.74)] border border-white text-[#1f2a44] font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.1)] hover:bg-white active:scale-[0.99] transition-all flex items-center justify-center gap-2.5 z-20 focus:outline-none focus:ring-2 focus:ring-[#1f2a44] disabled:opacity-60"
      >
        <svg className="w-5 h-5 text-[#1f2a44]" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.1667 7H5.83333C4.54467 7 3.5 8.04467 3.5 9.33333V18.6667C3.5 19.9553 4.54467 21 5.83333 21H22.1667C23.4553 21 24.5 19.9553 24.5 18.6667V9.33333C24.5 8.04467 23.4553 7 22.1667 7Z" stroke="#1F2A44" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M7 10.5H8.16667M11.6667 10.5H12.8333M16.3333 10.5H17.5M21 10.5H22.1667M7 14H8.16667M11.6667 14H12.8333M16.3333 14H17.5M21 14H22.1667M9.33333 17.5H18.6667" stroke="#1F2A44" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span>{t.welcome.typeInstead}</span>
      </button>

      {/* Subtle Footer Disclaimer (Figma 81:40 at y=816) */}
      <p className="absolute top-[816px] left-[16px] right-[16px] text-center text-[9px] text-[#4a5470] font-normal leading-tight z-20 pointer-events-none">
        {t.welcome.disclaimer}
      </p>
    </div>
  );
};
