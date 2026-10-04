// Real-PostgreSQL suite: `npm run test:pg`. Needs a migrated, disposable database
// and TEST_PG=1 (the suites refuse to run without it so a developer database is never touched).
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.pg.test.js'],
  testTimeout: 30000,
  globalSetup: './jest.pg.global-setup.js',
};
