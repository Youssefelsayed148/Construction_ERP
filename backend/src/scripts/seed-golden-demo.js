'use strict';

// Phase 9 demo fixture. This script reads DB_* and APP_ENV only from the current
// process; it intentionally does not load dotenv files or create user passwords.
const { Pool } = require('pg');
const projectProvisioning = require('../services/projectProvisioning');
const materialDemand = require('../services/materialDemand');

const PROJECT = Object.freeze({
  code: 'OSIRIS-RES-TOWERS-001',
  nameEn: 'Osiris Residential Towers',
  nameAr: 'أبراج أوسيريس السكنية',
  budget: 1500000,
  contractValue: 1600000,
});
const SUPPLIER = Object.freeze({
  code: 'OSIRIS-GOLD-SUP-001',
  nameEn: 'Osiris Golden Demo Supplier',
  nameAr: 'مورد مشروع أبراج أوسيريس التجريبي',
});
const MATERIAL = Object.freeze({ code: 'RM-CONC-C35', unit: 'm3', rate: 4200 });
const BOQ = Object.freeze({ code: 'OSIRIS-GOLD-BOQ-C35', quantity: 120, rate: 4200 });
const RECIPE = Object.freeze({ code: 'OSIRIS-GOLD-C35-RECIPE', factor: 1, wastagePct: 2 });
const SCHEDULE = Object.freeze({ code: 'OSIRIS-GOLD-C35-POURS', plannedQuantity: 120 });

function assertSafeTarget(env = process.env) {
  if (!['staging', 'test'].includes(env.APP_ENV)) {
    throw new Error('Refusing golden demo seed: APP_ENV must be exactly staging or test');
  }
  if (!/(^|[_-])(staging|stage|test)([_-]|$)/i.test(env.DB_NAME || '')) {
    throw new Error('Refusing golden demo seed: DB_NAME must contain a staging, stage, or test segment');
  }
  const host = String(env.DB_HOST || '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('Refusing golden demo seed: DB_HOST must be loopback');
  }
  const port = Number(env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Refusing golden demo seed: DB_PORT must be a valid TCP port');
  }
  if (!env.DB_USER || !env.DB_PASSWORD) {
    throw new Error('Refusing golden demo seed: DB_USER and DB_PASSWORD must be set in the process environment');
  }
}

const one = async (client, sql, params = []) => (await client.query(sql, params)).rows[0];

async function seedGoldenDemo(client) {
  if (!client || typeof client.query !== 'function') throw new Error('seedGoldenDemo requires a PostgreSQL client');

  let project = await one(client, 'SELECT id FROM projects WHERE code = $1', [PROJECT.code]);
  if (!project) {
    const result = await projectProvisioning.provisionProject({
      code: PROJECT.code,
      name_en: PROJECT.nameEn,
      name_ar: PROJECT.nameAr,
      project_type: 'residential',
      status: 'planning',
      budget: PROJECT.budget,
      contract_value: PROJECT.contractValue,
    }, { client, templateKey: 'residential_tower' });
    project = { id: result.project.id };
  }

  const unitRows = (await client.query(
    `SELECT pl.id, pl.code
       FROM project_locations pl JOIN location_types lt ON lt.id = pl.location_type_id
      WHERE pl.project_id = $1 AND lt.code = 'unit'
      ORDER BY pl.code`, [project.id]
  )).rows;
  if (unitRows.length !== 96) {
    throw new Error(`Residential template invariant failed for ${PROJECT.code}: expected 96 units, found ${unitRows.length}`);
  }

  const supplier = await one(client,
    `INSERT INTO suppliers (code, name_en, name_ar, specialty, is_active)
     VALUES ($1, $2, $3, 'construction materials', true)
     ON CONFLICT (code) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar,
       specialty = EXCLUDED.specialty, is_active = true RETURNING id`,
    [SUPPLIER.code, SUPPLIER.nameEn, SUPPLIER.nameAr]);
  const material = await one(client, 'SELECT id FROM item_master WHERE code = $1 AND is_active = true', [MATERIAL.code]);
  if (!material) throw new Error(`Required C35 item missing after migrations: ${MATERIAL.code}`);

  await client.query(
    `INSERT INTO supplier_materials (supplier_id, material_id, unit_price, lead_time_days, notes)
     VALUES ($1, $2, $3, 3, 'Fictional local golden-demo rate')
     ON CONFLICT (supplier_id, material_id) DO UPDATE SET unit_price = EXCLUDED.unit_price,
       lead_time_days = EXCLUDED.lead_time_days, notes = EXCLUDED.notes`,
    [supplier.id, material.id, MATERIAL.rate]);

  let warehouse = await one(client,
    'SELECT id FROM warehouses WHERE project_id = $1 AND name = $2', [project.id, 'Osiris Towers Site Warehouse']);
  if (!warehouse) warehouse = await one(client,
    `INSERT INTO warehouses (name, name_en, name_ar, type, warehouse_type, project_id, storage_capacity)
     VALUES ('Osiris Towers Site Warehouse', 'Osiris Towers Site Warehouse', 'مخزن موقع أبراج أوسيريس',
       'site', 'site', $1, 5000) RETURNING id`, [project.id]);
  await client.query(
    `INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, available_quantity, reorder_level, avg_unit_cost)
     VALUES ($1, $2, 0, 0, 0, $3)
     ON CONFLICT (warehouse_id, item_id) DO UPDATE SET avg_unit_cost = EXCLUDED.avg_unit_cost`,
    [warehouse.id, material.id, MATERIAL.rate]);

  let section = await one(client,
    'SELECT id FROM boq_sections WHERE project_id = $1 AND code = $2', [project.id, 'OSIRIS-GOLD-STRUCTURE']);
  if (!section) section = await one(client,
    `INSERT INTO boq_sections (project_id, code, name, name_en, name_ar, sort_order)
     VALUES ($1, 'OSIRIS-GOLD-STRUCTURE', 'Structure', 'Structure', 'الهيكل الإنشائي', 1) RETURNING id`, [project.id]);

  let boq = await one(client,
    'SELECT id FROM boq_items WHERE project_id = $1 AND code = $2', [project.id, BOQ.code]);
  if (!boq) boq = await one(client,
    `INSERT INTO boq_items (project_id, section_id, code, description, description_en, description_ar,
       unit, quantity, unit_rate, item_master_id, type)
     VALUES ($1, $2, $3, 'C35 structural concrete', 'C35 structural concrete', 'خرسانة إنشائية C35',
       $4, $5, $6, $7, 'material') RETURNING id`,
    [project.id, section.id, BOQ.code, MATERIAL.unit, BOQ.quantity, BOQ.rate, material.id]);

  let recipe = await one(client,
    'SELECT id FROM material_recipes WHERE code = $1', [RECIPE.code]);
  if (!recipe) recipe = await one(client,
    `INSERT INTO material_recipes
       (project_id, boq_item_id, code, activity_type, name, name_en, name_ar, output_description, output_unit)
     VALUES ($1, $2, $3, 'concrete_pour', 'C35 concrete mix', 'C35 concrete mix', 'خلطة خرسانة C35',
       '1 m3 concrete', 'm3') RETURNING id`, [project.id, boq.id, RECIPE.code]);
  let recipeLine = await one(client,
    'SELECT id FROM recipe_lines WHERE recipe_id = $1 AND material_id = $2', [recipe.id, material.id]);
  if (!recipeLine) recipeLine = await one(client,
    `INSERT INTO recipe_lines (recipe_id, material_id, factor_per_unit, wastage_pct, unit)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [recipe.id, material.id, RECIPE.factor, RECIPE.wastagePct, MATERIAL.unit]);

  const locationId = unitRows[0].id;
  let schedule = await one(client,
    'SELECT id FROM schedule_activities WHERE project_id = $1 AND activity_code = $2', [project.id, SCHEDULE.code]);
  if (!schedule) schedule = await one(client,
    `INSERT INTO schedule_activities (project_id, activity_code, name, project_location_id, boq_item_id,
       planned_quantity, planned_start, planned_finish, original_duration)
     VALUES ($1, $2, 'Tower A C35 pours', $3, $4, $5, CURRENT_DATE, CURRENT_DATE + 30, 30) RETURNING id`,
    [project.id, SCHEDULE.code, locationId, boq.id, SCHEDULE.plannedQuantity]);

  // Allocate 120 m3 across the template's 96 residential units. Each allocation
  // becomes a 1.25 m3 planned quantity and 1.275 m3 net recipe demand after waste.
  const perUnit = BOQ.quantity / unitRows.length;
  for (const unit of unitRows) {
    await client.query(
      `INSERT INTO boq_location_allocations
         (boq_item_id, project_location_id, planned_quantity, unit_cost, activity_type)
       VALUES ($1, $2, $3, $4, 'concrete_pour')
       ON CONFLICT (boq_item_id, project_location_id) DO UPDATE SET
         planned_quantity = EXCLUDED.planned_quantity, unit_cost = EXCLUDED.unit_cost,
         activity_type = EXCLUDED.activity_type, updated_at = NOW()`,
      [boq.id, unit.id, perUnit, BOQ.rate]);
  }
  const q = client.query.bind(client);
  await materialDemand.recomputeBoqItem(q, boq.id);

  return {
    projectId: Number(project.id), supplierId: Number(supplier.id), warehouseId: Number(warehouse.id),
    materialId: Number(material.id), boqItemId: Number(boq.id), recipeId: Number(recipe.id),
    scheduleActivityId: Number(schedule.id), unitCount: unitRows.length,
    boqTotal: BOQ.quantity * BOQ.rate,
    grossRequirement: BOQ.quantity,
    netRequirement: BOQ.quantity * (1 + RECIPE.wastagePct / 100),
  };
}

async function main() {
  assertSafeTarget();
  const pool = new Pool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await seedGoldenDemo(client);
    await client.query('COMMIT');
    console.log(`Seeded ${PROJECT.code}: ${result.unitCount} units, C35 BOQ EGP ${result.boqTotal}, recipe demand ${result.netRequirement} m3.`);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* preserve the source error */ }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) main().catch((error) => {
  console.error(`Golden demo seed failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { PROJECT, SUPPLIER, MATERIAL, BOQ, RECIPE, SCHEDULE, assertSafeTarget, seedGoldenDemo };
