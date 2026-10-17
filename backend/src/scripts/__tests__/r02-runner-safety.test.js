'use strict';

const fs = require('fs');
const path = require('path');
const runner = fs.readFileSync(path.resolve(__dirname, '../../../scripts/r02-pg-gate.ps1'), 'utf8');

test('disposable PG uses a Docker-assigned loopback port and rejects excluded mappings', () => {
  expect(runner).toContain('-p "127.0.0.1::5432"');
  expect(runner).toContain('docker port $name 5432/tcp');
  expect(runner).toContain('netsh interface ipv4 show excludedportrange protocol=tcp');
  expect(runner).toContain('$port -ge [int]$matches[1] -and $port -le [int]$matches[2]');
  expect(runner).not.toMatch(/Get-Random -Minimum 55000/);
});

test('failed runs capture activity and locks before deleting only the owned container and volume', () => {
  const cleanup = runner.slice(runner.indexOf('} finally {'));
  expect(cleanup).toContain('if ($exit -ne 0)');
  expect(cleanup.indexOf('r02-pg-failure.sql')).toBeLessThan(cleanup.indexOf('docker rm'));
  expect(cleanup).toContain('docker rm -fv $name');
  const sqlPath = path.resolve(__dirname, '../../../scripts/r02-pg-failure.sql');
  expect(fs.existsSync(sqlPath)).toBe(true);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  expect(sql).toMatch(/pg_stat_activity/);
  expect(sql).toMatch(/pg_blocking_pids/);
  expect(sql).toMatch(/pg_locks/);
});
