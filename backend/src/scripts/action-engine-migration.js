// Phase 7 migration core — universal action items, reminders, escalation and
// notifications, built on the existing event_log / fireEvent bus.
//
// Tables (all additive; nothing existing is dropped):
//   action_items              — polymorphic to-do (source_type/source_id),
//                               role- or user-assigned, with reminder and
//                               escalation policies and a bucket-friendly
//                               status/due-date surface
//   notifications             — per-user in-app notification rows (polled by
//                               the frontend); every channel send is logged
//                               here for audit
//   notification_preferences  — per user × event_type × channel enable flag
//   reminder_rules            — repeat reminder cadence per source scope
//
// Additive columns:
//   event_log.dispatched_at          — dispatcher watermark (catch-up poll)
//   escalation_rules.ack_remind_hours / overdue_escalate_hours —
//       per-row configurable escalation ladder thresholds
//
// Everything idempotent: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
// ON CONFLICT DO NOTHING.

'use strict';

const TABLE_DDL = [
  `CREATE TABLE IF NOT EXISTS action_items (
    id SERIAL PRIMARY KEY,
    source_type VARCHAR(100) NOT NULL,
    source_id INTEGER,
    project_id INTEGER REFERENCES projects(id),
    location_id INTEGER,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    assigned_user_id INTEGER REFERENCES users(id),
    assigned_role VARCHAR(100),
    assigned_organization_id INTEGER,
    priority VARCHAR(20) DEFAULT 'medium',
    due_date TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'open',
    reminder_policy JSONB DEFAULT '{}',
    escalation_policy JSONB DEFAULT '{}',
    escalation_level INTEGER DEFAULT 0,
    last_escalated_at TIMESTAMPTZ,
    last_reminded_at TIMESTAMPTZ,
    reminders_sent INTEGER DEFAULT 0,
    acknowledged_at TIMESTAMPTZ,
    delegated_to_user_id INTEGER REFERENCES users(id),
    delegated_at TIMESTAMPTZ,
    delegated_by_user_id INTEGER REFERENCES users(id),
    completed_at TIMESTAMPTZ,
    completed_by INTEGER REFERENCES users(id),
    created_by INTEGER REFERENCES users(id),
    workflow_instance_id INTEGER,
    workflow_step_instance_id INTEGER,
    event_log_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_action_items_assignee ON action_items(assigned_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_action_items_role ON action_items(assigned_role)`,
  `CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status)`,
  `CREATE INDEX IF NOT EXISTS idx_action_items_source ON action_items(source_type, source_id)`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    channel VARCHAR(30) DEFAULT 'in_app',
    event_type VARCHAR(255),
    entity_type VARCHAR(100),
    entity_id INTEGER,
    action_item_id INTEGER,
    title VARCHAR(500) NOT NULL,
    body TEXT,
    status VARCHAR(30) DEFAULT 'unread',
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, status)`,
  `CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    event_type VARCHAR(255) NOT NULL,
    channel VARCHAR(30) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, event_type, channel)
  )`,
  `CREATE TABLE IF NOT EXISTS reminder_rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applies_to VARCHAR(100) DEFAULT '*',
    remind_after_hours INTEGER DEFAULT 24,
    repeat_interval_hours INTEGER DEFAULT 24,
    max_reminders INTEGER DEFAULT 3,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
];

const ALTER_DDL = [
  `ALTER TABLE event_log ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS idx_event_log_dispatched ON event_log(dispatched_at)`,
  // Per-row configurable escalation ladder thresholds (defaults implement the
  // example ladder: remind the manager after 4h unacknowledged, escalate
  // further after 24h, due-date-missed goes to the top of the chain).
  `ALTER TABLE escalation_rules ADD COLUMN IF NOT EXISTS ack_remind_hours INTEGER`,
  `ALTER TABLE escalation_rules ADD COLUMN IF NOT EXISTS overdue_escalate_hours INTEGER`,
];

const DEFAULT_REMINDER_RULES = [
  { name: 'General action reminder', applies_to: '*', remind_after_hours: 24, repeat_interval_hours: 24, max_reminders: 3 },
  { name: 'Workflow step reminder', applies_to: 'workflow_step', remind_after_hours: 4, repeat_interval_hours: 8, max_reminders: 5 },
];

const DEFAULT_ESCALATION_POLICY = {
  ack_remind_hours: 4,
  overdue_escalate_hours: 24,
  manager_roles: ['admin'],
  top_roles: ['owner', 'admin'],
};

async function ensureTables(query) {
  for (const ddl of TABLE_DDL) {
    await query(ddl);
  }
  for (const ddl of ALTER_DDL) {
    await query(ddl);
  }
}

async function seedDefaults(query) {
  for (const rule of DEFAULT_REMINDER_RULES) {
    await query(
      `INSERT INTO reminder_rules (name, applies_to, remind_after_hours, repeat_interval_hours, max_reminders, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [rule.name, rule.applies_to, rule.remind_after_hours, rule.repeat_interval_hours, rule.max_reminders, true]
    );
  }
  // Backfill the ladder thresholds on any escalation_rules row that predates
  // them (workflow steps keep their own per-row values from here on).
  await query(`UPDATE escalation_rules SET ack_remind_hours = 4 WHERE ack_remind_hours IS NULL`);
  await query(`UPDATE escalation_rules SET overdue_escalate_hours = 24 WHERE overdue_escalate_hours IS NULL`);
}

// Idempotence: the seed INSERTs above are guarded so re-runs do not duplicate.
// reminder_rules has no natural unique key, so seedDefaults is only called
// when the table is still empty.
async function run(query) {
  await ensureTables(query);
  const cnt = await query('SELECT COUNT(*) FROM reminder_rules');
  if (!cnt.rows[0] || Number(cnt.rows[0].count) === 0) {
    await seedDefaults(query);
  }
}

module.exports = {
  TABLE_DDL,
  ALTER_DDL,
  DEFAULT_REMINDER_RULES,
  DEFAULT_ESCALATION_POLICY,
  ensureTables,
  seedDefaults,
  run,
};
