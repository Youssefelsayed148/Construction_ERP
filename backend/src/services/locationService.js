// Phase 8 — shared location/allocation helpers.
//
// getOrCreateAllocation guarantees a boq_location_allocations row exists for
// every (BOQ item, location) pair a measurement or completion references,
// so roll-ups always have a home. getOrCreateUnassignedLocation provides the
// per-project default home for records without explicit location data.

'use strict';

const { query: defaultQuery } = require('../config/database');

async function getOrCreateUnassignedLocation(q, projectId) {
  // The code is project-unique; no type join needed for the lookup.
  const existing = await q(
    "SELECT id FROM project_locations WHERE project_id = $1 AND code = 'UNASSIGNED' LIMIT 1",
    [projectId]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const areaType = await q("SELECT id FROM location_types WHERE code = 'area'");
  let typeId = areaType.rows[0] ? areaType.rows[0].id : null;
  if (typeId == null) {
    // Guard: the Phase 3 seed may not have run on this database yet.
    await q("INSERT INTO location_types (code, name) VALUES ('area', 'Area') ON CONFLICT (code) DO NOTHING");
    typeId = (await q("SELECT id FROM location_types WHERE code = 'area'")).rows[0]?.id || null;
  }
  const r = await q(
    `INSERT INTO project_locations (project_id, parent_id, location_type_id, code, name, name_en, name_ar, sort_order)
     VALUES ($1, NULL, $2, 'UNASSIGNED', 'Unassigned', 'Unassigned', 'غير محدد', 9999) RETURNING id`,
    [projectId, typeId]
  );
  return r.rows[0].id;
}

async function getOrCreateAllocation(q, boqItemId, locationId) {
  const existing = await q(
    'SELECT * FROM boq_location_allocations WHERE boq_item_id = $1 AND project_location_id = $2',
    [boqItemId, locationId]
  );
  if (existing.rows[0]) return existing.rows[0];
  const item = (await q('SELECT quantity, unit_rate FROM boq_items WHERE id = $1', [boqItemId])).rows[0] || {};
  const r = await q(
    `INSERT INTO boq_location_allocations (boq_item_id, project_location_id, planned_quantity, unit_cost)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [boqItemId, locationId, item.quantity ?? 0, item.unit_rate ?? 0]
  );
  return r.rows[0];
}

module.exports = { getOrCreateUnassignedLocation, getOrCreateAllocation };
