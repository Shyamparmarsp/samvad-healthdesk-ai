import React, { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  /** `danger` styles the confirm action as a leaving action. */
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible confirmation dialog used by the conversation exit flow.
 *
 * Uses the existing frosted-surface language (same radii, border and shadow tokens as the
 * approved cards), traps the initial focus on the safe action, closes on Escape and on a
 * backdrop click, and restores focus to the element that opened it.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = typeof document !== 'undefined' ? (document.activeElement as HTMLElement) : null;
    // Focus the non-destructive action so Enter does not leave the session by accident.
    const timer = setTimeout(() => cancelRef.current?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
      if (event.key !== 'Tab') return;
      // Two focusable actions: keep Tab inside the dialog.
      const buttons = document.querySelectorAll<HTMLElement>('[data-confirm-dialog] button');
      if (buttons.length === 0) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-5">
      <button
        type="button"
        aria-label={cancelLabel}
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 bg-[#1d2433]/40 backdrop-blur-sm cursor-default"
      />
      <div
        data-confirm-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="relative w-full max-w-[330px] rounded-[24px] backdrop-blur-[9px] bg-[rgba(255,255,255,0.9)] border border-white p-5 shadow-[0px_10px_30px_-6px_rgba(41,51,79,0.35)]"
      >
        <h2 id="confirm-dialog-title" className="text-[15px] font-bold text-[#1d2433] leading-snug">
          {title}
        </h2>
        <p id="confirm-dialog-description" className="mt-2 text-[12px] leading-relaxed text-[#4a5470]">
          {description}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="w-full h-[46px] rounded-[23px] bg-[#1f2a44] border border-[#1f2a44] text-white text-[13px] font-semibold hover:bg-[#2a3a5c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f2a44]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`w-full h-[46px] rounded-[23px] text-[13px] font-semibold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f2a44] ${
              tone === 'danger'
                ? 'bg-red-600 border-red-600 text-white hover:bg-red-700'
                : 'bg-[rgba(255,255,255,0.74)] border-white text-[#1d2433] hover:bg-white'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
