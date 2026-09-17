// Phase 8 — quantity engine.
//
// Single source of truth for executed quantity: quantity_measurements rows.
// Summary values (allocation executed/certified, boq_items.completed_quantity)
// are never hand-edited — every mutation path inserts a measurement and then
// calls syncDerived() to rewrite the summaries FROM the measurements, so the
// summary can never drift from the source.
//
// Formulas (implemented exactly, nothing invented):
//   Remaining              = max(Planned - Executed, 0)
//   Physical Progress %    = Executed / Planned * 100
//   Approved Progress %    = Approved / Planned * 100
//   Certified Progress %   = Certified / Planned * 100
//   Weighted Project %     = sum(Weight_i * ApprovedProgress_i) / sum(Weight_i)
//   Weight_i policy: 'boq_value' (planned qty × unit rate) | 'planned_quantity'
//                    | 'manual' (item.manual_weight) | 'schedule'
//                    (item.schedule_weight)

'use strict';

const { query: defaultQuery } = require('../config/database');

// States that count toward executed quantity. 'certified' implies approved.
const EXECUTED_STATES = ['approved', 'certified'];
const CERTIFIED_STATES = ['certified'];

function toNum(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

function remainingQuantity(planned, executed) {
  return Math.max((toNum(planned) || 0) - (toNum(executed) || 0), 0);
}

function physicalProgress(executed, planned) {
  const p = toNum(planned);
  return p > 0 ? ((toNum(executed) || 0) / p) * 100 : 0;
}

function approvedProgress(approved, planned) {
  return physicalProgress(approved, planned);
}

function certifiedProgress(certified, planned) {
  return physicalProgress(certified, planned);
}

function weightFor(item, weightPolicy) {
  const planned = toNum(item.planned_quantity) || 0;
  const unitRate = toNum(item.unit_rate) || 0;
  switch (weightPolicy) {
    case 'planned_quantity': return planned;
    case 'manual': return toNum(item.manual_weight) || 0;
    case 'schedule': return toNum(item.schedule_weight) || planned;
    case 'boq_value':
    default: return planned * unitRate;
  }
}

function weightedProjectProgress(items, weightPolicy = 'boq_value') {
  if (!Array.isArray(items) || items.length === 0) return { progress: 0, total_weight: 0 };
  let weightedSum = 0;
  let totalWeight = 0;
  for (const item of items) {
    const w = toNum(weightFor(item, weightPolicy)) || 0;
    const ap = approvedProgress(item.approved_quantity, item.planned_quantity);
    weightedSum += w * ap;
    totalWeight += w;
  }
  if (totalWeight <= 0) return { progress: 0, total_weight: 0 };
  return { progress: weightedSum / totalWeight, total_weight: totalWeight };
}

// ---------------------------------------------------------------------------
// Measurement aggregation
// ---------------------------------------------------------------------------

function sumMeasurements(measurements) {
  let executed = 0;
  let consultantApproved = 0;
  let certified = 0;
  for (const m of measurements) {
    const state = m.approval_state;
    const qty = toNum(m.quantity) || 0;
    if (EXECUTED_STATES.includes(state)) {
      executed += qty;
      if (m.reviewed_by != null) consultantApproved += qty;
    }
    if (CERTIFIED_STATES.includes(state)) {
      certified += qty;
      if (!EXECUTED_STATES.includes(state)) executed += qty;
    }
  }
  return { executed, consultant_approved: consultantApproved, certified };
}

// Location-tree resolution: descendant-or-self ids for a node in a flat
// location list (JS walk — identical behavior in PostgreSQL, mock and tests).
function descendantLocationIds(locations, rootId) {
  const byParent = new Map();
  for (const loc of locations) {
    const pid = loc.parent_id == null ? null : loc.parent_id;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(loc.id);
  }
  const out = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (id == null) continue;
    out.push(id);
    const children = byParent.get(id) || [];
    for (const c of children) stack.push(c);
  }
  return out;
}

// Rollup of measurements for a location subtree: only measurements whose
// project_location_id is in the subtree. Floor, building and project rollups
// all funnel through this one path, so they reconcile by construction.
function rollupForLocation(measurements, locations, locationId) {
  const ids = new Set(descendantLocationIds(locations, locationId));
  const relevant = measurements.filter((m) => m.project_location_id != null && ids.has(m.project_location_id));
  const sums = sumMeasurements(relevant);
  return {
    executed: sums.executed,
    consultant_approved: sums.consultant_approved,
    certified: sums.certified,
    measurement_count: relevant.length,
    measurement_ids: relevant.map((m) => m.id).sort((a, b) => a - b),
  };
}

// Project rollup = every measurement of the project (locations argument
// restricts to the project's own locations — sub-tree of the project root —
// which by construction covers all measurements raised on the project).
function projectRollup(measurements) {
  return {
    ...sumMeasurements(measurements),
    measurement_count: measurements.length,
    measurement_ids: measurements.map((m) => m.id).sort((a, b) => a - b),
  };
}

// Acceptance: the floors of a building, the building(s) and the project must
// resolve to the exact same underlying quantity_measurements rows — the union
// of the floor-level measurement ids equals the building's equals the
// project's. No separate summary path exists to drift.
function reconcile(measurements, locations, { floorIds = [], buildingIds = [] }) {
  const unionIds = (rollups) => {
    const s = new Set();
    for (const r of rollups) for (const id of r.measurement_ids) s.add(id);
    return [...s].sort((a, b) => a - b);
  };
  const floor = unionIds(floorIds.map((id) => rollupForLocation(measurements, locations, id)));
  const building = unionIds(buildingIds.map((id) => rollupForLocation(measurements, locations, id)));
  const project = measurements.map((m) => m.id).sort((a, b) => a - b);
  const same = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);
  return {
    floor_measurement_ids: floor,
    building_measurement_ids: building,
    project_measurement_ids: project,
    reconciles: same(floor, building) && same(building, project),
  };
}

// ---------------------------------------------------------------------------
// Deriving summaries FROM measurements (the only writer of summary values)
// ---------------------------------------------------------------------------

// Recompute executed/consultant_approved/certified on boq_location_allocations
// rows from quantity_measurements. Returns the number of allocations synced.
async function syncAllocations(q, opts = {}) {
  const boqItemId = opts.boqItemId == null ? null : opts.boqItemId;
  let rows;
  if (boqItemId != null) {
    rows = (await q(
      'SELECT * FROM boq_location_allocations WHERE boq_item_id = $1',
      [boqItemId]
    )).rows;
  } else {
    rows = (await q('SELECT * FROM boq_location_allocations')).rows;
  }
  let synced = 0;
  for (const alloc of rows) {
    const ms = (await q(
      `SELECT quantity, approval_state, reviewed_by FROM quantity_measurements
       WHERE boq_item_id = $1 AND project_location_id = $2`,
      [alloc.boq_item_id, alloc.project_location_id]
    )).rows;
    const sums = sumMeasurements(ms);
    await q(
      `UPDATE boq_location_allocations
       SET executed_quantity = $1, consultant_approved_quantity = $2, certified_quantity = $3, updated_at = $4
       WHERE id = $5`,
      [sums.executed, sums.consultant_approved, sums.certified, new Date(), alloc.id]
    );
    synced++;
  }
  return synced;
}

// Recompute boq_items.completed_quantity from approved/certified measurements
// (transition source: the stored column mirrors the derived value exactly).
async function syncBoqItemCompletedQuantity(q, boqItemId) {
  // Sum computed in JS (portable across pg and the mock executor).
  const measurements = (await q(
    'SELECT quantity, approval_state FROM quantity_measurements WHERE boq_item_id = $1',
    [boqItemId]
  )).rows;
  const executed = measurements
    .filter((m) => m.approval_state === 'approved' || m.approval_state === 'certified')
    .reduce((s, m) => s + (toNum(m.quantity) || 0), 0);
  await q(
    'UPDATE boq_items SET completed_quantity = $1, updated_at = $2 WHERE id = $3',
    [executed, new Date(), boqItemId]
  );
  return executed;
}

// ---------------------------------------------------------------------------
// Rollups over the live DB (fetch measurements/locations, compute in JS)
// ---------------------------------------------------------------------------

function whereClause(conds) {
  return conds.length ? ' WHERE ' + conds.join(' AND ') : '';
}

async function loadMeasurements(q, { projectId, locationId, boqItemId } = {}) {
  const conds = [];
  const p = [];
  let i = 1;
  if (projectId != null) { conds.push('project_id = $' + (i++)); p.push(projectId); }
  if (locationId != null) { conds.push('project_location_id = $' + (i++)); p.push(locationId); }
  if (boqItemId != null) { conds.push('boq_item_id = $' + (i++)); p.push(boqItemId); }
  return (await q(`SELECT * FROM quantity_measurements${whereClause(conds)}`, p)).rows;
}

async function loadLocations(q, projectId) {
  return (await q(
    'SELECT * FROM project_locations WHERE project_id = $1 ORDER BY sort_order, id',
    [projectId]
  )).rows;
}

async function projectProgress(q, projectId, weightPolicy = 'boq_value') {
  const measurements = await loadMeasurements(q, { projectId });
  const items = (await q(
    'SELECT id, code, description, unit, quantity, unit_rate, type, completed_quantity FROM boq_items WHERE project_id = $1',
    [projectId]
  )).rows;

  // Per-item approved/executed from measurements.
  const perItem = items.map((item) => {
    const mine = measurements.filter((m) => m.boq_item_id === item.id);
    const sums = sumMeasurements(mine);
    return {
      boq_item_id: item.id,
      code: item.code,
      unit: item.unit,
      planned_quantity: item.quantity,
      executed_quantity: sums.executed,
      approved_quantity: sums.consultant_approved,
      certified_quantity: sums.certified,
      manual_weight: item.manual_weight,
      unit_rate: item.unit_rate,
    };
  });

  const { progress, total_weight } = weightedProjectProgress(perItem, weightPolicy);
  const totals = perItem.reduce((acc, r) => {
    acc.planned += toNum(r.planned_quantity) || 0;
    acc.executed += r.executed_quantity;
    acc.approved += r.approved_quantity;
    acc.certified += r.certified_quantity;
    return acc;
  }, { planned: 0, executed: 0, approved: 0, certified: 0 });

  return {
    weight_policy: weightPolicy,
    progress,
    total_weight,
    totals: {
      planned_quantity: totals.planned,
      executed_quantity: totals.executed,
      remaining_quantity: remainingQuantity(totals.planned, totals.executed),
      physical_progress: physicalProgress(totals.executed, totals.planned),
      approved_progress: approvedProgress(totals.approved, totals.planned),
      certified_progress: certifiedProgress(totals.certified, totals.planned),
    },
    items: perItem,
  };
}

// Rollup for a location subtree (floor, building, ...) from live tables.
async function locationProgress(q, locationId) {
  const loc = (await q('SELECT * FROM project_locations WHERE id = $1', [locationId])).rows[0];
  if (!loc) return null;
  const locations = (await q(
    'SELECT * FROM project_locations WHERE project_id = $1 ORDER BY sort_order, id',
    [loc.project_id]
  )).rows;
  const projectId = loc.project_id;
  const measurements = await loadMeasurements(q, { projectId });

  // Planned from allocations in the subtree.
  const allocs = (await q('SELECT * FROM boq_location_allocations')).rows;
  const ids = new Set(descendantLocationIds(locations, locationId));
  const subtreeAllocs = allocs.filter((a) => ids.has(a.project_location_id));
  const planned = subtreeAllocs.reduce((s, a) => s + (toNum(a.planned_quantity) || 0), 0);
  const approvedDesign = subtreeAllocs.reduce((s, a) => s + (toNum(a.approved_design_quantity) || 0), 0);

  const rollup = rollupForLocation(measurements, locations, locationId);
  return {
    location: loc,
    planned_quantity: planned,
    approved_design_quantity: approvedDesign,
    executed_quantity: rollup.executed,
    consultant_approved_quantity: rollup.consultant_approved,
    certified_quantity: rollup.certified,
    remaining_quantity: remainingQuantity(planned, rollup.executed),
    physical_progress: physicalProgress(rollup.executed, planned),
    approved_progress: approvedProgress(rollup.consultant_approved, planned),
    certified_progress: certifiedProgress(rollup.certified, planned),
    measurement_count: rollup.measurement_count,
  };
}

module.exports = {
  EXECUTED_STATES,
  CERTIFIED_STATES,
  toNum,
  remainingQuantity,
  physicalProgress,
  approvedProgress,
  certifiedProgress,
  weightFor,
  weightedProjectProgress,
  sumMeasurements,
  descendantLocationIds,
  rollupForLocation,
  projectRollup,
  reconcile,
  loadMeasurements,
  whereClause,
  syncAllocations,
  syncBoqItemCompletedQuantity,
  projectProgress,
  locationProgress,
};
