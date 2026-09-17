// Phase 8 tests — real locations, BOQ allocations, quantity measurements and
// roll-ups.
//
// Coverage:
//   - migration: quantity_measurements + additive columns; buildings migrated
//     to real building + floor location rows (idempotent); Unassigned
//     locations; allocation backfill; measurement backfill from verified
//     completions; NOT NULL verification; completed_quantity recompute
//   - quantityEngine formulas: remaining/physical/approved/certified and all
//     four weight policies
//   - the acceptance test: floor, building and project level rollups
//     reconcile to the exact same quantity_measurements rows
//   - derived summaries are rewritten from measurements, never hand-edited

const { MockDb } = require('../test-helpers/mock-db');
const migration = require('../location-quantity-migration');
const engine = require('../../services/quantityEngine');
const locationService = require('../../services/locationService');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);
const client = { query: q };

async function count(table) {
  return db.table(table).rows.length;
}

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), role VARCHAR(100), is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS location_types (
    id SERIAL PRIMARY KEY, code VARCHAR(50) UNIQUE NOT NULL, name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS project_locations (
    id SERIAL PRIMARY KEY, project_id INTEGER, parent_id INTEGER, location_type_id INTEGER,
    code VARCHAR(50), name VARCHAR(255), name_en VARCHAR(255), name_ar VARCHAR(255),
    sort_order INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT true, legacy_building_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS buildings (
    id SERIAL PRIMARY KEY, project_id INTEGER, code VARCHAR(50), name VARCHAR(255),
    floors INTEGER DEFAULT 1, units_per_floor INTEGER DEFAULT 1, status VARCHAR(30),
    completion_percentage DECIMAL(5,2), project_location_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS boq_sections (id SERIAL PRIMARY KEY, project_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS boq_items (
    id SERIAL PRIMARY KEY, project_id INTEGER, section_id INTEGER, code VARCHAR(50),
    description VARCHAR(500), unit VARCHAR(50) DEFAULT 'm2', quantity DECIMAL(15,3) DEFAULT 0,
    unit_rate DECIMAL(15,2) DEFAULT 0, type VARCHAR(50) DEFAULT 'material',
    completed_quantity DECIMAL(15,3) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS boq_location_allocations (
    id SERIAL PRIMARY KEY, boq_item_id INTEGER, project_location_id INTEGER,
    planned_quantity DECIMAL(15,3) DEFAULT 0, executed_quantity DECIMAL(15,3) DEFAULT 0,
    approved_design_quantity DECIMAL(15,3) DEFAULT 0,
    consultant_approved_quantity DECIMAL(15,3) DEFAULT 0,
    certified_quantity DECIMAL(15,3) DEFAULT 0,
    unit_cost DECIMAL(15,2) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS work_orders (id SERIAL PRIMARY KEY, project_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS work_completions (
    id SERIAL PRIMARY KEY, work_order_id INTEGER, boq_item_id INTEGER,
    quantity_completed DECIMAL(15,3) DEFAULT 0, completion_date DATE,
    verified_by INTEGER, verified_at TIMESTAMPTZ, status VARCHAR(50) DEFAULT 'pending_verification',
    notes TEXT, project_location_id INTEGER, boq_location_allocation_id INTEGER)`);

  // Seed the location-type catalog the Phase 3 migration seeds.
  const types = [
    ['site', 0], ['zone', 1], ['building', 2], ['floor', 3],
    ['block', 3], ['wing', 3], ['area', 4], ['room', 5],
  ];
  for (const [code, sort] of types) {
    await q('INSERT INTO location_types (id, code, name) VALUES ($1, $2, $3)', [sort + 1, code, code]);
  }

  await q('INSERT INTO projects (id, name) VALUES ($1, $2)', [1, 'Tower A']);
  await q('INSERT INTO projects (id, name) VALUES ($1, $2)', [2, 'Migration Test Project']);
  await q('INSERT INTO users (id, name, role, is_active) VALUES ($1, $2, $3, $4)', [5, 'Surveyor', 'engineer', true]);
  await q(`INSERT INTO work_orders (id, project_id) VALUES ($1, $2)`, [10, 2]);

  await migration.ensureTables(q);
}

beforeAll(async () => {
  await buildFixture();
});

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

describe('migration', () => {
  test('creates quantity_measurements and the additive columns', () => {
    expect(db.table('quantity_measurements').columns.has('approval_state')).toBe(true);
    expect(db.table('quantity_measurements').columns.has('photos')).toBe(true);
    expect(db.table('boq_location_allocations').columns.has('approved_design_quantity')).toBe(true);
    expect(db.table('work_completions').columns.has('project_location_id')).toBe(true);
    expect(db.table('project_locations').columns.has('legacy_building_id')).toBe(true);
  });

  test('buildings migrate to real building + floor location rows (one row per floor)', async () => {
    await q(`INSERT INTO buildings (id, project_id, code, name, floors, units_per_floor, status) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [100, 1, 'B1', 'Building 1', 3, 4, 'planning']);

    const r = await migration.migrateBuildings(q);
    expect(r.migrated).toBe(1);
    expect(r.floorsCreated).toBe(3);

    const buildingLoc = (await q('SELECT * FROM project_locations WHERE legacy_building_id = 100')).rows[0];
    expect(buildingLoc).toBeTruthy();
    const buildingType = (await q("SELECT id FROM location_types WHERE code = 'building'")).rows[0];
    expect(buildingLoc.location_type_id).toBe(buildingType.id);
    const floors = (await q('SELECT * FROM project_locations WHERE parent_id = $1 ORDER BY sort_order', [buildingLoc.id])).rows;
    expect(floors.length).toBe(3);
    expect(floors.map((f) => f.name)).toEqual(['Floor 1', 'Floor 2', 'Floor 3']);

    const b = (await q('SELECT * FROM buildings WHERE id = 100')).rows[0];
    expect(b.project_location_id).toBe(buildingLoc.id);

    // Idempotent: re-run migrates nothing.
    const again = await migration.migrateBuildings(q);
    expect(again.migrated).toBe(0);
  });

  test('Unassigned locations are created per project and reused', async () => {
    await migration.createUnassignedLocations(q);
    await migration.createUnassignedLocations(q);
    // One per project (two projects in the fixture), reused on re-run.
    const rows = (await q("SELECT * FROM project_locations WHERE code = 'UNASSIGNED'")).rows;
    expect(rows.length).toBe(2);
    const forProject1 = (await q("SELECT * FROM project_locations WHERE code = 'UNASSIGNED' AND project_id = $1", [1])).rows;
    expect(forProject1.length).toBe(1);
  });

  test('allocation backfill gives every BOQ item a home allocation', async () => {
    await q(`INSERT INTO boq_items (id, project_id, quantity, unit_rate) VALUES ($1,$2,$3,$4)`, [500, 2, 200, 50]);
    const created = await migration.backfillAllocations(q);
    expect(created).toBe(1);
    const alloc = (await q('SELECT * FROM boq_location_allocations WHERE boq_item_id = 500')).rows[0];
    expect(Number(alloc.planned_quantity)).toBe(200);
    const unassigned = (await q("SELECT * FROM project_locations WHERE code = 'UNASSIGNED' AND project_id = $1", [2])).rows[0];
    expect(alloc.project_location_id).toBe(unassigned.id);
    // Idempotent.
    const again = await migration.backfillAllocations(q);
    expect(again).toBe(0);
  });

  test('verified completions backfill as approved measurements; re-run adds nothing', async () => {
    await q(`INSERT INTO work_completions (id, work_order_id, boq_item_id, quantity_completed, completion_date, verified_by, status) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [60, 10, 500, 30, '2026-06-01', 5, 'verified']);
    const inserted = await migration.backfillMeasurementsFromCompletions(q);
    expect(inserted).toBe(1);
    const meas = (await q("SELECT * FROM quantity_measurements WHERE source_type = 'work_completion' AND source_id = 60")).rows[0];
    expect(meas).toBeTruthy();
    expect(meas.approval_state).toBe('approved');
    expect(Number(meas.quantity)).toBe(30);
    const wc = (await q('SELECT * FROM work_completions WHERE id = 60')).rows[0];
    expect(wc.project_location_id).toBe(meas.project_location_id);
    const again = await migration.backfillMeasurementsFromCompletions(q);
    expect(again).toBe(0);
  });

  test('pending completions get stamped to the Unassigned location; backfill verifies clean', async () => {
    await q(`INSERT INTO work_completions (id, work_order_id, boq_item_id, quantity_completed, completion_date, status) VALUES ($1,$2,$3,$4,$5,$6)`, [61, 10, 500, 5, '2026-06-02', 'pending_verification']);
    await migration.backfillCompletions(q);
    const verify = await migration.verifyBackfill(q);
    expect(verify.ok).toBe(true);
    expect(verify.nullRows).toBe(0);
  });

  test('completed_quantity is recomputed from measurements (transition mirror)', async () => {
    await migration.recomputeCompletedQuantities(q);
    const item = (await q('SELECT * FROM boq_items WHERE id = 500')).rows[0];
    expect(Number(item.completed_quantity)).toBe(30);
  });

  test('locationService shares the same allocation home for later calls', async () => {
    const unassigned = (await q("SELECT id FROM project_locations WHERE code = 'UNASSIGNED' AND project_id = $1", [2])).rows[0];
    const a1 = await locationService.getOrCreateAllocation(q, 500, unassigned.id);
    const a2 = await locationService.getOrCreateAllocation(q, 500, unassigned.id);
    expect(a1.id).toBe(a2.id);
    expect(await count('boq_location_allocations')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// quantityEngine formulas
// ---------------------------------------------------------------------------

describe('quantityEngine formulas', () => {
  test('remaining is floored at zero', () => {
    expect(engine.remainingQuantity(100, 40)).toBe(60);
    expect(engine.remainingQuantity(100, 120)).toBe(0);
  });

  test('progress percentages are exact', () => {
    expect(engine.physicalProgress(40, 100)).toBe(40);
    expect(engine.approvedProgress(25, 100)).toBe(25);
    expect(engine.certifiedProgress(10, 100)).toBe(10);
    expect(engine.physicalProgress(5, 0)).toBe(0);
  });

  test('weighted project progress honours every weight policy', () => {
    const items = [
      { planned_quantity: 100, approved_quantity: 100, unit_rate: 10, manual_weight: 1, schedule_weight: 3 },
      { planned_quantity: 100, approved_quantity: 0, unit_rate: 30, manual_weight: 1, schedule_weight: 1 },
    ];
    // boq_value: weights 1000 vs 3000 → 100*0.25 + 0*0.75 = 25
    expect(engine.weightedProjectProgress(items, 'boq_value').progress).toBeCloseTo(25);
    // planned_quantity: equal weights → 50
    expect(engine.weightedProjectProgress(items, 'planned_quantity').progress).toBeCloseTo(50);
    // manual: equal weights → 50
    expect(engine.weightedProjectProgress(items, 'manual').progress).toBeCloseTo(50);
    // schedule: weights 3 vs 1 → 75
    expect(engine.weightedProjectProgress(items, 'schedule').progress).toBeCloseTo(75);
    // empty project → 0
    expect(engine.weightedProjectProgress([], 'boq_value').progress).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Reconciliation acceptance — floor / building / project = same measurements
// ---------------------------------------------------------------------------

describe('reconciliation (acceptance)', () => {
  let siteId; let buildingId; let floorAId; let floorBId;
  const SITE_ID = 21; const BUILDING_ID = 22; const FLOOR_A_ID = 23; const FLOOR_B_ID = 24;

  beforeAll(async () => {
    const siteType = (await q("SELECT id FROM location_types WHERE code = 'site'")).rows[0].id;
    const buildingType = (await q("SELECT id FROM location_types WHERE code = 'building'")).rows[0].id;
    const floorType = (await q("SELECT id FROM location_types WHERE code = 'floor'")).rows[0].id;

    const site = (await q(
      'INSERT INTO project_locations (id, project_id, parent_id, location_type_id, code, name) VALUES ($1, 1, NULL, $2, $3, $4) RETURNING *',
      [SITE_ID, siteType, 'SITE2', 'Site 2']
    )).rows[0];
    siteId = site.id;
    const building = (await q(
      'INSERT INTO project_locations (id, project_id, parent_id, location_type_id, code, name) VALUES ($1, 1, $2, $3, $4, $5) RETURNING *',
      [BUILDING_ID, site.id, buildingType, 'B2', 'Building 2']
    )).rows[0];
    buildingId = building.id;
    const fa = (await q(
      'INSERT INTO project_locations (id, project_id, parent_id, location_type_id, code, name) VALUES ($1, 1, $2, $3, $4, $5) RETURNING *',
      [FLOOR_A_ID, building.id, floorType, 'F-01', 'Floor 1']
    )).rows[0];
    floorAId = fa.id;
    const fb = (await q(
      'INSERT INTO project_locations (id, project_id, parent_id, location_type_id, code, name) VALUES ($1, 1, $2, $3, $4, $5) RETURNING *',
      [FLOOR_B_ID, building.id, floorType, 'F-02', 'Floor 2']
    )).rows[0];
    floorBId = fb.id;

    // Three measurements: two on floor A, one on floor B.
    await q(`INSERT INTO quantity_measurements (id, project_id, project_location_id, boq_item_id, measured_date, quantity, unit, source_type, source_id, approval_state)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [1, 1, floorAId, 500, '2026-06-01', 10, 'm2', 'daily_report', 1, 'approved']);
    await q(`INSERT INTO quantity_measurements (id, project_id, project_location_id, boq_item_id, measured_date, quantity, unit, source_type, source_id, approval_state, reviewed_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [2, 1, floorAId, 500, '2026-06-02', 5, 'm2', 'daily_report', 2, 'approved', 5]);
    await q(`INSERT INTO quantity_measurements (id, project_id, project_location_id, boq_item_id, measured_date, quantity, unit, source_type, source_id, approval_state)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [3, 1, floorBId, 500, '2026-06-02', 15, 'm2', 'daily_report', 3, 'certified']);
  });

  test('floor, building and project rollups see the exact same measurement rows', () => {
    const measurements = db.table('quantity_measurements').rows;
    const locations = db.table('project_locations').rows;
    // Scope to the site-2 subtree: the shared db also holds the migration
    // test's measurement on the project's Unassigned location.
    const scoped = measurements.filter((m) =>
      engine.descendantLocationIds(locations, siteId).includes(m.project_location_id));

    const floor = engine.rollupForLocation(scoped, locations, floorAId);
    expect(floor.executed).toBe(15); // 10 approved + 5 approved
    expect(floor.measurement_count).toBe(2);

    const building = engine.rollupForLocation(scoped, locations, buildingId);
    expect(building.executed).toBe(30); // 15 + 15 (certified counts as executed)
    expect(building.measurement_count).toBe(3);

    const project = engine.projectRollup(scoped);
    expect(project.executed).toBe(30);
    expect(project.measurement_count).toBe(3);

    // The acceptance assertion: floors ∪ = building = project, by ids.
    const rec = engine.reconcile(scoped, locations, {
      floorIds: [floorAId, floorBId], buildingIds: [buildingId],
    });
    expect(rec.reconciles).toBe(true);
  });

  test('consultant approval and certified derivation', () => {
    const measurements = db.table('quantity_measurements').rows.filter((m) => m.source_type !== 'work_completion');
    const sums = engine.sumMeasurements(measurements);
    // executed = 30 (all approved/certified); consultant-approved = 5
    // (only measurement #2 has reviewed_by); certified = 15.
    expect(sums.executed).toBe(30);
    expect(sums.consultant_approved).toBe(5);
    expect(sums.certified).toBe(15);
  });

  test('syncAllocations rewrites the allocation summary from measurements', async () => {
    await locationService.getOrCreateAllocation(q, 500, floorAId);
    await locationService.getOrCreateAllocation(q, 500, floorBId);
    const synced = await engine.syncAllocations(q, { boqItemId: 500 });
    expect(synced).toBe(3); // unassigned (backfill), floor A, floor B
    const allocs = (await q('SELECT * FROM boq_location_allocations WHERE boq_item_id = 500')).rows;
    const floorA = allocs.find((a) => a.project_location_id === floorAId);
    const floorB = allocs.find((a) => a.project_location_id === floorBId);
    expect(Number(floorA.executed_quantity)).toBe(15);
    expect(Number(floorB.executed_quantity)).toBe(15);

    // completed mirrors ALL approved/certified measurements of the item
    // (the migration test's 30 on project 2 + this project's 30).
    const derived = await engine.syncBoqItemCompletedQuantity(q, 500);
    expect(derived).toBe(60);
    const item = (await q('SELECT * FROM boq_items WHERE id = 500')).rows[0];
    expect(Number(item.completed_quantity)).toBe(60);
  });

  test('projectProgress computes totals and weighted progress from live tables', async () => {
    const r = await engine.projectProgress(q, 2, 'planned_quantity');
    // One item: planned 200, executed 30 (backfilled approved measurement,
    // reviewed_by set → consultant-approved too).
    expect(r.totals.planned_quantity).toBe(200);
    expect(r.totals.executed_quantity).toBe(30);
    expect(r.totals.remaining_quantity).toBe(170);
    expect(r.totals.physical_progress).toBeCloseTo(15);
    expect(r.totals.approved_progress).toBeCloseTo(15);
    expect(r.progress).toBeCloseTo(15);
  });
});
