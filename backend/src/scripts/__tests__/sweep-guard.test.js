'use strict';

const { assertClone } = require('../sweep-common');

describe('pre-UAT sweep clone guard', () => {
  const safe = { baseUrl: 'http://127.0.0.1:8091', dbName: 'construction_erp_sweep' };
  test('accepts only the authorized local clone', () => expect(() => assertClone(safe)).not.toThrow());
  test.each([
    { ...safe, baseUrl: 'http://127.0.0.1:8090' },
    { ...safe, dbName: 'construction_erp_staging' },
    { ...safe, baseUrl: 'http://example.com:8091' },
    { ...safe, baseUrl: 'https://127.0.0.1:8091' },
    { ...safe, baseUrl: 'http://127.0.0.1:8091@evil.example' },
  ])('refuses unsafe target %# before any request', target => expect(() => assertClone(target)).toThrow(/Refusing sweep/));
});
