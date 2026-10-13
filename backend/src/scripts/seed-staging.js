'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '..', '.env.docker') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const credentialsPath = path.join(repoRoot, '.staging-users.json');
const CANONICAL_ROLES = Object.freeze([
  'owner_ceo', 'coo', 'projects_director', 'construction_manager', 'project_manager',
  'site_manager', 'site_engineer', 'planning_engineer', 'technical_office_engineer', 'quantity_surveyor',
  'commercial_manager', 'contracts_manager', 'procurement_manager', 'procurement_officer', 'finance_manager',
  'accountant_ar', 'accountant_ap', 'storekeeper', 'qa_qc_manager', 'hse_manager', 'document_controller',
  'equipment_manager', 'hr_manager', 'business_development',
  'client_executive', 'client_reviewer', 'pmc_manager', 'consultant_coordinator',
  'consultant_reviewer', 'subcontractor_manager', 'subcontractor_site_engineer', 'supplier_sales', 'testing_lab',
]);
const PILOT_PROJECT_CODE = 'PILOT-PTP-001';
const SEED_EMAIL_DOMAIN = 'pilot.example.com';

function assertSafeTarget(env = process.env) {
  if (env.APP_ENV !== 'staging') throw new Error('Refusing to seed: APP_ENV must be exactly staging');
  if (!/(^|[_-])(staging|stage|test)([_-]|$)/i.test(env.DB_NAME || '')) {
    throw new Error('Refusing to seed: DB_NAME must contain a staging, stage, or test segment');
  }
  const host = String(env.DB_HOST || 'db').toLowerCase();
  if (!['db', 'localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('Refusing to seed: DB_HOST must be local or the Compose db service');
  }
}

function password() { return crypto.randomBytes(36).toString('base64url'); }
function emailFor(key) { return `pilot-${key}@${SEED_EMAIL_DOMAIN}`; }

async function main() {
  assertSafeTarget();
  const pool = new Pool({
    host: process.env.DB_HOST || 'db', port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  const generated = [];
  const stagedCredentialFile = `${credentialsPath}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`;

  try {
    await client.query('BEGIN');
    const clientRow = (await client.query(
      `INSERT INTO clients (code, name_en, name_ar, client_type, is_active)
       VALUES ('PILOT-CLIENT-001', 'Osiris Pilot Client', 'عميل أوسيريس التجريبي', 'organization', true)
       ON CONFLICT (code) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, is_active = true
       RETURNING id`)).rows[0];
    const supplierRow = (await client.query(
      `INSERT INTO suppliers (code, name_en, name_ar, specialty, is_active)
       VALUES ('PILOT-SUPPLIER-001', 'Osiris Pilot Supplier', 'مورد أوسيريس التجريبي', 'construction materials', true)
       ON CONFLICT (code) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, is_active = true
       RETURNING id`)).rows[0];
    const clientOrg = (await client.query(
      `INSERT INTO organizations (code, name_en, name_ar, org_type, legacy_client_id, status)
       VALUES ('PILOT-CLIENT-ORG', 'Osiris Pilot Client', 'عميل أوسيريس التجريبي', 'client', $1, 'active')
       ON CONFLICT (code) DO UPDATE SET legacy_client_id = EXCLUDED.legacy_client_id, status = 'active'
       RETURNING id`, [clientRow.id])).rows[0];
    const supplierOrg = (await client.query(
      `INSERT INTO organizations (code, name_en, name_ar, org_type, legacy_supplier_id, status)
       VALUES ('PILOT-SUPPLIER-ORG', 'Osiris Pilot Supplier', 'مورد أوسيريس التجريبي', 'supplier', $1, 'active')
       ON CONFLICT (code) DO UPDATE SET legacy_supplier_id = EXCLUDED.legacy_supplier_id, status = 'active'
       RETURNING id`, [supplierRow.id])).rows[0];
    const project = (await client.query(
      `INSERT INTO projects (name, name_en, name_ar, code, status, budget, contract_value, client_id, currency)
       VALUES ('مشروع المشتريات التجريبي', 'Procure-to-Pay Pilot', 'مشروع المشتريات التجريبي', $1, 'active', 250000, 300000, $2, 'EGP')
       ON CONFLICT (code) DO UPDATE SET status = 'active', budget = EXCLUDED.budget,
         contract_value = EXCLUDED.contract_value, client_id = EXCLUDED.client_id
       RETURNING id`, [PILOT_PROJECT_CODE, clientRow.id])).rows[0];

    const definitions = CANONICAL_ROLES.map((role) => ({ key: role, role, grantRole: role }));
    definitions.push(
      { key: 'unassigned', role: 'procurement_officer', grantRole: 'procurement_officer', noAssignment: true },
      { key: 'expired_assignment', role: 'site_engineer', grantRole: 'site_engineer', expired: true },
      // Existing workflow definitions use these compatibility role values.
      { key: 'workflow_owner', role: 'owner', grantRole: 'owner' },
      { key: 'workflow_checker', role: 'purchasing_mgr', grantRole: 'procurement_manager' },
      { key: 'workflow_budget', role: 'accountant', grantRole: 'accountant' },
    );
    for (const account of definitions) {
      const plainPassword = password();
      const hash = await bcrypt.hash(plainPassword, 12);
      const row = (await client.query(
        `INSERT INTO users (name, email, password, role, is_active, token_version)
         VALUES ($1, $2, $3, $4, true, 0)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password,
           role = EXCLUDED.role, is_active = true, token_version = users.token_version + 1, updated_at = NOW()
         RETURNING id`,
        [`Pilot ${account.key}`, emailFor(account.key), hash, account.role])).rows[0];
      await client.query('DELETE FROM user_project_roles WHERE user_id = $1', [row.id]);
      await client.query('DELETE FROM organization_users WHERE user_id = $1', [row.id]);

      const roleId = (await client.query('SELECT id FROM roles WHERE key = $1', [account.grantRole])).rows[0];
      if (!roleId) throw new Error(`Role missing from migrated database: ${account.grantRole}`);
      if (!account.noAssignment) {
        const organizationId = account.role === 'supplier_sales' ? supplierOrg.id
          : account.role === 'client_executive' ? clientOrg.id : null;
        await client.query(
          `INSERT INTO user_project_roles (user_id, project_id, role_id, organization_id, expires_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [row.id, project.id, roleId.id, organizationId, account.expired ? new Date(Date.now() - 86400000) : null]);
        if (organizationId) await client.query(
          `INSERT INTO organization_users (organization_id, user_id, role_at_org, is_active)
           VALUES ($1, $2, $3, true) ON CONFLICT (organization_id, user_id)
           DO UPDATE SET role_at_org = EXCLUDED.role_at_org, is_active = true`,
          [organizationId, row.id, account.role]);
      }
      generated.push({ key: account.key, email: emailFor(account.key), password: plainPassword, role: account.role, assignment: account.noAssignment ? 'none' : account.expired ? 'expired' : 'pilot-project' });
    }

    const secretFile = JSON.stringify({ generated_at: new Date().toISOString(), project_code: PILOT_PROJECT_CODE, accounts: generated }, null, 2) + '\n';
    fs.writeFileSync(stagedCredentialFile, secretFile, { encoding: 'utf8', mode: 0o600, flag: 'w' });
    await client.query('COMMIT');
    fs.renameSync(stagedCredentialFile, credentialsPath);
    console.log(`Seeded ${generated.length} staging users across ${CANONICAL_ROLES.length} canonical roles for ${PILOT_PROJECT_CODE}.`);
    console.log(`Generated credentials are stored in ${credentialsPath}; passwords are not printed.`);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* original failure takes precedence */ }
    if (fs.existsSync(stagedCredentialFile)) fs.unlinkSync(stagedCredentialFile);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) main().catch((error) => {
  console.error(`Staging seed failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { assertSafeTarget, CANONICAL_ROLES, main };
