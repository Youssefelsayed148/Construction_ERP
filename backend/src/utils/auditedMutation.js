'use strict';

const { auditedTransaction } = require('./auditedTransaction');
const { recordAuditEvent } = require('../services/policy');

// R2.3: one transaction for the business change, the activity_log row and the
// audit_events before/after snapshot. work(q) returns
//   { data, entityId, projectId, description, before, after, oldStatus, newStatus, amount }
// (before only for deletes, after only for creates). A thrown audit insert rolls
// the business change back; return { data, skipAudit: true } only for true no-ops.
// result.action overrides meta.action when the verb depends on the outcome.
async function auditedMutation(req, meta, work, opts = {}) {
  const run = opts.auditedTransaction || auditedTransaction;
  const snapshot = opts.recordAuditEvent || recordAuditEvent;
  const out = await run(async (q) => {
    const result = await work(q);
    if (!result || result.skipAudit) return result;
    await snapshot({
      entity: meta.entityType, entityId: result.entityId, action: result.action || meta.action,
      before: result.before, after: result.after, userId: req.user.id, projectId: result.projectId,
    }, { query: q });
    return result;
  }, (result) => result && !result.skipAudit && ({
    userId: req.user.id, userName: req.user.name, userRole: req.user.role,
    action: result.action || meta.action, module: meta.module, description: result.description,
    entityId: result.entityId, entityType: meta.entityType,
    amount: result.amount, oldStatus: result.oldStatus, newStatus: result.newStatus,
  }), opts);
  return out;
}

// Snapshot one row by primary key; table names come from route source, never input.
async function rowSnapshot(q, table, id) {
  if (!/^[a-z_]+$/.test(table)) throw new Error('invalid snapshot table');
  if (id == null) return null;
  return (await q(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows[0] || null;
}

// Wrap a service call that changes one row: snapshots the row before and after
// the call (id from opts.id, else from the call's result), audits in the same
// transaction and returns the call's result. describe(row, data) builds the text.
async function auditedChange(req, meta, { table, id, run, describe, amountOf, idOf = (d) => d?.id, actionOf }, opts = {}) {
  const out = await auditedMutation(req, meta, async (q) => {
    const before = await rowSnapshot(q, table, id);
    const data = await run(q);
    const entityId = id ?? idOf(data) ?? null;
    const after = await rowSnapshot(q, table, entityId);
    const row = after || before;
    return {
      data, entityId, projectId: row?.project_id, action: actionOf ? actionOf(data) : undefined,
      before: meta.action === 'create' ? undefined : before,
      after: meta.action === 'delete' ? undefined : after,
      oldStatus: before?.status, newStatus: after?.status,
      amount: amountOf ? amountOf(row) : undefined,
      description: describe(row, data),
    };
  }, opts);
  return out.data;
}

module.exports = { auditedMutation, auditedChange, rowSnapshot };
