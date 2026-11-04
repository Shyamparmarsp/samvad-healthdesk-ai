/**
 * Theme tokens and persistence.
 *
 * The product was designed for one light palette. Dark mode is a palette swap only: the
 * same layout, spacing, typography and components are reused, and every colour override
 * lives in `src/styles/theme-dark.css`. No component reads these helpers for styling —
 * they only own the persisted preference and the `<html data-theme>` attribute so the
 * correct palette is applied before the first paint.
 */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'samvad_theme';
export const DEFAULT_THEME: Theme = 'light';

/** Reads the stored preference. Unknown or unavailable storage falls back to light. */
export function readStoredTheme(): Theme {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_THEME;
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function persistTheme(theme: Theme): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or a storage quota failure must not break the toggle.
  }
}

/**
 * Applies the palette to the document root. `color-scheme` makes native controls
 * (inputs, scrollbars) follow the theme instead of staying light.
 */
export function applyTheme(theme: Theme, root?: HTMLElement | null): void {
  if (typeof document === 'undefined' && !root) return;
  const element = root ?? document.documentElement;
  element.setAttribute('data-theme', theme);
  element.classList.toggle('dark', theme === 'dark');
  element.style.colorScheme = theme;
}

export function nextTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}
