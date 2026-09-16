// Phase 2: Add nullable project_id to HR/legal/maintenance tables whose records
// represent project-attributable cost or activity, so they can later feed the
// Phase 13 Resource/Labour and Equipment cost calculations.
//
// Touched tables:
//   attendance          — daily timesheet rows (Phase 13 Labour Cost input).
//   maintenance_reminders — equipment maintenance cost attributed to a project.
//   legal_documents     — a contract can be project-scoped (e.g. a client's MSA
//                         for project X) or company-wide (a template library);
//                         the nullable column covers both.
//
// Tables deliberately NOT touched in this migration:
//   employees, daily_laborers         — directory rows, not project-attributable.
//   leave_requests                    — per-employee, not project-attributable.
//   payroll_periods, payroll_details  — company-wide by definition.
//   assets                            — already has current_project_id (migrate-12).
//   equipment_assignments             — already has project_id (migrate-1.3).
//   equipment_usage_logs              — already has project_id (migrate-1.3).
//
// All columns are NULLABLE with ON DELETE SET NULL so existing rows survive
// untouched and a deleted project does not cascade-delete history.
//
// Idempotent: every ALTER uses ADD COLUMN IF NOT EXISTS, so the script is safe
// to re-run against a partially-migrated DB.
//
// Run: node backend/src/scripts/migrate-16.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Phase 2 (migrate-16) — out-of-spec module scoping...\n');

  await query(
    `ALTER TABLE attendance
       ADD COLUMN IF NOT EXISTS project_id INTEGER
       REFERENCES projects(id) ON DELETE SET NULL`
  );
  console.log('[OK] attendance.project_id');

  await query(
    `ALTER TABLE maintenance_reminders
       ADD COLUMN IF NOT EXISTS project_id INTEGER
       REFERENCES projects(id) ON DELETE SET NULL`
  );
  console.log('[OK] maintenance_reminders.project_id');

  await query(
    `ALTER TABLE legal_documents
       ADD COLUMN IF NOT EXISTS project_id INTEGER
       REFERENCES projects(id) ON DELETE SET NULL`
  );
  console.log('[OK] legal_documents.project_id');

  await query(
    'CREATE INDEX IF NOT EXISTS idx_attendance_project ON attendance(project_id)'
  );
  await query(
    'CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_project ON maintenance_reminders(project_id)'
  );
  await query(
    'CREATE INDEX IF NOT EXISTS idx_legal_documents_project ON legal_documents(project_id)'
  );
  console.log('[OK] indexes');

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch((e) => { console.error(e); process.exit(1); });
