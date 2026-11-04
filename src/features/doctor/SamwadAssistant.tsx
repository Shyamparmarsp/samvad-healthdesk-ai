import React, { useEffect, useRef } from 'react';
import { SamwadAssistantButton } from './SamwadAssistantButton';
import { useSamwadAssistant, type AssistantPage } from './useSamwadAssistant';

interface SamwadAssistantProps {
  /** What the doctor is looking at right now. */
  page: AssistantPage;
  /** Signed-in doctor, so the mock backend reads the same rows as the page. */
  doctorId?: string;
  /** Dashboard only: brief automatically on entry. */
  autoGreet?: boolean;
  greetingToken?: number;
  dataReady?: boolean;
  dataFailed?: boolean;
}

/**
 * Samwad Assistant — doctor-facing Hindi summariser.
 *
 * The pill is the approved Figma component; this wrapper adds the contextual panel.
 * Every state is announced in Hindi, including the fallbacks, and the panel never
 * covers the page with a blocking overlay.
 */
export const SamwadAssistant: React.FC<SamwadAssistantProps> = ({
  page,
  doctorId,
  autoGreet = false,
  greetingToken = 0,
  dataReady = true,
  dataFailed = false,
}) => {
  const assistant = useSamwadAssistant({ page, doctorId, autoGreet, greetingToken, dataReady, dataFailed });
  const { isOpen, openSource, status, text, audio, errorKind, isBusy, open, close, retry, play, stop } = assistant;

  const buttonRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);

  // Move focus into the panel only when the doctor opened it. An automatic briefing
  // must not steal keyboard focus from the page; its text is announced politely instead.
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      if (openSource === 'user') panelRef.current?.focus();
    } else if (!isOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      if (openSource === null) {
        const button = buttonRef.current?.querySelector('button');
        button?.focus();
      }
    }
  }, [isOpen, openSource]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [isOpen, close]);

  const audioControl = (() => {
    if (audio === 'loading') {
      return (
        <span role="status" className="text-[11px] font-medium text-[#4a5470]">
          आवाज़ तैयार हो रही है…
        </span>
      );
    }
    if (audio === 'playing') {
      return (
        <button
          type="button"
          onClick={stop}
          className="inline-flex h-[36px] items-center gap-1.5 rounded-full bg-[#091329] px-4 text-[11px] font-semibold text-[#f7faff] transition-colors hover:bg-[#16213c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f2a44]"
        >
          <span aria-hidden>■</span> रोकें
        </button>
      );
    }
    if (audio === 'blocked') {
      return (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={play}
            className="inline-flex h-[36px] items-center gap-1.5 rounded-full bg-[#091329] px-4 text-[11px] font-semibold text-[#f7faff] transition-colors hover:bg-[#16213c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f2a44]"
          >
            <span aria-hidden>▶</span> सुनने के लिए दबाएँ
          </button>
          <p className="text-[10px] leading-snug text-[#4a5470]">
            ब्राउज़र ने अपने आप चलने वाली आवाज़ रोक दी है। सारांश नीचे पढ़ा भी जा सकता है।
          </p>
        </div>
      );
    }
    if (audio === 'unavailable') {
      return (
        <div className="space-y-1.5">
          <p className="text-[10px] leading-snug text-[#b2651a]">
            आवाज़ अभी उपलब्ध नहीं है। सारांश पढ़ा जा सकता है।
          </p>
          <button
            type="button"
            onClick={play}
            className="inline-flex h-[32px] items-center gap-1.5 rounded-full border border-[#dde3ee] bg-white px-3.5 text-[11px] font-semibold text-[#1f2a44] transition-colors hover:bg-[#f3f6fc] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f2a44]"
          >
            फिर कोशिश करें
          </button>
        </div>
      );
    }
    if (audio === 'ended' || audio === 'stopped') {
      return (
        <button
          type="button"
          onClick={play}
          className="inline-flex h-[36px] items-center gap-1.5 rounded-full border border-[#dde3ee] bg-white px-4 text-[11px] font-semibold text-[#1f2a44] transition-colors hover:bg-[#f3f6fc] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f2a44]"
        >
          <span aria-hidden>↻</span> फिर सुनें
        </button>
      );
    }
    return null;
  })();

  return (
    <div ref={buttonRef} className="relative shrink-0 self-end lg:self-auto">
      <SamwadAssistantButton onClick={isOpen ? close : open} isOpen={isOpen} isBusy={isBusy} />

      {isOpen && (
        <div
          ref={panelRef}
          id="samwad-assistant-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="samwad-assistant-title"
          tabIndex={-1}
          className="absolute right-0 top-[calc(100%+12px)] z-40 w-[min(92vw,384px)] overflow-hidden rounded-[24px] border-2 border-[rgba(77,107,173,0.92)] bg-[#091329] shadow-[0px_16px_38px_-6px_rgba(9,20,59,0.55)] focus:outline-none"
        >
          {/* Navy header, same palette as the approved pill */}
          <div className="flex items-start gap-3 px-4 pb-3 pt-4">
            <img
              src="/assistant/mascot-purple-avatar.png"
              alt=""
              aria-hidden
              className="mt-0.5 h-[38px] w-[38px] shrink-0"
            />
            <div className="min-w-0 flex-1">
              <h2 id="samwad-assistant-title" className="text-[13px] font-semibold leading-tight text-[#f7faff]">
                Samwad Assistant
              </h2>
              <p className="mt-0.5 text-[10px] text-[#b3d4ff]">हिंदी में आपका सहायक</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="सहायक बंद करें"
              className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full border border-[rgba(179,212,255,0.35)] text-[13px] leading-none text-[#b3d4ff] transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b3d4ff]"
            >
              <span aria-hidden>✕</span>
            </button>
          </div>

          {/* White body: the Hindi summary and its honest audio state */}
          <div className="space-y-3 rounded-t-[20px] bg-white px-4 py-4">
            {status === 'loading' && (
              <div role="status" aria-live="polite" className="flex items-center gap-2 py-1 text-[12px] text-[#4a5470]">
                <span aria-hidden className="h-2 w-2 animate-ping rounded-full bg-[#284c91]" />
                सारांश तैयार हो रहा है…
              </div>
            )}

            {status === 'error' && (
              <div role="alert" className="space-y-2">
                <p className="text-[12px] leading-relaxed text-[#8a1c1c]">
                  {errorKind === 'data'
                    ? 'आपका डेटा लोड नहीं हो सका, इसलिए मैं अभी सारांश नहीं बना सकता।'
                    : 'सारांश तैयार नहीं हो सका। कृपया फिर कोशिश करें।'}
                </p>
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex h-[34px] items-center rounded-full border border-[#b3d4ff]/40 bg-[#091329] px-4 text-[11px] font-semibold text-[#f7faff] transition-colors hover:bg-[#16213c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f2a44]"
                >
                  फिर कोशिश करें
                </button>
              </div>
            )}

            {status === 'ready' && text && (
              <>
                <p lang="hi" aria-live="polite" className="font-hindi text-[13px] leading-relaxed text-[#1d2433]">
                  {text}
                </p>
                <div className="flex flex-wrap items-center gap-2">{audioControl}</div>
              </>
            )}

            <p className="border-t border-[#dde3ee]/70 pt-2 text-[10px] leading-snug text-[#6b7590]">
              यह केवल आपके डैशबोर्ड की जानकारी का सारांश है, चिकित्सकीय सलाह नहीं।
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
