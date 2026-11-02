import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { en } from './en';
import { hi } from './hi';

export type Language = 'en' | 'hi';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof en;
}

const I18nContext = createContext<I18nContextType>({
  language: 'en',
  setLanguage: () => {},
  t: en,
});

const LANGUAGE_STORAGE_KEY = 'samvad_language';

/** Restore the persisted choice so a Hindi patient stays in Hindi (D-38). */
function readStoredLanguage(): Language {
  try {
    if (typeof localStorage === 'undefined') return 'en';
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => readStoredLanguage());

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      }
    } catch {
      // Storage can be unavailable (private mode); the session still works.
    }
  };

  useEffect(() => {
    try {
      if (typeof document !== 'undefined') {
        document.documentElement.lang = language === 'hi' ? 'hi' : 'en';
      }
    } catch {
      // No document in tests.
    }
  }, [language]);

  const t = language === 'hi' ? hi : en;

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);

export { en, hi };
