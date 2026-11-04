import React from 'react';
import { useTheme } from '../../theme/ThemeProvider';

interface ThemeToggleProps {
  /** Extra classes for placement; the control itself keeps the shared look. */
  className?: string;
}

/**
 * Sun/moon theme switch.
 *
 * Implemented as a `switch` button: it is one tab stop, responds to Enter and Space, and
 * announces the resulting state through `aria-checked`. The visible size matches the
 * existing 34px header pill so the header geometry does not change.
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      title={label}
      data-theme-toggle={theme}
      onClick={toggleTheme}
      className={`w-[34px] h-[34px] rounded-[17px] bg-[rgba(255,255,255,0.55)] backdrop-blur-[9px] border border-white shadow-[0px_3px_8px_-3px_rgba(41,51,79,0.08)] flex items-center justify-center text-[#1f2a44] hover:bg-[rgba(255,255,255,0.8)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f2a44] ${className}`}
    >
      {isDark ? (
        // Moon — dark mode is active.
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
        </svg>
      ) : (
        // Sun — light mode is active.
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
      <span className="sr-only">{label}</span>
    </button>
  );
};
