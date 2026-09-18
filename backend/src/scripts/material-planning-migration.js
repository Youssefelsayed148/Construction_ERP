// Phase 9 migration core — material planning: item_master planning columns,
// material_recipes / recipe_lines / material_requirements, and the standard
// reinforced-concrete recipe seed.
//
// Steps (all idempotent):
//   ensurePlanningColumns — additive item_master columns: base/purchase/issue
//                           unit, unit conversions, preferred suppliers,
//                           min/max/safety stock, supplier lead time, reorder
//                           policy + reorder point, order multiple/MOQ, shelf
//                           life, batch/lot tracking, inspection required
//   ensureTables          — material_recipes, recipe_lines, material_requirements
//   seedStandardRecipes   — the standard example: per 1 m3 reinforced concrete —
//                           1.00 m3 C35 concrete, 125 kg rebar, 1.5 kg binding
//                           wire, 3.8 m2 formwork, 10 spacers. Standard recipes
//                           have project_id NULL; every factor is editable by
//                           creating a project-scoped recipe that overrides it.

'use strict';

// ---------------------------------------------------------------------------
// item_master planning columns (additive — nothing existing is altered)
// ---------------------------------------------------------------------------

const ITEM_PLANNING_COLUMNS = [
  ['base_unit', "VARCHAR(50)"],
  ['purchase_unit', "VARCHAR(50)"],
  ['issue_unit', "VARCHAR(50)"],
  ['unit_conversions', "JSONB DEFAULT '[]'"],
  ['preferred_supplier_ids', "JSONB DEFAULT '[]'"],
  ['min_stock', 'DECIMAL(15,3) DEFAULT 0'],
  ['max_stock', 'DECIMAL(15,3) DEFAULT 0'],
  ['safety_stock', 'DECIMAL(15,3) DEFAULT 0'],
  ['supplier_lead_time_days', 'INTEGER DEFAULT 0'],
  ['reorder_policy', "VARCHAR(30) DEFAULT 'none'"],
  ['reorder_point', 'DECIMAL(15,3) DEFAULT 0'],
  ['order_multiple', 'DECIMAL(15,3) DEFAULT 0'],
  ['moq', 'DECIMAL(15,3) DEFAULT 0'],
  ['shelf_life_days', 'INTEGER'],
  ['batch_lot_tracking', 'BOOLEAN DEFAULT false'],
  ['inspection_required', 'BOOLEAN DEFAULT false'],
];

async function ensurePlanningColumns(query) {
  for (const [col, def] of ITEM_PLANNING_COLUMNS) {
    await query(`ALTER TABLE item_master ADD COLUMN IF NOT EXISTS ${col} ${def}`);
  }
  // Phase 9: an allocation can carry the activity type it plans (e.g.
  // 'concrete_pour') so activity-type recipes resolve without the Phase 22
  // schedule engine. Additive.
  await query('ALTER TABLE boq_location_allocations ADD COLUMN IF NOT EXISTS activity_type VARCHAR(50)');
  return ITEM_PLANNING_COLUMNS.length;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const DDL = [
  // Recipes: the standard template lives at project_id NULL. A project can
  // attach its own recipe to a boq_item_id (or activity_type) that overrides
  // the standard — resolution precedence lives in materialDemand.resolveRecipe.
  `CREATE TABLE IF NOT EXISTS material_recipes (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    boq_item_id INTEGER REFERENCES boq_items(id) ON DELETE CASCADE,
    activity_type VARCHAR(100),
    code VARCHAR(50) UNIQUE,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    name_ar VARCHAR(255),
    output_description VARCHAR(500),
    output_unit VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_material_recipes_project ON material_recipes(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_material_recipes_boq_item ON material_recipes(boq_item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_material_recipes_activity ON material_recipes(activity_type)`,
  // Lines: per 1 unit of the recipe output (e.g. per 1 m3 of concrete).
  `CREATE TABLE IF NOT EXISTS recipe_lines (
    id SERIAL PRIMARY KEY,
    recipe_id INTEGER NOT NULL REFERENCES material_recipes(id) ON DELETE CASCADE,
    material_id INTEGER NOT NULL REFERENCES item_master(id) ON DELETE CASCADE,
    factor_per_unit DECIMAL(15,6) NOT NULL CHECK (factor_per_unit >= 0),
    wastage_pct DECIMAL(5,3) DEFAULT 0,
    unit VARCHAR(50),
    notes VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(recipe_id, material_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_recipe_lines_recipe ON recipe_lines(recipe_id)`,
  `CREATE INDEX IF NOT EXISTS idx_recipe_lines_material ON recipe_lines(material_id)`,
  // Demand: one row per (allocation, recipe line). Recomputation upserts in
  // place — gross/net are derived values, never hand-edited.
  `CREATE TABLE IF NOT EXISTS material_requirements (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_location_id INTEGER REFERENCES project_locations(id) ON DELETE CASCADE,
    boq_item_id INTEGER REFERENCES boq_items(id) ON DELETE SET NULL,
    work_package_id INTEGER,
    recipe_id INTEGER REFERENCES material_recipes(id) ON DELETE SET NULL,
    recipe_line_id INTEGER REFERENCES recipe_lines(id) ON DELETE CASCADE,
    material_id INTEGER NOT NULL REFERENCES item_master(id) ON DELETE CASCADE,
    unit VARCHAR(50),
    gross_requirement DECIMAL(18,4) DEFAULT 0,
    wastage_pct DECIMAL(5,3) DEFAULT 0,
    already_consumed DECIMAL(18,4) DEFAULT 0,
    net_requirement DECIMAL(18,4) DEFAULT 0,
    source_type VARCHAR(50) DEFAULT 'location_allocation',
    source_id INTEGER,
    source_activity_date DATE,
    status VARCHAR(30) DEFAULT 'planned',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_material_requirements_project ON material_requirements(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_material_requirements_location ON material_requirements(project_location_id)`,
  `CREATE INDEX IF NOT EXISTS idx_material_requirements_material ON material_requirements(material_id)`,
  `CREATE INDEX IF NOT EXISTS idx_material_requirements_source ON material_requirements(source_type, source_id)`,
];

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

// ---------------------------------------------------------------------------
// Standard recipe seed — the Phase 9 example, exactly as specified
// ---------------------------------------------------------------------------

const STANDARD_ITEMS = [
  // [code, category, sub_category, unit, name_en, name_ar]
  ['RM-CONC-C35', 'raw_material', 'concrete_premix', 'm3', 'Ready-Mix Concrete C35', 'خرسانة جاهزة C35'],
  ['RM-REBAR', 'raw_material', 'steel', 'ton', 'Reinforcing Steel (Rebar)', 'حديد تسليح'],
  ['RM-BIND-WIRE', 'consumable', 'fastener', 'kg', 'Binding Wire', 'سلك ربط'],
  ['RM-FORMWORK', 'consumable', 'wood', 'm2', 'Formwork Panels', 'شدة خشبية'],
  ['RM-SPACER', 'consumable', 'fastener', 'piece', 'Concrete Spacers', 'عاكسات خرسانة'],
];

// Per 1 m3 of reinforced concrete (factors editable per project via a
// project-scoped recipe override).
const STANDARD_LINES = [
  // [item_code, factor_per_unit, wastage_pct, unit]
  ['RM-CONC-C35', 1.0, 2, 'm3'],
  ['RM-REBAR', 125, 3, 'kg'],
  ['RM-BIND-WIRE', 1.5, 5, 'kg'],
  ['RM-FORMWORK', 3.8, 8, 'm2'],
  ['RM-SPACER', 10, 1, 'piece'],
];

const STANDARD_RECIPE = {
  code: 'STD-REINF-CONC',
  name: 'Standard reinforced concrete (per 1 m3)',
  name_en: 'Standard reinforced concrete (per 1 m3)',
  name_ar: 'خرسانة مسلحة قياسية (لكل 1 م3)',
  activity_type: 'concrete_pour',
  output_description: '1 m3 reinforced concrete pour',
  output_unit: 'm3',
};

async function seedStandardRecipes(query) {
  // 1. Materials the recipe consumes (skip ones that already exist — a live
  //    item_master may already carry its own codes/prices).
  for (const [code, category, subCategory, unit, nameEn, nameAr] of STANDARD_ITEMS) {
    await query(
      `INSERT INTO item_master (code, category, sub_category, unit, name_en, name_ar, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true) ON CONFLICT (code) DO NOTHING`,
      [code, category, subCategory, unit, nameEn, nameAr]
    );
  }

  // 2. The standard recipe row (project_id NULL = applies everywhere).
  let recipeId;
  const existing = await query('SELECT id FROM material_recipes WHERE code = $1', [STANDARD_RECIPE.code]);
  if (existing.rows[0]) {
    recipeId = existing.rows[0].id;
  } else {
    const r = await query(
      `INSERT INTO material_recipes (code, project_id, boq_item_id, activity_type, name, name_en, name_ar, output_description, output_unit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [STANDARD_RECIPE.code, null, null, STANDARD_RECIPE.activity_type, STANDARD_RECIPE.name,
       STANDARD_RECIPE.name_en, STANDARD_RECIPE.name_ar,
       STANDARD_RECIPE.output_description, STANDARD_RECIPE.output_unit]
    );
    recipeId = r.rows[0].id;
  }

  // 3. Lines — idempotent on (recipe_id, material_id).
  let linesSeeded = 0;
  for (const [itemCode, factor, wastage, unit] of STANDARD_LINES) {
    const item = (await query('SELECT id FROM item_master WHERE code = $1', [itemCode])).rows[0];
    if (!item) throw new Error(`Standard recipe material missing: ${itemCode}`);
    const before = (await query(
      'SELECT id FROM recipe_lines WHERE recipe_id = $1 AND material_id = $2',
      [recipeId, item.id]
    )).rows[0];
    if (before) continue;
    await query(
      `INSERT INTO recipe_lines (recipe_id, material_id, factor_per_unit, wastage_pct, unit)
       VALUES ($1, $2, $3, $4, $5)`,
      [recipeId, item.id, factor, wastage, unit]
    );
    linesSeeded++;
  }

  return { recipe_id: recipeId, lines: linesSeeded };
}

// Real-Postgres-only maintenance: drop requirement rows whose recipe line was
// deleted (the upsert path cannot see them). Uses DELETE/IN — kept out of the
// service so tests on the mock executor never touch it.
async function purgeOrphanRequirements(query) {
  const r = await query(
    `DELETE FROM material_requirements
     WHERE recipe_line_id IS NOT NULL AND NOT EXISTS
       (SELECT 1 FROM recipe_lines rl WHERE rl.id = material_requirements.recipe_line_id)`
  );
  return r.rowCount || 0;
}

module.exports = {
  ITEM_PLANNING_COLUMNS,
  STANDARD_ITEMS,
  STANDARD_LINES,
  STANDARD_RECIPE,
  ensurePlanningColumns,
  ensureTables,
  seedStandardRecipes,
  purgeOrphanRequirements,
};
