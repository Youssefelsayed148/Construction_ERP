const fs = require('fs');
const path = require('path');
const { REPORTS, REPORT_PACKS } = require('../../backend/src/utils/reporting');

function reportContract() {
  const keys = Object.entries(REPORTS).flatMap(([report, spec]) => [
    `reports.catalog.${report}.title`, ...spec.columns.map(([column]) => `reports.catalog.${report}.columns.${column}`),
  ]);
  keys.push(...Object.keys(REPORT_PACKS).map(pack => `reports.packs.${pack}`));
  const source = fs.readFileSync(path.resolve(__dirname, '../../backend/src/routes/reports.js'), 'utf8');
  keys.push(...[...source.matchAll(/key: '([^']+)', title:/g)].map(match => `reports.sections.${match[1]}`));
  keys.push(...['inApp', 'email', 'push', 'sms', 'whatsapp'].map(channel => `enums.channel.${channel}`));
  keys.push(...['critical', 'high', 'medium', 'low'].map(priority => `enums.priority.${priority}`));
  return [...new Set(keys)];
}
function missingReportKeys() {
  const failures = [];
  for (const locale of ['en', 'ar']) {
    const catalogs = Object.fromEntries(['reports', 'enums'].map(namespace => [namespace,
      JSON.parse(fs.readFileSync(path.resolve(__dirname, `../src/locales/${locale}/${namespace}.json`), 'utf8'))]));
    for (const key of reportContract()) {
      const value = key.split('.').reduce((node, part) => node?.[part], catalogs);
      if (typeof value !== 'string' || !value.trim()) failures.push(`${locale}: missing ${key}`);
    }
  }
  return failures;
}
if (require.main === module) {
  const failures = missingReportKeys();
  console.log(`Report/enum contract: ${reportContract().length} keys x 2 locales; ${failures.length} missing`);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
}
module.exports = { reportContract, missingReportKeys };
