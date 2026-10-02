// Loads and caches translation catalogs (src/locales/<locale>/<namespace>.json).
// A failed namespace is reported, not thrown: the app keeps working with English / fallbacks.
// The namespace list from docs/system_language_fix.md L2. `workorders`, `subcontractors` and `costing`
// keep their existing names. A namespace needs a file in BOTH locales (scripts/i18n-parity.js).
export const NAMESPACES = [
  'common', 'auth', 'navigation', 'dashboard', 'projects', 'projectWizard', 'locations', 'boq', 'workorders',
  'subcontractors', 'costing', 'site', 'inventory', 'procurement', 'commercial', 'finance', 'clients', 'suppliers',
  'portals', 'qhse', 'hse', 'documentControl', 'schedule', 'reports', 'handover', 'actions', 'approvals', 'agents',
  'hr', 'payroll', 'assets', 'expenses', 'legal', 'errors', 'enums',
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
