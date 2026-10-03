const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm start',
    url: 'http://localhost:3000/',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: { BROWSER: 'none' },
  },
  projects: [
    { name: 'desktop-chromium', testIgnore: /i18n-baseline/, use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', testIgnore: /i18n-baseline/, use: { ...devices['Pixel 7'] } },
    // Baseline screenshots (Phase 10 L0); run on demand with `npm run i18n:screenshots`.
    { name: 'i18n-screenshots', testMatch: /i18n-baseline/, use: { ...devices['Desktop Chrome'] } },
  ],
});
