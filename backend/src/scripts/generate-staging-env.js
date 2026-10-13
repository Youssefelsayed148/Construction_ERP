'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envPath = path.resolve(__dirname, '..', '..', '..', '.env.docker');
const values = {
  APP_ENV: 'staging',
  DB_NAME: 'construction_erp_staging',
  DB_USER: 'construction_erp_user',
  DB_HOST: '127.0.0.1',
  DB_PORT: '55440',
  DB_PASSWORD: crypto.randomBytes(48).toString('base64url'),
  JWT_SECRET: crypto.randomBytes(64).toString('base64url'),
  FRONTEND_URL: 'http://localhost:8090',
  CORS_ALLOW_HTTP_LOCAL: 'true',
  TRUST_PROXY: '1',
  AUTH_RATE_LIMIT_PER_15_MIN: '100',
};
const contents = `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;

try {
  const fd = fs.openSync(envPath, 'wx', 0o600);
  try { fs.writeFileSync(fd, contents, 'utf8'); } finally { fs.closeSync(fd); }
  console.log(`Generated local staging configuration at ${envPath}. Keep it private; it is git-ignored.`);
} catch (error) {
  if (error.code === 'EEXIST') {
    console.error(`Refusing to overwrite existing ${envPath}; remove it yourself only if you intend to rotate the local credentials.`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
