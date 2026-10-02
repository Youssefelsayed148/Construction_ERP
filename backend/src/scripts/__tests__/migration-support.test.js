const fs = require('fs');
const os = require('os');
const path = require('path');
const { checksumOf } = require('../migration-support');

test('checksum is identical for LF and CRLF checkouts of the same file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-'));
  const lf = path.join(dir, 'lf.sql');
  const crlf = path.join(dir, 'crlf.sql');
  fs.writeFileSync(lf, 'SELECT 1;\nSELECT 2;\n');
  fs.writeFileSync(crlf, 'SELECT 1;\r\nSELECT 2;\r\n');
  expect(checksumOf(lf)).toBe(checksumOf(crlf));
  fs.rmSync(dir, { recursive: true, force: true });
});
