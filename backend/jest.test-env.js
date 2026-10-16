'use strict';

// Explicit local/test-only compatibility path for existing fixtures that do
// not set WEBHOOK_ENCRYPTION_KEY. Staging and production startup reject it.
if (process.env.NODE_ENV === 'test') {
  process.env.WEBHOOK_ENCRYPTION_KEY_ALLOW_JWT_FALLBACK = 'true';
}
