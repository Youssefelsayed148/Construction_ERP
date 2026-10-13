'use strict';

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

async function getAttempt(q, email) {
  return (await q('SELECT failure_count, locked_until FROM auth_login_attempts WHERE email_key = $1', [email])).rows[0] || null;
}

async function recordFailure(q, email) {
  await q(
    `INSERT INTO auth_login_attempts (email_key, failure_count, locked_until, updated_at)
     VALUES ($1, 1, NULL, NOW())
     ON CONFLICT (email_key) DO UPDATE SET
       failure_count = CASE
         WHEN auth_login_attempts.locked_until IS NOT NULL AND auth_login_attempts.locked_until <= NOW() THEN 1
         ELSE auth_login_attempts.failure_count + 1 END,
       locked_until = CASE
         WHEN auth_login_attempts.locked_until IS NOT NULL AND auth_login_attempts.locked_until > NOW() THEN auth_login_attempts.locked_until
         WHEN (CASE WHEN auth_login_attempts.locked_until IS NOT NULL AND auth_login_attempts.locked_until <= NOW()
                    THEN 1 ELSE auth_login_attempts.failure_count + 1 END) >= $2
           THEN NOW() + ($3 * INTERVAL '1 minute')
         ELSE NULL END,
       updated_at = NOW()`, [email, MAX_FAILURES, LOCK_MINUTES]
  );
}

async function clearAttempt(q, email) {
  await q('DELETE FROM auth_login_attempts WHERE email_key = $1', [email]);
}

function isLocked(attempt, now = Date.now()) {
  return Boolean(attempt && attempt.locked_until && new Date(attempt.locked_until).getTime() > now);
}

module.exports = { MAX_FAILURES, LOCK_MINUTES, getAttempt, recordFailure, clearAttempt, isLocked };
