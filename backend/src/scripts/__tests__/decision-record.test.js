// Unit tests for the Phase 2 decision record
// (docs/audit/OUT_OF_SPEC_MODULE_DECISIONS.md).
//
// These tests do not require a running database. They parse the markdown as
// text and assert:
//   - all five in-scope modules are present (HR, Payroll, Legal, Maintenance,
//     Assets),
//   - each module makes an explicit decision on the (a) fold-into-orgs vs.
//     (b) standalone axis,
//   - the Phase 13 Labour Cost formula is mapped to HR data,
//   - the Phase 13 Equipment Cost formula is mapped to Assets data,
//   - the unstated default (clients/suppliers/subcontractors) is explicitly
//     declared out of scope.

const fs = require('fs');
const path = require('path');

const DOC_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'docs',
  'audit',
  'OUT_OF_SPEC_MODULE_DECISIONS.md'
);

describe('OUT_OF_SPEC_MODULE_DECISIONS.md', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(DOC_PATH, 'utf8');
  });

  test('file exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(1000);
  });

  test.each(['HR', 'Payroll', 'Legal', 'Maintenance', 'Assets'])(
    'has a top-level section for %s',
    (moduleName) => {
      // The document uses `## 1. HR`, `## 2. Payroll`, etc.
      const re = new RegExp(`^##\\s+\\d+\\.\\s+${moduleName}\\b`, 'm');
      expect(content).toMatch(re);
    }
  );

  test.each(['HR', 'Payroll', 'Legal', 'Maintenance', 'Assets'])(
    '%s section explicitly records a decision (fold-into-org vs standalone)',
    (moduleName) => {
      const section = extractSection(content, moduleName);
      // Each section must contain a Decision: line that names one of the
      // two shapes. The HR section, for example, must say "Standalone"
      // because the default recommendation is (b).
      expect(section).toMatch(/Decision:\s*\*\*\(b\)\s*Standalone/i);
    }
  );

  test('HR section maps to the Phase 13 Labour Cost formula', () => {
    const section = extractSection(content, 'HR');
    expect(section).toMatch(/Labour Cost\s*=\s*Regular Hours/i);
    expect(section).toMatch(/attendance\.(check_in|check_out)/i);
    expect(section).toMatch(/employees\.salary/i);
  });

  test('Maintenance and Assets sections map to the Phase 13 Equipment Cost formula', () => {
    const maintenance = extractSection(content, 'Maintenance');
    const assets = extractSection(content, 'Assets');
    const formula = /Equipment Cost\s*=\s*Usage Hours/i;
    expect(maintenance).toMatch(formula);
    expect(assets).toMatch(formula);
  });

  test('Assets section references the existing assets.hourly_rate column', () => {
    const section = extractSection(content, 'Assets');
    expect(section).toMatch(/assets\.hourly_rate/i);
    expect(section).toMatch(/equipment_usage_logs\.hours_operated/i);
  });

  test('documents that clients/suppliers/subcontractors are out of scope', () => {
    expect(content).toMatch(/clients\.js.*suppliers\.js.*subcontractors\.js/s);
    expect(content).toMatch(/Phase 3.*organizations|Phase 3.*`organizations`/i);
  });

  test('declares the schema change is additive (no destructive ops)', () => {
    expect(content).toMatch(/nullable/i);
    expect(content).toMatch(/additive only|no column dropped or renamed/i);
  });
});

function extractSection(markdown, heading) {
  // Splits the markdown on `## ` level-2 headings and returns the body of the
  // first section whose heading line starts with the given module name.
  const lines = markdown.split('\n');
  const headingIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+\d+\.\s/.test(lines[i])) headingIndices.push(i);
  }
  if (headingIndices.length === 0) return '';
  const idx = headingIndices.findIndex((i) => lines[i].startsWith(`## ${headingNum(heading)}. ${heading}`));
  if (idx === -1) {
    // Fallback: match anywhere on the heading line.
    const fallback = headingIndices.findIndex((i) => new RegExp(`^##\\s+\\d+\\.\\s+${heading}\\b`).test(lines[i]));
    if (fallback === -1) return '';
    const start = headingIndices[fallback];
    const end = fallback + 1 < headingIndices.length ? headingIndices[fallback + 1] : lines.length;
    return lines.slice(start, end).join('\n');
  }
  const start = headingIndices[idx];
  const end = idx + 1 < headingIndices.length ? headingIndices[idx + 1] : lines.length;
  return lines.slice(start, end).join('\n');
}

function headingNum(heading) {
  const map = { HR: 1, Payroll: 2, Legal: 3, Maintenance: 4, Assets: 5 };
  return map[heading] || '\\d+';
}
