'use strict';

// B7: demo approval-limit rows for the canonical authority roles.
//
// The enforcement contract (services/approvalLimits.js) has no default: a
// role without an enabled row is refused 403 approval_limit_exceeded at the
// decision of every MONEY_TOOLS agent action. The demo roster's canonical
// owner_ceo and coo accounts had no rows, so every gated money decision by
// them failed. This module mirrors the owner/admin configuration
// (EGP 1,000,000,000 per money action) onto owner_ceo and coo, strictly
// through the existing PUT /api/approval-limits API — no SQL, no migration.
//
// PRODUCTION NOTE: production limits are an owner decision. Nothing here
// configures anything outside the erp-demo-20261017 demo stack.

const { assertDemoTarget } = require('./company-demo-common');
const approvalLimits = require('../services/approvalLimits');

const TARGET = Object.freeze({ projectName: 'erp-demo-20261017', baseUrl: 'http://127.0.0.1:8092',
  dbName: 'construction_erp_demo', dbHost: '127.0.0.1', dbPort: '55442' });

// Mirrors the owner/admin demo configuration (RUN F evidence: 1e9 EGP rows).
const ROLES = ['owner_ceo', 'coo'];
const MAX_AMOUNT = 1000000000;
const CURRENCY = 'EGP';

async function seedApprovalLimits({ target, request, accounts }) {
  assertDemoTarget(target);
  if (typeof request !== 'function' || !Array.isArray(accounts)) {
    throw new Error('Refusing demo: incomplete approval-limit dependencies');
  }
  const owner = accounts.find(row => row.key === 'workflow_owner');
  if (!owner) throw new Error('Refusing demo: missing workflow_owner account');

  const listRoute = '/api/approval-limits';
  const listed = await request(owner, listRoute);
  if (listed.status !== 200 || !Array.isArray(listed.body?.data)) {
    throw new Error(`Demo GET ${listRoute}: HTTP ${listed.status}`);
  }
  const existing = new Map(listed.body.data.map(row => [`${row.role_key}/${row.action_key}`, row]));

  let created = 0;
  let updated = 0;
  let rows = 0;
  for (const role of ROLES) {
    for (const action of approvalLimits.MONEY_TOOLS) {
      const current = existing.get(`${role}/${action}`);
      if (current && current.enabled
          && Number(current.max_amount) === MAX_AMOUNT && current.currency === CURRENCY) {
        rows += 1;
        continue;
      }
      const body = { role, action, max_amount: MAX_AMOUNT, currency: CURRENCY, enabled: true };
      const saved = await request(owner, listRoute, { method: 'PUT', body });
      if (saved.status < 200 || saved.status >= 300 || !saved.body?.data) {
        throw new Error(`Demo PUT ${listRoute}: HTTP ${saved.status}`);
      }
      if (current) updated += 1; else created += 1;
      rows += 1;
    }
  }
  return { stage: 'approval-limits', roles: ROLES.length, actions: approvalLimits.MONEY_TOOLS.size,
    created, updated, rows };
}

module.exports = { TARGET, ROLES, MAX_AMOUNT, CURRENCY, seedApprovalLimits };
