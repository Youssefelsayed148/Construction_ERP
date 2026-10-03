import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { applyDocumentLocale, directionOf, isSupportedLocale, normalizeLocale, readStoredLocale, STORAGE_KEY, storeLocale } from './config';
import { getCachedCatalog, loadCatalog } from './catalog';
import { translate } from './translate';

const LocaleContext = createContext(null);

const MODE = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const missingKeys = new Set();
export const getMissingKeys = () => [...missingKeys];

// One provider for the whole app: every component that calls useLocale() re-renders on a switch.
// Interface kept from the old hook: { locale, setLocale, t, isRTL, loading } plus { dir, error, retry }.
export function LocaleProvider({ children, initialLocale, onMissingKey }) {
  const [locale, setLocaleState] = useState(() => normalizeLocale(initialLocale || readStoredLocale()));
  const [catalogs, setCatalogs] = useState(() => ({ en: getCachedCatalog('en'), ar: getCachedCatalog('ar') }));
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);
  const localeRef = useRef(locale);
  const onMissingRef = useRef(onMissingKey);
  onMissingRef.current = onMissingKey;

  const load = useCallback(async (target) => {
    const [active, english] = await Promise.all([loadCatalog(target), target === 'en' ? null : loadCatalog('en')]);
    const failed = [...active.failed, ...(english ? english.failed : [])];
    setCatalogs((prev) => ({
      ...prev,
      [target]: active.catalog,
      ...(english ? { en: english.catalog } : {}),
    }));
    return failed;
  }, []);

  // Initial load, and a retry entry point.
  const retry = useCallback(async () => {
    setStatus('loading'); setError(null);
    const failed = await load(localeRef.current);
    if (failed.length) { setStatus('error'); setError(new Error(`Could not load translations: ${failed.join(', ')}`)); } else setStatus('ready');
  }, [load]);

  useEffect(() => {
    applyDocumentLocale(locale);
    retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback(async (next) => {
    if (!isSupportedLocale(next) || next === localeRef.current) return;
    storeLocale(next);
    // Load first, then switch locale, lang and dir together so there is no half-translated frame.
    const failed = await load(next);
    localeRef.current = next;
    applyDocumentLocale(next);
    setLocaleState(next);
    if (failed.length) { setStatus('error'); setError(new Error(`Could not load translations: ${failed.join(', ')}`)); }
  }, [load]);

  // Other tabs: follow a change made there (the storage event does not fire in the tab that wrote it).
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== STORAGE_KEY) return;
      const next = normalizeLocale(event.newValue);
      if (next !== localeRef.current) {
        load(next).then(() => { localeRef.current = next; applyDocumentLocale(next); setLocaleState(next); });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [load]);

  const t = useCallback((key, second) => translate(catalogs, locale, key, second, {
    mode: MODE,
    onMissing: (missing, loc) => {
      if (status === 'loading') return;
      const id = `${loc}:${missing}`;
      if (missingKeys.has(id)) return;
      missingKeys.add(id);
      if (onMissingRef.current) onMissingRef.current(missing, loc);
      else if (MODE === 'development' && process.env.NODE_ENV !== 'test') console.warn(`[i18n] missing key "${missing}" (${loc})`);
    },
  }), [catalogs, locale, status]);

  const value = useMemo(() => ({
    locale, setLocale, t, isRTL: locale === 'ar', dir: directionOf(locale),
    loading: status === 'loading', error, retry,
  }), [locale, setLocale, t, status, error, retry]);

  // Do not paint raw keys before the first catalog is in. A failed load still renders (English / fallbacks).
  if (status === 'loading' && !(catalogs[locale] && catalogs.en)) {
    return <div className="locale-loading" role="status" aria-busy="true" />;
  }
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale() must be used inside <LocaleProvider>');
  return ctx;
}
