// Phase 7 migration runner — universal action items, reminders, escalation
// and notifications.
//
// Run:  node backend/src/scripts/migrate-20-action-engine.js
//
// Order of operations:
//   1. ensureTables — action_items / notifications / notification_preferences
//                     / reminder_rules + additive columns on event_log and
//                     escalation_rules
//   2. seedDefaults — default reminder rules and escalation ladder thresholds
//
// Note: event_log is expected to exist (setupDb.js); the dispatcher only adds
// a dispatched_at watermark column to it.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const migration = require('./action-engine-migration');
const engine = require('../services/workflowEngine');
const actionService = require('../services/actionService');

// Backfill: workflow instances created before Phase 7 have no action items.
// One per active instance's pending step, deduped on
// (workflow_instance_id, workflow_step_instance_id) so re-runs add nothing.
async function backfillWorkflowActionItems(q) {
  const instances = (await q("SELECT * FROM workflow_instances WHERE status = 'active'")).rows;
  let created = 0;
  for (const instance of instances) {
    const steps = (await q('SELECT * FROM workflow_step_instances WHERE instance_id = $1 ORDER BY id', [instance.id])).rows;
    const pending = steps.find((s) => s.status === 'pending');
    if (!pending) continue;
    const existing = (await q(
      'SELECT id FROM action_items WHERE workflow_instance_id = $1 AND workflow_step_instance_id = $2',
      [instance.id, pending.id]
    )).rows;
    if (existing.length > 0) continue;
    const stepsDef = await engine.loadSteps({ query: q }, instance.template_id);
    const templateStep = stepsDef.find((s) => s.step_key === pending.step_key);
    await actionService.createForWorkflowStep(instance, pending, templateStep, { client: { query: q } });
    created++;
  }
  return created;
}

async function runMigration() {
  console.log('Running Phase 7 migration — action, reminder & notification engine...\n');

  await migration.run(query);
  console.log('[OK] action/notification tables ensured, defaults seeded');

  const backfilled = await backfillWorkflowActionItems(query);
  console.log(`[OK] backfilled ${backfilled} workflow step action item(s) for pre-engine instances`);

  console.log('\nMigration complete!');
  process.exit(0);
}

runMigration().catch((e) => { console.error(e); process.exit(1); });
