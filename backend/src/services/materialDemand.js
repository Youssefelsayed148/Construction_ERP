// Phase 9 — material demand engine (schedule-aware).
//
// Derived, never hand-edited: material_requirements rows are recomputed by
// this service from three inputs, so they can never drift from their sources.
//
// Formulas (implemented exactly, nothing invented):
//   Gross = Planned Activity Quantity * Recipe Factor
//   Net   = Gross * (1 + Wastage%) - Already Consumed
//
//   Planned Activity Quantity — a boq_location_allocations.planned_quantity
//     (Phase 8). When the Phase 22 schedule engine lands, the activity
//     quantity/date feeds the same path via the events below.
//   Recipe Factor / Wastage% — recipe_lines of the recipe that resolves for
//     the BOQ item (project-specific recipe overrides the standard, see
//     resolveRecipe precedence below).
//   Already Consumed — issued material on work orders: SUM(work_order_materials
//     .actual_quantity) for (project, material, boq_item). No issuance data → 0.
//
// Triggers:
//   * allocation planned_quantity changes → quantities routes call
//     recomputeAllocation directly AND fire 'allocation.quantity_changed'
//     (durable via event_log; catch-up re-runs it).
//   * schedule activity date changes → 'schedule.activity.changed' event
//     (Phase 22 will fire it; route already wired in eventDispatcher).

'use strict';

const { query: defaultQuery } = require('../config/database');
const { convertQuantity } = require('../utils/units');
const unitConversions = require('./unitConversions');

function toNum(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function round4(n) {
  return Math.round((toNum(n) + Number.EPSILON) * 10000) / 10000;
}

function parseJson(v) {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v || '[]'); } catch (e) { return []; }
}

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

function grossRequirement(plannedQuantity, factorPerUnit) {
  return round4(toNum(plannedQuantity) * toNum(factorPerUnit));
}

function netRequirement(gross, wastagePct, alreadyConsumed) {
  const withWastage = toNum(gross) * (1 + toNum(wastagePct) / 100);
  return round4(withWastage - toNum(alreadyConsumed));
}

// ---------------------------------------------------------------------------
// Recipe resolution — precedence: project+item > standard item >
// project+activity > standard activity. First active match wins.
// ---------------------------------------------------------------------------

async function resolveRecipe(q, { projectId, boqItemId, activityType } = {}) {
  const candidates = [];
  if (boqItemId != null) {
    if (projectId != null) {
      candidates.push(...(await q(
        'SELECT * FROM material_recipes WHERE boq_item_id = $1 AND project_id = $2 ORDER BY id',
        [boqItemId, projectId]
      )).rows);
    }
    candidates.push(...(await q(
      'SELECT * FROM material_recipes WHERE boq_item_id = $1 AND project_id IS NULL ORDER BY id',
      [boqItemId]
    )).rows);
  }
  if (activityType != null) {
    if (projectId != null) {
      candidates.push(...(await q(
        'SELECT * FROM material_recipes WHERE activity_type = $1 AND project_id = $2 AND boq_item_id IS NULL ORDER BY id',
        [activityType, projectId]
      )).rows);
    }
    candidates.push(...(await q(
      'SELECT * FROM material_recipes WHERE activity_type = $1 AND project_id IS NULL AND boq_item_id IS NULL ORDER BY id',
      [activityType]
    )).rows);
  }
  return candidates.find((r) => r.is_active !== false) || null;
}

// ---------------------------------------------------------------------------
// Already consumed — work-order material issues (best-effort: projects that
// predate work_order_materials contribute 0).
// ---------------------------------------------------------------------------

async function loadConsumed(q, { projectId, boqItemId, materialIds, allocationId = null, plannedQuantity = 0 } = {}) {
  const consumed = {};
  if (projectId == null || !Array.isArray(materialIds) || materialIds.length === 0) return consumed;
  let rows = [];
  try {
    rows = (await q(
      `SELECT wom.item_id, wom.actual_quantity, wom.boq_item_id
       FROM work_order_materials wom
       JOIN work_orders wo ON wo.id = wom.work_order_id
       WHERE wo.project_id = $1`,
      [projectId]
    )).rows;
  } catch (e) {
    return consumed; // no issuance data in this database
  }
  const ids = new Set(materialIds);
  for (const row of rows) {
    if (!ids.has(row.item_id)) continue;
    if (boqItemId != null && row.boq_item_id !== boqItemId) continue; // only consumption booked on this BOQ item
    consumed[row.item_id] = (consumed[row.item_id] || 0) + toNum(row.actual_quantity);
  }
  // Consumption records predate location-aware issues. Until an issue carries
  // an allocation/location, apportion the BOQ item's total consumption across
  // its allocations by planned quantity so it is deducted exactly once.
  if (allocationId != null && boqItemId != null) {
    const allocations = (await q(
      'SELECT id, planned_quantity FROM boq_location_allocations WHERE boq_item_id = $1',
      [boqItemId]
    )).rows;
    const totalPlanned = allocations.reduce((s, a) => s + toNum(a.planned_quantity), 0);
    const share = totalPlanned > 0 ? toNum(plannedQuantity) / totalPlanned : 0;
    for (const materialId of Object.keys(consumed)) {
      consumed[materialId] = round4(consumed[materialId] * share);
    }
  }
  return consumed;
}

// ---------------------------------------------------------------------------
// Recomputation (upsert — one row per allocation × recipe line)
// ---------------------------------------------------------------------------

async function recomputeAllocation(q, allocationId, opts = {}) {
  const alloc = (await q('SELECT * FROM boq_location_allocations WHERE id = $1', [allocationId])).rows[0];
  if (!alloc) return { recipe: null, rows: 0 };
  const item = (await q('SELECT * FROM boq_items WHERE id = $1', [alloc.boq_item_id])).rows[0];
  if (!item) return { recipe: null, rows: 0 };

  const recipe = await resolveRecipe(q, {
    projectId: item.project_id,
    boqItemId: item.id,
    // Explicit option wins (schedule event), else the allocation's own
    // activity type, else item-scoped recipes only.
    activityType: opts.activityType || alloc.activity_type || null,
  });
  if (!recipe) return { recipe: null, rows: 0 };

  const lines = (await q('SELECT * FROM recipe_lines WHERE recipe_id = $1 ORDER BY id', [recipe.id])).rows;
  if (lines.length === 0) return { recipe, rows: 0 };

  const consumed = await loadConsumed(q, {
    projectId: item.project_id,
    boqItemId: item.id,
    materialIds: lines.map((l) => l.material_id),
    allocationId: alloc.id,
    plannedQuantity: alloc.planned_quantity,
  });
  const activityDate = opts.activityDate || null;
  const now = new Date();

  let written = 0;
  for (const line of lines) {
    const material = (await q('SELECT * FROM item_master WHERE id = $1', [line.material_id])).rows[0];
    if (!material) throw new Error(`Recipe material #${line.material_id} not found`);
    const requirementUnit = material.base_unit || material.unit || line.unit || null;
    const gross = convertQuantity(
      grossRequirement(alloc.planned_quantity, line.factor_per_unit),
      line.unit || requirementUnit, requirementUnit, await unitConversions.conversionsFor(q, material.id)
    );
    const wastage = toNum(line.wastage_pct);
    const used = toNum(consumed[line.material_id]);
    const net = netRequirement(gross, wastage, used);

    const existing = (await q(
      'SELECT id FROM material_requirements WHERE source_type = $1 AND source_id = $2 AND recipe_line_id = $3',
      ['location_allocation', alloc.id, line.id]
    )).rows[0];

    if (existing) {
      await q(
        `UPDATE material_requirements
         SET project_id = $1, project_location_id = $2, boq_item_id = $3, work_package_id = $4,
             recipe_id = $5, material_id = $6, unit = $7, gross_requirement = $8, wastage_pct = $9,
             already_consumed = $10, net_requirement = $11, source_activity_date = $12, updated_at = $13
         WHERE id = $14`,
        [item.project_id, alloc.project_location_id ?? null, item.id, opts.workPackageId ?? null,
         recipe.id, line.material_id, requirementUnit, gross, wastage, used, net, activityDate, now,
         existing.id]
      );
    } else {
      await q(
        `INSERT INTO material_requirements
           (project_id, project_location_id, boq_item_id, work_package_id, recipe_id, recipe_line_id,
            material_id, unit, gross_requirement, wastage_pct, already_consumed, net_requirement,
            source_type, source_id, source_activity_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [item.project_id, alloc.project_location_id ?? null, item.id, opts.workPackageId ?? null,
         recipe.id, line.id, line.material_id, requirementUnit, gross, wastage, used, net,
         'location_allocation', alloc.id, activityDate, 'planned']
      );
    }
    written++;
  }
  return { recipe, rows: written };
}

// Every allocation of one BOQ item (used after a recipe edit).
async function recomputeBoqItem(q, boqItemId, opts = {}) {
  const allocs = (await q('SELECT * FROM boq_location_allocations WHERE boq_item_id = $1', [boqItemId])).rows;
  let rows = 0;
  let recipes = 0;
  for (const alloc of allocs) {
    const r = await recomputeAllocation(q, alloc.id, opts);
    if (r.recipe) { recipes++; rows += r.rows; }
  }
  return { boq_item_id: boqItemId, allocations: allocs.length, recipes, requirement_rows: rows };
}

// Whole project (used after a schedule date change or an activity-type-only
// recipe edit — Phase 22 will narrow this to the affected activities).
async function recomputeProject(q, projectId, opts = {}) {
  const items = (await q('SELECT * FROM boq_items WHERE project_id = $1', [projectId])).rows;
  let rows = 0;
  let recipes = 0;
  let allocations = 0;
  for (const item of items) {
    const r = await recomputeBoqItem(q, item.id, opts);
    recipes += r.recipes;
    allocations += r.allocations;
    rows += r.requirement_rows;
  }
  return { project_id: projectId, allocations, recipes, requirement_rows: rows };
}

// ---------------------------------------------------------------------------
// Event entry points (wired in eventDispatcher.js)
// ---------------------------------------------------------------------------

async function recomputeForAllocationEvent(q, evt, opts = {}) {
  if (!evt || evt.entityId == null) return { recipe: null, rows: 0 };
  return recomputeAllocation(q, evt.entityId, {
    activityDate: (evt.payload && evt.payload.activity_date) || null,
    ...opts,
  });
}

// Phase 22 forward-compat: payload { project_id, activity_date, activity_type }.
async function recomputeForScheduleEvent(q, evt, opts = {}) {
  const payload = (evt && evt.payload) || {};
  if (payload.project_id == null) return { project_id: null, requirement_rows: 0 };
  return recomputeProject(q, payload.project_id, {
    activityDate: payload.activity_date || null,
    activityType: payload.activity_type || null,
    ...opts,
  });
}

// Recipe edit: recompute the linked BOQ item's allocations when the recipe is
// item-scoped, else the whole project when the event carries one.
async function recomputeForRecipeEvent(q, evt, opts = {}) {
  const payload = (evt && evt.payload) || {};
  if (payload.boq_item_id != null) {
    return recomputeBoqItem(q, payload.boq_item_id, {
      activityDate: payload.activity_date || null,
      ...opts,
    });
  }
  if (payload.project_id != null) {
    return recomputeProject(q, payload.project_id, {
      activityDate: payload.activity_date || null,
      ...opts,
    });
  }
  return { requirement_rows: 0 };
}

module.exports = {
  toNum,
  round4,
  grossRequirement,
  netRequirement,
  convertQuantity,
  resolveRecipe,
  loadConsumed,
  recomputeAllocation,
  recomputeBoqItem,
  recomputeProject,
  recomputeForAllocationEvent,
  recomputeForScheduleEvent,
  recomputeForRecipeEvent,
  defaultQuery,
};
