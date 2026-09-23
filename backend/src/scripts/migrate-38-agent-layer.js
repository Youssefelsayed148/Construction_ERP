// Phase 27/28 — Agent layer migration.
//
// agent_tool_calls        — every MCP tool invocation: tool, acting user,
//                           session, arguments (redacted), authorization
//                           result, response summary, correlation id. This is
//                           the audit surface the "Agent Activity" screen
//                           renders (prompt 27 point 7).
// agent_action_requests   — confirmation records for HIGH-RISK gated actions
//                           (prompt 27 point 6): proposed action + generated
//                           payload + reason/context, requesting agent
//                           session, requesting user, required approver,
//                           approval decision, final executed transaction id.
//
// Run: node src/scripts/migrate-38-agent-layer.js  (idempotent)

require('dotenv').config();
const { query, healthCheck } = require('../config/database');

const DDL = [
  `CREATE TABLE IF NOT EXISTS agent_tool_calls (
    id SERIAL PRIMARY KEY,
    tool VARCHAR(100) NOT NULL,
    risk VARCHAR(20) NOT NULL DEFAULT 'read',
    user_id INTEGER REFERENCES users(id),
    user_role VARCHAR(100),
    agent_session VARCHAR(200),
    arguments JSONB,
    authorized BOOLEAN DEFAULT true,
    authorization_detail JSONB,
    response_status INTEGER,
    response_summary TEXT,
    request_id INTEGER,
    correlation_id VARCHAR(120),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_user ON agent_tool_calls(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_created ON agent_tool_calls(created_at)`,

  `CREATE TABLE IF NOT EXISTS agent_action_requests (
    id SERIAL PRIMARY KEY,
    tool VARCHAR(100) NOT NULL,
    operation JSONB NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    reason TEXT,
    agent_session VARCHAR(200),
    requesting_user_id INTEGER NOT NULL REFERENCES users(id),
    required_approver_role VARCHAR(50) NOT NULL DEFAULT 'owner',
    approver_user_id INTEGER REFERENCES users(id),
    decision VARCHAR(30),
    decision_comment TEXT,
    decided_at TIMESTAMPTZ,
    execution_status VARCHAR(30),
    execution_result JSONB,
    executed_transaction_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_action_requests_status ON agent_action_requests(decision, execution_status)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_action_requests_user ON agent_action_requests(requesting_user_id)`,
];

async function ensureTables(q = query) {
  for (const sql of DDL) await q(sql);
}

module.exports = { DDL, ensureTables };

if (require.main === module) {
  (async () => {
    const { healthCheck } = require('../config/database');
    const health = await healthCheck();
    if (health.status !== 'healthy') { console.error('DB unhealthy:', health.message); process.exit(1); }
    await ensureTables();
    console.log('[OK] Phase 27/28 agent tables ensured (agent_tool_calls, agent_action_requests)');
    process.exit(0);
  })().catch((e) => { console.error('[FAIL]', e.message); process.exit(1); });
}
