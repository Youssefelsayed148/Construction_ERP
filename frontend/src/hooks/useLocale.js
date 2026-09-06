import { useState, useEffect, useCallback } from 'react';

const NAMESPACES = ['common', 'auth', 'dashboard', 'inventory', 'projects', 'suppliers', 'clients', 'expenses', 'hr', 'payroll', 'assets', 'legal', 'approvals', 'boq', 'workorders', 'subcontractors', 'costing'];

const loadLocale = async (locale) => {
  const translations = {};
  await Promise.all(
    NAMESPACES.map(async (ns) => {
      try {
        const mod = await import(`../locales/${locale}/${ns}.json`);
        translations[ns] = mod.default || mod;
      } catch {
        translations[ns] = {};
      }
    })
  );
  return translations;
};

let cachedTranslations = { en: null, ar: null };
let currentLocale = localStorage.getItem('locale') || 'ar';

const applyDirection = (locale) => {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = locale;
};

export function useLocale() {
  const [locale, setLocaleState] = useState(() => {
    const saved = localStorage.getItem('locale') || 'ar';
    applyDirection(saved);
    return saved;
  });
  const [translations, setTranslations] = useState(cachedTranslations[locale] || {});
  const [loading, setLoading] = useState(!cachedTranslations[locale]);

  useEffect(() => {
    if (cachedTranslations[locale]) {
      setTranslations(cachedTranslations[locale]);
      setLoading(false);
      return;
    }

    setLoading(true);
    loadLocale(locale).then((loaded) => {
      cachedTranslations[locale] = loaded;
      setTranslations(loaded);
      setLoading(false);
    });
  }, [locale]);

  const setLocale = useCallback((newLocale) => {
    currentLocale = newLocale;
    localStorage.setItem('locale', newLocale);
    applyDirection(newLocale);
    setLocaleState(newLocale);
  }, []);

  const t = useCallback((key, fallback = '') => {
    const parts = key.split('.');
    if (parts.length < 2) {
      for (const ns of NAMESPACES) {
        if (translations[ns]?.[key]) return translations[ns][key];
      }
      return fallback || key;
    }

    const ns = parts[0];
    let value = translations[ns] || {};
    for (let i = 1; i < parts.length; i++) {
      if (value && typeof value === 'object') {
        value = value[parts[i]];
      } else {
        return fallback || key;
      }
    }
    return value || fallback || key;
  }, [translations]);

  return {
    locale,
    setLocale,
    t,
    loading,
    isRTL: locale === 'ar',
  };
}

export { currentLocale, applyDirection };
