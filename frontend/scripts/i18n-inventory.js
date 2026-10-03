// Localization baseline inventory (Phase 10, L0). Static scan, no build needed.
//
//   node scripts/i18n-inventory.js            write ../docs/i18n/baseline/inventory.json and print a summary
//   node scripts/i18n-inventory.js --check    fail if any per-file count went UP versus the committed baseline
//
// The counts are heuristics (regex over source), good enough to rank work and to stop regressions:
//   inlineBranches    `locale === 'ar'` / `isRTL ?` style inline language branches
//   hardcodedEnglish  JSX text nodes and placeholder/title/aria-label/alt attributes that are plain English
//   rawEnumRendering  `.replace(/_/g, ' ')` / replaceAll('_', ' ') used to "translate" a value
//   hardcodedFormat   toLocale*('en-US') and similar fixed-locale formatting
//   prompts           window prompt()/confirm()/alert() calls (replaced by real forms in Phase 6)
// Plus: empty/missing namespaces, keys used in code but absent from the catalog, English server messages.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src');
const outDir = path.join(root, '..', 'docs', 'i18n', 'baseline');
const outFile = path.join(outDir, 'inventory.json');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.jsx?$/.test(e.name) && !/\.test\.jsx?$/.test(e.name)) out.push(full);
  }
  return out;
}
const rel = (f) => path.relative(srcDir, f).split(path.sep).join('/');
// The i18n infrastructure itself (src/i18n) legitimately inspects the locale; it is not screen text.
const isInfrastructure = (relPath) => relPath.startsWith('i18n/');
const count = (text, re) => (text.match(re) || []).length;

const INLINE = /locale\s*===?\s*['"]ar['"]|locale\s*!==?\s*['"]ar['"]|isRTL\s*\?/g;
const ENGLISH_TEXT_NODE = />\s*([A-Z][A-Za-z][A-Za-z ,.'&/()-]{2,})\s*</g;
const ENGLISH_ATTR = /\b(?:placeholder|title|aria-label|alt)=["']([A-Z][A-Za-z][A-Za-z ,.'&/()-]{2,})["']/g;
const RAW_ENUM = /\.replace(?:All)?\(\s*(?:\/_\/g|['"]_['"])\s*,\s*['"] ['"]\s*\)/g;
const FIXED_FORMAT = /toLocale(?:Date|Time)?String\(\s*['"](?:en-US|en-GB|en)['"]|Intl\.\w+Format\(\s*['"](?:en-US|en-GB|en)['"]/g;
const PROMPTS = /(?<![\w.])(?:prompt|confirm|alert)\(|window\.(?:prompt|confirm|alert)\(/g;

function scanFrontend() {
  const files = {};
  for (const f of walk(srcDir)) {
    if (isInfrastructure(rel(f))) continue;
    const text = fs.readFileSync(f, 'utf8');
    const entry = {
      inlineBranches: count(text, INLINE),
      hardcodedEnglish: count(text, ENGLISH_TEXT_NODE) + count(text, ENGLISH_ATTR),
      rawEnumRendering: count(text, RAW_ENUM),
      hardcodedFormat: count(text, FIXED_FORMAT),
      prompts: count(text, PROMPTS),
    };
    if (Object.values(entry).some((n) => n > 0)) files[rel(f)] = entry;
  }
  return files;
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function scanCatalog() {
  const localesDir = path.join(srcDir, 'locales');
  const result = { locales: {}, usedKeysMissingFromEn: [], usedKeysMissingFromAr: [] };
  const catalogs = {};
  for (const loc of ['en', 'ar']) {
    const dir = path.join(localesDir, loc);
    catalogs[loc] = {};
    result.locales[loc] = { namespaces: {} };
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json')) : []) {
      const ns = f.replace(/\.json$/, '');
      const keys = flatten(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), ns);
      Object.assign(catalogs[loc], keys);
      result.locales[loc].namespaces[ns] = Object.keys(keys).length;
    }
  }
  const emptyNamespaces = (loc) => Object.entries(result.locales[loc].namespaces).filter(([, n]) => n === 0).map(([ns]) => ns);
  result.emptyNamespaces = { en: emptyNamespaces('en'), ar: emptyNamespaces('ar') };

  // Keys referenced as t('ns.key') with a literal. Dynamic keys (template strings) are listed separately.
  const used = new Set(); const dynamic = {};
  for (const f of walk(srcDir)) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\bt\(\s*['"]([A-Za-z][\w.]*)['"]/g)) used.add(m[1]);
    const dyn = count(text, /\bt\(\s*`/g);
    if (dyn) dynamic[rel(f)] = dyn;
  }
  result.usedKeys = used.size;
  result.dynamicKeyCalls = dynamic;
  const isNamespaced = (k) => k.includes('.');
  for (const k of [...used].filter(isNamespaced).sort()) {
    if (!(k in catalogs.en)) result.usedKeysMissingFromEn.push(k);
    if (!(k in catalogs.ar)) result.usedKeysMissingFromAr.push(k);
  }
  const en = new Set(Object.keys(catalogs.en)); const ar = new Set(Object.keys(catalogs.ar));
  result.parity = {
    inEnNotAr: [...en].filter((k) => !ar.has(k)).sort(),
    inArNotEn: [...ar].filter((k) => !en.has(k)).sort(),
  };
  return result;
}

function scanServerMessages() {
  const routesDir = path.join(root, '..', 'backend', 'src', 'routes');
  const out = {};
  if (!fs.existsSync(routesDir)) return out;
  for (const f of fs.readdirSync(routesDir).filter((x) => x.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(routesDir, f), 'utf8');
    const literal = count(text, /error:\s*['"`][A-Z][^'"`]*['"`]/g);
    const dynamic = count(text, /error:\s*(?:e|err|error)\.message/g);
    if (literal || dynamic) out[f] = { englishLiteral: literal, exceptionMessage: dynamic };
  }
  return out;
}

function build() {
  const files = scanFrontend();
  const totals = {};
  for (const e of Object.values(files)) for (const [k, v] of Object.entries(e)) totals[k] = (totals[k] || 0) + v;
  const server = scanServerMessages();
  const serverTotals = { englishLiteral: 0, exceptionMessage: 0 };
  for (const e of Object.values(server)) { serverTotals.englishLiteral += e.englishLiteral; serverTotals.exceptionMessage += e.exceptionMessage; }
  return {
    note: 'Heuristic static counts. Per-file counts may only go down (npm run i18n:check). Regenerate with npm run i18n:inventory.',
    frontend: { totals, files },
    catalog: scanCatalog(),
    server: { totals: serverTotals, files: server },
  };
}

function main() {
  const inv = build();
  if (process.argv.includes('--check')) {
    const base = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    const failures = [];
    const files = new Set([...Object.keys(inv.frontend.files), ...Object.keys(base.frontend.files)]);
    for (const f of files) {
      for (const metric of ['inlineBranches', 'hardcodedEnglish', 'rawEnumRendering', 'hardcodedFormat', 'prompts']) {
        const now = (inv.frontend.files[f] || {})[metric] || 0;
        const was = (base.frontend.files[f] || {})[metric] || 0;
        if (now > was) failures.push(`${f}: ${metric} ${was} -> ${now}`);
      }
    }
    if (failures.length) {
      console.error('i18n regression (counts may only go down; use translation keys and the shared helpers):');
      failures.forEach((m) => console.error('  ' + m));
      process.exit(1);
    }
    console.log('i18n:check ok');
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(inv, null, 2)}\n`);
  console.log('frontend totals', inv.frontend.totals);
  console.log('server totals', inv.server.totals);
  console.log('empty namespaces (en)', inv.catalog.emptyNamespaces.en.length, '(ar)', inv.catalog.emptyNamespaces.ar.length);
  console.log('keys used in code but missing from en', inv.catalog.usedKeysMissingFromEn.length);
  console.log('written', outFile);
}

if (require.main === module) main();
module.exports = { build };
