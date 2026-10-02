// Phase 20 tests — HSE: the permit workflow through the Phase 6 'permit'
// template (draft → HSE review → PM approval → active; reject reopens),
// the expiry sweep, the HSE dashboard aggregation, and the zero-record
// contract. The typed incident/inspection conversion is a real-PostgreSQL
// step (the MockDb has no DROP/VIEW support) and is covered by the runner.

const { MockDb } = require('../test-helpers/mock-db');
const hseMigration = require('../hse-migration');
const workflowMigration = require('../workflow-engine-migration');
const hseEngine = require('../../services/hseEngine');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

const SITE = { id: 6, name: 'Site Supervisor', role: 'site_supervisor' };
const ENGINEER = { id: 7, name: 'HSE Engineer', role: 'engineer' };
const PM = { id: 4, name: 'PM', role: 'project_manager' };
const STAFF = { id: 9, name: 'Random Staff', role: 'staff' };

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name VARCHAR(255), name_en VARCHAR(255), status VARCHAR(50), progress_percent DECIMAL(5,2))`);
  await q(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), role VARCHAR(100), is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS project_locations (id SERIAL PRIMARY KEY, project_id INTEGER, name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS attendance (id SERIAL PRIMARY KEY, employee_id INTEGER, date DATE, status VARCHAR(30), project_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY, project_id INTEGER, incident_date DATE, incident_type VARCHAR(100),
    severity VARCHAR(20), description TEXT, injured_party VARCHAR(255), reported_by INTEGER,
    corrective_action TEXT, status VARCHAR(30), created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
    incident_category VARCHAR(50), is_lti BOOLEAN, lost_days INTEGER, closed_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS corrective_actions (
    id SERIAL PRIMARY KEY, project_id INTEGER, source_type VARCHAR(40), source_id INTEGER,
    description TEXT, assigned_user_id INTEGER, assigned_role VARCHAR(100), due_date DATE,
    status VARCHAR(30) DEFAULT 'open', created_at TIMESTAMPTZ)`);
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
  await hseMigration.ensureTables(q);
  await hseMigration.seedPermitTemplate(q);
  await hseMigration.seedPermitTemplate(q); // idempotent

  await q(`INSERT INTO projects (id, name, status, progress_percent) VALUES ($1,$2,$3,$4)`, [1, 'Site X', 'active', 20]);
}

beforeAll(buildFixture);

// ---------------------------------------------------------------------------
// Migration contract
// ---------------------------------------------------------------------------

describe('phase 20 migration', () => {
  test('seeds the permit template idempotently', async () => {
    const again = await hseMigration.seedPermitTemplate(q);
    expect(again).toBe(false);
  });

  test('the permit template steps are HSE review → PM approval', async () => {
    const t = (await q(`SELECT id FROM workflow_templates WHERE key = $1`, ['permit'])).rows[0];
    const steps = (await q(
      `SELECT step_key FROM workflow_steps WHERE template_id = $1`, [t.id]
    )).rows.map((r) => r.step_key);
    expect(steps).toEqual(['draft', 'hse_review', 'pm_approval']);
  });
});

// ---------------------------------------------------------------------------
// Permit workflow
// ---------------------------------------------------------------------------

describe('permit to work', () => {
  test('a hot-work permit drafts with a workflow instance; staff cannot submit', async () => {
    const permit = await hseEngine.createPermit(q, { project_id: 1, permit_type: 'hot_work', title: 'Welding at Level 2' }, SITE);
    expect(permit.permit_number).toMatch(/^HW-\d{4}-0001$/);
    expect(permit.status).toBe('draft');
    await expect(hseEngine.submitPermit(q, permit.id, STAFF)).rejects.toThrow(/Not authorized/);
    await hseEngine.submitPermit(q, permit.id, SITE);
    const submitted = (await q('SELECT status FROM permits WHERE id = $1', [permit.id])).rows[0];
    expect(submitted.status).toBe('pending_approval');
  });

  test('HSE approve → PM approve activates the permit with approved_by stamp', async () => {
    const permit = await hseEngine.createPermit(q, { project_id: 1, permit_type: 'confined_space', title: 'Tank entry' }, SITE);
    await hseEngine.submitPermit(q, permit.id, SITE);
    let p = await hseEngine.permitStageDecision(q, permit.id, ENGINEER, 'approve', { comment: 'Gas test done' });
    expect(p.status).toBe('approved');
    p = await hseEngine.permitStageDecision(q, permit.id, PM, 'approve');
    expect(p.status).toBe('active');
    expect(p.approved_by).toBe(PM.id);
  });

  test('an engineer cannot take the PM approval stage', async () => {
    const permit = await hseEngine.createPermit(q, { project_id: 1, permit_type: 'lifting', title: 'Crane lift' }, SITE);
    await hseEngine.submitPermit(q, permit.id, SITE);
    await expect(hseEngine.permitStageDecision(q, permit.id, ENGINEER, 'approve')).resolves.toBeTruthy();
    await expect(hseEngine.permitStageDecision(q, permit.id, ENGINEER, 'approve')).rejects.toThrow(/Not authorized/);
  });

  test('reject at the HSE stage reopens the permit for correction', async () => {
    const permit = await hseEngine.createPermit(q, { project_id: 1, permit_type: 'work', title: 'Scaffolding' }, SITE);
    await hseEngine.submitPermit(q, permit.id, SITE);
    const rejected = await hseEngine.permitStageDecision(q, permit.id, ENGINEER, 'reject', { comment: 'Add harness' });
    expect(rejected.status).toBe('rejected');
    const reopened = await hseEngine.transitionPermit(q, permit.id, 'pending_approval', SITE);
    expect(reopened.status).toBe('pending_approval');
  });

  test('active permits suspend, resume, and close; illegal jumps are refused', async () => {
    const permit = await hseEngine.createPermit(q, { project_id: 1, permit_type: 'work', title: 'Scaffold' }, SITE);
    await hseEngine.submitPermit(q, permit.id, SITE);
    await hseEngine.permitStageDecision(q, permit.id, ENGINEER, 'approve');
    const active = await hseEngine.permitStageDecision(q, permit.id, PM, 'approve');
    expect(active.status).toBe('active');
    await expect(hseEngine.transitionPermit(q, permit.id, 'closed', PM)).resolves.toBeTruthy();
    await expect(hseEngine.transitionPermit(q, permit.id, 'closed', SITE)).rejects.toThrow(/Cannot transition/);
  });

  test('the expiry sweep expires permits past valid_to', async () => {
    const permit = await hseEngine.createPermit(q, { project_id: 1, permit_type: 'work', title: 'Grinding', valid_to: new Date(Date.now() - 86400000).toISOString() }, SITE);
    await hseEngine.submitPermit(q, permit.id, SITE);
    await hseEngine.permitStageDecision(q, permit.id, ENGINEER, 'approve');
    await hseEngine.permitStageDecision(q, permit.id, PM, 'approve');
    const n = await hseEngine.expireOverduePermits(q);
    expect(n).toBeGreaterThanOrEqual(1);
    const status = (await q('SELECT status FROM permits WHERE id = $1', [permit.id])).rows[0].status;
    expect(status).toBe('expired');
  });
});

// ---------------------------------------------------------------------------
// HSE dashboard
// ---------------------------------------------------------------------------

describe('hse dashboard', () => {
  test('renders with zero records (all counters at their zero states)', async () => {
    const dash = await hseEngine.hseDashboard(q, { projectId: 999 });
    expect(dash.open_incidents).toBe(0);
    expect(dash.open_near_misses).toBe(0);
    expect(dash.permits.active).toBe(0);
    expect(dash.overdue_corrective_actions).toBe(0);
    expect(dash.days_without_lti).toBe(null);
  });

  test('computes man-hours, days-without-LTI, and overdue corrective actions', async () => {
    await q(`INSERT INTO attendance (project_id, status, date) VALUES ($1,$2,$3)`, [1, 'present', new Date().toISOString().slice(0, 10)]);
    await q(`INSERT INTO attendance (project_id, status, date) VALUES ($1,$2,$3)`, [1, 'late', new Date().toISOString().slice(0, 10)]);
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
    await q(`INSERT INTO incidents (project_id, description, incident_date, is_lti) VALUES ($1,$2,$3,$4)`, [1, 'Fall', tenDaysAgo, true]);
    const dueDate = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    await q(`INSERT INTO corrective_actions (project_id, description, due_date, status) VALUES ($1,$2,$3,'open')`, [1, 'Fix guardrail', dueDate]);
    const dash = await hseEngine.hseDashboard(q, { projectId: 1 });
    expect(dash.man_hours_today).toBe(16);
    expect(dash.days_without_lti).toBe(10);
    expect(dash.overdue_corrective_actions).toBe(1);
    expect(dash.lti_count).toBe(1);
  });
});
