/**
 * i18n entry point for the Expo mobile app.
 *
 * Languages: DE / EN / RU (re-activated). Adding a new language = drop the
 * locale json under ./locales, register it in `resources` below, and append
 * its meta entry to LANGUAGES (label/flag) — the Switcher renders dynamically.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import de from './locales/de.json';
import ru from './locales/ru.json';

export const SUPPORTED_LANGS = ['de', 'en', 'ru'] as const;
export type AppLang = (typeof SUPPORTED_LANGS)[number];
export const DEFAULT_LANG: AppLang = 'de';

// Single registry of language metadata — used by LanguageSwitcher and Profile.
// Add a new locale here once and it propagates everywhere.
export const LANGUAGES: { code: AppLang; label: string; name: string; flag: string }[] = [
  { code: 'de', label: 'DE', name: 'Deutsch',  flag: '🇩🇪' },
  { code: 'en', label: 'EN', name: 'English',  flag: '🇬🇧' },
  { code: 'ru', label: 'RU', name: 'Русский',  flag: '🇷🇺' },
];

const STORAGE_KEY = 'app.lang';

function pickInitialLanguage(stored?: string | null): AppLang {
  if (stored && (SUPPORTED_LANGS as readonly string[]).includes(stored)) return stored as AppLang;
  try {
    const locales = (Localization.getLocales?.() || []) as Array<{ languageCode?: string }>;
    for (const l of locales) {
      const code = (l?.languageCode || '').toLowerCase();
      if ((SUPPORTED_LANGS as readonly string[]).includes(code)) return code as AppLang;
    }
  } catch {
    /* expo-localization may not be available on web SSR */
  }
  return DEFAULT_LANG;
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      de: { translation: de },
      ru: { translation: ru },
    },
    lng: DEFAULT_LANG,
    fallbackLng: DEFAULT_LANG,
    interpolation: { escapeValue: false },
    returnNull: false,
    compatibilityJSON: 'v4',
  });

// Async hydrate from storage so first render uses persisted choice.
AsyncStorage.getItem(STORAGE_KEY)
  .then((stored) => {
    const lang = pickInitialLanguage(stored);
    if (i18n.language !== lang) i18n.changeLanguage(lang);
  })
  .catch(() => { /* ignore storage failures */ });

export async function setAppLanguage(lang: AppLang): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

export function getCurrentLanguage(): AppLang {
  const cur = (i18n.language || DEFAULT_LANG).split('-')[0];
  return ((SUPPORTED_LANGS as readonly string[]).includes(cur) ? cur : DEFAULT_LANG) as AppLang;
}

export default i18n;
