import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import tr from './locales/tr.json';

export const resources = {
  en: { translation: en },
  tr: { translation: tr },
} as const;

export const supportedLanguages = ['en', 'tr'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: supportedLanguages,

    // Language detection options
    detection: {
      // Order: explicit user choice (localStorage) > browser language > html tag
      order: ['localStorage', 'navigator', 'htmlTag'],
      // Keys to look for in localStorage
      lookupLocalStorage: 'agentropolis_language',
      // Do NOT auto-cache detected language — only persist explicit user choice
      // (changeLanguage() below handles manual caching)
      caches: [],
    },

    interpolation: {
      escapeValue: false, // React already escapes by default
    },

    react: {
      useSuspense: false, // Disable suspense to avoid loading states
    },
  });

export default i18n;

/**
 * Get the current language
 */
export function getCurrentLanguage(): SupportedLanguage {
  return (i18n.language?.split('-')[0] as SupportedLanguage) || 'en';
}

/**
 * Change the language (explicit user action — persists to localStorage)
 */
export function changeLanguage(lang: SupportedLanguage): Promise<void> {
  localStorage.setItem('agentropolis_language', lang);
  return i18n.changeLanguage(lang).then(() => undefined);
}
