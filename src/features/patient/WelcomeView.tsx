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
                /* Pencil Icon (Figma 81:20) */
                <svg className="w-6 h-6 text-[#1f2a44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              )}
              {idx === 2 && (
                /* Calendar Icon (Figma 81:25) */
                <svg className="w-6 h-6 text-[#1f2a44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      {/* Start Talking Button (Figma 81:30: w=350, h=58 at x=20, y=623) */}
      <button
        type="button"
        onClick={onStartTalking}
        aria-label={t.welcome.startTalking}
        className="absolute left-[20px] top-[623px] w-[350px] h-[58px] rounded-[29px] bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] active:scale-[0.99] transition-all flex items-center justify-center gap-3 z-20 focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
      >
        <svg className="w-5 h-5 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
        </svg>
        <span>{t.welcome.startTalking}</span>
      </button>

      {/* Type Instead Button (Figma 81:35: w=350, h=54 at x=20, y=694) */}
      <button
        type="button"
        onClick={onTypeInstead}
        aria-label={t.welcome.typeInstead}
        className="absolute left-[20px] top-[694px] w-[350px] h-[54px] rounded-[27px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.74)] border border-white text-[#1f2a44] font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.1)] hover:bg-white active:scale-[0.99] transition-all flex items-center justify-center gap-2.5 z-20 focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
      >
        <svg className="w-5 h-5 text-[#1f2a44]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M3 14h18m-9-4v8m-4-8v8m8-8v8M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
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
