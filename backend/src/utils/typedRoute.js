// Small helpers for routes that answer with typed errors (error + error_code + error_params).
// A typed service error becomes its own status and code; anything else is logged with its tag and answered with its
// message, never swallowed.
'use strict';

const crypto = require('crypto');
const { transaction } = require('../config/database');

const atomic = (fn) => transaction((client) => fn(client.query.bind(client)));

function typedFail(res, e, tag = 'ROUTE', req = null) {
  if (e && e.error_code && e.status) {
    return res.status(e.status).json({ success: false, error: e.message, error_code: e.error_code, error_params: e.error_params || {} });
  }
  // An unmapped ledger account (JournalError carries .key) keeps the code the rest of the API uses (L7 contract).
  if (e && e.key) {
    return res.status(500).json({ success: false, error: e.message, error_code: 'ledger_account_not_mapped', error_params: { key: e.key } });
  }
  if (e && e.code === '23505') {
    return res.status(409).json({ success: false, error: 'A record with these values already exists', error_code: 'database_conflict', error_params: {} });
  }
  if (e && e.code === '23503') {
    return res.status(400).json({ success: false, error: 'A referenced record does not exist or is still in use', error_code: 'database_reference_violation', error_params: {} });
  }
  if (e && e.code === '23514') {
    return res.status(400).json({ success: false, error: 'The record violates a data rule', error_code: 'database_check_violation', error_params: {} });
  }
  const requestId = (req && (req.correlationId || req.id)) || crypto.randomUUID();
  console.error(`[${tag}] request_id=${requestId}`, e);
  if (res.setHeader) res.setHeader('X-Request-ID', requestId);
  return res.status(500).json({
    success: false,
    error: 'The request could not be completed',
    error_code: 'internal_error',
    error_params: { request_id: requestId },
  });
}

// Validate req.body with a Joi schema; on failure answer 400 and return null.
function typedBody(schema, req, res) {
  const { error, value } = schema.validate(req.body || {});
  if (error) {
    res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') } });
    return null;
  }
  return value;
}

module.exports = { atomic, typedFail, typedBody };
