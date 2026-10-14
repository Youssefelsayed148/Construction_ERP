'use strict';

const { auditedTransaction } = require('./auditedTransaction');
const { recordAuditEvent } = require('../services/policy');

// R2.3: one transaction for the business change, the activity_log row and the
// audit_events before/after snapshot. work(q) returns
//   { data, entityId, projectId, description, before, after, oldStatus, newStatus, amount }
// (before only for deletes, after only for creates). A thrown audit insert rolls
// the business change back; return { data, skipAudit: true } only for true no-ops.
async function auditedMutation(req, meta, work, opts = {}) {
  const run = opts.auditedTransaction || auditedTransaction;
  const snapshot = opts.recordAuditEvent || recordAuditEvent;
  const out = await run(async (q) => {
    const result = await work(q);
    if (!result || result.skipAudit) return result;
    await snapshot({
      entity: meta.entityType, entityId: result.entityId, action: meta.action,
      before: result.before, after: result.after, userId: req.user.id, projectId: result.projectId,
    }, { query: q });
    return result;
  }, (result) => result && !result.skipAudit && ({
    userId: req.user.id, userName: req.user.name, userRole: req.user.role,
    action: meta.action, module: meta.module, description: result.description,
    entityId: result.entityId, entityType: meta.entityType,
    amount: result.amount, oldStatus: result.oldStatus, newStatus: result.newStatus,
  }), opts);
  return out;
}

module.exports = { auditedMutation };
