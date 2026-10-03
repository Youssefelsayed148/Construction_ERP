import { translate, interpolate } from './translate';
import { normalizeLocale, directionOf, DEFAULT_LOCALE, FORMAT_LOCALE } from './config';
import { loadCatalog, _resetCatalogCache } from './catalog';

const catalogs = {
  en: {
    common: { save: 'Save', greeting: 'Hello {name}', items: { one: '{count} item', other: '{count} items' } },
    procurement: { comparison: { title: 'Comparison' } },
  },
  ar: {
    common: {
      save: 'حفظ',
      items: { zero: 'لا عناصر', one: 'عنصر واحد', two: 'عنصران', few: '{count} عناصر', many: '{count} عنصرًا', other: '{count} عنصر' },
    },
  },
};

describe('translate', () => {
  test('looks up dot paths in the active locale', () => {
    expect(translate(catalogs, 'ar', 'common.save')).toBe('حفظ');
    expect(translate(catalogs, 'en', 'procurement.comparison.title')).toBe('Comparison');
  });

  test('falls back to English, then to the supplied fallback', () => {
    expect(translate(catalogs, 'ar', 'procurement.comparison.title')).toBe('Comparison');
    expect(translate(catalogs, 'ar', 'nope.missing', 'Fallback text')).toBe('Fallback text');
  });

  test('interpolates params instead of concatenating', () => {
    expect(translate(catalogs, 'en', 'common.greeting', { name: 'Sara' })).toBe('Hello Sara');
    expect(interpolate('Hello {name}', {})).toBe('Hello {name}');
  });

  test('picks plural forms per locale', () => {
    expect(translate(catalogs, 'en', 'common.items', { count: 1 })).toBe('1 item');
    expect(translate(catalogs, 'en', 'common.items', { count: 5 })).toBe('5 items');
    expect(translate(catalogs, 'ar', 'common.items', { count: 0 })).toBe('لا عناصر');
    expect(translate(catalogs, 'ar', 'common.items', { count: 1 })).toBe('عنصر واحد');
    expect(translate(catalogs, 'ar', 'common.items', { count: 2 })).toBe('عنصران');
    expect(translate(catalogs, 'ar', 'common.items', { count: 5 })).toBe('5 عناصر');
    expect(translate(catalogs, 'ar', 'common.items', { count: 11 })).toBe('11 عنصرًا');
  });

  test('a missing key is visible in development and never a raw path in production', () => {
    const seen = [];
    expect(translate(catalogs, 'en', 'a.b.c', undefined, { mode: 'development', onMissing: (k) => seen.push(k) })).toBe('⟦a.b.c⟧');
    expect(seen).toEqual(['a.b.c']);
    const prod = translate(catalogs, 'en', 'a.b.noQuotations', undefined, { mode: 'production' });
    expect(prod).toBe('No quotations');
    expect(prod).not.toContain('a.b');
  });

  test('legacy un-namespaced keys search the namespaces', () => {
    expect(translate(catalogs, 'ar', 'save')).toBe('حفظ');
  });
});

describe('locale config', () => {
  test('invalid values fall back to the default; direction follows the locale', () => {
    expect(normalizeLocale('fr')).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(null)).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale('en')).toBe('en');
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
    expect(FORMAT_LOCALE.ar).toBe('ar-EG');
  });
});

describe('catalog loading', () => {
  beforeEach(() => _resetCatalogCache());

  test('caches a successful load and shares concurrent loads', async () => {
    const importer = jest.fn(async (locale, ns) => ({ ns }));
    const [a, b] = await Promise.all([loadCatalog('en', importer), loadCatalog('en', importer)]);
    expect(a.failed).toEqual([]);
    expect(b.catalog).toBe(a.catalog);
    const calls = importer.mock.calls.length;
    await loadCatalog('en', importer);
    expect(importer.mock.calls.length).toBe(calls);
  });

  test('reports failed namespaces, keeps going, and does not cache the failure', async () => {
    const bad = jest.fn(async (locale, ns) => { if (ns === 'hr') throw new Error('boom'); return { ns }; });
    const first = await loadCatalog('ar', bad);
    expect(first.failed).toEqual(['hr']);
    expect(first.catalog.hr).toEqual({});
    const good = jest.fn(async (locale, ns) => ({ ns }));
    const second = await loadCatalog('ar', good);
    expect(second.failed).toEqual([]);
  });
});
