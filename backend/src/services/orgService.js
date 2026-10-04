// Phase 5.1 (spec 03, 04) — Organization & RBAC service layer.
//
// Single place for the organizations-domain writes the routes expose:
//   * company profiles (single-company settings),
//   * departments / job positions (organization structure, hard disable by is_active — 5.1 does not
//     define a soft-delete semantics for departments, so "update" only moves labels/structure),
//   * delegations of authority (see services/delegationService.js for the enforcement side),
//   * org qualifications, bank accounts (exactly one primary), performance scores,
//   * the organizations CRUD itself (create/update/deactivate; deactivate is SOFT: status = 'inactive').
//
// Every write is validated here (typed errors with error_code/error_params) and audited by the
// routes via policy.recordAuditEvent / logActivity; bilingual entity names follow
// docs/system_language_fix.md: name_ar + name_en are required as a pair (one may be null, both may
// not be missing/empty).
'use strict';

const database = require('../config/database');

const query = database.query.bind(database);

// --- typed errors ----------------------------------------------------------
class OrgValidationError extends Error {
  constructor(message, code, params = {}) { super(message); this.status = 400; this.error_code = code; this.error_params = params; }
}
class OrgNotFoundError extends Error {
  constructor(message, code, params = {}) { super(message); this.status = 404; this.error_code = code; this.error_params = params; }
}
class OrgForbiddenError extends Error {
  constructor(message, code, params = {}) { super(message); this.status = 403; this.error_code = code; this.error_params = params; }
}

function toNum(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Bilingual pair rule: at most one of (name_ar, name_en) may be null, never both.
function requireBilingualPair(nameAr, nameEn, field = 'name') {
  const a = nameAr == null || String(nameAr).trim() === '' ? null : String(nameAr).trim();
  const e = nameEn == null || String(nameEn).trim() === '' ? null : String(nameEn).trim();
  if (!a && !e) {
    throw new OrgValidationError(
      `Both ${field}_ar and ${field}_en are empty — one of the two is required`,
      'bilingual_pair_required',
      { field_a: `${field}_ar`, field_b: `${field}_en` }
    );
  }
  return { [`${field}_ar`]: a, [`${field}_en`]: e };
}

// ---------------------------------------------------------------------------
// Company profile (single-company settings)
// ---------------------------------------------------------------------------

async function listCompanies(q = query) {
  return (await q('SELECT * FROM company_profiles ORDER BY id')).rows;
}

async function upsertCompany(q, fields) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const bilingual = requireBilingualPair(fields.legal_name_ar, fields.legal_name_en, 'legal_name');
  const existing = (await q('SELECT id FROM company_profiles ORDER BY id LIMIT 1')).rows[0];
  const values = {
    cr_no: fields.cr_no ?? null, tax_id: fields.tax_id ?? null,
    address_ar: fields.address_ar ?? null, address_en: fields.address_en ?? null,
    fee_schedule: fields.fee_schedule ?? null, icon_url: fields.icon_url ?? null,
    phone: fields.phone ?? null, email: fields.email ?? null,
    currency: fields.currency || 'EGP',
  };
  if (existing) {
    await q(
      `UPDATE company_profiles
          SET legal_name_ar = $1, legal_name_en = $2, cr_no = $3, tax_id = $4,
              address_ar = $5, address_en = $6, fee_schedule = $7::jsonb, icon_url = $8,
              phone = $9, email = $10, currency = $11, updated_at = now()
        WHERE id = $12`,
      [bilingual.legal_name_ar, bilingual.legal_name_en, values.cr_no, values.tax_id,
       values.address_ar, values.address_en, values.fee_schedule ? JSON.stringify(values.fee_schedule) : null,
       values.icon_url, values.phone, values.email, values.currency, existing.id]
    );
    return (await q('SELECT * FROM company_profiles WHERE id = $1', [existing.id])).rows[0];
  }
  const r = await q(
    `INSERT INTO company_profiles (legal_name_ar, legal_name_en, cr_no, tax_id, address_ar, address_en, fee_schedule, icon_url, phone, email, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11) RETURNING *`,
    [bilingual.legal_name_ar, bilingual.legal_name_en, values.cr_no, values.tax_id,
     values.address_ar, values.address_en, values.fee_schedule ? JSON.stringify(values.fee_schedule) : null,
     values.icon_url, values.phone, values.email, values.currency]
  );
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

async function listDepartments(q = query, { includeInactive = true } = {}) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const where = includeInactive ? '' : 'WHERE d.is_active';
  const r = await q(
    `SELECT d.*, p.name_en AS parent_name_en, p.name_ar AS parent_name_ar, u.name AS head_user_name
       FROM departments d
       LEFT JOIN departments p ON p.id = d.parent_department_id
       LEFT JOIN users u ON u.id = d.head_user_id
       ${where} ORDER BY d.id`);
  return r.rows;
}

const DEPARTMENT_FIELDS = ['name_ar', 'name_en', 'parent_department_id', 'head_user_id', 'is_active'];

async function createDepartment(q, { code, name_ar, name_en, parent_department_id = null, head_user_id = null }) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  if (!code || String(code).trim() === '') {
    throw new OrgValidationError('department code is required', 'department_code_required');
  }
  const names = requireBilingualPair(name_ar, name_en, 'name');
  if (parent_department_id != null) {
    const parent = (await q('SELECT id FROM departments WHERE id = $1', [toNum(parent_department_id)])).rows[0];
    if (!parent) throw new OrgNotFoundError(`Department #${parent_department_id} not found`, 'department_not_found', { department_id: toNum(parent_department_id) });
  }
  const r = await q(
    `INSERT INTO departments (code, name_ar, name_en, parent_department_id, head_user_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [String(code).trim(), names.name_ar, names.name_en, parent_department_id == null ? null : toNum(parent_department_id), head_user_id == null ? null : toNum(head_user_id)]
  ).catch((e) => {
    if (e.code === '23505') throw new OrgValidationError(`Department code "${code}" already exists`, 'department_code_taken', { code });
    if (e.code === '23503') throw new OrgValidationError('head_user_id or parent_department_id does not exist', 'department_ref_missing');
    throw e;
  });
  return r.rows[0];
}

async function updateDepartment(q, id, fields = {}) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const existing = (await q('SELECT * FROM departments WHERE id = $1', [toNum(id)])).rows[0];
  if (!existing) throw new OrgNotFoundError(`Department #${id} not found`, 'department_not_found', { department_id: toNum(id) });
  const sets = [];
  const params = [];
  if (fields.name_ar !== undefined || fields.name_en !== undefined) {
    const names = requireBilingualPair(fields.name_ar ?? existing.name_ar, fields.name_en ?? existing.name_en, 'name');
    sets.push('name_ar = $' + (params.push(names.name_ar)), 'name_en = $' + (params.push(names.name_en)));
  }
  for (const key of ['parent_department_id', 'head_user_id', 'is_active']) {
    if (fields[key] !== undefined) {
      if (key === 'parent_department_id' && toNum(fields[key]) === toNum(id)) {
        throw new OrgValidationError('a department cannot be its own parent', 'department_parent_self', { department_id: toNum(id) });
      }
      sets.push(`${key} = $${params.push(key === 'is_active' ? Boolean(fields[key]) : toNum(fields[key]) ?? null)}`);
    }
  }
  if (!sets.length) return existing;
  params.push(toNum(id));
  const r = await q(`UPDATE departments SET updated_at = now(), ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// Job positions
// ---------------------------------------------------------------------------

async function listJobPositions(q = query, { department_id = null } = {}) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const conds = [];
  const params = [];
  if (department_id != null) { conds.push(`jp.department_id = $${params.push(toNum(department_id))}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const r = await q(
    `SELECT jp.*, d.name_en AS department_name_en, d.name_ar AS department_name_ar
       FROM job_positions jp LEFT JOIN departments d ON d.id = jp.department_id
       ${where} ORDER BY jp.id`, params);
  return r.rows;
}

async function createJobPosition(q, { code, name_ar, name_en, department_id, grade = null }) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  if (!code || String(code).trim() === '') throw new OrgValidationError('job position code is required', 'job_position_code_required');
  const names = requireBilingualPair(name_ar, name_en, 'name');
  if (department_id == null) throw new OrgValidationError('department_id is required', 'job_position_department_required');
  const dept = (await q('SELECT id FROM departments WHERE id = $1', [toNum(department_id)])).rows[0];
  if (!dept) throw new OrgNotFoundError(`Department #${department_id} not found`, 'department_not_found', { department_id: toNum(department_id) });
  const r = await q(
    `INSERT INTO job_positions (code, name_ar, name_en, department_id, grade)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [String(code).trim(), names.name_ar, names.name_en, toNum(department_id), grade]
  ).catch((e) => {
    if (e.code === '23505') throw new OrgValidationError(`Job position code "${code}" already exists`, 'job_position_code_taken', { code });
    throw e;
  });
  return r.rows[0];
}

async function updateJobPosition(q, id, fields = {}) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const existing = (await q('SELECT * FROM job_positions WHERE id = $1', [toNum(id)])).rows[0];
  if (!existing) throw new OrgNotFoundError(`Job position #${id} not found`, 'job_position_not_found', { job_position_id: toNum(id) });
  const sets = [];
  const params = [];
  if (fields.name_ar !== undefined || fields.name_en !== undefined) {
    const names = requireBilingualPair(fields.name_ar ?? existing.name_ar, fields.name_en ?? existing.name_en, 'name');
    sets.push('name_ar = $' + (params.push(names.name_ar)), 'name_en = $' + (params.push(names.name_en)));
  }
  if (fields.department_id !== undefined) {
    const dept = (await q('SELECT id FROM departments WHERE id = $1', [toNum(fields.department_id)])).rows[0];
    if (!dept) throw new OrgNotFoundError(`Department #${fields.department_id} not found`, 'department_not_found', { department_id: toNum(fields.department_id) });
    sets.push(`department_id = $${params.push(toNum(fields.department_id))}`);
  }
  if (fields.grade !== undefined) sets.push(`grade = $${params.push(fields.grade)}`);
  if (fields.is_active !== undefined) sets.push(`is_active = $${params.push(Boolean(fields.is_active))}`);
  if (!sets.length) return existing;
  params.push(toNum(id));
  const r = await q(`UPDATE job_positions SET updated_at = now(), ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// Organizations CRUD (soft deactivate only)
// ---------------------------------------------------------------------------

async function listOrganizations(q = query, { status = null } = {}) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const conds = [];
  const params = [];
  if (status != null) { conds.push(`status = $${params.push(status)}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const r = await q(`SELECT * FROM organizations ${where} ORDER BY id DESC`, params);
  return r.rows;
}

async function getOrganization(q, id) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const row = (await q('SELECT * FROM organizations WHERE id = $1', [toNum(id)])).rows[0];
  if (!row) throw new OrgNotFoundError(`Organization #${id} not found`, 'organization_not_found', { organization_id: toNum(id) });
  return row;
}

async function createOrganization(q, fields) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  if (!fields.code || String(fields.code).trim() === '') {
    throw new OrgValidationError('organization code is required', 'organization_code_required');
  }
  if (!fields.org_type) throw new OrgValidationError('organization org_type is required', 'organization_type_required');
  const names = requireBilingualPair(fields.name_ar, fields.name_en, 'name');
  const cols = ['code', 'name_ar', 'name_en', 'org_type'];
  const vals = [String(fields.code).trim(), names.name_ar, names.name_en, fields.org_type];
  for (const key of ['contact_person', 'phone', 'email', 'address', 'city', 'tax_id', 'payment_terms', 'classification', 'specialties', 'license_no']) {
    if (fields[key] !== undefined && fields[key] !== null) { cols.push(key); vals.push(fields[key]); }
  }
  for (const key of ['credit_limit', 'insurance_amount']) {
    if (fields[key] !== undefined && fields[key] !== null) { cols.push(key); vals.push(toNum(fields[key])); }
  }
  if (fields.insurance_expiry !== undefined && fields.insurance_expiry !== null) { cols.push('insurance_expiry'); vals.push(fields.insurance_expiry); }
  const r = await q(
    `INSERT INTO organizations (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    vals
  ).catch((e) => {
    if (e.code === '23505') throw new OrgValidationError(`Organization code "${fields.code}" already exists`, 'organization_code_taken', { code: fields.code });
    throw e;
  });
  return r.rows[0];
}

async function updateOrganization(q, id, fields = {}) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const existing = (await q('SELECT * FROM organizations WHERE id = $1', [toNum(id)])).rows[0];
  if (!existing) throw new OrgNotFoundError(`Organization #${id} not found`, 'organization_not_found', { organization_id: toNum(id) });
  const sets = [`updated_at = now()`];
  const params = [];
  if (fields.name_ar !== undefined || fields.name_en !== undefined) {
    const names = requireBilingualPair(fields.name_ar ?? existing.name_ar, fields.name_en ?? existing.name_en, 'name');
    sets.push(`name_ar = $${params.push(names.name_ar)}`, `name_en = $${params.push(names.name_en)}`);
  }
  for (const key of ['contact_person', 'phone', 'email', 'address', 'city', 'tax_id', 'payment_terms', 'classification', 'specialties', 'license_no', 'status']) {
    if (fields[key] !== undefined) { sets.push(`${key} = $${params.push(fields[key])}`); }
  }
  for (const key of ['credit_limit', 'insurance_amount']) {
    if (fields[key] !== undefined) { sets.push(`${key} = $${params.push(toNum(fields[key]))}`); }
  }
  if (fields.insurance_expiry !== undefined) { sets.push(`insurance_expiry = $${params.push(fields.insurance_expiry)}`); }
  params.push(toNum(id));
  const r = await q(`UPDATE organizations SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  return r.rows[0];
}

// Soft deactivate: status 'inactive' — never a row delete, exactly like users (migration 0011).
async function deactivateOrganization(q, id, userId) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const existing = (await q('SELECT * FROM organizations WHERE id = $1', [toNum(id)])).rows[0];
  if (!existing) throw new OrgNotFoundError(`Organization #${id} not found`, 'organization_not_found', { organization_id: toNum(id) });
  if (existing.status === 'inactive') {
    throw new OrgValidationError(`Organization #${id} is already inactive`, 'organization_already_inactive', { organization_id: toNum(id) });
  }
  const r = await q(
    "UPDATE organizations SET status = 'inactive', updated_at = now() WHERE id = $1 RETURNING *", [toNum(id)]);
  void userId;
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// Delegations of authority (the row store; enforcement lives in delegationService/policy)
// ---------------------------------------------------------------------------

const DELEGATION_SCOPES = ['*', 'approvals'];

async function listDelegations(q, actor) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const privileged = actor && (actor.role === 'owner' || actor.role === 'admin');
  if (privileged) {
    return (await q(
      `SELECT d.*, du.name AS delegate_name, du.role AS delegate_role, fu.name AS delegator_name, fu.role AS delegator_role
         FROM delegations d JOIN users du ON du.id = d.delegate_user_id JOIN users fu ON fu.id = d.delegate_from_user_id
        ORDER BY d.id DESC`)).rows;
  }
  return (await q(
    `SELECT d.*, du.name AS delegate_name, du.role AS delegate_role, fu.name AS delegator_name, fu.role AS delegator_role
       FROM delegations d JOIN users du ON du.id = d.delegate_user_id JOIN users fu ON fu.id = d.delegate_from_user_id
      WHERE d.delegate_user_id = $1 OR d.delegate_from_user_id = $1
      ORDER BY d.id DESC`, [actor.id])).rows;
}

async function createDelegation(q, actor, {
  delegate_user_id, delegate_from_user_id = null, module_scope = '*',
  max_amount = null, valid_from = null, valid_to = null, notes = null,
}) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const delegator = toNum(actor.id);
  const delegate = toNum(delegate_user_id);
  if (delegate == null) throw new OrgValidationError('delegate_user_id is required', 'delegation_delegate_required');
  if (delegator === delegate) {
    throw new OrgValidationError('a user cannot delegate to themselves', 'delegation_self_ref', { delegate_user_id: delegate });
  }
  const scope = module_scope || '*';
  if (!DELEGATION_SCOPES.includes(scope)) {
    throw new OrgValidationError(
      `module_scope "${scope}" is not enforced yet — use one of ${DELEGATION_SCOPES.join(', ')}`,
      'delegation_scope_unknown', { module_scope: scope, known: DELEGATION_SCOPES });
  }
  const from = valid_from || new Date().toISOString().slice(0, 10);
  const to = valid_to;
  if (!to) throw new OrgValidationError('valid_to is required', 'delegation_valid_to_required');
  if (String(from) > String(to)) {
    throw new OrgValidationError('valid_from must be on or before valid_to', 'delegation_window_inverted', { valid_from: from, valid_to: to });
  }
  if (max_amount != null && !(toNum(max_amount) >= 0)) {
    throw new OrgValidationError('max_amount must be a positive amount or omitted', 'delegation_amount_invalid', { max_amount });
  }
  const dup = (await q(
    `SELECT id FROM delegations
      WHERE delegate_user_id = $1 AND delegate_from_user_id = $2 AND module_scope = $3 AND is_active`, [delegate, delegator, scope])).rows[0];
  if (dup) {
    throw new OrgValidationError(
      `An active delegation ${delegator} → ${delegate} with scope "${scope}" already exists (#${dup.id})`,
      'delegation_duplicate', { delegation_id: dup.id, delegate_user_id: delegate, module_scope: scope });
  }
  const r = await q(
    `INSERT INTO delegations (delegate_user_id, delegate_from_user_id, module_scope, max_amount, valid_from, valid_to, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [delegate, delegator, scope, max_amount == null ? null : toNum(max_amount), from, to, notes, delegator]
  );
  return r.rows[0];
}

async function deactivateDelegation(q, actor, id) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const existing = (await q('SELECT * FROM delegations WHERE id = $1', [toNum(id)])).rows[0];
  if (!existing) throw new OrgNotFoundError(`Delegation #${id} not found`, 'delegation_not_found', { delegation_id: toNum(id) });
  const privileged = actor && (actor.role === 'owner' || actor.role === 'admin');
  if (!privileged && toNum(actor.id) !== toNum(existing.delegate_from_user_id)) {
    throw new OrgForbiddenError('Only the delegator (or an owner/admin) can deactivate a delegation', 'delegation_not_mine', { delegation_id: toNum(id) });
  }
  if (!existing.is_active) {
    throw new OrgValidationError(`Delegation #${id} is already inactive`, 'delegation_already_inactive', { delegation_id: toNum(id) });
  }
  const r = await q('UPDATE delegations SET is_active = false WHERE id = $1 RETURNING *', [toNum(id)]);
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// Qualifications (personal records; delete is own-rows only — or owner/admin)
// ---------------------------------------------------------------------------

async function listQualifications(q, actor, { user_id = null } = {}) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const target = toNum(user_id) ?? toNum(actor.id);
  const privileged = actor && (actor.role === 'owner' || actor.role === 'admin');
  const rows = (await q(
    `SELECT oq.*, u.name AS user_name FROM org_qualifications oq JOIN users u ON u.id = oq.user_id
      WHERE ($1::int IS NULL OR oq.user_id = $1) ORDER BY oq.id DESC`, [target])).rows;
  if (!privileged && target !== toNum(actor.id)) {
    // A plain user can list only their own qualifications.
    return rows.filter((r) => toNum(r.user_id) === toNum(actor.id));
  }
  return rows;
}

async function createQualification(q, actor, { user_id = null, name_ar, name_en, issuer, issued_on, expires_on }) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const target = user_id == null ? toNum(actor.id) : toNum(user_id);
  const privileged = actor && (actor.role === 'owner' || actor.role === 'admin');
  if (target !== toNum(actor.id) && !privileged) {
    throw new OrgForbiddenError('Only an owner/admin can record a qualification for someone else', 'qualification_not_mine');
  }
  const names = requireBilingualPair(name_ar, name_en, 'name');
  if (issued_on && expires_on && String(expires_on) < String(issued_on)) {
    throw new OrgValidationError('expires_on must be on or after issued_on', 'qualification_dates_inverted', { issued_on, expires_on });
  }
  const r = await q(
    `INSERT INTO org_qualifications (user_id, name_ar, name_en, issuer, issued_on, expires_on)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [target, names.name_ar, names.name_en, issuer ?? null, issued_on ?? null, expires_on ?? null]);
  return r.rows[0];
}

async function deleteQualification(q, actor, id) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const existing = (await q('SELECT * FROM org_qualifications WHERE id = $1', [toNum(id)])).rows[0];
  if (!existing) throw new OrgNotFoundError(`Qualification #${id} not found`, 'qualification_not_found', { qualification_id: toNum(id) });
  const privileged = actor && (actor.role === 'owner' || actor.role === 'admin');
  if (toNum(existing.user_id) !== toNum(actor.id) && !privileged) {
    throw new OrgForbiddenError('Only the qualification holder (or an owner/admin) can delete it', 'qualification_not_mine', { qualification_id: toNum(id) });
  }
  const r = await q('DELETE FROM org_qualifications WHERE id = $1 RETURNING *', [toNum(id)]);
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// Bank accounts — exactly one primary per organization
// ---------------------------------------------------------------------------

async function listBankAccounts(q = query, { organization_id = null } = {}) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const params = [];
  const conds = [];
  if (organization_id != null) conds.push(`organization_id = $${params.push(toNum(organization_id))}`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return (await q(
    `SELECT b.*, o.code AS organization_code, o.name_ar AS organization_name_ar, o.name_en AS organization_name_en
       FROM org_bank_accounts b JOIN organizations o ON o.id = b.organization_id
       ${where} ORDER BY b.is_primary DESC, b.id`, params)).rows;
}

async function createBankAccount(q, { organization_id, bank_name, iban, account_no, currency = 'EGP', is_primary = false }) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  if (toNum(organization_id) == null) throw new OrgValidationError('organization_id is required', 'bank_account_org_required');
  if (!bank_name || String(bank_name).trim() === '') throw new OrgValidationError('bank_name is required', 'bank_account_name_required');
  if ((iban == null || String(iban).trim() === '') && (account_no == null || String(account_no).trim() === '')) {
    throw new OrgValidationError('iban or account_no is required', 'bank_account_ident_required');
  }
  const org = (await q('SELECT id FROM organizations WHERE id = $1', [toNum(organization_id)])).rows[0];
  if (!org) throw new OrgNotFoundError(`Organization #${organization_id} not found`, 'organization_not_found', { organization_id: toNum(organization_id) });
  const wantPrimary = Boolean(is_primary);
  return database.transaction(async (client) => {
    const cq = (t, p) => client.query(t, p);
    const existing = (await cq(
      'SELECT count(*)::int n, COALESCE(SUM(CASE WHEN is_primary THEN 1 ELSE 0 END), 0)::int primaries FROM org_bank_accounts WHERE organization_id = $1',
      [toNum(organization_id)])).rows[0];
    // Exactly one primary per organization: the first account becomes primary unless one is explicit.
    const makePrimary = wantPrimary || existing.n === 0;
    if (makePrimary) {
      await cq('UPDATE org_bank_accounts SET is_primary = false WHERE organization_id = $1', [toNum(organization_id)]);
    }
    const r = await cq(
      `INSERT INTO org_bank_accounts (organization_id, bank_name, iban, account_no, currency, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [toNum(organization_id), String(bank_name).trim(), iban || null, account_no || null, currency, makePrimary]);
    return r.rows[0];
  }).catch((e) => {
    if (e.code === '23505' && String(e.detail || '').includes('primary')) {
      throw new OrgValidationError('another bank account of this organization is already the primary', 'bank_account_primary_taken', { organization_id: toNum(organization_id) });
    }
    throw e;
  });
}

async function updateBankAccount(q, id, fields = {}) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const existing = (await q('SELECT * FROM org_bank_accounts WHERE id = $1', [toNum(id)])).rows[0];
  if (!existing) throw new OrgNotFoundError(`Bank account #${id} not found`, 'bank_account_not_found', { bank_account_id: toNum(id) });
  const sets = [];
  const params = [];
  for (const key of ['bank_name', 'iban', 'account_no', 'currency']) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${params.push(fields[key])}`);
    }
  }
  if (!sets.length) return existing;
  params.push(toNum(id));
  const r = await q(`UPDATE org_bank_accounts SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  return r.rows[0];
}

async function setPrimaryBankAccount(q, organization_id, id) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const account = (await q('SELECT * FROM org_bank_accounts WHERE id = $1', [toNum(id)])).rows[0];
  if (!account) throw new OrgNotFoundError(`Bank account #${id} not found`, 'bank_account_not_found', { bank_account_id: toNum(id) });
  if (toNum(account.organization_id) !== toNum(organization_id)) {
    throw new OrgValidationError(`Bank account #${id} does not belong to organization #${organization_id}`,
      'bank_account_wrong_organization', { bank_account_id: toNum(id), organization_id: toNum(organization_id) });
  }
  return database.transaction(async (client) => {
    const cq = (t, p) => client.query(t, p);
    await cq('UPDATE org_bank_accounts SET is_primary = false WHERE organization_id = $1', [toNum(organization_id)]);
    const r = await cq('UPDATE org_bank_accounts SET is_primary = true WHERE id = $1 RETURNING *', [toNum(id)]);
    return r.rows[0];
  });
}

// ---------------------------------------------------------------------------
// Performance scores
// ---------------------------------------------------------------------------

async function listPerformanceScores(q = query, { organization_id = null, period = null } = {}) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  const params = [];
  const conds = [];
  if (organization_id != null) conds.push(`organization_id = $${params.push(toNum(organization_id))}`);
  if (period != null) conds.push(`period = $${params.push(period)}`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return (await q(
    `SELECT s.*, o.code AS organization_code, u.name AS scored_by_name
       FROM org_performance_scores s JOIN organizations o ON o.id = s.organization_id
       LEFT JOIN users u ON u.id = s.scored_by ${where} ORDER BY s.id`, params)).rows;
}

async function createPerformanceScore(q, actor, { organization_id, period, score, notes = null }) {
  if (typeof q === 'object' && typeof q.query === 'function') q = q.query;
  if (toNum(organization_id) == null) throw new OrgValidationError('organization_id is required', 'performance_org_required');
  if (!period) throw new OrgValidationError('period is required', 'performance_period_required');
  const value = toNum(score);
  if (value == null || value < 0) throw new OrgValidationError('score must be a number >= 0', 'performance_score_invalid', { score });
  const org = (await q('SELECT id FROM organizations WHERE id = $1', [toNum(organization_id)])).rows[0];
  if (!org) throw new OrgNotFoundError(`Organization #${organization_id} not found`, 'organization_not_found', { organization_id: toNum(organization_id) });
  const existing = (await q(
    'SELECT id FROM org_performance_scores WHERE organization_id = $1 AND period = $2',
    [toNum(organization_id), period])).rows[0];
  if (existing) {
    throw new OrgValidationError(`A performance score for organization #${organization_id} and period "${period}" already exists (#${existing.id})`,
      'performance_duplicate', { organization_id: toNum(organization_id), period });
  }
  const r = await q(
    `INSERT INTO org_performance_scores (organization_id, period, score, notes, scored_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [toNum(organization_id), period, value, notes, toNum(actor.id)]);
  return r.rows[0];
}

module.exports = {
  ITEMS: DELEGATION_SCOPES,
  OrgValidationError,
  OrgNotFoundError,
  OrgForbiddenError,
  requireBilingualPair,
  listCompanies,
  upsertCompany,
  listDepartments,
  createDepartment,
  updateDepartment,
  listJobPositions,
  createJobPosition,
  updateJobPosition,
  listOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  deactivateOrganization,
  listDelegations,
  createDelegation,
  deactivateDelegation,
  listQualifications,
  createQualification,
  deleteQualification,
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  setPrimaryBankAccount,
  listPerformanceScores,
  createPerformanceScore,
};
