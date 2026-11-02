import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { CONSENT_TEXT } from '../../types/consent';
import { cachedPromptSources } from '../../lib/audio/prompt-audio';
import { PatientHeader } from './PatientHeader';
import { BackButton } from '../common/BackButton';

interface ConsentViewProps {
  onAgree: () => void;
  onDecline: () => void;
  onBack?: () => void;
  /** D-04: no active session (demo_busy) or a request is in flight. */
  disabled?: boolean;
  disabledMessage?: string | null;
}

type AudioStatus = 'idle' | 'playing' | 'unavailable' | 'blocked';

export const ConsentView: React.FC<ConsentViewProps> = ({
  onAgree,
  onDecline,
  onBack,
  disabled = false,
  disabledMessage = null,
}) => {
  const { t, language } = useI18n();
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /**
   * D-06: the greeting is a cached static asset. It is never requested from the paid
   * TTS provider; when the asset is missing the screen says so instead of pretending
   * to play it.
   */
  const playGreeting = useCallback(async () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setAudioStatus('playing');
    // Try the approved static locations in order; never a paid fallback for a fixed prompt.
    for (const source of cachedPromptSources(language, 'greeting')) {
      try {
        const audio = new Audio(source);
        audioRef.current = audio;
        audio.onended = () => setAudioStatus('idle');
        audio.onerror = () => setAudioStatus('unavailable');
        await audio.play();
        return;
      } catch {
        audioRef.current = null;
      }
    }
    setAudioStatus('unavailable');
  }, [language]);

  useEffect(() => {
    void playGreeting();
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [playGreeting]);

  const audioLabel =
    audioStatus === 'unavailable'
      ? t.chat.audioUnavailable
      : audioStatus === 'blocked'
      ? t.chat.audioBlocked
      : audioStatus === 'playing'
      ? t.chat.replayQuestion
      : t.consent.playGreeting;

  return (
    <div className="flex flex-col h-full justify-between pb-4 select-none relative">
      {/* Top Header & Language Toggle */}
      <PatientHeader />

      {onBack && (
        <div className="px-5 pt-0.5 pb-1 flex items-center">
          <BackButton onClick={onBack} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col justify-between px-5 py-3">
        {/* Screen Reader Header */}
        <h1 className="sr-only">{t.consent.title}</h1>

        {/* Assistant Consent Bubble (Figma 72:42) */}
        <div className="my-auto space-y-3">
          <div className="flex items-start gap-2.5">
            {/* Assistant Avatar (Figma 81:47: 30x30 rounded-full) */}
            <div
              className="w-[30px] h-[30px] rounded-full bg-white/80 border border-white text-[#1f2a44] flex items-center justify-center flex-shrink-0 mt-1 shadow-sm"
              aria-hidden="true"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 30 30"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 block"
              >
                <path
                  d="M20 8.75H10C7.92893 8.75 6.25 10.4289 6.25 12.5V20C6.25 22.0711 7.92893 23.75 10 23.75H20C22.0711 23.75 23.75 22.0711 23.75 20V12.5C23.75 10.4289 22.0711 8.75 20 8.75Z"
                  stroke="#1F2A44"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M15 3.75V8.75M11.25 15H11.2625M18.75 15H18.7625M11.25 20H18.75M3.75 13.75V18.75M26.25 13.75V18.75"
                  stroke="#1F2A44"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* Bubble */}
            <div className="flex-1 backdrop-blur-[9px] bg-[rgba(255,255,255,0.7)] border border-white rounded-[20px] rounded-tl-sm p-4 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.1)]">
              <p className="text-[13px] text-[#1d2433] leading-relaxed font-normal">
                {CONSENT_TEXT[language]}
              </p>

              {/* Cached greeting audio control */}
              <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={playGreeting}
                  aria-label={audioLabel}
                  data-audio-status={audioStatus}
                  className="text-[11px] font-medium text-[#1f2a44] flex items-center gap-1.5 hover:underline focus:outline-none text-left"
                >
                  <svg
                    className={`w-3.5 h-3.5 flex-shrink-0 ${
                      audioStatus === 'playing' ? 'animate-spin text-indigo-600' : 'text-[#4a5470]'
                    }`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  <span>{audioLabel}</span>
                </button>
                <span className="text-[10px] text-[#4a5470]/70 font-mono">v1</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons (Figma 72:42) */}
        <div className="space-y-3 pt-2">
          {disabledMessage && (
            <p role="alert" className="text-[11px] text-[#a12626] text-center leading-snug">
              {disabledMessage}
            </p>
          )}

          {/* Yes, I agree (Primary Action, h=54px) */}
          <button
            type="button"
            onClick={onAgree}
            disabled={disabled}
            aria-label={t.consent.agree}
            aria-busy={disabled}
            className="w-full h-[54px] rounded-[27px] bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] active:scale-[0.99] transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#1f2a44] disabled:opacity-50"
          >
            {t.consent.agree}
          </button>

          {/* No, do not proceed (Secondary Action, h=54px) */}
          <button
            type="button"
            onClick={onDecline}
            disabled={disabled}
            aria-label={t.consent.decline}
            className="w-full h-[54px] rounded-[27px] bg-[rgba(255,255,255,0.74)] backdrop-blur-[9px] border border-white text-[#1f2a44] font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.1)] hover:bg-white active:scale-[0.99] transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#1f2a44] disabled:opacity-50"
          >
            {t.consent.decline}
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
