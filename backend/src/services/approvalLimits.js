'use strict';

const { query } = require('../config/database');

const MONEY_TOOLS = new Set([
  'issue_purchase_order', 'issue_client_invoice', 'record_payment',
  'approve_payment_certificate', 'release_retention', 'void_financial_record',
  'approve_supplier_invoice',
]);

const RECORD_AMOUNT_SQL = {
  issue_purchase_order: ['purchase_orders', 'total_amount'],
  issue_client_invoice: ['invoices', 'total_amount'],
  approve_payment_certificate: ['payment_certificates', 'net_certificate'],
  approve_supplier_invoice: ['supplier_invoices', 'total_amount'],
  void_financial_record: ['invoices', 'total_amount'],
};

function numericAmount(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return null;
  return Number(value);
}

async function resolveActionAmount(tool, payload, dbQuery = query) {
  if (!MONEY_TOOLS.has(tool)) return null;
  const direct = numericAmount(payload && payload.amount);
  if (direct != null && ['record_payment', 'release_retention'].includes(tool)) return direct;

  const record = RECORD_AMOUNT_SQL[tool];
  if (!record) return null;
  const [table, column] = record;
  const idKey = {
    issue_purchase_order: 'purchase_order_id',
    issue_client_invoice: 'invoice_id',
    approve_payment_certificate: 'certificate_id',
    approve_supplier_invoice: 'supplier_invoice_id',
    void_financial_record: 'record_id',
  }[tool];
  const id = Number(payload && payload[idKey]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  // Table and column names come only from the static whitelist above.
  const row = (await dbQuery(`SELECT ${column} AS amount FROM ${table} WHERE id = $1`, [id])).rows[0];
  return row ? numericAmount(row.amount) : null;
}

async function getLimits(filters = {}, dbQuery = query) {
  const conditions = [];
  const params = [];
  if (filters.role) { params.push(filters.role); conditions.push(`role_key = $${params.length}`); }
  if (filters.action) { params.push(filters.action); conditions.push(`action_key = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return (await dbQuery(
    `SELECT role_key, action_key, max_amount::text, currency, enabled, updated_at
       FROM role_action_approval_limits ${where}
      ORDER BY role_key, action_key`, params
  )).rows;
}

async function setLimit({ role, action, maxAmount, currency = 'EGP', enabled = true, userId }, dbQuery = query) {
  if (!role || !MONEY_TOOLS.has(action)) throw Object.assign(new Error('Unknown role or monetary action'), { code: 'invalid_approval_limit' });
  const amount = numericAmount(maxAmount);
  const normalizedCurrency = String(currency).toUpperCase();
  if (amount == null || !/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw Object.assign(new Error('A non-negative limit and ISO currency are required'), { code: 'invalid_approval_limit' });
  }
  return (await dbQuery(
    `INSERT INTO role_action_approval_limits
       (role_key, action_key, max_amount, currency, enabled, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$6)
     ON CONFLICT (role_key, action_key) DO UPDATE SET
       max_amount = EXCLUDED.max_amount, currency = EXCLUDED.currency,
       enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING role_key, action_key, max_amount::text, currency, enabled, updated_at`,
    [role, action, amount, normalizedCurrency, Boolean(enabled), userId || null]
  )).rows[0];
}

async function assertWithinLimit({ role, action, amount, currency = 'EGP' }, dbQuery = query) {
  const resolvedAmount = numericAmount(amount);
  if (!MONEY_TOOLS.has(action) || resolvedAmount == null) {
    throw Object.assign(new Error('The monetary value could not be determined; approval is blocked'), { code: 'approval_amount_unresolved', status: 403 });
  }
  const row = (await dbQuery(
    `SELECT max_amount::text, currency, enabled FROM role_action_approval_limits
      WHERE role_key = $1 AND action_key = $2`, [role, action]
  )).rows[0];
  if (!row || !row.enabled || row.currency !== currency || resolvedAmount > Number(row.max_amount)) {
    throw Object.assign(new Error('This role does not have a sufficient configured limit for this action'), { code: 'approval_limit_exceeded', status: 403 });
  }
  return { amount: resolvedAmount, limit: Number(row.max_amount), currency: row.currency };
}

module.exports = { MONEY_TOOLS, resolveActionAmount, getLimits, setLimit, assertWithinLimit };
