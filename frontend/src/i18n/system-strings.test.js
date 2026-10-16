const fs = require('fs');
const path = require('path');
const { scan, pageViolations, visibleLiteralViolations } = require('../../scripts/system-strings');

test('Arabic catalog text is not corrupted into question marks', () => {
  const dir = path.join(__dirname, '../locales/ar');
  const corrupt = fs.readdirSync(dir).filter(file => /\?{2}/.test(fs.readFileSync(path.join(dir, file), 'utf8')));
  expect(corrupt).toEqual([]);
});

test('rendered Latin literals use catalogs, except documented identifiers and examples', () => {
  expect(visibleLiteralViolations()).toEqual([]);
});

test('pages have no user-visible inline language branches (allow-list: docs/I18N_SYSTEM_STRINGS.md)', () => {
  expect(pageViolations()).toEqual([]);
});
test('new literal branches fail, while stored data and formatting choices stay allowed', () => {
  for (const condition of ['ar', 'isRTL', "locale === 'ar'"]) {
    expect(scan(`const label = ${condition} ? 'حفظ' : 'Save';`, 'Demo.js')).toHaveLength(1);
    expect(scan(`const label = ${condition} ? 'حفظ' : t('common.save');`, 'Demo.js')).toHaveLength(1);
  }
  expect(scan("const name = ar ? row.name_ar : row.name_en; const lang = ar ? 'ar-EG' : 'en-US';", 'Demo.js')).toEqual([]);
});
test('all widget titles and fields have both EN and AR, including nested and handover fields', () => {
  const { widgetContract, missingWidgetKeys } = require('../../scripts/widget-contract');
  const contract = widgetContract();
  expect(contract.widgets.length).toBeGreaterThan(40);
  const catalogs = Object.fromEntries(['en', 'ar'].map(locale => [locale, JSON.parse(fs.readFileSync(path.join(__dirname, `../locales/${locale}/dashboard.json`), 'utf8'))]));
  expect(missingWidgetKeys(contract, catalogs)).toEqual([]);
  const added = widgetContract("w('new_widget', 'New widget', { new_field: 0 });");
  for (const locale of ['en', 'ar']) {
    expect(missingWidgetKeys(added, catalogs)).toContain(`${locale}: dashboard.widgets.new_widget.title`);
    expect(missingWidgetKeys(added, catalogs)).toContain(`${locale}: dashboard.widgets.fields.new_field`);
  }
  for (const locale of ['en', 'ar']) {
    const broken = JSON.parse(JSON.stringify(catalogs));
    delete broken[locale].widgets.portfolio;
    expect(missingWidgetKeys(contract, broken)).toContain(`${locale}: dashboard.widgets.portfolio.title`);
    delete broken[locale].widgets.fields.outstanding;
    expect(missingWidgetKeys(contract, broken)).toContain(`${locale}: dashboard.widgets.fields.outstanding`);
  }
});
