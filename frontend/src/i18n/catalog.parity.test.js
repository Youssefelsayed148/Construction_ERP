// Translation parity is enforced in CI through the normal test run (scripts/i18n-parity.js).
const { check } = require('../../scripts/i18n-parity');

test('every namespace exists in en and ar, is non-empty, and has identical keys and placeholders', () => {
  const { problems, namespaces } = check();
  expect(namespaces).toBeGreaterThanOrEqual(35);
  expect(problems).toEqual([]);
});

describe('the checker catches real problems', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const build = (files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-'));
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), JSON.stringify(content));
    }
    return dir;
  };
  const run = (files) => check({ localesDir: build(files), namespaces: ['demo'], skipCodeScan: true }).problems;

  test('a missing Arabic key, an empty namespace, an empty value and a placeholder mismatch all fail', () => {
    expect(run({ 'en/demo.json': { a: 'A', b: 'B' }, 'ar/demo.json': { a: 'ا' } })).toContain('demo.b is in en but not in ar');
    expect(run({ 'en/demo.json': {}, 'ar/demo.json': {} })).toEqual(expect.arrayContaining(['en/demo.json is empty']));
    expect(run({ 'en/demo.json': { a: 'A' }, 'ar/demo.json': { a: ' ' } }).join()).toMatch(/empty or not a string/);
    expect(run({ 'en/demo.json': { a: 'Hi {name}' }, 'ar/demo.json': { a: 'مرحبا' } })).toContain('demo.a: placeholders differ between en and ar');
  });

  test('a missing namespace file fails', () => {
    expect(run({ 'en/demo.json': { a: 'A' } })).toContain('ar/demo.json is missing');
  });

  test('a clean pair passes', () => {
    expect(run({ 'en/demo.json': { a: 'Hi {name}' }, 'ar/demo.json': { a: 'مرحبا {name}' } })).toEqual([]);
  });
});
