// Phase 8 migration core — real locations, BOQ allocations, quantity
// measurements, work_completions linkage, and the buildings →
// project_locations migration.
//
// Steps (all idempotent):
//   ensureTables        — quantity_measurements; additive columns on
//                         boq_location_allocations (approved_design_quantity,
//                         consultant_approved_quantity), work_completions
//                         (project_location_id, boq_location_allocation_id,
//                         nullable first), project_locations (legacy_building_id),
//                         buildings (project_location_id)
//   migrateBuildings    — every buildings row becomes a project_location
//                         (location_type='building') with one REAL floor row
//                         per integer of buildings.floors
//   createUnassigned    — a default 'Unassigned' location per project that has
//                         completions/BOQ items but no location data
//   backfillAllocations — boq_location_allocations row per BOQ item per
//                         location (initially the project's Unassigned
//                         location) so every item has a home
//   backfillMeasurements— every verified work_completion becomes an approved
//                         quantity_measurements row (the source of truth)
//   backfillCompletions — stamp work_completions.project_location_id +
//                         boq_location_allocation_id
//   recomputeCompleted  — boq_items.completed_quantity recomputed from
//                         measurements (transition: column mirrors derived)
//   enforceNotNull      — only after the backfill verified empty: NOT NULL on
//                         work_completions.project_location_id
//   createViews         — v_boq_item_progress (derived progress read path)

'use strict';

const locationService = require('../services/locationService');

const DDL = [
  // Self-sufficiency: some databases never ran the Phase 3 migration, so the
  // base tables are ensured here with the exact Phase 3 shapes.
  `CREATE TABLE IF NOT EXISTS location_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    name_ar VARCHAR(255),
    parent_id INTEGER REFERENCES location_types(id),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS project_locations (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES project_locations(id) ON DELETE CASCADE,
    location_type_id INTEGER REFERENCES location_types(id),
    code VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    name_ar VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, parent_id, code)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_project_locations_project ON project_locations(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_locations_parent ON project_locations(parent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_locations_type ON project_locations(location_type_id)`,
  `CREATE TABLE IF NOT EXISTS boq_location_allocations (
    id SERIAL PRIMARY KEY,
    boq_item_id INTEGER NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
    project_location_id INTEGER NOT NULL REFERENCES project_locations(id) ON DELETE CASCADE,
    planned_quantity DECIMAL(15,3) DEFAULT 0,
    approved_design_quantity DECIMAL(15,3) DEFAULT 0,
    executed_quantity DECIMAL(15,3) DEFAULT 0,
    consultant_approved_quantity DECIMAL(15,3) DEFAULT 0,
    certified_quantity DECIMAL(15,3) DEFAULT 0,
    remaining_quantity DECIMAL(15,3) GENERATED ALWAYS AS
      (CASE WHEN planned_quantity - executed_quantity > 0
            THEN planned_quantity - executed_quantity
            ELSE 0 END) STORED,
    unit_cost DECIMAL(15,2) DEFAULT 0,
    cost_amount DECIMAL(15,2) GENERATED ALWAYS AS (planned_quantity * unit_cost) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(boq_item_id, project_location_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_boq_location_allocations_item ON boq_location_allocations(boq_item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_boq_location_allocations_loc ON boq_location_allocations(project_location_id)`,
  // Phase 8 additive columns.
  `ALTER TABLE boq_location_allocations ADD COLUMN IF NOT EXISTS approved_design_quantity DECIMAL(15,3) DEFAULT 0`,
  `ALTER TABLE boq_location_allocations ADD COLUMN IF NOT EXISTS consultant_approved_quantity DECIMAL(15,3) DEFAULT 0`,
  `ALTER TABLE work_completions ADD COLUMN IF NOT EXISTS project_location_id INTEGER REFERENCES project_locations(id)`,
  `ALTER TABLE work_completions ADD COLUMN IF NOT EXISTS boq_location_allocation_id INTEGER REFERENCES boq_location_allocations(id)`,
  `ALTER TABLE project_locations ADD COLUMN IF NOT EXISTS legacy_building_id INTEGER`,
  `ALTER TABLE buildings ADD COLUMN IF NOT EXISTS project_location_id INTEGER REFERENCES project_locations(id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_project_locations_legacy_building
     ON project_locations(legacy_building_id) WHERE legacy_building_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS quantity_measurements (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL,
    boq_item_id INTEGER NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
    boq_location_allocation_id INTEGER REFERENCES boq_location_allocations(id) ON DELETE SET NULL,
    work_package_id INTEGER,
    measured_date DATE NOT NULL,
    quantity DECIMAL(15,3) NOT NULL CHECK (quantity >= 0),
    unit VARCHAR(50),
    source_type VARCHAR(50) DEFAULT 'manual',
    source_id INTEGER,
    source_ref VARCHAR(200),
    measured_by INTEGER REFERENCES users(id),
    reviewed_by INTEGER REFERENCES users(id),
    approval_state VARCHAR(30) DEFAULT 'pending',
    photos JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_quantity_measurements_project ON quantity_measurements(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_quantity_measurements_location ON quantity_measurements(project_location_id)`,
  `CREATE INDEX IF NOT EXISTS idx_quantity_measurements_item ON quantity_measurements(boq_item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_quantity_measurements_source ON quantity_measurements(source_type, source_id)`,
];

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

// ---------------------------------------------------------------------------
// Buildings → project_locations (location_type='building') + real floor rows
// ---------------------------------------------------------------------------

async function ensureLocationType(query, code, name, nameEn, nameAr, sortOrder) {
  await query(
    `INSERT INTO location_types (code, name, name_en, name_ar, sort_order)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (code) DO NOTHING`,
    [code, name, nameEn, nameAr, sortOrder]
  );
  const r = await query('SELECT id FROM location_types WHERE code = $1', [code]);
  return r.rows[0] ? r.rows[0].id : null;
}

// The project's root location if provisioned (Phase 5), else NULL parent.
async function projectRootLocationId(query, projectId) {
  const r = await query(
    "SELECT id FROM project_locations WHERE project_id = $1 AND parent_id IS NULL ORDER BY id LIMIT 1",
    [projectId]
  );
  return r.rows[0] ? r.rows[0].id : null;
}

// The core location-type catalog (Phase 3 seeds these; this guard covers
// databases where the seed has not run yet).
async function ensureLocationTypes(query) {
  const defs = [
    ['site', 'Site'], ['zone', 'Zone'], ['building', 'Building'],
    ['floor', 'Floor'], ['area', 'Area'], ['room', 'Room'],
  ];
  for (const [code, name] of defs) {
    await query(
      `INSERT INTO location_types (code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING`,
      [code, name]
    );
  }
}

// One REAL project_locations floor row per integer of buildings.floors —
// not a count on a column.
async function migrateBuildings(query) {
  await ensureLocationTypes(query);
  const typeRes = await query("SELECT id FROM location_types WHERE code = 'building'");
  const buildingTypeId = typeRes.rows[0] ? typeRes.rows[0].id : null;
  const floorTypeRes = await query("SELECT id FROM location_types WHERE code = 'floor'");
  const floorTypeId = floorTypeRes.rows[0] ? floorTypeRes.rows[0].id : null;

  const buildings = (await query('SELECT * FROM buildings ORDER BY id')).rows;
  let migrated = 0;
  let floorsCreated = 0;

  for (const b of buildings) {
    if (b.project_location_id != null) continue; // already migrated

    const parentId = await projectRootLocationId(query, b.project_id);
    const locRes = await query(
      `INSERT INTO project_locations (project_id, parent_id, location_type_id, code, name, name_en, name_ar, legacy_building_id, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [b.project_id, parentId, buildingTypeId, b.code, b.name, b.name, b.name, b.id, 0]
    );
    const locationId = locRes.rows[0].id;

    const floorCount = Math.max(parseInt(b.floors || 1, 10) || 1, 1);
    for (let f = 1; f <= floorCount; f++) {
      const code = `F-${String(f).padStart(2, '0')}`;
      await query(
        `INSERT INTO project_locations (project_id, parent_id, location_type_id, code, name, name_en, name_ar, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [b.project_id, locationId, floorTypeId, code, `Floor ${f}`, `Floor ${f}`, `الطابق ${f}`, f]
      );
      floorsCreated++;
    }

    await query('UPDATE buildings SET project_location_id = $1 WHERE id = $2', [locationId, b.id]);
    migrated++;
  }
  return { migrated, floorsCreated };
}

// A default 'Unassigned' location per project that has completions or BOQ
// items but no explicit location tree — the backfill target.
const UNASSIGNED_CODE = 'UNASSIGNED';

// Delegated to services/locationService so the migration, the quantities
// routes and the work-order flow all share one implementation.
const getOrCreateUnassignedLocation = locationService.getOrCreateUnassignedLocation;
const getOrCreateAllocation = locationService.getOrCreateAllocation;

async function createUnassignedLocations(query) {
  // One default home per project (idempotent: the lookup short-circuits).
  const projects = (await query('SELECT id FROM projects ORDER BY id')).rows;
  let created = 0;
  for (const p of projects) {
    await getOrCreateUnassignedLocation(query, p.id);
    created++;
  }
  return created;
}

// ---------------------------------------------------------------------------
// BOQ allocations + measurement backfill
// ---------------------------------------------------------------------------

// Every verified work_completion becomes an approved quantity_measurements
// row, stamped with the completion's location. Idempotent via the
// (source_type, source_id) lookup.
async function backfillMeasurementsFromCompletions(query) {
  // Join-free on purpose: per-row lookups keep this portable to the mock
  // executor and trivially idempotent.
  const completions = (await query(
    "SELECT id, work_order_id, boq_item_id, quantity_completed, completion_date, status, project_location_id, verified_by FROM work_completions WHERE status = 'verified' ORDER BY id"
  )).rows;
  let inserted = 0;
  for (const wc of completions) {
    const existing = (await query(
      "SELECT id FROM quantity_measurements WHERE source_type = 'work_completion' AND source_id = $1",
      [wc.id]
    )).rows;
    if (existing.length > 0) continue;

    const wo = (await query('SELECT project_id FROM work_orders WHERE id = $1', [wc.work_order_id])).rows[0] || {};
    const bi = (await query('SELECT unit FROM boq_items WHERE id = $1', [wc.boq_item_id])).rows[0] || {};
    const projectId = wo.project_id;
    if (projectId == null) continue;

    const locationId = wc.project_location_id
      || await getOrCreateUnassignedLocation(query, projectId);
    const alloc = await getOrCreateAllocation(query, wc.boq_item_id, locationId);

    await query(
      `INSERT INTO quantity_measurements
         (project_id, project_location_id, boq_item_id, boq_location_allocation_id,
          measured_date, quantity, unit, source_type, source_id, reviewed_by, approval_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'work_completion', $8, $9, 'approved')`,
      [projectId, locationId, wc.boq_item_id, alloc.id, wc.completion_date,
       wc.quantity_completed, bi.unit || null, wc.id, wc.verified_by || null]
    );
    await query(
      'UPDATE work_completions SET project_location_id = $1, boq_location_allocation_id = $2 WHERE id = $3',
      [locationId, alloc.id, wc.id]
    );
    inserted++;
  }
  return inserted;
}

// Backfill allocation rows per BOQ item: any item without an allocation gets
// one at the project's Unassigned location carrying the full planned quantity.
async function backfillAllocations(query) {
  const items = (await query('SELECT id, project_id, quantity, unit_rate FROM boq_items ORDER BY id')).rows;
  let created = 0;
  for (const item of items) {
    const existing = (await query(
      'SELECT id FROM boq_location_allocations WHERE boq_item_id = $1 LIMIT 1',
      [item.id]
    )).rows;
    if (existing.length > 0) continue;
    const locationId = await getOrCreateUnassignedLocation(query, item.project_id);
    await getOrCreateAllocation(query, item.id, locationId);
    created++;
  }
  return created;
}

// Stamp every completion's location (verified ones were stamped during the
// measurement backfill; the rest — pending/rejected — get Unassigned too).
async function backfillCompletions(query) {
  const rows = (await query(
    'SELECT id, work_order_id, boq_item_id FROM work_completions WHERE project_location_id IS NULL ORDER BY id'
  )).rows;
  let stamped = 0;
  for (const wc of rows) {
    const wo = (await query('SELECT project_id FROM work_orders WHERE id = $1', [wc.work_order_id])).rows[0] || {};
    if (wc.project_id == null && wo.project_id != null) wc.project_id = wo.project_id;
    if (wo.project_id == null) continue;
    const locationId = await getOrCreateUnassignedLocation(query, wo.project_id);
    const alloc = wc.boq_item_id != null
      ? await getOrCreateAllocation(query, wc.boq_item_id, locationId)
      : null;
    await query(
      'UPDATE work_completions SET project_location_id = $1, boq_location_allocation_id = $2 WHERE id = $3',
      [locationId, alloc ? alloc.id : null, wc.id]
    );
    stamped++;
  }
  return stamped;
}

// boq_items.completed_quantity ← derived from measurements (transition mirror).
async function recomputeCompletedQuantities(query) {
  const items = (await query('SELECT id FROM boq_items ORDER BY id')).rows;
  let synced = 0;
  for (const item of items) {
    // Sum computed in JS (portable across pg and the mock executor).
    const measurements = (await query(
      'SELECT quantity, approval_state FROM quantity_measurements WHERE boq_item_id = $1',
      [item.id]
    )).rows;
    const executed = measurements
      .filter((m) => m.approval_state === 'approved' || m.approval_state === 'certified')
      .reduce((s, m) => s + (parseFloat(m.quantity) || 0), 0);
    await query(
      'UPDATE boq_items SET completed_quantity = $1, updated_at = $2 WHERE id = $3',
      [executed, new Date(), item.id]
    );
    synced++;
  }
  return synced;
}

// NOT NULL only after the backfill verified complete (0 null rows).
async function verifyBackfill(query) {
  const r = await query('SELECT COUNT(*) AS c FROM work_completions WHERE project_location_id IS NULL');
  const nullRows = r.rows[0] ? Number(r.rows[0].c) : -1;
  return { ok: nullRows === 0, nullRows };
}

async function enforceNotNull(query) {
  const { ok, nullRows } = await verifyBackfill(query);
  if (!ok) {
    throw new Error(`work_completions backfill incomplete: ${nullRows} row(s) still without project_location_id`);
  }
  await query('ALTER TABLE work_completions ALTER COLUMN project_location_id SET NOT NULL');
  return true;
}

// The transition read surface: stored completed_quantity stays readable, but
// the view exposes the derived value straight from the source of truth.
async function createViews(query) {
  const views = [
    `CREATE OR REPLACE VIEW v_boq_item_progress AS
     SELECT bi.*,
       COALESCE(m.executed, 0) AS completed_quantity_derived,
       CASE WHEN bi.quantity > 0
            THEN LEAST(COALESCE(m.executed, 0) / bi.quantity * 100, 100)
            ELSE 0 END AS completion_percentage_derived
     FROM boq_items bi
     LEFT JOIN (
       SELECT boq_item_id, SUM(quantity) AS executed
       FROM quantity_measurements
       WHERE approval_state IN ('approved','certified')
       GROUP BY boq_item_id
     ) m ON m.boq_item_id = bi.id`,
    `CREATE OR REPLACE VIEW v_boq_allocation_progress AS
     SELECT a.*,
       COALESCE(m.executed, 0) AS executed_derived,
       COALESCE(m.consultant_approved, 0) AS consultant_approved_derived,
       COALESCE(m.certified, 0) AS certified_derived
     FROM boq_location_allocations a
     LEFT JOIN (
       SELECT boq_item_id, project_location_id,
              SUM(CASE WHEN approval_state IN ('approved','certified') THEN quantity ELSE 0 END) AS executed,
              SUM(CASE WHEN approval_state IN ('approved','certified') AND reviewed_by IS NOT NULL THEN quantity ELSE 0 END) AS consultant_approved,
              SUM(CASE WHEN approval_state = 'certified' THEN quantity ELSE 0 END) AS certified
       FROM quantity_measurements
       GROUP BY boq_item_id, project_location_id
     ) m ON m.boq_item_id = a.boq_item_id AND m.project_location_id = a.project_location_id`,
  ];
  for (const ddl of views) {
    // Views are a PostgreSQL-only read convenience; mock executors skip them.
    try {
      await query(ddl);
    } catch (e) {
      console.error(`[location-quantity-migration] view skipped: ${e.message}`);
    }
  }
  return true;
}

async function run(query, { enforceNotNull = false } = {}) {
  await ensureTables(query);
  const buildingsResult = await migrateBuildings(query);
  await createUnassignedLocations(query);
  await backfillAllocations(query);
  await backfillMeasurementsFromCompletions(query);
  await backfillCompletions(query);
  await recomputeCompletedQuantities(query);
  const verify = await verifyBackfill(query);
  let notNull = false;
  if (enforceNotNull && verify.ok) {
    await query('ALTER TABLE work_completions ALTER COLUMN project_location_id SET NOT NULL');
    notNull = true;
  }
  await createViews(query);
  return { buildings: buildingsResult, verify, notNull };
}

// Step 7 of the phase — only called by the real runner, after every reader
// moved to counting real project_locations floor rows (units.js GET counts
// rows, bulk-units takes floors/units_per_floor as request inputs, the
// frontend renders floor_count). Returns the names actually dropped.
async function dropLegacyBuildingColumns(query) {
  const dropped = [];
  for (const col of ['floors', 'units_per_floor']) {
    try {
      await query(`ALTER TABLE buildings DROP COLUMN IF EXISTS ${col}`);
      dropped.push(col);
    } catch (e) {
      console.error(`[location-quantity-migration] drop ${col} skipped: ${e.message}`);
    }
  }
  return dropped;
}

module.exports = {
  DDL,
  UNASSIGNED_CODE,
  ensureTables,
  migrateBuildings,
  createUnassignedLocations,
  getOrCreateUnassignedLocation,
  getOrCreateAllocation,
  backfillAllocations,
  backfillMeasurementsFromCompletions,
  backfillCompletions,
  recomputeCompletedQuantities,
  verifyBackfill,
  enforceNotNull,
  createViews,
  dropLegacyBuildingColumns,
  run,
};
