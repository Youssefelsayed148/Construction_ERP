// Loads and caches translation catalogs (src/locales/<locale>/<namespace>.json).
// A failed namespace is reported, not thrown: the app keeps working with English / fallbacks.
export const NAMESPACES = [
  'common', 'auth', 'dashboard', 'inventory', 'projects', 'suppliers', 'clients', 'expenses',
  'hr', 'payroll', 'assets', 'legal', 'approvals', 'boq', 'workorders', 'subcontractors', 'costing',
];

const cache = {};      // locale -> catalog
const pending = {};    // locale -> promise

async function importNamespace(locale, ns) {
  const mod = await import(`../locales/${locale}/${ns}.json`);
  return mod.default || mod;
}

export function getCachedCatalog(locale) {
  return cache[locale] || null;
}

// Resolves { catalog, failed: [namespaces] }. Concurrent calls share one load; failures are not cached.
export function loadCatalog(locale, importer = importNamespace) {
  if (cache[locale]) return Promise.resolve({ catalog: cache[locale], failed: [] });
  if (!pending[locale]) {
    pending[locale] = (async () => {
      const catalog = {}; const failed = [];
      await Promise.all(NAMESPACES.map(async (ns) => {
        try { catalog[ns] = await importer(locale, ns); } catch (e) { catalog[ns] = {}; failed.push(ns); }
      }));
      if (failed.length === 0) cache[locale] = catalog;
      delete pending[locale];
      return { catalog, failed };
    })();
  }
  return pending[locale];
}

export function _resetCatalogCache() {
  Object.keys(cache).forEach((k) => delete cache[k]);
  Object.keys(pending).forEach((k) => delete pending[k]);
}
