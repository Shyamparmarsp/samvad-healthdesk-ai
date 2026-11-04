import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { applyTheme, nextTheme, persistTheme, readStoredTheme, type Theme } from './theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

/**
 * Owns the single theme preference for both route groups (patient and doctor).
 *
 * The initial class is applied by the inline script in `index.html` so the first paint
 * already uses the stored palette; this provider re-applies it for React and keeps the
 * state in sync after a toggle.
 */
export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((value: Theme) => {
    setThemeState(value);
    persistTheme(value);
    applyTheme(value);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = nextTheme(current);
      persistTheme(next);
      applyTheme(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
