'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const SCRYPT = Object.freeze({ N: 32768, r: 8, p: 3, keyLength: 64, maxmem: 64 * 1024 * 1024 });
const PREFIX = `scrypt$N=${SCRYPT.N},r=${SCRYPT.r},p=${SCRYPT.p}$`;
// Stable dummy value keeps unknown and disabled-account comparisons on the
// same asynchronous scrypt path without deriving a key synchronously at boot.
const DUMMY_HASH = `${PREFIX}Y29uZXJwLXI0LWR1bW15IQ$96MkTdU0XL6IuqC9qIMp65LEbpp5Ow-SM1KcoyyIy4MdaRz0XIp0M8P9td7KxR349_5H-pU2gLkJ8AAneWHtKA`;
const LEGACY_BCRYPT = /^\$2[abxy]\$\d{2}\$/;

function derive(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keyLength, SCRYPT, (error, key) => error ? reject(error) : resolve(key));
  });
}

async function hashPassword(password) {
  if (typeof password !== 'string') throw new TypeError('Password must be a string');
  const salt = crypto.randomBytes(16);
  const key = await derive(password, salt);
  return `${PREFIX}${salt.toString('base64url')}$${key.toString('base64url')}`;
}

function parseScryptHash(encoded) {
  if (typeof encoded !== 'string' || !encoded.startsWith(PREFIX)) return null;
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== `N=${SCRYPT.N},r=${SCRYPT.r},p=${SCRYPT.p}`) return null;
  try {
    const salt = Buffer.from(parts[2], 'base64url');
    const key = Buffer.from(parts[3], 'base64url');
    if (salt.length !== 16 || key.length !== SCRYPT.keyLength) return null;
    return { salt, key };
  } catch (_) {
    return null;
  }
}

async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  if (LEGACY_BCRYPT.test(encoded)) {
    try { return await bcrypt.compare(password, encoded); } catch (_) { return false; }
  }
  const parsed = parseScryptHash(encoded);
  if (!parsed) return false;
  const actual = await derive(password, parsed.salt);
  return crypto.timingSafeEqual(actual, parsed.key);
}

function needsRehash(encoded) {
  if (typeof encoded !== 'string' || LEGACY_BCRYPT.test(encoded)) return true;
  return parseScryptHash(encoded) === null;
}

module.exports = { SCRYPT, PREFIX, DUMMY_HASH, hashPassword, verifyPassword, needsRehash };
