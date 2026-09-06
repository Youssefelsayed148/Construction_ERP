require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Prompt 14 — Department managers & Project Manager re-target migration...\n');

  await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_manager BOOLEAN NOT NULL DEFAULT false`);
  console.log('[OK] employees.is_manager');

  // project_manager_id used to point at users(id) (login accounts). It's being re-targeted
  // to employees(id) — a pure staffing/display field, decoupled from the approvals
  // workflow's separate 'project_manager' role check on users.
  await query(`UPDATE projects SET project_manager_id = NULL WHERE project_manager_id IS NOT NULL`);
  console.log('[OK] cleared stale users-based project_manager_id values');

  await query(`ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_project_manager_id_fkey`);
  console.log('[OK] dropped old FK to users');

  await query(`ALTER TABLE projects ADD CONSTRAINT projects_project_manager_id_fkey FOREIGN KEY (project_manager_id) REFERENCES employees(id) ON DELETE SET NULL`);
  console.log('[OK] added FK to employees');

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
