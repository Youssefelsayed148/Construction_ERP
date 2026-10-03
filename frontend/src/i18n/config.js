// Locale contract (docs/i18n/README.md). Stored and sent as 'en' / 'ar'; use FORMAT_LOCALE[...]
// only for Intl / toLocale*String.
export const SUPPORTED_LOCALES = ['en', 'ar'];
export const DEFAULT_LOCALE = 'ar';
export const STORAGE_KEY = 'locale';
export const FORMAT_LOCALE = { en: 'en-EG', ar: 'ar-EG' };

export const isSupportedLocale = (value) => SUPPORTED_LOCALES.includes(value);
export const normalizeLocale = (value) => (isSupportedLocale(value) ? value : DEFAULT_LOCALE);
export const directionOf = (locale) => (locale === 'ar' ? 'rtl' : 'ltr');

export function readStoredLocale() {
  try {
    return normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    return DEFAULT_LOCALE;
  }
}

export function storeLocale(locale) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch (e) { /* storage blocked: the choice lasts for this session only */ }
}

// <html lang> and dir always match the active locale.
export function applyDocumentLocale(locale) {
  const root = document.documentElement;
  root.lang = locale;
  root.dir = directionOf(locale);
}
