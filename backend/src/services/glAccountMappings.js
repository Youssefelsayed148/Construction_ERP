'use strict';

const { bad, missing } = require('./commercialErrors');

// Codes are intentionally conservative placeholders. Finance must confirm each purpose/code pairing before
// production use; the migration records that state on every row and the admin UI displays it.
const ACCOUNT_MAPPING_CATALOG = Object.freeze({
  cash: ['Cash / bank', 'النقدية والبنوك'],
  receivable: ['Accounts receivable', 'الذمم المدينة'],
  inventory: ['Inventory', 'المخزون'],
  payable: ['Accounts payable', 'الذمم الدائنة'],
  revenue: ['Project revenue', 'إيرادات المشاريع'],
  salary_expense: ['Salaries expense', 'مصروف الرواتب'],
  material_cost: ['Material cost', 'تكلفة المواد'],
  other_expense: ['Other expense', 'مصروفات أخرى'],
  vat_output: ['Output VAT payable', 'ضريبة القيمة المضافة المستحقة'],
  service_cost: ['Service cost', 'تكلفة الخدمات'],
  vat_input: ['Input VAT receivable', 'ضريبة القيمة المضافة المدخلة'],
  client_retention_receivable: ['Client retention receivable', 'مستحقات ضمان العميل'],
  subcontractor_retention_payable: ['Subcontractor retention payable', 'مستحقات ضمان المقاول'],
  client_advance_liability: ['Client advances liability', 'التزامات دفعات العميل المقدمة'],
  subcontractor_advance_receivable: ['Subcontractor advance recovery', 'مستحقات استرداد دفعات المقاول'],
  client_other_deductions: ['Client certificate deductions', 'استقطاعات شهادة العميل'],
  subcontractor_other_deductions: ['Subcontractor certificate deductions', 'استقطاعات شهادة المقاول'],
  subcontractor_certificate_cost: ['Subcontractor certified cost', 'تكلفة مستخلص المقاول'],
});

async function listMappings(q) {
  return (await q(
    `SELECT m.key, m.account_id, a.code AS account_code, a.name_en AS account_name_en, a.name_ar AS account_name_ar,
            a.type AS account_type, m.is_provisional, m.confirmed_by, m.confirmed_at, m.updated_by, m.updated_at
       FROM gl_account_map m LEFT JOIN accounts a ON a.id = m.account_id
      ORDER BY m.key`
  )).rows.map((row) => ({ ...row, purpose_en: ACCOUNT_MAPPING_CATALOG[row.key]?.[0] || row.key,
    purpose_ar: ACCOUNT_MAPPING_CATALOG[row.key]?.[1] || row.key }));
}

async function listAccounts(q) {
  return (await q('SELECT id, code, name_en, name_ar, type FROM accounts WHERE is_active = TRUE ORDER BY code, id')).rows;
}

async function updateMapping(q, key, accountId, userId) {
  if (!Object.prototype.hasOwnProperty.call(ACCOUNT_MAPPING_CATALOG, key)) {
    throw missing('gl_account_mapping_not_found', `Account mapping ${key} is not supported`, { key });
  }
  const account = (await q('SELECT id FROM accounts WHERE id = $1 AND is_active = TRUE', [accountId])).rows[0];
  if (!account) throw bad('gl_account_inactive', 'Choose an active chart-of-accounts entry', { account_id: accountId });
  const row = (await q(
    `UPDATE gl_account_map
        SET account_id = $2, updated_by = $3, updated_at = NOW(), is_provisional = TRUE,
            confirmed_by = NULL, confirmed_at = NULL
      WHERE key = $1 RETURNING key, account_id, is_provisional, confirmed_by, confirmed_at, updated_by, updated_at`,
    [key, accountId, userId]
  )).rows[0];
  if (!row) throw missing('gl_account_mapping_not_found', `Account mapping ${key} is not configured`, { key });
  return row;
}

async function confirmMapping(q, key, userId) {
  if (!Object.prototype.hasOwnProperty.call(ACCOUNT_MAPPING_CATALOG, key)) {
    throw missing('gl_account_mapping_not_found', `Account mapping ${key} is not supported`, { key });
  }
  const row = (await q(
    `UPDATE gl_account_map SET is_provisional = FALSE, confirmed_by = $2, confirmed_at = NOW(),
       updated_by = $2, updated_at = NOW() WHERE key = $1
       RETURNING key, account_id, is_provisional, confirmed_by, confirmed_at, updated_by, updated_at`, [key, userId]
  )).rows[0];
  if (!row) throw missing('gl_account_mapping_not_found', `Account mapping ${key} is not configured`, { key });
  return row;
}

module.exports = { ACCOUNT_MAPPING_CATALOG, listMappings, listAccounts, updateMapping, confirmMapping };
