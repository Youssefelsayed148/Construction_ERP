require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running migration 15 — project_team re-target from users to employees...\n');

  // project_team.user_id used to reference users(id) (login accounts). Team membership is a
  // pure staffing/display concern (like project_manager_id, re-targeted in migrate-14), so it
  // moves to employees(id). Existing rows can't be mapped 1:1 to employees, so they're dropped.
  await query(`ALTER TABLE project_team ADD COLUMN IF NOT EXISTS employee_id INTEGER`);
  console.log('[OK] project_team.employee_id column');

  // Destructive step, only while the legacy user_id column still exists, so a re-run can never delete rows.
  const legacyColumn = await query(
    `SELECT 1 AS ok FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_team' AND column_name = 'user_id'`
  );
  if (legacyColumn.rows.length) {
    await query(`DELETE FROM project_team WHERE employee_id IS NULL`);
    console.log('[OK] cleared legacy user-based team rows');

    await query(`ALTER TABLE project_team DROP CONSTRAINT IF EXISTS project_team_user_id_fkey`);
    await query(`ALTER TABLE project_team DROP COLUMN user_id`);
    console.log('[OK] dropped old user_id column + FK');
  }

  await query(`ALTER TABLE project_team DROP CONSTRAINT IF EXISTS project_team_employee_id_fkey`);
  await query(`ALTER TABLE project_team
    ADD CONSTRAINT project_team_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE`);
  await query(`ALTER TABLE project_team ALTER COLUMN employee_id SET NOT NULL`);
  console.log('[OK] added FK project_team.employee_id -> employees(id)');

  await query(`CREATE UNIQUE INDEX IF NOT EXISTS project_team_unique_member
    ON project_team (project_id, employee_id)`);
  console.log('[OK] unique (project_id, employee_id)');

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
