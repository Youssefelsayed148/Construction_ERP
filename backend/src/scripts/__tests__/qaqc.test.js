// Phase 19 tests — QA/QC deepening: the WIR workflow (Site -> QA/QC -> PM ->
// Consultant -> result), punch items on the 'handover_punch' template,
// checklists, CAPA, mock-ups, NCR verification, and the zero-record contract.
//
// The MockDb is used the same way the other phase suites use it — service +
// migration logic runs on the portable subset so drift surfaces as a test
// failure instead of a silent pass.

const { MockDb } = require('../test-helpers/mock-db');
const qaqcMigration = require('../qaqc-migration');
const workflowMigration = require('../workflow-engine-migration');
const qaqcEngine = require('../../services/qaqcEngine');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

const SITE = { id: 6, name: 'Site Engineer', role: 'site_supervisor' };
const ENGINEER = { id: 7, name: 'QA/QC Engineer', role: 'engineer' };
const PM = { id: 4, name: 'PM', role: 'project_manager' };
const CONSULTANT = { id: 20, name: 'Consultant Rep', role: 'consultant' };
const STAFF = { id: 9, name: 'Random Staff', role: 'staff' };
const OWNER = { id: 1, name: 'Owner', role: 'owner' };

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name VARCHAR(255), name_en VARCHAR(255), status VARCHAR(50), progress_percent DECIMAL(5,2))`);
  await q(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), role VARCHAR(100), is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name VARCHAR(255), org_type VARCHAR(30))`);
  await q(`CREATE TABLE IF NOT EXISTS project_locations (id SERIAL PRIMARY KEY, project_id INTEGER, name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS quality_tests (id SERIAL PRIMARY KEY, project_id INTEGER, test_type VARCHAR(100), result VARCHAR(20))`);
  await q(`CREATE TABLE IF NOT EXISTS ncrs (
    id SERIAL PRIMARY KEY, ncr_number VARCHAR(50), project_id INTEGER, description TEXT,
    severity VARCHAR(20), status VARCHAR(30), raised_by INTEGER, resolved_by INTEGER,
    resolution_notes TEXT, resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
    exact_location VARCHAR(255), root_cause TEXT, verification_notes TEXT, closure_authority VARCHAR(150),
    verified_by INTEGER, verified_at TIMESTAMPTZ, closed_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS material_inspection_requests (
    id SERIAL PRIMARY KEY, mir_number VARCHAR(50), purchase_order_id INTEGER, delivery_id INTEGER,
    supplier_id INTEGER, warehouse_id INTEGER, status VARCHAR(30), inspected_by INTEGER,
    decided_at TIMESTAMPTZ, notes TEXT, created_by INTEGER, created_at TIMESTAMPTZ,
    project_id INTEGER, material_submittal_id INTEGER, grn_id INTEGER, workflow_instance_id INTEGER)`);
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
  await qaqcMigration.ensureTables(q);
  await qaqcMigration.ensureTables(q); // idempotent
  // 5.2: registers point at work_packages by FK (migration 0033 adds the column on real databases)
  await q(`CREATE TABLE IF NOT EXISTS work_packages (id SERIAL PRIMARY KEY, project_id INTEGER, code VARCHAR(50), name VARCHAR(255))`);
  await q('ALTER TABLE wirs ADD COLUMN IF NOT EXISTS work_package_id INTEGER');

  await q(`INSERT INTO projects (id, name, status, progress_percent) VALUES ($1,$2,$3,$4)`, [1, 'Tower A', 'active', 40]);
  await q(`INSERT INTO project_locations (id, project_id, name) VALUES ($1,$2,$3)`, [11, 1, 'Level 3 — Core']);
  await q(`INSERT INTO organizations (id, name, org_type) VALUES ($1,$2,$3)`, [31, 'Sub Org', 'subcontractor']);
  await q(`INSERT INTO work_packages (project_id, code, name) VALUES ($1,$2,$3)`, [1, 'WP-BW3', 'Blockwork L3']);
  await q(`INSERT INTO work_packages (project_id, code, name) VALUES ($1,$2,$3)`, [1, 'WP-PL4', 'Plaster L4']);
}

beforeAll(buildFixture);

// ---------------------------------------------------------------------------
// Migration contract
// ---------------------------------------------------------------------------

describe('phase 19 migration', () => {
  test('is idempotent — running it twice changes nothing', async () => {
    const before = (await q('SELECT COUNT(*) AS c FROM wirs')).rows[0].c;
    await qaqcMigration.ensureTables(q);
    const after = (await q('SELECT COUNT(*) AS c FROM wirs')).rows[0].c;
    expect(before).toBe(after);
  });
});

// ---------------------------------------------------------------------------
// WIR workflow — Site -> QA/QC -> PM -> Consultant -> result
// ---------------------------------------------------------------------------

describe('WIR workflow', () => {
  let wir;

  test('a site engineer drafts a WIR — it starts in draft with a workflow instance', async () => {
    wir = await qaqcEngine.createWir(q, { project_id: 1, project_location_id: 11, work_package: 'Blockwork L3' }, SITE);
    expect(wir.wir_number).toMatch(/^WIR-\d{4}-0001$/);
    expect(wir.status).toBe('draft');
    expect(wir.workflow_instance_id).not.toBeNull();
  });

  test('a random staff member cannot submit — authorization follows the template', async () => {
    await expect(qaqcEngine.submitWir(q, wir.id, STAFF)).rejects.toThrow(/Not authorized/);
  });

  test('submit moves it to the QA/QC stage', async () => {
    const submitted = await qaqcEngine.submitWir(q, wir.id, SITE);
    expect(submitted.status).toBe('submitted');
  });

  test('the QA/QC engineer approves — WIR advances', async () => {
    const r = await qaqcEngine.wirStepDecision(q, wir.id, null, ENGINEER, 'approve', 'OK');
    expect(r.status).toBe('pm_review');
    expect(r.qa_qc_by).toBe(ENGINEER.id);
  });

  test('the PM approves — WIR advances to the consultant stage', async () => {
    const r = await qaqcEngine.wirStepDecision(q, wir.id, null, PM, 'approve', null);
    expect(r.status).toBe('consultant_review');
    expect(r.pm_by).toBe(PM.id);
  });

  test('an engineer cannot take the final result — only the consultant stage can', async () => {
    await expect(qaqcEngine.decideWir(q, wir.id, ENGINEER, 'approved', {})).rejects.toThrow(/Not authorized/);
  });

  test('reinspect loops the WIR back into the QA/QC stage', async () => {
    const r = await qaqcEngine.decideWir(q, wir.id, CONSULTANT, 'reinspect', { comment: 'Hollows found' });
    expect(r.result).toBe('reinspect');
    expect(r.status).toBe('submitted');
    // second cycle straight through
    await qaqcEngine.wirStepDecision(q, wir.id, null, ENGINEER, 'approve', null);
    await qaqcEngine.wirStepDecision(q, wir.id, null, PM, 'approve', null);
    const final = await qaqcEngine.decideWir(q, wir.id, CONSULTANT, 'approved_with_comments', { comment: 'Minor remarks' });
    expect(final.status).toBe('approved_with_comments');
  });

  test('a rejected WIR records the decider and is terminal', async () => {
    let w = await qaqcEngine.createWir(q, { project_id: 1, work_package: 'Plaster L4' }, SITE);
    await qaqcEngine.submitWir(q, w.id, SITE);
    await qaqcEngine.wirStepDecision(q, w.id, null, ENGINEER, 'approve', null);
    await qaqcEngine.wirStepDecision(q, w.id, null, PM, 'approve', null);
    const decided = await qaqcEngine.decideWir(q, w.id, CONSULTANT, 'rejected', { comment: 'Wrong mix' });
    expect(decided.status).toBe('rejected');
    expect(decided.decided_by).toBe(CONSULTANT.id);
  });

  test('an invalid result string is rejected', async () => {
    await expect(qaqcEngine.decideWir(q, 1, CONSULTANT, 'maybe', {})).rejects.toThrow(/Invalid WIR result/);
  });
});

// ---------------------------------------------------------------------------
// Punch items — 'handover_punch' template
// ---------------------------------------------------------------------------

describe('punch items', () => {
  test('raising a punch item opens the workflow and the rectification action item', async () => {
    const punch = await qaqcEngine.createPunchItem(q, {
      project_id: 1, project_location_id: 11, discipline: 'finishes',
      description: 'Honeycombing at column C3', severity: 'major', due_date: null,
      responsible_user_id: SITE.id,
    }, PM);
    expect(punch.punch_number).toMatch(/^PCH-\d{4}-0001$/);
    expect(punch.status).toBe('open');
    const actions = (await q("SELECT * FROM action_items WHERE source_type = 'punch_item'")).rows;
    expect(actions.some((a) => a.source_id === punch.id && a.assigned_user_id === SITE.id)).toBe(true);
  });

  test('the full rectification chain: assigned → rectified → verified → closed', async () => {
    const punch = await qaqcEngine.createPunchItem(q, { project_id: 1, description: 'Paint defect' }, PM);
    await qaqcEngine.transitionPunchItem(q, punch.id, 'assigned', PM);
    await qaqcEngine.transitionPunchItem(q, punch.id, 'rectified', SITE);
    await qaqcEngine.transitionPunchItem(q, punch.id, 'verified', CONSULTANT);
    const closed = await qaqcEngine.transitionPunchItem(q, punch.id, 'closed', PM, { comment: 'ok' });
    expect(closed.status).toBe('closed');
    expect(closed.closed_by).toBe(PM.id);
  });

  test('illegal transitions are refused (cannot verify before rectification)', async () => {
    const punch = await qaqcEngine.createPunchItem(q, { project_id: 1, description: 'Tile lippage' }, PM);
    await expect(qaqcEngine.transitionPunchItem(q, punch.id, 'verified', CONSULTANT)).rejects.toThrow(/Cannot transition/);
  });

  test('a consultant cannot close a punch item — that is the PM step', async () => {
    const punch = await qaqcEngine.createPunchItem(q, { project_id: 1, description: 'Sealant missing' }, PM);
    await qaqcEngine.transitionPunchItem(q, punch.id, 'assigned', PM);
    await qaqcEngine.transitionPunchItem(q, punch.id, 'rectified', SITE);
    await qaqcEngine.transitionPunchItem(q, punch.id, 'verified', CONSULTANT);
    await expect(qaqcEngine.transitionPunchItem(q, punch.id, 'closed', CONSULTANT)).rejects.toThrow(/Not authorized/);
  });
});

// ---------------------------------------------------------------------------
// Zero-record contract
// ---------------------------------------------------------------------------

describe('zero-record contract', () => {
  test('a fresh project has zero WIRs, zero punch items, zero ITPs', async () => {
    expect((await q('SELECT COUNT(*) AS c FROM wirs WHERE project_id = $1', [2])).rows[0].c).toBe(0);
    expect((await q('SELECT COUNT(*) AS c FROM punch_items WHERE project_id = $1', [2])).rows[0].c).toBe(0);
    expect((await q('SELECT COUNT(*) AS c FROM itps WHERE project_id = $1', [2])).rows[0].c).toBe(0);
  });
});
