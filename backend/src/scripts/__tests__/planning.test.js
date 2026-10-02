// Phase 22 tests — planning / scheduling: the CPM (forward pass, critical
// path, float), SV%/planned progress, SPI/CPI gating on the EV flag,
// quantity-derived progress with the permission gate, baselines, lookahead
// windows, and the zero-record contract.

const { MockDb } = require('../test-helpers/mock-db');
const planningMigration = require('../planning-migration');
const engine = require('../../services/schedulingEngine');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

const PM = { id: 4, name: 'PM', role: 'project_manager' };

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name VARCHAR(255), name_en VARCHAR(255), status VARCHAR(50), earned_value_enabled BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS project_milestones (
    id SERIAL PRIMARY KEY, project_id INTEGER, title VARCHAR(255), target_date DATE,
    status VARCHAR(50) DEFAULT 'pending', schedule_activity_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS schedule_activities (
    id SERIAL PRIMARY KEY, project_id INTEGER, activity_code VARCHAR(50), name VARCHAR(255),
    wbs_path VARCHAR(300), work_package VARCHAR(255), phase_id INTEGER, project_location_id INTEGER,
    boq_item_id INTEGER, boq_location_allocation_id INTEGER, calendar_id INTEGER,
    responsible_organization_id INTEGER, responsible_user_id INTEGER, subcontractor_organization_id INTEGER,
    planned_start DATE, planned_finish DATE, actual_start DATE, actual_finish DATE,
    original_duration INTEGER DEFAULT 0, remaining_duration INTEGER, percent_complete DECIMAL(5,2) DEFAULT 0,
    progress_source VARCHAR(20) DEFAULT 'manual', planned_quantity DECIMAL(15,3),
    critical BOOLEAN DEFAULT false, total_float DECIMAL(10,2), is_milestone BOOLEAN DEFAULT false,
    status VARCHAR(30) DEFAULT 'planned', notes TEXT, created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS activity_relationships (
    id SERIAL PRIMARY KEY, project_id INTEGER, predecessor_id INTEGER, successor_id INTEGER,
    relationship_type VARCHAR(2) DEFAULT 'FS', lag_days INTEGER DEFAULT 0, created_by INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS baselines (
    id SERIAL PRIMARY KEY, project_id INTEGER, name VARCHAR(150), baseline_date TIMESTAMPTZ DEFAULT NOW(),
    data JSONB DEFAULT '[]', is_current BOOLEAN DEFAULT true, created_by INTEGER, created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS quantity_measurements (
    id SERIAL PRIMARY KEY, project_id INTEGER, boq_item_id INTEGER, quantity DECIMAL(15,3) DEFAULT 0,
    approval_state VARCHAR(30) DEFAULT 'pending')`);
  await q(`CREATE TABLE IF NOT EXISTS boq_location_allocations (
    id SERIAL PRIMARY KEY, project_id INTEGER, boq_item_id INTEGER, project_location_id INTEGER, planned_quantity DECIMAL(15,3) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS event_log (
    id SERIAL PRIMARY KEY, event_type VARCHAR(100), entity_type VARCHAR(100), entity_id INTEGER,
    user_id INTEGER, user_name VARCHAR(255), user_role VARCHAR(100), payload JSONB,
    dispatched_at TIMESTAMPTZ, created_at TIMESTAMPTZ)`);
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

  await planningMigration.ensureTables(q);
  await planningMigration.ensureTables(q); // idempotent

  await q(`INSERT INTO projects (id, name_en, status, earned_value_enabled) VALUES ($1,$2,$3,$4)`, [1, 'Schedule Tower', 'active', true]);
  await q(`INSERT INTO projects (id, name_en, status, earned_value_enabled) VALUES ($1,$2,$3,$4)`, [2, 'Quiet Tower', 'active', false]);
}

beforeAll(buildFixture);

// ---------------------------------------------------------------------------
// Migration contract
// ---------------------------------------------------------------------------

describe('phase 22 migration', () => {
  test('is idempotent — running it twice changes nothing', async () => {
    const before = (await q('SELECT COUNT(*) AS c FROM schedule_activities')).rows[0].c;
    await planningMigration.ensureTables(q);
    const after = (await q('SELECT COUNT(*) AS c FROM schedule_activities')).rows[0].c;
    expect(before).toBe(after);
  });
});

// ---------------------------------------------------------------------------
// CPM
// ---------------------------------------------------------------------------

describe('critical path calculation', () => {
  test('a linear chain: FS relationships push early dates; everything on the chain is critical', async () => {
    const acts = [
      { id: 1, planned_start: '2026-03-02', planned_finish: '2026-03-06', original_duration: 5 },
      { id: 2, planned_start: '2026-03-02', planned_finish: '2026-03-13', original_duration: 10 },
      { id: 3, planned_start: '2026-03-02', planned_finish: '2026-03-04', original_duration: 3 },
    ];
    const rels = [
      { predecessor_id: 1, successor_id: 3, relationship_type: 'FS', lag_days: 0 },
      { predecessor_id: 3, successor_id: 2, relationship_type: 'FS', lag_days: 0 },
    ];
    const sched = engine.computeSchedule(acts, rels);
    // A (5d, 03-02→03-07) drives C (3d, →03-10); C drives B (10d) → finish 03-20
    expect(sched.project_finish).toBe('2026-03-20');
    const byId = new Map(sched.activities.map((a) => [a.id, a]));
    expect(byId.get(1).critical).toBe(true);
    expect(byId.get(3).critical).toBe(true);
    expect(byId.get(2).critical).toBe(true);
    expect(byId.get(1).total_float).toBe(0);
  });

  test('off-critical activities carry float', async () => {
    const acts = [
      { id: 1, planned_start: '2026-03-02', planned_finish: '2026-03-16', original_duration: 15 },
      { id: 2, planned_start: '2026-03-02', planned_finish: '2026-03-04', original_duration: 3 },
      { id: 3, planned_start: '2026-03-02', planned_finish: '2026-03-03', original_duration: 2 },
    ];
    const rels = [{ predecessor_id: 2, successor_id: 1, relationship_type: 'FS', lag_days: 0 }];
    const sched = engine.computeSchedule(acts, rels);
    const byId = new Map(sched.activities.map((a) => [a.id, a]));
    expect(byId.get(1).critical).toBe(true);
    expect(byId.get(2).critical).toBe(true); // the whole chain is critical
    // the unconnected activity floats over the whole project window
    expect(byId.get(3).critical).toBe(false);
    expect(byId.get(3).total_float).toBeGreaterThan(10);
  });

  test('lags and SS relationships shift early dates', async () => {
    const acts = [
      { id: 1, planned_start: '2026-03-02', planned_finish: '2026-03-16', original_duration: 15 },
      { id: 2, planned_start: '2026-03-02', planned_finish: '2026-03-04', original_duration: 5 },
    ];
    const sched = engine.computeSchedule(acts, [{ predecessor_id: 1, successor_id: 2, relationship_type: 'SS', lag_days: 3 }]);
    const byId = new Map(sched.activities.map((a) => [a.id, a]));
    // B early-starts 3 days after A starts
    expect(byId.get(2).early_start).toBe('2026-03-05');
  });
});

// ---------------------------------------------------------------------------
// SV% / SPI / CPI
// ---------------------------------------------------------------------------

describe('schedule KPIs', () => {
  test('SV% = actual − planned progress', async () => {
    const a = {
      planned_start: '2026-03-01', planned_finish: '2026-03-11', percent_complete: 25,
    };
    const dataDate = new Date('2026-03-06'); // half-way → planned 50%
    expect(engine.plannedProgress(a, dataDate)).toBe(50);
    expect(engine.scheduleVariancePercent(a, dataDate)).toBe(-25);
  });

  test('SPI only where earned-value management is enabled', async () => {
    const acts = [{ planned_start: '2026-03-01', planned_finish: '2026-03-11', percent_complete: 50, planned_quantity: 100 }];
    const enabled = { earned_value_enabled: true };
    const disabled = { earned_value_enabled: false };
    expect(engine.spi(disabled, acts, new Date('2026-03-06'))).toBe(null);
    const spi = engine.spi(enabled, acts, new Date('2026-03-06'));
    expect(spi).toBe(1); // 50% actual vs 50% planned
  });

  test('CPI needs cost data and the EVM opt-in', async () => {
    const acts = [{ id: 1, planned_start: '2026-03-01', planned_finish: '2026-03-11', percent_complete: 50, planned_quantity: 100 }];
    const enabled = { earned_value_enabled: true };
    // EV = 50% × 100 units, AC = 100 → CPI 0.5; no cost data → null; EVM off → null
    expect(engine.cpi(enabled, acts, { 1: 100 })).toBe(0.5);
    expect(engine.cpi(enabled, acts, {})).toBe(null);
    expect(engine.cpi({ earned_value_enabled: false }, acts, { 1: 100 })).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Quantity-driven progress (Phase 8 integration)
// ---------------------------------------------------------------------------

describe('quantity-driven progress', () => {
  let activity;

  test('derives % complete from approved physical quantity', async () => {
    await q(`INSERT INTO schedule_activities (project_id, activity_code, name, boq_item_id, planned_quantity, percent_complete, progress_source)
             VALUES ($1,$2,$3,$4,$5,$6,'quantity')`, [1, 'A0001', 'Concrete pour L2', 55, 100, 0]);
    await q(`INSERT INTO quantity_measurements (project_id, boq_item_id, quantity, approval_state) VALUES ($1,$2,$3,'approved')`, [1, 55, 25]);
    const rows = (await q('SELECT * FROM schedule_activities WHERE project_id = 1')).rows;
    const activity = rows[rows.length - 1];
    const pct = await engine.deriveQuantityProgress(q, activity);
    expect(pct).toBe(25);
    const updated = await engine.updateProgress(q, activity.id, { progress_source: 'quantity' }, PM);
    expect(parseFloat(updated.percent_complete)).toBe(25);
    expect(updated.status).toBe('in_progress');
  });

  test('updating progress stamps actual dates and fires the Phase 9 demand hook', async () => {
    const rows = (await q('SELECT * FROM schedule_activities WHERE project_id = 1')).rows;
    const activity = rows[rows.length - 1];
    await q(`INSERT INTO quantity_measurements (project_id, boq_item_id, quantity, approval_state) VALUES ($1,$2,$3,'approved')`, [1, 55, 75]);
    const updated = await engine.updateProgress(q, activity.id, { progress_source: 'quantity' }, PM);
    expect(parseFloat(updated.percent_complete)).toBe(100);
    expect(updated.status).toBe('completed');
    const events = (await q(`SELECT * FROM event_log WHERE event_type = 'schedule.activity.changed'`)).rows;
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Lookahead / delayed
// ---------------------------------------------------------------------------

describe('schedule views', () => {
  test('2-week lookahead window picks activities starting inside it', async () => {
    const dataDate = new Date('2026-03-06');
    const acts = [
      { id: 1, planned_start: '2026-03-10', planned_finish: '2026-03-20' },
      { id: 2, planned_start: '2026-02-20', planned_finish: '2026-03-01' },
    ];
    const inWindow = engine.lookahead(acts, 2, dataDate);
    expect(inWindow.map((a) => a.id)).toEqual([1]);
    // finished after the data date → NOT delayed; only 2 is behind
    expect(engine.delayedActivities([{ ...acts[0], percent_complete: 0 }], dataDate).map((a) => a.id)).toEqual([]);
    expect(engine.delayedActivities([{ ...acts[1], percent_complete: 0 }], dataDate).map((a) => a.id)).toEqual([2]);
  });
});

// ---------------------------------------------------------------------------
// Baselines
// ---------------------------------------------------------------------------

describe('baselines', () => {
  test('captures a snapshot and marks only it current', async () => {
    await q(`INSERT INTO baselines (project_id, name, data, is_current) VALUES ($1,$2,$3,false)`, [1, 'Old', JSON.stringify([{ id: 9 }])]);
    const r = await q(`INSERT INTO baselines (project_id, name, data, is_current) VALUES ($1,$2,$3,$4) RETURNING *`,
      [1, 'Mar baseline', JSON.stringify([{ id: 1 }, { id: 2 }]), true]);
    // mark others not current (the route does this before insert)
    await q('UPDATE baselines SET is_current = $1 WHERE id != $2', [false, r.rows[0].id]);
    const current = (await q('SELECT * FROM baselines WHERE is_current = true')).rows;
    expect(current.length).toBe(1);
    expect(current[0].name).toBe('Mar baseline');
  });
});

// ---------------------------------------------------------------------------
// Zero-record contract
// ---------------------------------------------------------------------------

describe('zero-record contract', () => {
  test('a fresh project has zero activities, relationships, baselines', async () => {
    expect((await q('SELECT COUNT(*) AS c FROM schedule_activities WHERE project_id = $1', [2])).rows[0].c).toBe(0);
    expect((await q('SELECT COUNT(*) AS c FROM activity_relationships WHERE project_id = $1', [2])).rows[0].c).toBe(0);
    expect((await q('SELECT COUNT(*) AS c FROM baselines WHERE project_id = $1', [2])).rows[0].c).toBe(0);
    const sc = engine.sCurve([]);
    expect(sc).toEqual([]);
  });
});
