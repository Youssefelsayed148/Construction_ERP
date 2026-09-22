// Phase 26 — seed a sandbox service account for testing /api/v1.
//
// Creates (or resets) a sandbox service account linked to an owner user and
// prints the client_id/client_secret exactly once — the secret is only stored
// hashed.
//
// Run: node src/scripts/seed-sandbox.js [--url http://host:port/webhook]
//   --url additionally registers a sample webhook subscription.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, healthCheck } = require('../config/database');

const CLIENT_ID = 'sandbox-client';
const CLIENT_SECRET = 'sandbox-secret-' + require('crypto').randomBytes(12).toString('hex');

(async () => {
  const health = await healthCheck();
  if (health.status !== 'healthy') { console.error('DB unhealthy:', health.message); process.exit(1); }

  const owner = (await query("SELECT id FROM users WHERE role = 'owner' AND is_active = true ORDER BY id LIMIT 1")).rows[0];
  if (!owner) { console.error('No active owner user found — create one first'); process.exit(1); }

  const hash = await bcrypt.hash(CLIENT_SECRET, 10);
  const scopes = ['api:read', 'projects:write', 'procurement:write', 'invoices:write', 'payments:write'];
  const r = await query(
    `INSERT INTO service_accounts (name, client_id, client_secret_hash, user_id, scopes, created_by)
     VALUES ('Sandbox service account', $1, $2, $3, $4, $3)
     ON CONFLICT (client_id) DO UPDATE SET client_secret_hash = EXCLUDED.client_secret_hash,
       scopes = EXCLUDED.scopes, is_active = true
     RETURNING id, client_id`,
    [CLIENT_ID, hash, owner.id, JSON.stringify(scopes)]
  );

  console.log('[OK] sandbox service account ready:');
  console.log('  client_id:     ' + CLIENT_ID);
  console.log('  client_secret: ' + CLIENT_SECRET + '  (store it now — shown once)');
  console.log('  linked user:   #' + owner.id + ' (owner)');
  console.log('  scopes:        ' + scopes.join(' '));
  console.log('');
  console.log('Try it:');
  console.log(`  curl -X POST http://localhost:5000/api/v1/oauth/token -H 'Content-Type: application/json' \\`);
  console.log(`    -d '{"grant_type":"client_credentials","client_id":"${CLIENT_ID}","client_secret":"${CLIENT_SECRET}","scope":"projects:read"}'`);

  const urlIdx = process.argv.indexOf('--url');
  if (urlIdx !== -1 && process.argv[urlIdx + 1]) {
    const url = process.argv[urlIdx + 1];
    const webhook = await query(
      `INSERT INTO webhooks (url, secret, events, description, created_by)
       VALUES ($1, $2, $3, 'Sandbox sample webhook', $4) RETURNING id, url, secret`,
      [url, require('crypto').randomBytes(24).toString('hex'),
       JSON.stringify(['project.created', 'rfi.*', 'inventory.low', 'purchase_order.issued', 'payment.received']), owner.id]
    );
    console.log('');
    console.log('[OK] sandbox webhook registered:');
    console.log('  url:    ' + webhook.rows[0].url);
    console.log('  secret: ' + webhook.rows[0].secret + '  (shown once)');
  }
  process.exit(0);
})().catch((e) => { console.error('[FAIL]', e.message); process.exit(1); });
