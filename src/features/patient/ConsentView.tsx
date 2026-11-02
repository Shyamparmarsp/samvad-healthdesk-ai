import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { CONSENT_TEXT } from '../../types/consent';
import { cachedPromptUrl } from '../../lib/audio/prompt-audio';
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
    try {
      const audio = new Audio(cachedPromptUrl(language, 'greeting'));
      audioRef.current = audio;
      audio.onended = () => setAudioStatus('idle');
      audio.onerror = () => setAudioStatus('unavailable');
      await audio.play();
    } catch {
      // Browser autoplay policy or a decode failure. Offer an explicit replay.
      setAudioStatus('blocked');
    }
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
            {/* Assistant Avatar */}
            <div className="w-[30px] h-[30px] rounded-full bg-[#1f2a44] border border-white text-white flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <rect x="4" y="8" width="16" height="12" rx="4" strokeWidth={1.8} />
                <circle cx="9" cy="14" r="1.5" fill="currentColor" />
                <circle cx="15" cy="14" r="1.5" fill="currentColor" />
                <path d="M12 4v4m-3-4h6" strokeWidth={1.8} strokeLinecap="round" />
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
