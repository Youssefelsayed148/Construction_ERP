// Translation parity checker (Phase 10 L2). Used by `npm run i18n:parity` and by the jest suite.
// Fails when: a namespace file is missing or empty, EN and AR key sets differ, a value is empty,
// placeholders ({name}) differ between EN and AR, a plural object lacks `other`, or code uses
// a literal t('ns.key') that does not exist in the English catalog.
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const defaultLocalesDir = path.join(srcDir, 'locales');
const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'];

function namespacesFromCatalog() {
  const text = fs.readFileSync(path.join(srcDir, 'i18n', 'catalog.js'), 'utf8');
  const block = text.slice(text.indexOf('export const NAMESPACES = ['));
  const list = block.slice(block.indexOf('[') + 1, block.indexOf('];'));
  return [...list.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
}

const isPluralObject = (v) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length > 0 && Object.keys(v).every((k) => PLURAL_FORMS.includes(k));
const placeholders = (s) => [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',');

// Plural objects are leaves.
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isPluralObject(v)) out[key] = v;
    else if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function load(localesDir, locale, ns, problems) {
  const file = path.join(localesDir, locale, `${ns}.json`);
  if (!fs.existsSync(file)) { problems.push(`${locale}/${ns}.json is missing`); return null; }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { problems.push(`${locale}/${ns}.json is not valid JSON: ${e.message}`); return null; }
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'locales') walk(full, out); } else if (/\.jsx?$/.test(e.name) && !/\.test\.jsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

function check(options = {}) {
  const localesDir = options.localesDir || defaultLocalesDir;
  const problems = [];
  const namespaces = options.namespaces || namespacesFromCatalog();
  const englishKeys = new Set();

  for (const loc of ['en', 'ar']) {
    const dir = path.join(localesDir, loc);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')) : [];
    for (const f of files) if (!namespaces.includes(f)) problems.push(`${loc}/${f}.json is not a registered namespace (add it to NAMESPACES)`);
  }

  for (const ns of namespaces) {
    const parsed = {};
    for (const loc of ['en', 'ar']) {
      const data = load(localesDir, loc, ns, problems);
      if (!data) continue;
      const flat = flatten(data);
      if (Object.keys(flat).length === 0) problems.push(`${loc}/${ns}.json is empty`);
      for (const [k, v] of Object.entries(flat)) {
        if (isPluralObject(v)) { if (!('other' in v)) problems.push(`${loc}/${ns}: plural ${k} has no "other" form`); } else if (typeof v !== 'string' || v.trim() === '') problems.push(`${loc}/${ns}: ${k} is empty or not a string`);
      }
      parsed[loc] = flat;
    }
    if (!parsed.en || !parsed.ar) continue;
    for (const k of Object.keys(parsed.en)) {
      englishKeys.add(`${ns}.${k}`);
      if (!(k in parsed.ar)) { problems.push(`${ns}.${k} is in en but not in ar`); continue; }
      const text = (v) => (isPluralObject(v) ? Object.values(v).join(' ') : v);
      if (placeholders(text(parsed.en[k])) !== placeholders(text(parsed.ar[k]))) {
        problems.push(`${ns}.${k}: placeholders differ between en and ar`);
      }
    }
    for (const k of Object.keys(parsed.ar)) if (!(k in parsed.en)) problems.push(`${ns}.${k} is in ar but not in en`);
  }

  // Literal keys used in code must resolve in the English catalog (a prefix is fine: it is a subtree).
  if (options.skipCodeScan) return { problems, namespaces: namespaces.length, keys: englishKeys.size };
  const prefixes = new Set([...englishKeys].flatMap((k) => k.split('.').map((_, i, arr) => arr.slice(0, i + 1).join('.'))));
  for (const f of walk(srcDir)) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\bt\(\s*['"]([A-Za-z]\w*\.[\w.]+)['"]/g)) {
      if (!prefixes.has(m[1])) problems.push(`${path.relative(srcDir, f).split(path.sep).join('/')}: t('${m[1]}') has no key in the English catalog`);
    }
  }
  return { problems, namespaces: namespaces.length, keys: englishKeys.size };
}

if (require.main === module) {
  const { problems, namespaces, keys } = check();
  if (problems.length) {
    console.error(`i18n parity: ${problems.length} problem(s)`);
    problems.forEach((p) => console.error('  ' + p));
    process.exit(1);
  }
  console.log(`i18n parity ok: ${namespaces} namespaces, ${keys} English keys`);
}
module.exports = { check };
