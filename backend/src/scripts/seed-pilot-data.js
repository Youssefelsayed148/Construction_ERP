'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '..', '.env.docker') });
const { Pool } = require('pg');
const { assertSafeTarget } = require('./seed-staging');

const PROJECT_CODE = 'PILOT-PTP-001';
const WAREHOUSE_NAME = 'Pilot Site Warehouse';
const MATERIALS = [
  { code: 'PILOT-MAT-CEMENT', category: 'raw_material', sub: 'cement', unit: 'bag', nameEn: 'Portland Cement 50 kg', nameAr: 'أسمنت بورتلاند 50 كجم', costCode: 'PILOT-CC-MAT', supplierPrice: 185, leadDays: 3 },
  { code: 'PILOT-MAT-REBAR', category: 'raw_material', sub: 'steel', unit: 'ton', nameEn: 'Rebar 12 mm', nameAr: 'حديد تسليح 12 مم', costCode: 'PILOT-CC-STEEL', supplierPrice: 36500, leadDays: 7 },
  { code: 'PILOT-MAT-TILE', category: 'finished_material', sub: 'tile_flooring', unit: 'm2', nameEn: 'Ceramic Floor Tile', nameAr: 'بلاط أرضيات سيراميك', costCode: 'PILOT-CC-FINISH', supplierPrice: 320, leadDays: 5 },
];

async function one(q, sql, params = []) { return (await q(sql, params)).rows[0]; }

async function seedPilotData(q) {
  const project = await one(q, 'SELECT id FROM projects WHERE code = $1', [PROJECT_CODE]);
  const supplier = await one(q, "SELECT id FROM suppliers WHERE code = 'PILOT-SUPPLIER-001'");
  if (!project || !supplier) throw new Error('Run the guarded role seed first; pilot project or supplier is missing');
  const alternativeSupplier = await one(q,
    `INSERT INTO suppliers (code, name_en, name_ar, specialty, is_active)
     VALUES ('PILOT-SUPPLIER-002', 'Delta Pilot Materials', 'دلتا لمواد البناء التجريبية', 'construction materials', true)
     ON CONFLICT (code) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, is_active = true
     RETURNING id`);

  const costCodes = {};
  for (const [code, type, en, ar] of [
    ['PILOT-CC-MAT', 'material', 'Materials', 'مواد'],
    ['PILOT-CC-STEEL', 'material', 'Reinforcement Steel', 'حديد التسليح'],
    ['PILOT-CC-FINISH', 'material', 'Finishes', 'التشطيبات'],
  ]) {
    costCodes[code] = await one(q,
      `INSERT INTO cost_codes (code, name, name_en, name_ar, level, type)
       VALUES ($1, $2, $3, $4, 1, $5)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, name_en = EXCLUDED.name_en,
         name_ar = EXCLUDED.name_ar, type = EXCLUDED.type RETURNING id`, [code, en, en, ar, type]);
  }

  let warehouse = await one(q, 'SELECT id FROM warehouses WHERE project_id = $1 AND name = $2', [project.id, WAREHOUSE_NAME]);
  if (!warehouse) warehouse = await one(q,
    `INSERT INTO warehouses (name, name_en, name_ar, type, warehouse_type, project_id, storage_capacity)
     VALUES ($1, $1, $2, 'site', 'site', $3, 5000) RETURNING id`, [WAREHOUSE_NAME, 'مخزن الموقع التجريبي', project.id]);

  const itemRows = [];
  for (const material of MATERIALS) {
    const item = await one(q,
      `INSERT INTO item_master (code, category, sub_category, unit, base_unit, purchase_unit, issue_unit,
         name_en, name_ar, description, is_active, default_cost_code_id, inspection_required)
       VALUES ($1, $2, $3, $4, $4, $4, $4, $5, $6, $7, true, $8, true)
       ON CONFLICT (code) DO UPDATE SET category = EXCLUDED.category, sub_category = EXCLUDED.sub_category,
         unit = EXCLUDED.unit, base_unit = EXCLUDED.base_unit, purchase_unit = EXCLUDED.purchase_unit,
         issue_unit = EXCLUDED.issue_unit, name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar,
         default_cost_code_id = EXCLUDED.default_cost_code_id, is_active = true
       RETURNING id`, [material.code, material.category, material.sub, material.unit,
        material.nameEn, material.nameAr, material.nameEn, costCodes[material.costCode].id]);
    await q(
      `INSERT INTO supplier_materials (supplier_id, material_id, unit_price, lead_time_days, notes)
       VALUES ($1, $2, $3, $4, 'Pilot rate; fictional local demo data')
       ON CONFLICT (supplier_id, material_id) DO UPDATE SET unit_price = EXCLUDED.unit_price,
         lead_time_days = EXCLUDED.lead_time_days, notes = EXCLUDED.notes`,
      [supplier.id, item.id, material.supplierPrice, material.leadDays]);
    await q(
      `INSERT INTO supplier_materials (supplier_id, material_id, unit_price, lead_time_days, notes)
       VALUES ($1, $2, $3, $4, 'Alternative fictional pilot rate')
       ON CONFLICT (supplier_id, material_id) DO UPDATE SET unit_price = EXCLUDED.unit_price,
         lead_time_days = EXCLUDED.lead_time_days, notes = EXCLUDED.notes`,
      [alternativeSupplier.id, item.id, Math.round(material.supplierPrice * 1.08 * 100) / 100, material.leadDays + 2]);
    await q(
      `INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, available_quantity, reorder_level, avg_unit_cost)
       VALUES ($1, $2, 0, 0, 0, $3)
       ON CONFLICT (warehouse_id, item_id) DO UPDATE SET avg_unit_cost = EXCLUDED.avg_unit_cost`,
      [warehouse.id, item.id, material.supplierPrice]);
    itemRows.push({ ...material, id: item.id });
  }

  let section = await one(q, 'SELECT id FROM boq_sections WHERE project_id = $1 AND code = $2', [project.id, 'PILOT-BOQ-MATERIALS']);
  if (!section) section = await one(q,
    `INSERT INTO boq_sections (project_id, code, name, name_en, name_ar, sort_order)
     VALUES ($1, 'PILOT-BOQ-MATERIALS', 'Materials', 'Materials', 'المواد', 1) RETURNING id`, [project.id]);
  for (const [index, item] of itemRows.entries()) {
    const exists = await one(q, 'SELECT id FROM boq_items WHERE project_id = $1 AND code = $2', [project.id, `PILOT-BOQ-${index + 1}`]);
    const quantity = [120, 35, 240][index];
    if (exists) {
      await q('UPDATE boq_items SET section_id = $1, item_master_id = $2, quantity = $3, unit_rate = $4 WHERE id = $5',
        [section.id, item.id, quantity, item.supplierPrice, exists.id]);
    } else {
      await q(
        `INSERT INTO boq_items (project_id, section_id, code, description, description_en, description_ar,
           unit, quantity, unit_rate, item_master_id, type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'material')`,
        [project.id, section.id, `PILOT-BOQ-${index + 1}`, item.nameEn, item.nameEn,
          item.nameAr, item.unit, quantity, item.supplierPrice, item.id]);
    }
  }
  return { projectId: project.id, supplierId: supplier.id, alternativeSupplierId: alternativeSupplier.id, warehouseId: warehouse.id, materials: itemRows };
}

async function main() {
  assertSafeTarget();
  const pool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = async (sql, params) => {
      try { return await client.query(sql, params); }
      catch (error) { error.message = `${error.message}; failed pilot seed statement: ${sql}`; throw error; }
    };
    const result = await seedPilotData(q);
    await client.query('COMMIT');
    console.log(`Seeded ${result.materials.length} demo materials, rates, stock rows, and BOQ items for ${PROJECT_CODE}.`);
    console.log(`Project ${result.projectId}; suppliers ${result.supplierId}, ${result.alternativeSupplierId}; warehouse ${result.warehouseId}.`);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* keep the source error */ }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) main().catch((error) => {
  console.error(`Pilot data seed failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { assertSafeTarget, seedPilotData, MATERIALS };
