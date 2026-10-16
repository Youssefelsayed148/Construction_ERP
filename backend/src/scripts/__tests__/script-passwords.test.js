const fs = require('fs');
const path = require('path');
const { countLiteralPasswords, scanScriptPasswords, containsLegacyDbPassword, findLegacyDbPasswordReferences } = require('../lint-guards');

const repo = path.resolve(__dirname, '../../../..');
const scripts = ['start_backend.bat', 'orchestrator.bat', 'launch_backend.ps1', 'docs/legacy/run_tests.ps1', 'start_backend.ps1'];

describe('R0.1 launcher credentials', () => {
  test('guard rejects literal batch, PowerShell and shell password assignments', () => {
    expect(countLiteralPasswords('set DB_PASSWORD=fixture-only\n$env:POSTGRES_PASSWORD = "fixture-only"\nexport DB_PASSWORD=fixture-only')).toBe(3);
    expect(countLiteralPasswords('set "DB_PASSWORD=fixture-only"\n$Password = \'fixture-only\'')).toBe(2);
  });

  test('guard allows process environment references, expressions, comments and empty values', () => {
    expect(countLiteralPasswords('set DB_PASSWORD=%EXTERNAL_PASSWORD%\n$env:DB_PASSWORD = $env:EXTERNAL_PASSWORD\nexport DB_PASSWORD="$EXTERNAL_PASSWORD"\n$env:DB_PASSWORD = [Guid]::NewGuid()\n# DB_PASSWORD=fixture-only\nDB_PASSWORD=""')).toBe(0);
  });

  test('no tracked shell script contains a literal password assignment', () => {
    expect(scanScriptPasswords()).toEqual({});
  });
  test('the legacy committed database password pattern is rejected and absent', () => {
    const pattern = 'NewStrongPassword' + '12345!';
    expect(containsLegacyDbPassword(`DB_PASSWORD=${pattern}`)).toBe(true);
    expect(containsLegacyDbPassword('DB_PASSWORD=$env:DB_PASSWORD')).toBe(false);
    expect(findLegacyDbPasswordReferences()).toEqual([]);
  });
  test('git-less fallback scans backend scripts and reports the same backend violations', () => {
    const tracked = scanScriptPasswords();
    const fallback = scanScriptPasswords({ forceFallback: true });
    const backendTracked = Object.fromEntries(Object.entries(tracked)
      .filter(([file]) => file.startsWith('backend/'))
      .map(([file, count]) => [file.slice('backend/'.length), count]));
    expect(fallback).toEqual(backendTracked);
  });
  // The backend Docker build context excludes repo-root launchers; they are verified in a full checkout/CI.
  const launcherTest = (file) => (fs.existsSync(path.join(repo, file)) ? test : test.skip);
  scripts.forEach((file) => launcherTest(file)(`${file} preserves the process DB_PASSWORD instead of assigning a literal`, () => {
    const source = fs.readFileSync(path.join(repo, file), 'utf8');
    // Assert a boolean so failing output never includes a credential.
    const overwritesPassword = /(?:\$env:DB_PASSWORD\s*=|\bset\s+"?DB_PASSWORD\s*=)/i.test(source);
    expect(overwritesPassword).toBe(false);
  }));
});
