// Phase 3 (open item): stale approval workflows — the report and the non-destructive cancel.
//
// Dry-run (default): lists every pending approval older than --older-than days (default 30) with its
// linked workflow instance. Touches NOTHING.
//
//   node scripts/cancel-stale-approvals.js                      (report)
//   node scripts/cancel-stale-approvals.js --older-than 60      (report with another threshold)
//
// Cancel: performs the SAME cancel the PUT /api/approvals/:id/cancel route performs (status 'cancelled'
// with cancelled_by/cancelled_at/cancel_reason, audit-logged, linked workflow cancelled) for every
// pending approval past the threshold. Requires --reason.
//
//   node scripts/cancel-stale-approvals.js --cancel --reason "superseded by the procurement flow" [--older-than 30]
//
// cleanup-orphan-approvals.js --apply remains the destructive last resort; this script never deletes.
const database = require('../config/database');

async function report(q, olderThanDays) {
  const rows = (await q(
    `SELECT ar.id, ar.module_name, ar.request_type, ar.request_id, ar.status, ar.created_at,
            requester.name AS requester_name, requester.role AS requester_role,
            wi.id AS workflow_instance_id, wi.status AS workflow_status
       FROM approval_requests ar
       LEFT JOIN users requester ON ar.requester_id = requester.id
       LEFT JOIN workflow_instances wi ON wi.legacy_approval_id = ar.id
      WHERE ar.status = 'pending'
        AND ar.created_at < now() - ($1 || ' days')::interval
      ORDER BY ar.created_at ASC`,
    [String(olderThanDays)]
  )).rows;
  return rows;
}

async function cancelOne(q, { id, actor, reason }) {
  return database.transaction(async (client) => {
    const c = client.query.bind(client);
    const existing = (await c('SELECT * FROM approval_requests WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!existing || existing.status !== 'pending') return null;
    const cancelled = (await c(
      `UPDATE approval_requests
          SET status = 'cancelled', cancelled_by = $2, cancelled_at = now(), cancel_reason = $3, updated_at = now()
        WHERE id = $1 AND status = 'pending' RETURNING *`,
      [id, actor.id, reason]
    )).rows[0];
    const instances = (await c('SELECT id FROM workflow_instances WHERE legacy_approval_id = $1 AND status = $2', [id, 'active'])).rows;
    const workflowEngine = require('../services/workflowEngine');
    let workflowCancelled = 0;
    for (const inst of instances) {
      if (await workflowEngine.cancelWorkflowInstance(c, inst.id, { userId: actor.id, reason })) workflowCancelled += 1;
    }
    await require('../utils/activity').logActivity({
      userId: actor.id, userName: actor.name, userRole: actor.role,
      action: 'cancel', module: 'approvals',
      description: `Cancelled approval #${id} (${existing.module_name}): ${reason}${workflowCancelled ? ` — ${workflowCancelled} workflow instance(s) cancelled` : ''}`,
      entityId: id, entityType: 'approval_request',
    });
    return { cancelled, workflowCancelled };
  });
}

async function main() {
  const argv = process.argv.slice(2);
  let olderThanDays = 30;
  const olderThanIdx = argv.indexOf('--older-than');
  if (olderThanIdx >= 0) {
    const parsed = parseInt(argv[olderThanIdx + 1], 10);
    if (Number.isFinite(parsed) && parsed > 0) olderThanDays = parsed;
  }
  const cancelMode = argv.includes('--cancel');
  const reasonIdx = argv.indexOf('--reason');
  const reason = reasonIdx >= 0 ? argv[reasonIdx + 1] : null;
  const actor = { id: null, name: 'cancel-stale-approvals script', role: 'owner' };

  const q = database.query;
  const rows = await report(q, olderThanDays);
  const byModule = {};
  for (const r of rows) byModule[r.module_name] = (byModule[r.module_name] || 0) + 1;
  console.log(`stale pending approvals older than ${olderThanDays} day(s): ${rows.length}`);
  for (const [mod, n] of Object.entries(byModule)) console.log(`  ${mod}: ${n}`);
  for (const r of rows) {
    console.log(`  #${r.id} ${r.module_name} request ${r.request_id} from ${r.requester_name || '?'} (created ${r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '?'}), workflow ${r.workflow_instance_id || 'none'} ${r.workflow_status || ''}`);
  }

  if (!cancelMode) {
    console.log('dry run — nothing changed. Add --cancel --reason "..." to cancel these.');
  } else {
    if (!reason || reason.trim().length < 3) {
      console.error('--cancel requires --reason "..." (min 3 characters)');
      process.exit(1);
    }
    const actorId = process.env.CANCEL_ACTOR_ID ? parseInt(process.env.CANCEL_ACTOR_ID, 10) : null;
    if (actorId) actor.id = actorId;
    let done = 0;
    for (const r of rows) {
      const outcome = await cancelOne(q, { id: r.id, actor, reason });
      if (outcome) { done += 1; console.log(`cancelled #${r.id} (${r.module_name}); workflows cancelled: ${outcome.workflowCancelled}`); }
      else console.log(`skipped #${r.id} — no longer pending`);
    }
    console.log(`cancelled ${done} of ${rows.length} approval request(s).`);
  }
  await database.pool.end();
}

main().catch((e) => { console.error('cancel-stale-approvals failed:', e.message); process.exit(1); });
