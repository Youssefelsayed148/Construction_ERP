// Small helpers for routes that answer with typed errors (error + error_code + error_params).
// A typed service error becomes its own status and code; anything else is logged with its tag and answered with its
// message, never swallowed.
'use strict';

const { transaction } = require('../config/database');

const atomic = (fn) => transaction((client) => fn(client.query.bind(client)));

function typedFail(res, e, tag = 'ROUTE') {
  if (e && e.error_code && e.status) {
    return res.status(e.status).json({ success: false, error: e.message, error_code: e.error_code, error_params: e.error_params || {} });
  }
  // An unmapped ledger account (JournalError carries .key) keeps the code the rest of the API uses (L7 contract).
  if (e && e.key) {
    return res.status(500).json({ success: false, error: e.message, error_code: 'ledger_account_not_mapped', error_params: { key: e.key } });
  }
  console.error(`[${tag}]`, e);
  return res.status((e && e.status) || 400).json({ success: false, error: e && e.message });
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
