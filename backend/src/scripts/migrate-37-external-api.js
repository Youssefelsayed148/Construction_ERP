// Phase 26 — External API migration.
//
// Adds the storage the versioned /api/v1 needs:
//   service_accounts   — machine integrations (client_credentials grant);
//                        every account is linked to a real user so writes
//                        keep their audit attribution inside the Phase 4
//                        policy engine.
//   idempotency_keys   — replay records for POST/financial endpoints
//                        (Idempotency-Key header).
//   webhooks           — subscriber registrations (url + secret + event list).
//   webhook_deliveries — one row per event per subscriber; carries the
//                        retry/dead-letter state machine.
//
// Run: node src/scripts/migrate-37-external-api.js
// Idempotent — safe to run repeatedly.

require('dotenv').config();
const { query, healthCheck } = require('../config/database');

const DDL = [
  `CREATE TABLE IF NOT EXISTS service_accounts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    client_id VARCHAR(100) UNIQUE NOT NULL,
    client_secret_hash VARCHAR(200) NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    scopes JSONB NOT NULL DEFAULT '[]',
    project_ids JSONB,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_service_accounts_user ON service_accounts(user_id)`,

  `CREATE TABLE IF NOT EXISTS idempotency_keys (
    id SERIAL PRIMARY KEY,
    key VARCHAR(200) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    method VARCHAR(10) NOT NULL,
    path VARCHAR(500) NOT NULL,
    request_hash VARCHAR(80),
    status VARCHAR(20) DEFAULT 'in_flight',
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
    CONSTRAINT uq_idempotency UNIQUE (key, subject, method, path)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at)`,

  `CREATE TABLE IF NOT EXISTS webhooks (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    secret VARCHAR(200) NOT NULL,
    events JSONB NOT NULL DEFAULT '[]',
    description VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id SERIAL PRIMARY KEY,
    webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    event_log_id INTEGER,
    entity_type VARCHAR(100),
    entity_id INTEGER,
    payload JSONB NOT NULL DEFAULT '{}',
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 6,
    status VARCHAR(20) DEFAULT 'pending',
    next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
    last_status_code INTEGER,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due ON webhook_deliveries(status, next_attempt_at)`,
  `CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_hook ON webhook_deliveries(webhook_id)`,
];

async function ensureTables(q = query) {
  for (const sql of DDL) await q(sql);
}

module.exports = { DDL, ensureTables };

// Auto-run only when invoked directly: node src/scripts/migrate-37-external-api.js
if (require.main === module) {
  (async () => {
    const health = await healthCheck();
    if (health.status !== 'healthy') { console.error('DB unhealthy:', health.message); process.exit(1); }
    await ensureTables();
    console.log('[OK] Phase 26 external API tables ensured (service_accounts, idempotency_keys, webhooks, webhook_deliveries)');
    process.exit(0);
  })().catch((e) => { console.error('[FAIL]', e.message); process.exit(1); });
}
