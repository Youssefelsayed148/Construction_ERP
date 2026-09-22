// Phase 23 tests — per-role widget dashboards: the registry covers the 16
// roles, every dashboard is permission-filtered server-side (scoped portal
// roles see only their projects), every widget renders on zero records, the
// owner resolver extends the /overview strip, and sticky notes/location
// widgets come through the same payload.

const { MockDb } = require('../test-helpers/mock-db');
const widgets = require('../../services/dashboardWidgets');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

const OWNER = { id: 1, name: 'Owner', role: 'owner' };
const PM = { id: 4, name: 'PM', role: 'project_manager' };
const ENGINEER = { id: 7, name: 'Engineer', role: 'engineer' };
const CLIENT = { id: 30, name: 'Client Rep', role: 'client' };
const CONSULTANT = { id: 20, name: 'Consultant Rep', role: 'consultant' };
const SUBCON = { id: 40, name: 'Sub Rep', role: 'subcontractor' };

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name VARCHAR(255), name_en VARCHAR(255), status VARCHAR(50), completion_percentage DECIMAL(5,2), expected_completion DATE, budget DECIMAL(15,2))`);
  await q(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), role VARCHAR(100), is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS project_participants (
    id SERIAL PRIMARY KEY, project_id INTEGER, organization_id INTEGER,
    participant_type VARCHAR(50), portal_access_enabled BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS project_participant_users (
    id SERIAL PRIMARY KEY, project_participant_id INTEGER, user_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS sticky_notes (
    id SERIAL PRIMARY KEY, project_id INTEGER, scope VARCHAR(20), owner_user_id INTEGER,
    location_id INTEGER, linked_entity_type VARCHAR(50), linked_entity_id INTEGER,
    text VARCHAR(2000), color VARCHAR(20), reminder_at TIMESTAMPTZ, reminder_notified_at TIMESTAMPTZ,
    converted_action_item_id INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS project_locations (id SERIAL PRIMARY KEY, project_id INTEGER, name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS boq_location_allocations (
    id SERIAL PRIMARY KEY, project_location_id INTEGER, planned_quantity DECIMAL(15,3) DEFAULT 0,
    executed_quantity DECIMAL(15,3) DEFAULT 0, certified_quantity DECIMAL(15,3) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS handover_package_items (
    id SERIAL PRIMARY KEY, project_id INTEGER, title VARCHAR(255), status VARCHAR(30) DEFAULT 'pending')`);
  await q(`CREATE TABLE IF NOT EXISTS observations (
    id SERIAL PRIMARY KEY, project_id INTEGER, consultant_user_id INTEGER, status VARCHAR(30))`);
  await q(`CREATE TABLE IF NOT EXISTS project_milestones (
    id SERIAL PRIMARY KEY, project_id INTEGER, title VARCHAR(255), status VARCHAR(50) DEFAULT 'pending')`);
}

beforeAll(buildFixture);

// ---------------------------------------------------------------------------
// Registry — the 16 roles
// ---------------------------------------------------------------------------

describe('the 16 role dashboards', () => {
  test('the registry covers all 16 target roles', () => {
    const roles = Object.keys(widgets.DASHBOARDS);
    for (const role of ['owner', 'projects_director', 'construction_manager', 'project_manager',
      'site_engineer', 'planning', 'qs', 'procurement', 'storekeeper', 'qa_qc', 'hse',
      'document_controller', 'finance_manager', 'client', 'consultant', 'subcontractor']) {
      expect(roles).toContain(role);
    }
    expect(Object.values(widgets.DASHBOARDS).every((f) => typeof f === 'function')).toBe(true);
  });

  test('legacy role strings resolve through aliases (manager → construction manager)', async () => {
    expect(widgets.ROLE_ALIASES.manager).toBe('construction_manager');
    expect(widgets.ROLE_ALIASES.staff).toBe('site_engineer');
    expect(widgets.ROLE_ALIASES.accountant).toBe('finance_manager');
  });
});

// ---------------------------------------------------------------------------
// Zero-record contract — every role dashboard renders with zero records
// ---------------------------------------------------------------------------

describe('zero-record contract', () => {
  test.each([
    ['owner', OWNER], ['projects_director', { id: 2, role: 'projects_director' }],
    ['construction_manager', { id: 3, role: 'construction_manager' }],
    ['project_manager', PM], ['site_engineer', ENGINEER],
    ['planning', { id: 8, role: 'planning' }], ['qs', { id: 9, role: 'qs' }],
    ['procurement', { id: 10, role: 'procurement' }],
    ['storekeeper', { id: 11, role: 'storekeeper' }],
    ['qa_qc', { id: 11, role: 'qa_qc' }], ['hse', { id: 12, role: 'hse' }],
    ['document_controller', { id: 13, role: 'document_controller' }],
    ['finance_manager', { id: 14, role: 'finance_manager' }],
    ['client', CLIENT], ['consultant', CONSULTANT], ['subcontractor', SUBCON],
  ])('%s renders an empty-but-valid dashboard on a fresh system', async (role, user) => {
    const dash = await widgets.roleDashboard(q, user, {});
    expect(dash.role).toBe(user.role);
    expect(Array.isArray(dash.widgets)).toBe(true);
    for (const wgt of dash.widgets) {
      expect(wgt.key).toBeTruthy();
      expect(wgt.title).toBeTruthy();
      expect(wgt.data).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Permission filtering
// ---------------------------------------------------------------------------

describe('server-side permission filtering', () => {
  test('a client sees only their scoped projects', async () => {
    await q(`INSERT INTO projects (id, name_en, status, completion_percentage) VALUES ($1,$2,$3,$4)`, [1, 'Client Tower', 'active', 40]);
    await q(`INSERT INTO projects (id, name_en, status, completion_percentage) VALUES ($1,$2,$3,$4)`, [2, 'Secret Tower', 'active', 0]);
    await q(`INSERT INTO project_participants (id, project_id, organization_id, participant_type, portal_access_enabled) VALUES ($1,$2,$3,$4,$5)`, [1, 1, 5, 'client', true]);
    await q(`INSERT INTO project_participant_users (id, project_participant_id, user_id) VALUES ($1,$2,$3)`, [1, 1, CLIENT.id]);
    const ids = await widgets.visibleProjectIds(q, CLIENT);
    expect(ids).toEqual([1]);
  });

  test('a client with no assignments gets an empty handover/milestones state, not an error', async () => {
    const dash = await widgets.roleDashboard(q, { id: 999, role: 'client' });
    expect(dash.widgets.find((w) => w.key === 'projects').data.count).toBe(0);
    expect(dash.widgets.find((w) => w.key === 'handover_readiness').data.percent).toBe(0);
  });

  test('the location widget is filtered for portal roles', async () => {
    await q(`INSERT INTO project_locations (id, project_id, name) VALUES ($1,$2,$3)`, [11, 1, 'Level 1']);
    const blocked = await widgets.locationWidget(q, { id: 999, role: 'client' }, 1);
    expect(blocked).toBe(null);
    const allowed = await widgets.locationWidget(q, CLIENT, 1);
    expect(allowed.locations.length).toBe(1);
    expect(allowed.locations[0].percent).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Owner extends /overview; sticky notes; populated widget values
// ---------------------------------------------------------------------------

describe('owner dashboard + components', () => {
  test('the owner dashboard carries the summary-strip widgets (extending /overview)', async () => {
    const dash = await widgets.roleDashboard(q, OWNER);
    const keys = dash.widgets.map((w) => w.key);
    expect(keys).toContain('portfolio');
    expect(keys).toContain('procurement_exposure');
    expect(keys).toContain('quality_safety_risks');
    expect(keys).toContain('financial_position');
  });

  test('sticky notes come through the dashboard payload (personal + project scope)', async () => {
    await q(`INSERT INTO sticky_notes (project_id, scope, owner_user_id, text, color)
             VALUES ($1,$2,$3,$4,$5)`, [1, 'project', PM.id, 'Check rebar cover', 'yellow']);
    await q(`INSERT INTO sticky_notes (project_id, scope, owner_user_id, text, color)
             VALUES ($1,$2,$3,$4,$5)`, [2, 'personal', PM.id, 'Call supplier', 'blue']);
    const dash = await widgets.roleDashboard(q, PM, { projectId: 1 });
    expect(dash.sticky_notes.length).toBe(2);
    expect(dash.sticky_notes.some((n) => n.scope === 'project')).toBe(true);
  });

  test('populated widgets reflect the records (planning & QA/QC)', async () => {
    await q(`CREATE TABLE IF NOT EXISTS schedule_activities (
      id SERIAL PRIMARY KEY, project_id INTEGER, activity_code VARCHAR(50), name VARCHAR(255),
      planned_start DATE, planned_finish DATE, original_duration INTEGER DEFAULT 0,
      percent_complete DECIMAL(5,2) DEFAULT 0, critical BOOLEAN DEFAULT false, status VARCHAR(30) DEFAULT 'planned')`);
    await q(`CREATE TABLE IF NOT EXISTS baselines (
      id SERIAL PRIMARY KEY, project_id INTEGER, name VARCHAR(150), is_current BOOLEAN DEFAULT true)`);
    await q(`INSERT INTO schedule_activities (project_id, activity_code, name, percent_complete, critical) VALUES ($1,$2,$3,$4,true)`, [1, 'A0001', 'Pour', 50]);
    await q(`INSERT INTO baselines (project_id, name, is_current) VALUES ($1,$2,true)`, [1, 'Mar']);
    const dash = await widgets.roleDashboard(q, { id: 8, role: 'planning' });
    const summary = dash.widgets.find((w) => w.key === 'baseline_vs_actual');
    expect(summary.data.total).toBe(1);
    expect(Number(summary.data.avg_progress)).toBe(50);
  });

  test('the handover readiness percent computes for a client', async () => {
    await q(`INSERT INTO handover_package_items (project_id, title, status) VALUES ($1,$2,'complete')`, [1, 'As-builts']);
    await q(`INSERT INTO handover_package_items (project_id, title, status) VALUES ($1,$2,'pending')`, [1, 'O&M']);
    const dash = await widgets.roleDashboard(q, CLIENT);
    expect(dash.widgets.find((w) => w.key === 'handover_readiness').data.percent).toBe(50);
  });
});
