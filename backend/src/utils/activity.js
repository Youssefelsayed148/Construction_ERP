const { query } = require('../config/database');

const logActivity = async ({ userId, userName, userRole, action, module, description, entityId, entityType, amount, oldStatus, newStatus }) => {
  try {
    await query(
      `INSERT INTO activity_log (user_id, user_name, user_role, action, module, description, entity_id, entity_type, amount, old_status, new_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [userId, userName, userRole, action, module, description, entityId, entityType, amount, oldStatus, newStatus]
    );
  } catch (error) {
    console.error('[ACTIVITY_LOG] Failed to log:', error.message);
  }
};

// fireEvent — durable domain event, written in the caller's transaction (Phase 3.3).
// The row goes to event_log (audit trail of what happened) and event_outbox (delivery queue). Both
// inserts run on the caller's query function, so an event enqueued inside a transaction never escapes a
// rollback. The in-process bus is no longer fired here: routed consumers (notifications, action items,
// material recompute, cost postings) are delivered by services/outboxDispatcher.js after the claim, and
// unrouted types (webhooks, the rest) are emitted on the bus by the dispatcher too — post-commit, never
// inside the state-changing transaction. This function THROWS on a failed enqueue (an event lost to a
// swallowed error is a lost side effect); it no longer returns a partial row as a silent failure.
const fireEvent = async ({ eventType, entityType, entityId, userId, userName, userRole, payload, eventId = null }, opts = {}) => {
  const q = opts.query || query;
  const result = await q(
    `INSERT INTO event_log (event_type, entity_type, entity_id, user_id, user_name, user_role, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [eventType, entityType, entityId, userId, userName, userRole, JSON.stringify(payload || {})]
  );
  const logId = result.rows[0] ? result.rows[0].id : null;

  await q(
    `INSERT INTO event_outbox (event_id, event_type, entity_type, entity_id, user_id, user_name, user_role, payload, source_event_log_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
    [eventId || `log-${logId}`, eventType, entityType, entityId, userId, userName, userRole,
     JSON.stringify(payload || {}), logId]
  );

  console.log(`[EVENT] ${eventType} fired for ${entityType} #${entityId}`);
  return result.rows[0];
};

const getRecentActivities = async (limit = 20) => {
  try {
    const result = await query('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT $1', [limit]);
    return result.rows;
  } catch (error) { return []; }
};

const getUserActivities = async (userId, limit = 20) => {
  try {
    const result = await query('SELECT * FROM activity_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit]);
    return result.rows;
  } catch (error) { return []; }
};

const getModuleActivities = async (module, limit = 20) => {
  try {
    const result = await query('SELECT * FROM activity_log WHERE module = $1 ORDER BY created_at DESC LIMIT $2', [module, limit]);
    return result.rows;
  } catch (error) { return []; }
};

module.exports = { logActivity, fireEvent, getRecentActivities, getUserActivities, getModuleActivities };
