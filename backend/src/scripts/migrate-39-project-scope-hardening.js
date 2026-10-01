// Security hardening: attach previously company-global operational records to
// projects so the policy layer can enforce object ownership consistently.

require('dotenv').config();
const { query, healthCheck } = require('../config/database');

const DDL = [
  'ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE',
  'CREATE INDEX IF NOT EXISTS idx_legal_documents_project ON legal_documents(project_id)',
  'ALTER TABLE maintenance_reminders ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE',
  'CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_project ON maintenance_reminders(project_id)',
  'ALTER TABLE agent_action_requests ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL',
  'CREATE INDEX IF NOT EXISTS idx_agent_action_requests_project ON agent_action_requests(project_id)',
];

async function ensureScopeColumns(q = query) {
  for (const sql of DDL) await q(sql);
}

module.exports = { DDL, ensureScopeColumns };

if (require.main === module) {
  (async () => {
    const health = await healthCheck();
    if (health.status !== 'healthy') { console.error('DB unhealthy:', health.message); process.exit(1); }
    await ensureScopeColumns();
    console.log('[OK] Project scope columns and indexes ensured');
    process.exit(0);
  })().catch((e) => { console.error('[FAIL]', e.message); process.exit(1); });
}
