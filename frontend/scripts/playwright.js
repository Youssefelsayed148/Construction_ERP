'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(__dirname, '..', '.playwright-browsers');
const cli = path.join(path.dirname(require.resolve('playwright')), 'cli.js');
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(`Unable to launch the project-local Playwright CLI: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status == null ? 1 : result.status);
