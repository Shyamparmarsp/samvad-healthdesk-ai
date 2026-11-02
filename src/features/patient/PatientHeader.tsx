import React from 'react';
import { useI18n } from '../../i18n';

interface PatientHeaderProps {
  progress?: number; // 0 to 1
  onBack?: () => void;
}

export const PatientHeader: React.FC<PatientHeaderProps> = ({ progress, onBack }) => {
  const { language, setLanguage } = useI18n();

  return (
    <div className="w-full flex-shrink-0 pt-4 px-5 pb-2 relative z-20">
      <div className="flex items-center justify-between">
        {/* Brand Mark + Name (Figma 81:4 - 81:6) */}
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Go back"
              className="mr-1 text-[#1f2a44] hover:opacity-80 p-1 -ml-1 rounded-full transition-opacity"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div
            className="w-[30px] h-[30px] rounded-[9px] bg-[#1f2a44] border border-white text-white flex items-center justify-center font-bold text-[22px] leading-none select-none shadow-sm flex-shrink-0"
            aria-hidden="true"
          >
            +
          </div>
          <span className="font-bold text-[13px] text-[#1d2433] tracking-tight whitespace-nowrap">
            Samvad HealthDesk AI
          </span>
        </div>

        {/* Language Toggle Pill (Exact Figma 81:7 / 98:46) */}
        <div
          className="w-[120px] h-[34px] rounded-[17px] bg-[rgba(255,255,255,0.55)] backdrop-blur-[9px] border border-white shadow-[0px_3px_8px_-3px_rgba(41,51,79,0.08)] flex items-center p-0.5 select-none"
          role="group"
          aria-label="Language selector"
        >
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`w-[58px] h-[30px] rounded-[15px] text-[10px] font-semibold transition-all flex items-center justify-center ${
              language === 'en'
                ? 'bg-[#1f2a44] text-white shadow-sm'
                : 'text-[#4a5470] hover:text-[#1d2433]'
            }`}
            aria-pressed={language === 'en'}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLanguage('hi')}
            className={`w-[58px] h-[30px] rounded-[15px] text-[11px] font-semibold transition-all flex items-center justify-center ${
              language === 'hi'
                ? 'bg-[#1f2a44] text-white shadow-sm'
                : 'text-[#4a5470] hover:text-[#1d2433]'
            }`}
            aria-pressed={language === 'hi'}
          >
            हिंदी
          </button>
        </div>
      </div>

      {/* Progress Track & Value (Figma 81:67 & 81:68: w=346, h=4 at y=72) */}
      {typeof progress === 'number' && (
        <div className="w-[346px] mx-auto bg-[#e0e5f0] h-[4px] rounded-[2px] mt-3.5 overflow-hidden">
          <div
            className="bg-[#1f2a44] h-full rounded-[2px] transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, Math.round(progress * 100)))}%` }}
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}
    </div>
  );
};
