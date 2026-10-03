// Pure translation lookup: dot-path keys, {param} interpolation, plural objects. No React here.
//
//   translate(catalogs, 'en', 'procurement.comparison.title')
//   translate(catalogs, 'ar', 'projects.count', { count: 3 })     value: { one, two, few, many, other }
//   translate(catalogs, 'en', 'common.save', 'Save')              legacy: a string second argument is a fallback
//
// catalogs = { en: { ns: {...} }, ar: { ns: {...} } }. A key missing in the active locale is read from
// English, then from the fallback. A key missing everywhere reports itself (onMissing) and renders:
//   development/test  a visible marker
//   production        the fallback, or a readable form of the last key segment (never the raw path)
const lookupPath = (tree, parts) => {
  let node = tree;
  for (const part of parts) {
    if (node && typeof node === 'object' && part in node) node = node[part];
    else return undefined;
  }
  return node;
};

export function interpolate(template, params) {
  if (typeof template !== 'string' || !params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined || params[name] === null ? match : String(params[name])));
}

function pickPlural(value, params, locale) {
  const count = Number(params.count);
  if (!Number.isFinite(count)) return value.other;
  const category = new Intl.PluralRules(locale === 'ar' ? 'ar-EG' : 'en').select(count);
  if (count === 0 && 'zero' in value) return value.zero;
  return value[category] ?? value.other;
}

function resolve(catalogs, locale, key, params) {
  const parts = key.split('.');
  const tree = catalogs[locale];
  let value;
  if (tree) {
    if (parts.length < 2) {
      // Legacy un-namespaced key: first namespace that defines it.
      for (const ns of Object.keys(tree)) {
        if (tree[ns] && typeof tree[ns] === 'object' && key in tree[ns]) { value = tree[ns][key]; break; }
      }
    } else {
      value = lookupPath(tree, parts);
    }
  }
  if (value && typeof value === 'object' && ('other' in value)) value = pickPlural(value, params || {}, locale);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

const humanize = (segment) => {
  const words = segment.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export function translate(catalogs, locale, key, second, options = {}) {
  if (typeof key !== 'string' || key === '') return '';
  const params = second && typeof second === 'object' ? second : undefined;
  const fallback = typeof second === 'string' ? second : (params && params.defaultValue);

  let value = resolve(catalogs, locale, key, params);
  if (value === undefined && locale !== 'en') value = resolve(catalogs, 'en', key, params);
  if (value !== undefined) return interpolate(value, params);

  if (options.onMissing) options.onMissing(key, locale);
  if (fallback) return interpolate(fallback, params);
  if (options.mode === 'production') return humanize(key.split('.').pop());
  return `⟦${key}⟧`;
}

export const _internal = { lookupPath, humanize };
