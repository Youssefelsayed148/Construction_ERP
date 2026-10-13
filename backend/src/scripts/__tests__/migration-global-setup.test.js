const fs = require('fs');
const os = require('os');
const path = require('path');
const setup = require('../../../jest.pg.global-setup');
const { checksumOf } = require('../migration-support');

describe('PG global migration inventory precheck', () => {
  let dir;

  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-migrations-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('compares versioned filenames and checksums, not ledger counts', () => {
    fs.writeFileSync(path.join(dir, '0001_first.sql'), 'SELECT 1;\n');
    fs.writeFileSync(path.join(dir, '0002_second.sql'), 'SELECT 2;\n');
    const checksum = (name) => checksumOf(path.join(dir, name));

    expect(setup.compareVersionedMigrationInventory(dir, [
      { version: '0001_first.sql', checksum: checksum('0001_first.sql') },
      { version: '0002_wrong_name.sql', checksum: 'same-count-does-not-pass' },
    ])).toEqual({
      missing: ['0002_second.sql'], unexpected: ['0002_wrong_name.sql'], checksumMismatch: [],
    });
  });

  test('detects a modified applied migration even when every filename matches', () => {
    fs.writeFileSync(path.join(dir, '0036_final.sql'), 'SELECT 1;\n');
    const result = setup.compareVersionedMigrationInventory(dir, [
      { version: '0036_final.sql', checksum: 'stale-checksum' },
    ]);
    expect(result).toEqual({ missing: [], unexpected: [], checksumMismatch: ['0036_final.sql'] });
  });
});
