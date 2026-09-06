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

const fireEvent = async ({ eventType, entityType, entityId, userId, userName, userRole, payload }) => {
  try {
    const result = await query(
      `INSERT INTO event_log (event_type, entity_type, entity_id, user_id, user_name, user_role, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [eventType, entityType, entityId, userId, userName, userRole, JSON.stringify(payload || {})]
    );

    console.log(`[EVENT] ${eventType} fired for ${entityType} #${entityId}`);

    if (global.eventBus && typeof global.eventBus.emit === 'function') {
      global.eventBus.emit(eventType, { entityType, entityId, userId, userName, userRole, payload });
    }

    return result.rows[0];
  } catch (error) {
    console.error('[EVENT_LOG] Failed to fire event:', error.message);
    return null;
  }
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
