
import { createContext, useContext } from 'react';
import vi, { type TranslationKeys } from './vi';
import en from './en';
import ko from './ko';

export type Locale = 'vi' | 'en' | 'ko';

const translations: Record<Locale, TranslationKeys> = { vi, en, ko };

export function detectLocale(): Locale {
  const saved = localStorage.getItem('pref_locale') as Locale | null;
  if (saved && translations[saved]) return saved;

  // Trang meta đa ngôn ngữ /en/, /ko/ (postbuild-i18n) → người vào từ link đó nhận đúng locale
  const path = window.location.pathname;
  if (path === '/en' || path.startsWith('/en/')) return 'en';
  if (path === '/ko' || path.startsWith('/ko/')) return 'ko';

  const browserLang = (navigator.language || '').toLowerCase();
  if (browserLang.startsWith('vi')) return 'vi';
  if (browserLang.startsWith('ko')) return 'ko';
  return 'en';
}

export interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslationKeys;
}

export const LocaleContext = createContext<LocaleContextValue>({
  locale: 'vi',
  setLocale: () => {},
  t: vi,
});

export function getTranslations(locale: Locale): TranslationKeys {
  return translations[locale] || vi;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

export const LOCALE_OPTIONS: { value: Locale; label: string; flag: string }[] = [
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { value: 'ko', label: '한국어', flag: '🇰🇷' },
];
