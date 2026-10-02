require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Prompt 12 migration (form audit fixes + supplier-materials linking)...\n');

  await query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS current_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL`);
  console.log('[OK] assets.current_project_id');

  await query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city VARCHAR(100)`);
  console.log('[OK] suppliers.city');

  // Keep the data: fold location into address before the column goes.
  const hasLocation = await query(
    `SELECT 1 AS ok FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'location'`
  );
  if (hasLocation.rows.length) {
    await query(`UPDATE projects SET address = location WHERE (address IS NULL OR address = '') AND location IS NOT NULL AND location <> ''`);
    await query(`ALTER TABLE projects DROP COLUMN location`);
  }
  console.log('[OK] projects.location dropped (redundant with address + city)');

  await query(`
    CREATE TABLE IF NOT EXISTS supplier_materials (
      id SERIAL PRIMARY KEY,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      material_id INTEGER NOT NULL REFERENCES item_master(id) ON DELETE CASCADE,
      unit_price NUMERIC(12,2),
      lead_time_days INTEGER,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (supplier_id, material_id)
    )
  `);
  console.log('[OK] supplier_materials');

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
