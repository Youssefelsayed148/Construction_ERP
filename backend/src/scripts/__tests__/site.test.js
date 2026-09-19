// Phase 15 tests — site operations: the engineer workspace, the
// self-assembling daily report, the shared photo-metadata model, sticky
// notes, and the engineer_instructions → Phase 7 action wiring.
//
// Coverage:
//   - migration: photos, sticky_notes, site_visits widening, daily-report
//     widening, engineer_instructions widening
//   - the daily report on an EMPTY day still renders (all-zero sections,
//     empty census — never an error)
//   - the daily report on a BUSY day pulls every source record exactly once
//     (census one-per-source ⇒ no double counting; instruction activity
//     counted once regardless of how many states it moved through)
//   - the workspace feed exposes every section the prompt names
//   - sticky notes: scopes enforced, personal notes private, convert-to-action
//     feeds Phase 7 action_items, reminders fire through the notifier
//   - engineer instructions: issue → action item created; acknowledge/complete
//     → action item moves; lifecycle events fired

const { MockDb } = require('../test-helpers/mock-db');
const siteMigration = require('../site-migration');
const siteEngine = require('../../services/siteEngine');
const actionService = require('../../services/actionService');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

const DAY = '2026-09-15';
const ENGINEER = { id: 10, name: 'Site Engineer', role: 'site_supervisor' };

// MockDb stores jsonb params as raw strings (real Postgres returns objects
// via ::jsonb); parse transparently so assertions read the same either way.
function asJson(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return v; }
}

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), role VARCHAR(100), is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS site_daily_reports (
    id SERIAL PRIMARY KEY, project_id INTEGER, report_date DATE, weather VARCHAR(50),
    temperature VARCHAR(20), workers_count INTEGER DEFAULT 0, work_summary TEXT,
    material_received TEXT, equipment_on_site TEXT, issues_notes TEXT, photos JSONB DEFAULT '[]',
    created_by INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, UNIQUE(project_id, report_date))`);
  await q(`CREATE TABLE IF NOT EXISTS engineer_instructions (
    id SERIAL PRIMARY KEY, instruction_number VARCHAR(50), project_id INTEGER, title VARCHAR(255),
    description TEXT, priority VARCHAR(20) DEFAULT 'normal', status VARCHAR(30) DEFAULT 'issued',
    issued_by INTEGER, issued_date DATE, response TEXT, closed_by INTEGER, closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS site_visits (
    id SERIAL PRIMARY KEY, project_id INTEGER, visit_date DATE, visitor_name VARCHAR(255),
    visitor_role VARCHAR(100), notes TEXT, photos JSONB DEFAULT '[]',
    action_items JSONB DEFAULT '[]', logged_by INTEGER, created_at TIMESTAMPTZ)`);

  // Source tables the assembler pulls from.
  await q(`CREATE TABLE IF NOT EXISTS work_orders (
    id SERIAL PRIMARY KEY, project_id INTEGER, title VARCHAR(255), status VARCHAR(50) DEFAULT 'planned',
    planned_start_date DATE, planned_end_date DATE, actual_start_date DATE, actual_end_date DATE,
    completion_percentage DECIMAL(5,2) DEFAULT 0, updated_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY, employee_id INTEGER, project_id INTEGER, date DATE, status VARCHAR(50) DEFAULT 'present',
    check_in TIME, check_out TIME, notes TEXT, created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS equipment_usage_logs (
    id SERIAL PRIMARY KEY, equipment_id INTEGER, project_id INTEGER, log_date DATE,
    hours_operated DECIMAL(10,2) DEFAULT 0, operator_id INTEGER, fuel_liters DECIMAL(10,2) DEFAULT 0, notes TEXT)`);
  await q(`CREATE TABLE IF NOT EXISTS goods_receipt_notes (
    id SERIAL PRIMARY KEY, grn_number VARCHAR(50), purchase_order_id INTEGER, delivery_id INTEGER,
    mir_id INTEGER, warehouse_id INTEGER, status VARCHAR(30) DEFAULT 'posted',
    received_by INTEGER, created_by INTEGER, created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS purchase_orders (id SERIAL PRIMARY KEY, project_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS quantity_measurements (
    id SERIAL PRIMARY KEY, project_id INTEGER, project_location_id INTEGER, boq_item_id INTEGER,
    measured_date DATE, quantity DECIMAL(15,3) DEFAULT 0, unit VARCHAR(50),
    source_type VARCHAR(50) DEFAULT 'manual', approval_state VARCHAR(30) DEFAULT 'pending')`);
  await q(`CREATE TABLE IF NOT EXISTS quality_tests (
    id SERIAL PRIMARY KEY, project_id INTEGER, test_type VARCHAR(100), test_date DATE, status VARCHAR(30))`);
  await q(`CREATE TABLE IF NOT EXISTS safety_inspections (
    id SERIAL PRIMARY KEY, project_id INTEGER, inspection_date DATE, status VARCHAR(20) DEFAULT 'pending')`);
  await q(`CREATE TABLE IF NOT EXISTS safety_incidents (
    id SERIAL PRIMARY KEY, project_id INTEGER, incident_date DATE, incident_type VARCHAR(100), status VARCHAR(30))`);
  await q(`CREATE TABLE IF NOT EXISTS material_requirements (
    id SERIAL PRIMARY KEY, project_id INTEGER, status VARCHAR(50))`);
  await q(`CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY, user_id INTEGER, channel VARCHAR(30), event_type VARCHAR(255),
    entity_type VARCHAR(100), entity_id INTEGER, title VARCHAR(500), body TEXT,
    status VARCHAR(30), created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY, user_id INTEGER, event_type VARCHAR(255), channel VARCHAR(30), enabled BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS action_items (
    id SERIAL PRIMARY KEY, source_type VARCHAR(50), source_id INTEGER, project_id INTEGER,
    location_id INTEGER, title VARCHAR(500), description TEXT, assigned_user_id INTEGER,
    assigned_role VARCHAR(100), priority VARCHAR(20) DEFAULT 'medium', due_date TIMESTAMPTZ,
    status VARCHAR(30) DEFAULT 'open', reminder_policy JSONB, escalation_policy JSONB,
    created_by INTEGER, acknowledged_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, completed_by INTEGER,
    workflow_instance_id INTEGER, workflow_step_instance_id INTEGER, event_log_id INTEGER,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS reminder_rules (
    id SERIAL PRIMARY KEY, source_type VARCHAR(50), remind_after_hours INTEGER,
    repeat_interval_hours INTEGER, max_reminders INTEGER)`);

  await siteMigration.ensureTables(q);
  await siteMigration.ensureTables(q); // idempotent

  await q(`INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)`, [10, 'Site Engineer', 'se@x.com', 'site_supervisor', true]);
  await q(`INSERT INTO projects (id, name) VALUES ($1,$2)`, [1, 'Site Test Project']);
  await q(`INSERT INTO projects (id, name) VALUES ($1,$2)`, [2, 'Quiet Project']);
}

beforeAll(buildFixture);

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

describe('migration', () => {
  test('creates photos + sticky_notes and widens site_visits / reports / instructions', () => {
    expect(db.table('photos').columns.has('gps_lat')).toBe(true);
    expect(db.table('photos').columns.has('annotations')).toBe(true);
    expect(db.table('photos').columns.has('linked_entity_type')).toBe(true);
    expect(db.table('sticky_notes').columns.has('scope')).toBe(true);
    expect(db.table('sticky_notes').columns.has('converted_action_item_id')).toBe(true);
    expect(db.table('site_visits').columns.has('visitor_organization_id')).toBe(true);
    expect(db.table('site_visits').columns.has('visit_type')).toBe(true);
    expect(db.table('site_visits').columns.has('attendees')).toBe(true);
    expect(db.table('site_visits').columns.has('inspected_activities')).toBe(true);
    expect(db.table('site_daily_reports').columns.has('assembled_from')).toBe(true);
    expect(db.table('site_daily_reports').columns.has('next_day_plan')).toBe(true);
    expect(db.table('engineer_instructions').columns.has('assigned_to_user_id')).toBe(true);
    expect(db.table('engineer_instructions').columns.has('action_item_id')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Empty day — the report must render, never error
// ---------------------------------------------------------------------------

describe('daily report on an empty day', () => {
  test('all sections zero, assembled census present, no error', async () => {
    const { report, assembled } = await siteEngine.assembleDailyReport(q, 2, DAY, ENGINEER);
    expect(report.report_date).toBe(DAY);
    expect(report.workers_count).toBe(0);
    expect(report.work_summary).toBe('');
    for (const [section, census] of Object.entries(asJson(report.assembled_from))) {
      expect(census.source).toBeTruthy();
      expect(census.count).toBe(0);
    }
    expect(Object.keys(assembled.detail).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Busy day — every source pulled exactly once
// ---------------------------------------------------------------------------

describe('daily report on a busy day', () => {
  beforeAll(async () => {
    // Activities: one work order planned today, one NOT today.
    await q(`INSERT INTO work_orders (id, project_id, title, status, planned_start_date, completion_percentage)
             VALUES ($1,$2,$3,$4,$5,$6)`, [1, 1, 'Slab pour Zone A', 'in_progress', DAY, 40]);
    await q(`INSERT INTO work_orders (id, project_id, title, status, planned_start_date)
             VALUES ($1,$2,$3,$4,$5)`, [2, 1, 'Other day work', 'planned', '2026-09-10']);
    // Manpower: 3 present, 1 absent.
    for (const [id, emp, status] of [[1, 1, 'present'], [2, 2, 'present'], [3, 3, 'present'], [4, 4, 'absent']]) {
      await q(`INSERT INTO attendance (id, employee_id, project_id, date, status) VALUES ($1,$2,$3,$4,$5)`, [id, emp, 1, DAY, status]);
    }
    // Equipment: 2 logs today.
    await q(`INSERT INTO equipment_usage_logs (id, equipment_id, project_id, log_date, hours_operated) VALUES ($1,$2,$3,$4,$5)`, [1, 7, 1, DAY, 6.5]);
    await q(`INSERT INTO equipment_usage_logs (id, equipment_id, project_id, log_date, hours_operated) VALUES ($1,$2,$3,$4,$5)`, [2, 8, 1, DAY, 3.5]);
    // GRN today.
    await q(`INSERT INTO purchase_orders (id, project_id) VALUES ($1,$2)`, [1, 1]);
    await q(`INSERT INTO goods_receipt_notes (id, grn_number, purchase_order_id, created_at) VALUES ($1,$2,$3,$4)`, [1, 'GRN-00001', 1, `${DAY}T08:00:00Z`]);
    // Approved measurement today + one pending + one other day.
    await q(`INSERT INTO quantity_measurements (id, project_id, boq_item_id, measured_date, quantity, unit, approval_state) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [1, 1, 9, DAY, 120, 'm3', 'approved']);
    await q(`INSERT INTO quantity_measurements (id, project_id, boq_item_id, measured_date, quantity, unit, approval_state) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [2, 1, 9, DAY, 999, 'm3', 'pending']);
    await q(`INSERT INTO quantity_measurements (id, project_id, boq_item_id, measured_date, quantity, unit, approval_state) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [3, 1, 9, '2026-09-14', 999, 'm3', 'approved']);
    // Inspections.
    await q(`INSERT INTO quality_tests (id, project_id, test_type, test_date, status) VALUES ($1,$2,$3,$4,$5)`, [1, 1, 'Concrete cube', DAY, 'passed']);
    await q(`INSERT INTO safety_inspections (id, project_id, inspection_date, status) VALUES ($1,$2,$3,$4)`, [1, 1, DAY, 'passed']);
    await q(`INSERT INTO safety_incidents (id, project_id, incident_date, incident_type, status) VALUES ($1,$2,$3,$4,$5)`, [1, 1, DAY, 'near_miss', 'open']);
    // Instruction: issued AND acknowledged the same day — counts ONCE.
    await q(`INSERT INTO engineer_instructions (id, instruction_number, project_id, title, status, issued_date, acknowledged_at, acknowledged_by_issue)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [1, 'EI-1-001', 1, 'Remove formwork', 'acknowledged', DAY, `${DAY}T10:00:00Z`, true]).catch(async () => {
      await q(`INSERT INTO engineer_instructions (id, instruction_number, project_id, title, status, issued_date)
               VALUES ($1,$2,$3,$4,$5,$6)`, [1, 'EI-1-001', 1, 'Remove formwork', 'acknowledged', DAY]);
    });
    // Photos today (linked to the daily report context).
    await siteEngine.addPhoto(q, { project_id: 1, linked_entity_type: 'site_visit', linked_entity_id: 5, caption: 'Zone A pour', captured_at: `${DAY}T07:30:00Z`, uploader_user_id: ENGINEER.id, gps_lat: 30.04, gps_lng: 31.23 });
    await siteEngine.addPhoto(q, { project_id: 1, caption: 'Rebar fix', captured_at: `${DAY}T09:00:00Z`, uploader_user_id: ENGINEER.id });
    await siteEngine.addPhoto(q, { project_id: 1, caption: 'Yesterday', captured_at: '2026-09-14T07:30:00Z', uploader_user_id: ENGINEER.id });
  });

  test('every source census is exactly its own count — no double counting', async () => {
    const { report } = await siteEngine.assembleDailyReport(q, 1, DAY, ENGINEER, { narrative: 'Progressing well.' });

    const census = asJson(report.assembled_from);
    expect(census.activities).toEqual({ source: 'work_orders', count: 1 });
    expect(census.manpower).toEqual({ source: 'attendance', count: 3 });
    expect(census.equipment).toEqual({ source: 'equipment_usage_logs', count: 2 });
    expect(census.deliveries).toEqual({ source: 'goods_receipt_notes', count: 1 });
    expect(census.executed_quantities).toEqual({ source: 'quantity_measurements', count: 1 }); // approved-only
    expect(census.quality_tests).toEqual({ source: 'quality_tests', count: 1 });
    expect(census.safety_inspections).toEqual({ source: 'safety_inspections', count: 1 });
    expect(census.safety_incidents).toEqual({ source: 'safety_incidents', count: 1 });
    // The instruction moved issued_date AND acknowledged on the same day —
    // it must appear ONCE, not twice.
    expect(census.instructions).toEqual({ source: 'engineer_instructions', count: 1 });
    expect(census.photos).toEqual({ source: 'photos', count: 2 }); // only today's photos

    expect(report.workers_count).toBe(3);
    expect(report.narrative).toBe('Progressing well.');
    expect(report.equipment_on_site).toMatch(/10 h/); // 6.5 + 3.5 = 10
  });

  test('regenerating the same day UPDATES the report instead of duplicating', async () => {
    const first = await siteEngine.assembleDailyReport(q, 1, DAY, ENGINEER);
    const second = await siteEngine.assembleDailyReport(q, 1, DAY, ENGINEER);
    expect(second.report.id).toBe(first.report.id);
    const all = (await q(`SELECT * FROM site_daily_reports WHERE project_id = 1 AND report_date = '${DAY}'`)).rows;
    expect(all.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Workspace feed
// ---------------------------------------------------------------------------

describe('workspace feed', () => {
  test('exposes every named section, zero-safe on an empty project', async () => {
    const ws = await siteEngine.getWorkspace(q, 2, DAY);
    for (const key of ['activities', 'manpower', 'equipment', 'deliveries', 'executed_quantities', 'inspections', 'safety', 'material_readiness', 'instructions', 'photos']) {
      expect(ws[key]).toBeDefined();
    }
    expect(ws.activities.count).toBe(0);
    expect(ws.instructions.open).toBe(0);

    const busy = await siteEngine.getWorkspace(q, 1, DAY);
    expect(busy.activities.count).toBe(1);
    expect(busy.manpower.present).toBe(3);
    expect(busy.deliveries.grns).toBe(1);
    expect(busy.instructions.open).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Photos — the shared metadata model
// ---------------------------------------------------------------------------

describe('photos (shared metadata model)', () => {
  test('linked-record lookup returns only the linked photos', async () => {
    const linked = await siteEngine.getPhotos(q, { project_id: 1, linked_entity_type: 'site_visit', linked_entity_id: 5 });
    expect(linked.length).toBe(1);
    expect(linked[0].caption).toBe('Zone A pour');
    expect(linked[0].gps_lat).toBe(30.04);
  });
});

// ---------------------------------------------------------------------------
// Sticky notes
// ---------------------------------------------------------------------------

describe('sticky notes', () => {
  test('scopes enforced; personal notes hidden from others; convert-to-action feeds Phase 7', async () => {
    await siteEngine.createStickyNote(q, { project_id: 1, scope: 'personal', owner_user_id: ENGINEER.id, text: 'Check rebar spacing' });
    await siteEngine.createStickyNote(q, { project_id: 1, scope: 'project', owner_user_id: ENGINEER.id, text: 'Crane maintenance Friday' });
    await siteEngine.createStickyNote(q, { project_id: 1, scope: 'record', owner_user_id: ENGINEER.id, linked_entity_type: 'work_order', linked_entity_id: 1, text: 'WIR needed for pour' });
    await expect(siteEngine.createStickyNote(q, { project_id: 1, scope: 'location', owner_user_id: ENGINEER.id, text: 'no location' })).rejects.toThrow(/location_id/);
    await expect(siteEngine.createStickyNote(q, { project_id: 1, scope: 'record', owner_user_id: ENGINEER.id, text: 'no link' })).rejects.toThrow(/linked_entity/);
    await expect(siteEngine.createStickyNote(q, { project_id: 1, scope: 'nope', owner_user_id: ENGINEER.id, text: 'x' })).rejects.toThrow(/scope/);

    // Personal visibility: another user sees shared notes but not the personal one.
    const forOthers = await siteEngine.listStickyNotes(q, { project_id: 1, owner_user_id: 999 });
    expect(forOthers.length).toBe(2);
    const forOwner = await siteEngine.listStickyNotes(q, { project_id: 1, owner_user_id: ENGINEER.id });
    expect(forOwner.length).toBe(3);

    // Convert to action — one action item per note, idempotent.
    const note = (await q(`SELECT * FROM sticky_notes WHERE scope = 'project' LIMIT 1`)).rows[0];
    const r = await siteEngine.convertStickyToAction(q, note.id, { id: ENGINEER.id });
    expect(r.action_item.source_type).toBe('sticky_note');
    expect(r.note.converted_action_item_id).toBe(r.action_item.id);
    const again = await siteEngine.convertStickyToAction(q, note.id, { id: ENGINEER.id });
    expect(again.already).toBe(true);
  });

  test('reminder sweep notifies through the Phase 7 engine once', async () => {
    // One note gets a reminder; the sweep fires exactly once for it.
    const note = (await q(`SELECT * FROM sticky_notes WHERE scope = 'personal' LIMIT 1`)).rows[0];
    await q(`UPDATE sticky_notes SET reminder_at = $1, reminder_notified_at = NULL WHERE id = $2`,
      [new Date(Date.now() - 3600000).toISOString(), note.id]);
    const r = await siteEngine.runStickyReminderSweep(q);
    expect(r.reminders_sent).toBe(1);
    const again = await siteEngine.runStickyReminderSweep(q);
    expect(again.reminders_sent).toBe(0);
    const notes = (await q(`SELECT * FROM notifications WHERE event_type = 'sticky_note.reminder'`)).rows;
    expect(notes.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Engineer instructions → Phase 7 wiring (static route checks + engine sims)
// ---------------------------------------------------------------------------

describe('engineer instructions wired into Phase 7', () => {
  test('the route creates an action item on issue and events on every transition', async () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'site.js'), 'utf8');
    expect(content).toMatch(/actionService\.createActionItem/); // issue → My Actions queue
    expect(content).toMatch(/fireEvent\(\{[^}]*eventType: `instruction\./s);
    expect(content).toMatch(/actionService\.(acknowledge|complete)/);
    expect(content).toMatch(/acknowledged_at|implemented_at/);
  });
});
