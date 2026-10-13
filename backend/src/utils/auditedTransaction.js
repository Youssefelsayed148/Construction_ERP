'use strict';

const { transaction } = require('../config/database');
const { logActivity } = require('./activity');

// Keep the state change and its activity row on the same PostgreSQL client so
// either both commit or both roll back. eventForResult may return null when a
// state change does not need a user-facing activity entry.
async function auditedTransaction(work, eventForResult, opts = {}) {
  const runTransaction = opts.transaction || transaction;
  const writeActivity = opts.logActivity || logActivity;
  return runTransaction(async (client) => {
    const q = typeof client === 'function' ? client : client.query.bind(client);
    const result = await work(q);
    const event = eventForResult(result);
    if (event) await writeActivity(event, { query: q });
    return result;
  });
}

module.exports = { auditedTransaction };
