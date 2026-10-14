'use strict';

const { assertSafeTarget } = require('../seed-golden-demo');

const safeEnv = {
  APP_ENV: 'test',
  DB_HOST: '127.0.0.1',
  DB_PORT: '5432',
  DB_NAME: 'construction_erp_test',
  DB_USER: 'test_user',
  DB_PASSWORD: 'test_password',
};

describe('golden demo seed target guard', () => {
  test('accepts a loopback test database with process credentials', () => {
    expect(() => assertSafeTarget(safeEnv)).not.toThrow();
  });

  test.each([
    ['production app environment', { APP_ENV: 'production' }],
    ['production-looking database', { DB_NAME: 'construction_erp_production' }],
    ['remote database host', { DB_HOST: 'db.example.invalid' }],
    ['missing port', { DB_PORT: undefined }],
    ['invalid port', { DB_PORT: '70000' }],
    ['missing database user', { DB_USER: '' }],
    ['missing database password', { DB_PASSWORD: '' }],
  ])('refuses %s', (_label, override) => {
    expect(() => assertSafeTarget({ ...safeEnv, ...override })).toThrow();
  });
});
