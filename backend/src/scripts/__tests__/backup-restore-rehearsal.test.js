'use strict';

const { assertSafeRehearsalTarget, summarizeDifferences } = require('../backup-restore-rehearsal');

describe('backup rehearsal target guard', () => {
  const safe = { APP_ENV: 'staging', DB_NAME: 'construction_erp_staging', DB_HOST: '127.0.0.1', DB_USER: 'construction_erp_user' };

  test('accepts only a staging-named database on loopback', () => {
    expect(() => assertSafeRehearsalTarget(safe)).not.toThrow();
    expect(() => assertSafeRehearsalTarget({ ...safe, APP_ENV: 'production' })).toThrow('APP_ENV');
    expect(() => assertSafeRehearsalTarget({ ...safe, DB_NAME: 'construction_erp_prod' })).toThrow('DB_NAME');
    expect(() => assertSafeRehearsalTarget({ ...safe, DB_HOST: 'db.example.com' })).toThrow('loopback');
  });

  test('compares exact row counts and sequence maxima across the restore', () => {
    const before = { counts: { users: 4 }, sequence_maxima: { users_id_seq: { last_value: 6, is_called: true } } };
    expect(summarizeDifferences(before, structuredClone(before))).toEqual({
      countDifferences: [], newTables: [], sequenceDifferences: [], newSequences: [],
    });
    const changed = { counts: { users: 5, projects: 1 }, sequence_maxima: { users_id_seq: { last_value: 8, is_called: true } } };
    expect(summarizeDifferences(before, changed)).toEqual({
      countDifferences: ['users'], newTables: ['projects'], sequenceDifferences: ['users_id_seq'], newSequences: [],
    });
  });
});
