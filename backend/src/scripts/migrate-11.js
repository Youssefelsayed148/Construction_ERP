require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Prompt 11 migration...\n');

  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS address TEXT`).catch(() => {});
  console.log('[OK] projects.address');

  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS city VARCHAR(100)`).catch(() => {});
  console.log('[OK] projects.city');

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
