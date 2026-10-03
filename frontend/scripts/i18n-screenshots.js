// Runs the baseline screenshot spec (it skips itself unless I18N_SCREENSHOTS=1; this sets it portably).
const { spawnSync } = require('child_process');

const result = spawnSync('npx', ['playwright', 'test', '--project=i18n-screenshots', ...process.argv.slice(2)], {
  stdio: 'inherit', shell: true, env: { ...process.env, I18N_SCREENSHOTS: '1' },
});
process.exit(result.status === null ? 1 : result.status);
