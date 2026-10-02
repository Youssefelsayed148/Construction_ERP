// Phase 25 tests — handover, closeout & warranty: the exact §79 lifecycle
// with the punch gate, the package checklist + readiness percent (zero
// punch items → 0% state, never an error), warranty/DLP claim states with
// SLA tracking, and the workflow sync surface.

const { MockDb } = require('../test-helpers/mock-db');
const handoverMigration = require('../handover-migration');
const workflowMigration = require('../workflow-engine-migration');
const engine = require('../../services/handoverEngine');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

const OWNER = { id: 1, name: 'Owner', role: 'owner' };
const PM = { id: 4, name: 'PM', role: 'project_manager' };
const SUPERVISOR = { id: 6, name: 'Supervisor', role: 'site_supervisor' };

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name_en VARCHAR(255), status VARCHAR(50))`);
  await q(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), role VARCHAR(100), is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS punch_items (
    id SERIAL PRIMARY KEY, punch_number VARCHAR(50), project_id INTEGER, description TEXT,
    status VARCHAR(30) DEFAULT 'open', workflow_instance_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY, user_id INTEGER, channel VARCHAR(30), event_type VARCHAR(255),
    entity_type VARCHAR(100), entity_id INTEGER, title VARCHAR(500), body TEXT, status VARCHAR(30),
    created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY, user_id INTEGER, event_type VARCHAR(255), channel VARCHAR(30), enabled BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS action_items (
    id SERIAL PRIMARY KEY, source_type VARCHAR(50), source_id INTEGER, project_id INTEGER,
    location_id INTEGER, title VARCHAR(500), description TEXT, assigned_user_id INTEGER,
    assigned_role VARCHAR(100), assigned_organization_id INTEGER, priority VARCHAR(20) DEFAULT 'medium',
    due_date TIMESTAMPTZ, status VARCHAR(30) DEFAULT 'open', reminder_policy JSONB, escalation_policy JSONB,
    created_by INTEGER, acknowledged_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, completed_by INTEGER,
    workflow_instance_id INTEGER, workflow_step_instance_id INTEGER, event_log_id INTEGER,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS reminder_rules (
    id SERIAL PRIMARY KEY, source_type VARCHAR(50), remind_after_hours INTEGER,
    repeat_interval_hours INTEGER, max_reminders INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS event_log (
    id SERIAL PRIMARY KEY, event_type VARCHAR(100), entity_type VARCHAR(100), entity_id INTEGER,
    user_id INTEGER, user_name VARCHAR(255), user_role VARCHAR(100), payload JSONB,
    dispatched_at TIMESTAMPTZ, created_at TIMESTAMPTZ)`);

  await workflowMigration.run(q);
  await handoverMigration.ensureTables(q);
  await handoverMigration.seedTemplates(q);
  await handoverMigration.seedTemplates(q); // idempotent

  await q(`INSERT INTO projects (id, name_en, status) VALUES ($1,$2,$3)`, [1, 'Tower HO', 'active']);
}

beforeAll(buildFixture);

// ---------------------------------------------------------------------------
// Migration contract
// ---------------------------------------------------------------------------

describe('phase 25 migration', () => {
  test('is idempotent — running it twice changes nothing', async () => {
    const before = (await q('SELECT COUNT(*) AS c FROM handover_processes')).rows[0].c;
    await handoverMigration.ensureTables(q);
    const after = (await q('SELECT COUNT(*) AS c FROM handover_processes')).rows[0].c;
    expect(before).toBe(after);
  });

  test('the handover lifecycle template has all 11 exact states in order', async () => {
    const t = (await q(`SELECT id FROM workflow_templates WHERE key = $1`, ['handover'])).rows[0];
    const steps = (await q(`SELECT step_key FROM workflow_steps WHERE template_id = $1 ORDER BY sort_order`, [t.id])).rows.map((r) => r.step_key);
    expect(steps).toEqual([
      'pre_handover', 'punch_snag', 'rectification', 'final_inspection',
      'testing_commissioning', 'as_builts', 'o_m', 'training', 'taking_over',
      'dlp_warranty', 'final_completion',
    ]);
  });
});

// ---------------------------------------------------------------------------
// The exact lifecycle + punch gate
// ---------------------------------------------------------------------------

describe('handover lifecycle', () => {
  test('starts at pre_handover and seeds the default package register', async () => {
    const process = await engine.startHandover(q, 1, OWNER);
    expect(process.process_number).toMatch(/^HO-\d{4}-0001$/);
    const created = await engine.ensureDefaultPackageItems(q, 1);
    expect(created).toBe(9); // startHandover does not seed; the route does
    const count = (await q('SELECT COUNT(*) AS c FROM handover_package_items WHERE project_id = 1')).rows[0].c;
    expect(parseInt(count, 10)).toBe(9);
  });

  test('cannot skip states (exact chain enforced)', async () => {
    const process = (await q('SELECT * FROM handover_processes WHERE project_id = 1')).rows[0];
    await expect(engine.transitionHandover(q, process.id, 'final_inspection', PM)).rejects.toThrow(/exact states/);
  });

  test('the punch gate blocks leaving punch_snag with open punch items', async () => {
    const process = (await q('SELECT * FROM handover_processes WHERE project_id = 1')).rows[0];
    // advance pre_handover → punch_snag (allowed)
    await engine.transitionHandover(q, process.id, 'punch_snag', PM);
    await q(`INSERT INTO punch_items (punch_number, project_id, description, status) VALUES ($1,$2,$3,'open')`, ['PCH-HO-0002', 1, 'Defect']);
    await expect(engine.transitionHandover(q, process.id, 'rectification', PM)).rejects.toThrow(/open punch item/);
    // close the punch item → gate opens
    await q(`UPDATE punch_items SET status = 'closed' WHERE punch_number = $1`, ['PCH-HO-0002']);
    const advanced = await engine.transitionHandover(q, process.id, 'rectification', PM);
    expect(advanced.status).toBe('rectification');
  });

  test('final completion stamps completed_at', async () => {
    let process = (await q('SELECT * FROM handover_processes WHERE project_id = 1')).rows[0];
    for (const next of ['final_inspection', 'testing_commissioning', 'as_builts', 'o_m', 'training', 'taking_over', 'dlp_warranty', 'final_completion']) {
      process = await engine.transitionHandover(q, process.id, next, PM);
    }
    expect(process.status).toBe('final_completion');
    expect(process.completed_at).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Readiness percent
// ---------------------------------------------------------------------------

describe('package readiness', () => {
  test('zero records → 0% (the zero-record contract)', async () => {
    const readiness = await engine.handoverReadiness(q, 999);
    expect(readiness.items_total).toBe(0);
    expect(readiness.percent).toBe(0);
  });

  test('complete items drive the percent', async () => {
    await q(`INSERT INTO handover_package_items (project_id, item_type, title, status) VALUES ($1,'as_built_drawings','As-builts','complete')`, [2]);
    await q(`INSERT INTO handover_package_items (project_id, item_type, title, status) VALUES ($1,'o_m_manuals','O&M','pending')`, [2]);
    const readiness = await engine.handoverReadiness(q, 2);
    expect(readiness.items_total).toBe(2);
    expect(readiness.percent).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Warranty / DLP claims with SLA
// ---------------------------------------------------------------------------

describe('warranty / DLP claims', () => {
  test('a client raises a claim with an SLA due date', async () => {
    const claim = await engine.createWarrantyClaim(q, {
      project_id: 1, title: 'AC unit leaking', description: 'Unit 3 drips at the core',
      sla_days: 14,
    }, OWNER);
    expect(claim.claim_number).toMatch(/^WCL-\d{4}-0001$/);
    expect(claim.status).toBe('raised');
    expect(claim.due_date).toBeTruthy();
    expect(claim.workflow_instance_id).not.toBeNull();
  });

  test('the claim chain: assigned → rectification → submitted → accepted → closed', async () => {
    const claim = await engine.createWarrantyClaim(q, { project_id: 1, title: 'Pump fault', description: 'Not priming' }, OWNER);
    let c = await engine.transitionWarrantyClaim(q, claim.id, 'assigned', PM, { assigned_organization_id: 31 });
    expect(c.status).toBe('assigned');
    c = await engine.transitionWarrantyClaim(q, claim.id, 'rectification_in_progress', PM);
    c = await engine.transitionWarrantyClaim(q, claim.id, 'submitted_for_acceptance', SUPERVISOR, { evidence: { note: 'Fixed and tested' } });
    c = await engine.transitionWarrantyClaim(q, claim.id, 'accepted', PM, { note: 'Rectification verified' });
    c = await engine.transitionWarrantyClaim(q, claim.id, 'closed', PM);
    expect(c.status).toBe('closed');
    const sla = await engine.warrantySlaStatus(q, claim.id);
    expect(sla.is_overdue).toBe(false);
  });

  test('rejection reopens rectification with an audit trail', async () => {
    const claim = await engine.createWarrantyClaim(q, { project_id: 1, title: 'Valve drip', description: 'x' }, OWNER);
    await engine.transitionWarrantyClaim(q, claim.id, 'assigned', PM, { assigned_organization_id: 31 });
    await engine.transitionWarrantyClaim(q, claim.id, 'submitted_for_acceptance', SUPERVISOR, { evidence: { note: 'attempt 1' } });
    const rejected = await engine.transitionWarrantyClaim(q, claim.id, 'rejected', PM, { note: 'evidence insufficient' });
    expect(rejected.status).toBe('rejected');
    const reopened = await engine.transitionWarrantyClaim(q, claim.id, 'rectification_in_progress', PM);
    expect(reopened.status).toBe('rectification_in_progress');
    const sla = await engine.warrantySlaStatus(q, claim.id);
    expect(sla.status).toBe('rectification_in_progress');
    expect(sla.days_remaining).not.toBeNull();
  });
});
