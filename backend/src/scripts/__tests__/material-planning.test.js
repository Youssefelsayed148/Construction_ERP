// Phase 9 tests — material recipes + schedule-aware demand.
//
// Coverage:
//   - migration: item_master planning columns (additive); material_recipes /
//     recipe_lines / material_requirements; the standard reinforced-concrete
//     seed (per 1 m3: 1.00 m3 C35, 125 kg rebar, 1.5 kg binding wire, 3.8 m2
//     formwork, 10 spacers) and its idempotency
//   - materialDemand formulas: Gross = Planned × Factor;
//     Net = Gross × (1 + Wastage%) − Already Consumed
//   - recipe resolution precedence (project override beats standard)
//   - the acceptance test: allocating a 100 m3 concrete pour to a floor with
//     the linked standard recipe produces the correct material_requirements
//     rows, including wastage, minus real issued consumption
//   - recalculation triggers: allocation planned_quantity change (direct +
//     event route) and schedule activity date change (event route)

const { MockDb } = require('../test-helpers/mock-db');
const migration = require('../material-planning-migration');
const demand = require('../../services/materialDemand');
const { dispatchEvent } = require('../../services/eventDispatcher');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

async function rowsOf(table, where = '') {
  return (await q(`SELECT * FROM ${table}${where}`)).rows;
}

async function buildFixture() {
  // Phase 3-era shapes — the migration must add everything it needs.
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS item_master (
    id SERIAL PRIMARY KEY, code VARCHAR(50) UNIQUE NOT NULL, category VARCHAR(100),
    sub_category VARCHAR(100), unit VARCHAR(50) DEFAULT 'piece',
    name_en VARCHAR(255), name_ar VARCHAR(255), description TEXT, is_active BOOLEAN DEFAULT true)`);
  await q(`CREATE TABLE IF NOT EXISTS boq_items (
    id SERIAL PRIMARY KEY, project_id INTEGER, section_id INTEGER, code VARCHAR(50),
    description VARCHAR(500), unit VARCHAR(50) DEFAULT 'm3', quantity DECIMAL(15,3) DEFAULT 0,
    unit_rate DECIMAL(15,2) DEFAULT 0, type VARCHAR(50) DEFAULT 'material',
    completed_quantity DECIMAL(15,3) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS project_locations (
    id SERIAL PRIMARY KEY, project_id INTEGER, parent_id INTEGER, code VARCHAR(50), name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS boq_location_allocations (
    id SERIAL PRIMARY KEY, boq_item_id INTEGER, project_location_id INTEGER,
    planned_quantity DECIMAL(15,3) DEFAULT 0, executed_quantity DECIMAL(15,3) DEFAULT 0,
    unit_cost DECIMAL(15,2) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS work_orders (id SERIAL PRIMARY KEY, project_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS work_order_materials (
    id SERIAL PRIMARY KEY, work_order_id INTEGER, item_id INTEGER, boq_item_id INTEGER,
    planned_quantity DECIMAL(15,3) DEFAULT 0, actual_quantity DECIMAL(15,3) DEFAULT 0,
    unit_cost DECIMAL(15,2) DEFAULT 0, total_cost DECIMAL(15,2) DEFAULT 0)`);

  await q('INSERT INTO projects (id, name) VALUES ($1, $2)', [1, 'Tower A']);
  await q('INSERT INTO item_master (id, code, category, unit, name_en, name_ar, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [50, 'MAT-0001', 'raw_material', 'm3', 'Structural Concrete', 'خرسانة إنشائية', true]);
  await q('INSERT INTO work_orders (id, project_id) VALUES ($1, $2)', [10, 1]);
}

beforeAll(async () => {
  await buildFixture();
  await migration.ensurePlanningColumns(q);
  await migration.ensureTables(q);
  await migration.seedStandardRecipes(q);
});

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

describe('migration', () => {
  test('adds every planning column to item_master, nothing dropped', async () => {
    const cols = db.table('item_master').columns;
    for (const [name] of migration.ITEM_PLANNING_COLUMNS) {
      expect(cols.has(name)).toBe(true);
    }
    expect(cols.has('code')).toBe(true); // pre-existing untouched
  });

  test('creates material_recipes, recipe_lines, material_requirements', () => {
    expect(db.table('material_recipes').columns.has('activity_type')).toBe(true);
    expect(db.table('material_recipes').columns.has('boq_item_id')).toBe(true);
    expect(db.table('recipe_lines').columns.has('factor_per_unit')).toBe(true);
    expect(db.table('recipe_lines').columns.has('wastage_pct')).toBe(true);
    expect(db.table('material_requirements').columns.has('gross_requirement')).toBe(true);
    expect(db.table('material_requirements').columns.has('net_requirement')).toBe(true);
    expect(db.table('material_requirements').columns.has('source_activity_date')).toBe(true);
  });

  test('standard example recipe seeded: per 1 m3 reinforced concrete — 1.00 m3 C35, 125 kg rebar, 1.5 kg binding wire, 3.8 m2 formwork, 10 spacers', async () => {
    const recipe = (await q('SELECT * FROM material_recipes WHERE code = $1', ['STD-REINF-CONC'])).rows[0];
    expect(recipe).toBeTruthy();
    expect(recipe.activity_type).toBe('concrete_pour');
    expect(recipe.output_unit).toBe('m3');
    // Standard = not bound to a project or a single BOQ item.
    expect(recipe.project_id == null).toBe(true);
    expect(recipe.boq_item_id == null).toBe(true);

    const lines = await rowsOfRecipe(recipe.id);
    expect(lines.length).toBe(5);
    const byCode = {};
    for (const l of lines) byCode[l.material_code] = l;
    expect(num(byCode['RM-CONC-C35'].factor_per_unit)).toBe(1.0);
    expect(byCode['RM-CONC-C35'].unit).toBe('m3');
    expect(num(byCode['RM-REBAR'].factor_per_unit)).toBe(125);
    expect(byCode['RM-REBAR'].unit).toBe('kg');
    expect(num(byCode['RM-BIND-WIRE'].factor_per_unit)).toBe(1.5);
    expect(byCode['RM-BIND-WIRE'].unit).toBe('kg');
    expect(num(byCode['RM-FORMWORK'].factor_per_unit)).toBe(3.8);
    expect(byCode['RM-FORMWORK'].unit).toBe('m2');
    expect(num(byCode['RM-SPACER'].factor_per_unit)).toBe(10);
    expect(byCode['RM-SPACER'].unit).toBe('piece');
    // Wastage is part of every line and editable.
    expect(num(byCode['RM-CONC-C35'].wastage_pct)).toBe(2);
    expect(num(byCode['RM-REBAR'].wastage_pct)).toBe(3);
  });

  test('seed is idempotent — re-run adds nothing', async () => {
    const before = (await rowsOfRecipeLines()).length;
    const again = await migration.seedStandardRecipes(q);
    expect(again.lines).toBe(0);
    const after = (await rowsOfRecipeLines()).length;
    expect(after).toBe(before);
    expect(await rowsOfStandardRecipes()).toHaveLength(1);
  });
});

async function rowsOfRecipe(recipeId) {
  return (await q(
    `SELECT rl.id, rl.recipe_id, rl.material_id, rl.factor_per_unit, rl.wastage_pct, rl.unit,
            im.code AS material_code
     FROM recipe_lines rl
     JOIN item_master im ON im.id = rl.material_id
     WHERE rl.recipe_id = $1 ORDER BY rl.id`, [recipeId]
  )).rows;
}
async function rowsOfRecipeLines() {
  return (await q(
    `SELECT rl.id, rl.recipe_id, rl.material_id, rl.factor_per_unit, rl.wastage_pct, rl.unit
     FROM recipe_lines rl ORDER BY rl.id`
  )).rows;
}
async function rowsOfStandardRecipes() {
  return (await q('SELECT r.* FROM material_recipes r WHERE r.code = $1', ['STD-REINF-CONC'])).rows;
}
function num(v) { return parseFloat(v); }

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

describe('materialDemand formulas', () => {
  test('Gross = Planned Activity Quantity * Recipe Factor', () => {
    expect(demand.grossRequirement(100, 1.0)).toBe(100);
    expect(demand.grossRequirement(100, 125)).toBe(12500);
    expect(demand.grossRequirement(100, 1.5)).toBe(150);
    expect(demand.grossRequirement(0, 125)).toBe(0);
  });

  test('Net = Gross * (1 + Wastage%) - Already Consumed', () => {
    expect(demand.netRequirement(100, 2, 0)).toBe(102);
    expect(demand.netRequirement(12500, 3, 875)).toBe(12000);
    expect(demand.netRequirement(150, 5, 12)).toBe(145.5);
    expect(demand.netRequirement(100, 0, 40)).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Recipe resolution precedence
// ---------------------------------------------------------------------------

describe('recipe resolution', () => {
  // The override lives on BOQ item 600 so it cannot interfere with the
  // standard-recipe acceptance fixture on item 500 below.
  test('a project-scoped recipe on the BOQ item overrides the standard', async () => {
    const item = (await q('SELECT * FROM item_master WHERE code = $1', ['RM-CONC-C35'])).rows[0];
    await q(
      `INSERT INTO material_recipes (project_id, boq_item_id, activity_type, code, name, output_unit, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [1, 600, 'concrete_pour', 'PROJ1-RC', 'Tower A high-durability concrete', 'm3', true]
    );
    await q(
      `INSERT INTO recipe_lines (recipe_id, material_id, factor_per_unit, wastage_pct, unit)
       VALUES ($1,$2,$3,$4,$5)`,
      [overrideRecipeId(), item.id, 1.05, 4, 'm3']
    );

    const resolved = await demand.resolveRecipe(q, { projectId: 1, boqItemId: 600, activityType: 'concrete_pour' });
    expect(resolved.id).toBe(overrideRecipeId());
    expect(resolved.code).toBe('PROJ1-RC');
  });

  test('the standard recipe wins for items without a project override', async () => {
    const resolved = await demand.resolveRecipe(q, { projectId: 1, boqItemId: 500, activityType: 'concrete_pour' });
    expect(resolved.code).toBe('STD-REINF-CONC');
  });

  test('a project override never leaks into another project', async () => {
    const resolved = await demand.resolveRecipe(q, { projectId: 2, boqItemId: 600, activityType: 'concrete_pour' });
    expect(resolved.code).toBe('STD-REINF-CONC');
  });

  test('no candidates → null', async () => {
    const resolved = await demand.resolveRecipe(q, { projectId: 1, boqItemId: 700, activityType: 'blockwork' });
    expect(resolved).toBe(null);
  });
});

function overrideRecipeId() {
  return db.table('material_recipes').rows.find((r) => r.code === 'PROJ1-RC').id;
}

// ---------------------------------------------------------------------------
// Acceptance — concrete pour on a floor produces correct demand rows
// ---------------------------------------------------------------------------

describe('recomputeAllocation (acceptance)', () => {
  const FLOOR_ID = 1000; const ALLOC_ID = 900; const BOQ_ID = 500;

  beforeAll(async () => {
    await q(`INSERT INTO boq_items (id, project_id, code, description, unit, quantity, unit_rate)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [BOQ_ID, 1, 'C-01', 'Reinforced concrete slab pour', 'm3', 500, 350]);
    await q(`INSERT INTO project_locations (id, project_id, code, name) VALUES ($1,$2,$3,$4)`,
      [FLOOR_ID, 1, 'F-05', 'Floor 5']);
    await q(`INSERT INTO boq_location_allocations (id, boq_item_id, project_location_id, planned_quantity, activity_type)
             VALUES ($1,$2,$3,$4,$5)`, [ALLOC_ID, BOQ_ID, FLOOR_ID, 100, 'concrete_pour']);
  });

  test('100 m3 pour + standard recipe → five requirement rows with wastage and the activity date', async () => {
    const r = await demand.recomputeAllocation(q, ALLOC_ID, { activityDate: '2026-09-25' });
    expect(r.recipe.code).toBe('STD-REINF-CONC');
    expect(r.rows).toBe(5);

    const rows = await rowsOfRequirements();
    expect(rows.length).toBe(5);
    const byCode = {};
    for (const row of rows) byCode[row.material_code] = row;

    // Gross = Planned × Factor; Net = Gross × (1 + Wastage%) − Consumed (0).
    expect(num(byCode['RM-CONC-C35'].gross_requirement)).toBe(100);
    expect(num(byCode['RM-CONC-C35'].net_requirement)).toBe(102); // +2% wastage
    expect(num(byCode['RM-REBAR'].gross_requirement)).toBe(12.5);
    expect(num(byCode['RM-REBAR'].net_requirement)).toBe(12.875); // +3%, stored in tonnes
    expect(num(byCode['RM-BIND-WIRE'].gross_requirement)).toBe(150);
    expect(num(byCode['RM-BIND-WIRE'].net_requirement)).toBe(157.5); // +5%
    expect(num(byCode['RM-FORMWORK'].gross_requirement)).toBe(380);
    expect(num(byCode['RM-FORMWORK'].net_requirement)).toBe(410.4); // +8%
    expect(num(byCode['RM-SPACER'].gross_requirement)).toBe(1000);
    expect(num(byCode['RM-SPACER'].net_requirement)).toBe(1010); // +1%

    for (const row of rows) {
      expect(row.source_type).toBe('location_allocation');
      expect(row.source_id).toBe(ALLOC_ID);
      expect(row.source_activity_date).toBe('2026-09-25');
      expect(row.project_location_id).toBe(FLOOR_ID);
      expect(row.boq_item_id).toBe(BOQ_ID);
      expect(row.project_id).toBe(1);
    }
  });

  test('issued consumption on the BOQ item is subtracted (already consumed)', async () => {
    const rebar = (await q('SELECT * FROM item_master WHERE code = $1', ['RM-REBAR'])).rows[0];
    await q(`INSERT INTO work_order_materials (work_order_id, item_id, boq_item_id, actual_quantity)
             VALUES ($1,$2,$3,$4)`, [10, rebar.id, BOQ_ID, 0.875]);

    await demand.recomputeAllocation(q, ALLOC_ID, { activityDate: '2026-09-25' });
    const byCode = await requirementByCode();
    // 12500 × 1.03 = 12875 − 875 issued = 12000
    expect(num(byCode['RM-REBAR'].already_consumed)).toBe(0.875);
    expect(num(byCode['RM-REBAR'].net_requirement)).toBe(12);
    // Other rows untouched by the rebar issue.
    expect(num(byCode['RM-CONC-C35'].net_requirement)).toBe(102);
  });

  test('consumption booked on another BOQ item is NOT subtracted', async () => {
    const wire = (await q('SELECT * FROM item_master WHERE code = $1', ['RM-BIND-WIRE'])).rows[0];
    await q(`INSERT INTO work_order_materials (work_order_id, item_id, boq_item_id, actual_quantity)
             VALUES ($1,$2,$3,$4)`, [10, wire.id, 999, 50]);
    await demand.recomputeAllocation(q, ALLOC_ID, { activityDate: '2026-09-25' });
    const byCode = await requirementByCode();
    expect(num(byCode['RM-BIND-WIRE'].already_consumed)).toBe(0);
    expect(num(byCode['RM-BIND-WIRE'].net_requirement)).toBe(157.5);
  });

  test('planned quantity change recalculates in place — no duplicate rows', async () => {
    const before = (await rowsOfRequirements()).length;
    await q('UPDATE boq_location_allocations SET planned_quantity = $1 WHERE id = $2', [120, ALLOC_ID]);
    const r = await demand.recomputeAllocation(q, ALLOC_ID, { activityDate: '2026-09-25' });
    expect(r.rows).toBe(5);
    expect((await rowsOfRequirements()).length).toBe(before); // upserted, not appended

    const byCode = await requirementByCode();
    expect(num(byCode['RM-CONC-C35'].gross_requirement)).toBe(120);
    expect(num(byCode['RM-CONC-C35'].net_requirement)).toBeCloseTo(122.4);
    expect(num(byCode['RM-REBAR'].gross_requirement)).toBe(15);
    // 15000 × 1.03 − 875 consumed = 14575
    expect(num(byCode['RM-REBAR'].net_requirement)).toBe(14.575);
  });

  test('allocation without any matching recipe produces no rows', async () => {
    await q(`INSERT INTO boq_location_allocations (id, boq_item_id, project_location_id, planned_quantity, activity_type)
             VALUES ($1,$2,$3,$4,$5)`, [901, 700, FLOOR_ID, 10, 'blockwork']);
    const r = await demand.recomputeAllocation(q, 901, {});
    expect(r.recipe).toBe(null);
    expect(r.rows).toBe(0);
  });
});

async function rowsOfRequirements() {
  return (await q(
    `SELECT mr.id, mr.project_id, mr.project_location_id, mr.boq_item_id, mr.material_id,
            mr.gross_requirement, mr.wastage_pct, mr.already_consumed, mr.net_requirement,
            mr.source_type, mr.source_id, mr.source_activity_date,
            im.code AS material_code
     FROM material_requirements mr
     JOIN item_master im ON im.id = mr.material_id ORDER BY mr.id`
  )).rows;
}
async function requirementByCode() {
  const out = {};
  for (const row of await rowsOfRequirements()) out[row.material_code] = row;
  return out;
}

// ---------------------------------------------------------------------------
// Event-driven triggers
// ---------------------------------------------------------------------------

describe('event-driven recalculation', () => {
  test("route 'schedule.activity.changed' recomputes the project's demand and stamps the activity date", async () => {
    const r = await dispatchEvent('schedule.activity.changed', {
      eventType: 'schedule.activity.changed', entityType: 'schedule_activity', entityId: 7,
      payload: { project_id: 1, activity_date: '2026-10-01', activity_type: 'concrete_pour' },
    }, { query: q });
    expect(r.handled).toBe(true);

    const rows = await rowsOfRequirements();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.source_activity_date).toBe('2026-10-01');
      expect(num(row.gross_requirement)).toBeGreaterThan(0);
    }
  });

  test("route 'allocation.quantity_changed' recomputes just that allocation", async () => {
    const r = await dispatchEvent('allocation.quantity_changed', {
      eventType: 'allocation.quantity_changed', entityType: 'boq_location_allocation', entityId: 900,
      payload: { activity_date: '2026-09-25' },
    }, { query: q });
    expect(r.handled).toBe(true);
    const byCode = await requirementByCode();
    expect(num(byCode['RM-SPACER'].gross_requirement)).toBe(1200); // planned 120 × 10
  });

  test("route 'recipe.changed' re-derives demand for the linked BOQ item", async () => {
    await q(`UPDATE boq_location_allocations SET planned_quantity = $1 WHERE id = $2`, [100, 900]);
    const recipeId = overrideRecipeId();
    const r = await dispatchEvent('recipe.changed', {
      eventType: 'recipe.changed', entityType: 'material_recipe', entityId: recipeId,
      payload: { recipe_id: recipeId, project_id: 1, boq_item_id: 500 },
    }, { query: q });
    expect(r.handled).toBe(true);
    const byCode = await requirementByCode();
    expect(num(byCode['RM-CONC-C35'].gross_requirement)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// setupDb invariant — fresh installs get the planning columns too
// ---------------------------------------------------------------------------

describe('setupDb.js item_master', () => {
  const fs = require('fs');
  const path = require('path');
  test('CREATE TABLE carries the planning fields', () => {
    const content = fs.readFileSync(
      require('path').join(__dirname, '..', 'setupDb.js'), 'utf8'
    );
    expect(content).toMatch(/reorder_policy VARCHAR\(30\) DEFAULT 'none'/);
    expect(content).toMatch(/batch_lot_tracking BOOLEAN DEFAULT false/);
    expect(content).toMatch(/inspection_required BOOLEAN DEFAULT false/);
    expect(content).toMatch(/supplier_lead_time_days INTEGER/);
    expect(content).toMatch(/unit_conversions JSONB DEFAULT '\[\]'/);
    expect(content).toMatch(/preferred_supplier_ids JSONB DEFAULT '\[\]'/);
  });
});
