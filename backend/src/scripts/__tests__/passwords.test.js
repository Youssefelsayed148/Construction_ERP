'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const passwords = require('../../services/passwords');

describe('password storage', () => {
  test('creates a tagged scrypt hash and verifies the correct password', async () => {
    const hash = await passwords.hashPassword('correct passphrase 123');
    expect(hash).toMatch(/^scrypt\$N=\d+,r=\d+,p=\d+\$/);
    expect(await passwords.verifyPassword('correct passphrase 123', hash)).toBe(true);
  });

  test('rejects a wrong password and malformed tagged hashes', async () => {
    const hash = await passwords.hashPassword('correct passphrase 123');
    expect(await passwords.verifyPassword('wrong passphrase 123', hash)).toBe(false);
    expect(await passwords.verifyPassword('anything', 'scrypt$broken')).toBe(false);
  });

  test('keeps a valid asynchronous dummy hash for unknown-account comparisons', async () => {
    expect(passwords.DUMMY_HASH).toMatch(/^scrypt\$N=32768,r=8,p=3\$/);
    expect(await passwords.verifyPassword('not the dummy password', passwords.DUMMY_HASH)).toBe(false);
  });

  test('uses constant-time comparison for valid scrypt hash encodings', async () => {
    const hash = await passwords.hashPassword('constant comparison fixture');
    const compare = jest.spyOn(crypto, 'timingSafeEqual');
    try {
      await passwords.verifyPassword('constant comparison fixture', hash);
      expect(compare).toHaveBeenCalledTimes(1);
      expect(compare.mock.calls[0][0]).toHaveLength(compare.mock.calls[0][1].length);
    } finally {
      compare.mockRestore();
    }
  });

  test('verifies bcrypt legacy hashes and marks them for transparent upgrade', async () => {
    const legacy = await bcrypt.hash('legacy passphrase 123', 4);
    expect(await passwords.verifyPassword('legacy passphrase 123', legacy)).toBe(true);
    expect(passwords.needsRehash(legacy)).toBe(true);
    expect(await passwords.verifyPassword('wrong passphrase 123', legacy)).toBe(false);
  });

  test('recognizes only the current scrypt parameters as current', async () => {
    const hash = await passwords.hashPassword('current params passphrase');
    expect(passwords.needsRehash(hash)).toBe(false);
    expect(passwords.needsRehash('$2a$12$legacy-looking-placeholder')).toBe(true);
  });
});
