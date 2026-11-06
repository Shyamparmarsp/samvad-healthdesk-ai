import React from 'react';

/**
 * Samwad Assistant button — imported from the approved Figma master component
 * `140:2 · Samwad Assistant / Button` (file PIIKHDaviWGq9EV9yBZcnc).
 *
 * The visual contract is copied from that node, not re-drawn:
 *   - dark navy pill 306×72, radius 36, 2px border rgba(77,107,173,0.92)
 *   - drop shadow 0 8px 11px rgba(9,20,59,0.48) plus the inset top highlight
 *   - lavender mascot asset 54×54, white 18px Plus Jakarta Sans SemiBold label
 *   - 37.77×24.04 light-blue sparkle accents
 *
 * The assets are the exported Figma files committed under `public/assistant/`.
 * Below `lg` the pill is scaled proportionally so it never collides with a page title;
 * the mascot, label and sparkles keep their original relative sizes.
 */

interface SamwadAssistantButtonProps {
  onClick: () => void;
  isOpen: boolean;
  isBusy?: boolean;
}

export const SamwadAssistantButton: React.FC<SamwadAssistantButtonProps> = ({
  onClick,
  isOpen,
  isBusy = false,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-haspopup="dialog"
    aria-expanded={isOpen}
    aria-controls="samwad-assistant-panel"
    aria-label="Open Samwad Assistant to hear a summary of this page"
    data-node-id="140:2"
    data-name="Samwad Assistant / Button"
    className="group relative inline-flex shrink-0 items-center justify-center gap-[4px] rounded-full border-2 border-[rgba(77,107,173,0.92)] bg-[#091329] py-[5px] pl-[5px] pr-[8px] drop-shadow-[0px_8px_11px_rgba(9,20,59,0.48)] transition-transform hover:brightness-110 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b3d4ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#dde3ee] sm:gap-[5px] sm:py-[6px] sm:pl-[6px] sm:pr-[9px] lg:h-[72px] lg:w-[306px] lg:gap-[7px] lg:py-[8px] lg:pl-[8px] lg:pr-[13px]"
  >
    {/* Pill fill (Figma 140:2 background) */}
    <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[#091329]" />
    {/* Inset top highlight (Figma 140:2 inner shadow) */}
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      style={{ boxShadow: 'inset 0px 1px 4px 0px rgba(92,122,191,0.16)' }}
    />

    {/* Mascot / Purple Avatar (Figma 140:3, exported asset) */}
    <span aria-hidden className="relative block h-[34px] w-[34px] shrink-0 sm:h-[38px] sm:w-[38px] lg:h-[54px] lg:w-[54px]">
      <img
        src="/assistant/mascot-purple-avatar.png"
        alt=""
        className="absolute inset-0 block h-full w-full max-w-none"
        draggable={false}
      />
    </span>

    {/* Editable label (Figma 140:4) */}
    <span className="relative shrink-0 whitespace-nowrap font-sans text-[13.5px] font-semibold leading-none text-[#f7faff] sm:text-[15.5px] lg:text-[18px]">
      Samwad Assistant
    </span>

    {/* Sparkles (Figma 140:5, exported asset) */}
    <span
      aria-hidden
      className="relative block h-[15px] w-[23.6px] shrink-0 sm:h-[16.2px] sm:w-[25.5px] lg:h-[24.042px] lg:w-[37.77px]"
    >
      <img src="/assistant/sparkles.svg" alt="" className="absolute inset-0 block h-full w-full max-w-none" draggable={false} />
    </span>

    {/* Busy state is announced, never drawn over the approved artwork. */}
    {isBusy && <span className="sr-only" role="status">Preparing summary</span>}
  </button>
);
