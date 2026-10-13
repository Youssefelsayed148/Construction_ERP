'use strict';

const { assertSafeTarget, CANONICAL_ROLES } = require('../seed-staging');

describe('staging seeder guardrails', () => {
  test('requires exact staging mode and a staging/test database name', () => {
    expect(() => assertSafeTarget({ APP_ENV: 'development', DB_NAME: 'construction_erp_staging', DB_HOST: 'db' }))
      .toThrow('APP_ENV must be exactly staging');
    expect(() => assertSafeTarget({ APP_ENV: 'staging', DB_NAME: 'construction_erp', DB_HOST: 'db' }))
      .toThrow('DB_NAME must contain');
  });

  test('refuses non-local database hosts', () => {
    expect(() => assertSafeTarget({ APP_ENV: 'staging', DB_NAME: 'construction_erp_staging', DB_HOST: 'prod-db.internal' }))
      .toThrow('DB_HOST must be local');
    expect(() => assertSafeTarget({ APP_ENV: 'staging', DB_NAME: 'construction_erp_staging', DB_HOST: 'db' })).not.toThrow();
  });

  test('canonical pilot set contains the 24 internal and 9 external roles exactly once', () => {
    expect(CANONICAL_ROLES).toHaveLength(33);
    expect(new Set(CANONICAL_ROLES).size).toBe(33);
    expect(CANONICAL_ROLES).toContain('procurement_officer');
    expect(CANONICAL_ROLES).toContain('procurement_manager');
    expect(CANONICAL_ROLES).toContain('supplier_sales');
    expect(CANONICAL_ROLES).toContain('client_executive');
  });
});
