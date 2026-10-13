'use strict';

const { baseUrlFromArgs } = require('../smoke-staging');

describe('staging smoke target guard', () => {
  test('accepts only local HTTP base URLs', () => {
    expect(baseUrlFromArgs(['--base-url=http://127.0.0.1:8090'])).toBe('http://127.0.0.1:8090');
    expect(baseUrlFromArgs(['--base-url=http://localhost:8090/path'])).toBe('http://localhost:8090');
  });

  test('refuses HTTPS/external/prod-looking targets', () => {
    expect(() => baseUrlFromArgs(['--base-url=https://localhost'])).toThrow('localhost HTTP');
    expect(() => baseUrlFromArgs(['--base-url=https://erp.example.com'])).toThrow('localhost HTTP');
    expect(() => baseUrlFromArgs(['--base-url=http://10.0.0.5:8090'])).toThrow('localhost HTTP');
  });
});
