'use strict';

function timeoutValue(env, name, fallback, max = 3_600_000) {
  const raw = env[name] == null || env[name] === '' ? fallback : Number(env[name]);
  if (!Number.isInteger(raw) || raw < 100 || raw > max) {
    throw new TypeError(`${name} must be an integer from 100 to ${max}`);
  }
  return raw;
}

function pgPoolOptions(env = process.env) {
  const statement = timeoutValue(env, 'DB_STATEMENT_TIMEOUT_MS', 30_000);
  const idleTransaction = timeoutValue(env, 'DB_IDLE_TX_TIMEOUT_MS', 60_000);
  const lock = timeoutValue(env, 'DB_LOCK_TIMEOUT_MS', 5_000);
  return { options: `-c statement_timeout=${statement} -c idle_in_transaction_session_timeout=${idleTransaction} -c lock_timeout=${lock}` };
}

function httpServerTimeouts(env = process.env) {
  const headers = timeoutValue(env, 'HTTP_HEADERS_TIMEOUT_MS', 15_000);
  const request = timeoutValue(env, 'HTTP_REQUEST_TIMEOUT_MS', 120_000);
  const keepAlive = timeoutValue(env, 'HTTP_KEEP_ALIVE_TIMEOUT_MS', 5_000);
  const socket = timeoutValue(env, 'HTTP_SOCKET_TIMEOUT_MS', 120_000);
  if (headers >= request) throw new TypeError('HTTP_HEADERS_TIMEOUT_MS must be less than HTTP_REQUEST_TIMEOUT_MS');
  return { headersTimeout: headers, requestTimeout: request, keepAliveTimeout: keepAlive, timeout: socket };
}

function decorateDatabaseError(error) {
  if (!error || typeof error !== 'object') return error;
  if (error.code === '57014' || error.code === '55P03' || error.code === '25P03') {
    error.status = 504;
    error.statusCode = 504;
    error.error_code = 'database_timeout';
    error.error_key = 'errors.databaseTimeout';
    error.retryAfter = 1;
  } else if (/^(08|53|57P0[123])/.test(String(error.code || ''))
    || ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(error.code)) {
    error.status = 503;
    error.statusCode = 503;
    error.error_code = 'database_unavailable';
    error.error_key = 'errors.databaseUnavailable';
    error.retryAfter = 5;
  }
  return error;
}

function databaseErrorDiagnostic(error) {
  return {
    code: /^[A-Z0-9_]{2,40}$/.test(error?.code) ? error.code : 'unknown',
    name: ['Error', 'error', 'TypeError', 'RangeError', 'DatabaseError', 'AggregateError', 'TimeoutError'].includes(error?.name) ? error.name : 'Error',
    messageClass: /timeout.*connect|connect.*timeout/i.test(error?.message || '') ? 'connection_timeout' : 'other',
  };
}

module.exports = { timeoutValue, pgPoolOptions, httpServerTimeouts, decorateDatabaseError, databaseErrorDiagnostic };
