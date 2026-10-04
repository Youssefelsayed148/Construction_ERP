// Phase 5.1 (spec 03, 04) — the organization & RBAC router. Mounted at /api/organizations (server.js).
//
// Everything runs through services/orgService.js and services/teamService.js; every write is audited
// via policy.recordAuditEvent (the same append-only trail financeEngine and the policy engine use).
// Coarse role lists stay on the sensitive surfaces per the plan (authorize(...roles) acts as a coarse
// filter ON TOP of the policy decision), so e.g. a Purchasing Manager cannot open the company profile
// editor even though their legacy blanket grant would pass the policy layer.
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const policy = require('../services/policy');
const org = require('../services/orgService');
const team = require('../services/teamService');

const name_ar = Joi.string().allow('', null);
const name_en = Joi.string().allow('', null);

function fail(res, e) {
  const status = e.status || (e.error_code ? 400 : 500);
  if (status >= 500) console.error('[ORGANIZATIONS]', e);
  return res.status(status).json({
    success: false,
    error: e.message,
    ...(e.error_code ? { error_code: e.error_code, error_params: e.error_params || {} } : {}),
  });
}

// ============ organizations (the v1-read family's write side; deactivate is SOFT) ============

router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const rows = await org.listOrganizations(query, { status: req.query.status || null });
    res.json({ success: true, data: rows });
  } catch (e) { return fail(res, e); }
});
// NOTE: GET /:id is declared LAST of the GET routes so the static sub-paths
// (/company, /departments, ...) never match the id parameter.

router.post('/', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo'), async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string().required(),
      org_type: Joi.string().valid('client', 'supplier', 'subcontractor', 'consultant', 'other').required(),
      name_ar, name_en,
      contact_person: Joi.string().allow(null, ''), phone: Joi.string().allow(null, ''),
      email: Joi.string().allow(null, ''), address: Joi.string().allow(null, ''),
      city: Joi.string().allow(null, ''), tax_id: Joi.string().allow(null, ''),
      payment_terms: Joi.string().allow(null, ''), classification: Joi.string().allow(null, ''),
      specialties: Joi.string().allow(null, ''), license_no: Joi.string().allow(null, ''),
      credit_limit: Joi.number().min(0).allow(null), insurance_amount: Joi.number().min(0).allow(null),
      insurance_expiry: Joi.date().iso().allow(null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error' });
    const created = await transaction((client) => org.createOrganization((t, p) => client.query(t, p), value));
    await policy.recordAuditEvent({
      entity: 'organization', entityId: created.id, action: 'create',
      after: created, userId: req.user.id,
    });
    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'organizations',
      description: `Created organization ${created.code}`, entityId: created.id, entityType: 'organization',
    });
    res.status(201).json({ success: true, data: created });
  } catch (e) { return fail(res, e); }
});

router.put('/:id', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo'), async (req, res) => {
  try {
    const schema = Joi.object({
      name_ar, name_en,
      contact_person: Joi.string().allow(null, ''), phone: Joi.string().allow(null, ''),
      email: Joi.string().allow(null, ''), address: Joi.string().allow(null, ''),
      city: Joi.string().allow(null, ''), tax_id: Joi.string().allow(null, ''),
      payment_terms: Joi.string().allow(null, ''), classification: Joi.string().allow(null, ''),
      specialties: Joi.string().allow(null, ''), license_no: Joi.string().allow(null, ''),
      credit_limit: Joi.number().min(0).allow(null), insurance_amount: Joi.number().min(0).allow(null),
      insurance_expiry: Joi.date().iso().allow(null),
      status: Joi.string().valid('active', 'inactive'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error' });
    const updated = await org.updateOrganization(query, req.params.id, value);
    await policy.recordAuditEvent({
      entity: 'organization', entityId: updated.id, action: 'edit',
      before: { status: updated.status }, after: updated, userId: req.user.id,
    });
    res.json({ success: true, data: updated });
  } catch (e) { return fail(res, e); }
});

router.post('/:id/deactivate', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo'), async (req, res) => {
  try {
    const updated = await org.deactivateOrganization(query, req.params.id, req.user.id);
    await policy.recordAuditEvent({
      entity: 'organization', entityId: updated.id, action: 'deactivate',
      before: { status: 'active' }, after: { status: 'inactive' }, userId: req.user.id,
    });
    res.json({ success: true, data: updated });
  } catch (e) { return fail(res, e); }
});

// ============ company profile (=the single-company settings) ============

router.get('/company', authenticate, authorize(), async (req, res) => {
  try {
    res.json({ success: true, data: await org.listCompanies() });
  } catch (e) { return fail(res, e); }
});

router.post('/company', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const schema = Joi.object({
      legal_name_ar: Joi.string().allow('', null), legal_name_en: Joi.string().allow('', null),
      cr_no: Joi.string().allow(null, ''), tax_id: Joi.string().allow(null, ''),
      address_ar: Joi.string().allow(null, ''), address_en: Joi.string().allow(null, ''),
      fee_schedule: Joi.object().pattern(Joi.string(), Joi.number()).allow(null),
      icon_url: Joi.string().allow(null, ''), phone: Joi.string().allow(null, ''),
      email: Joi.string().allow(null, ''), currency: Joi.string().allow(null, ''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error' });
    const saved = await org.upsertCompany(query, value);
    await policy.recordAuditEvent({
      entity: 'company_profile', entityId: saved.id, action: 'edit',
      after: saved, userId: req.user.id,
    });
    res.status(201).json({ success: true, data: saved });
  } catch (e) { return fail(res, e); }
});

// ============ departments ============

router.get('/departments', authenticate, authorize(), async (req, res) => {
  try {
    res.json({ success: true, data: await org.listDepartments(query, { includeInactive: req.query.include_inactive !== 'false' }) });
  } catch (e) { return fail(res, e); }
});

router.post('/departments', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo', 'hr_manager'), async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string().required(), name_ar, name_en,
      parent_department_id: Joi.number().integer().allow(null), head_user_id: Joi.number().integer().allow(null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error' });
    const created = await org.createDepartment(query, value);
    await policy.recordAuditEvent({
      entity: 'department', entityId: created.id, action: 'create',
      after: created, userId: req.user.id,
    });
    res.status(201).json({ success: true, data: created });
  } catch (e) { return fail(res, e); }
});

router.put('/departments/:id', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo', 'hr_manager'), async (req, res) => {
  try {
    const schema = Joi.object({
      name_ar, name_en,
      parent_department_id: Joi.number().integer().allow(null), head_user_id: Joi.number().integer().allow(null),
      is_active: Joi.boolean(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error' });
    const updated = await org.updateDepartment(query, req.params.id, value);
    await policy.recordAuditEvent({
      entity: 'department', entityId: updated.id, action: 'edit',
      after: { is_active: updated.is_active }, userId: req.user.id,
    });
    res.json({ success: true, data: updated });
  } catch (e) { return fail(res, e); }
});

// ============ job positions ============

router.get('/job-positions', authenticate, authorize(), async (req, res) => {
  try {
    res.json({ success: true, data: await org.listJobPositions(query, { department_id: req.query.department_id || null }) });
  } catch (e) { return fail(res, e); }
});

router.post('/job-positions', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo', 'hr_manager'), async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string().required(), name_ar, name_en,
      department_id: Joi.number().integer().required(), grade: Joi.string().allow(null, ''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error' });
    const created = await org.createJobPosition(query, value);
    await policy.recordAuditEvent({
      entity: 'job_position', entityId: created.id, action: 'create', after: created, userId: req.user.id,
    });
    res.status(201).json({ success: true, data: created });
  } catch (e) { return fail(res, e); }
});

router.put('/job-positions/:id', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo', 'hr_manager'), async (req, res) => {
  try {
    const schema = Joi.object({
      name_ar, name_en, department_id: Joi.number().integer(),
      grade: Joi.string().allow(null, ''), is_active: Joi.boolean(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error' });
    const updated = await org.updateJobPosition(query, req.params.id, value);
    await policy.recordAuditEvent({
      entity: 'job_position', entityId: updated.id, action: 'edit', userId: req.user.id,
    });
    res.json({ success: true, data: updated });
  } catch (e) { return fail(res, e); }
});

// ============ qualifications (personal records) ============

router.get('/qualifications', authenticate, authorize(), async (req, res) => {
  try {
    res.json({ success: true, data: await org.listQualifications(query, req.user, { user_id: req.query.user_id || null }) });
  } catch (e) { return fail(res, e); }
});

router.post('/qualifications', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      user_id: Joi.number().integer().allow(null), name_ar, name_en,
      issuer: Joi.string().allow(null, ''), issued_on: Joi.date().iso().allow(null), expires_on: Joi.date().iso().allow(null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error' });
    const created = await org.createQualification(query, req.user, value);
    await policy.recordAuditEvent({
      entity: 'org_qualification', entityId: created.id, action: 'create', after: created, userId: req.user.id,
    });
    res.status(201).json({ success: true, data: created });
  } catch (e) { return fail(res, e); }
});

router.delete('/qualifications/:id', authenticate, authorize(), async (req, res) => {
  try {
    const removed = await org.deleteQualification(query, req.user, req.params.id);
    await policy.recordAuditEvent({
      entity: 'org_qualification', entityId: removed.id, action: 'delete', before: removed, userId: req.user.id,
    });
    res.status(200).json({ success: true, data: removed });
  } catch (e) { return fail(res, e); }
});

// ============ bank accounts ============

router.get('/bank-accounts', authenticate, authorize(), async (req, res) => {
  try {
    res.json({ success: true, data: await org.listBankAccounts(query, { organization_id: req.query.organization_id || null }) });
  } catch (e) { return fail(res, e); }
});

router.post('/bank-accounts', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo', 'finance_manager', 'accountant_ap'), async (req, res) => {
  try {
    const schema = Joi.object({
      organization_id: Joi.number().integer().required(),
      bank_name: Joi.string().required(),
      iban: Joi.string().allow(null, ''), account_no: Joi.string().allow(null, ''),
      currency: Joi.string().default('EGP'), is_primary: Joi.boolean().default(false),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error' });
    const created = await org.createBankAccount(query, value);
    await policy.recordAuditEvent({
      entity: 'org_bank_account', entityId: created.id, action: 'create', after: created, userId: req.user.id,
    });
    res.status(201).json({ success: true, data: created });
  } catch (e) { return fail(res, e); }
});

router.put('/bank-accounts/:id', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo', 'finance_manager', 'accountant_ap'), async (req, res) => {
  try {
    const schema = Joi.object({
      bank_name: Joi.string(), iban: Joi.string().allow(null, ''), account_no: Joi.string().allow(null, ''),
      currency: Joi.string(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error' });
    const updated = await org.updateBankAccount(query, req.params.id, value);
    await policy.recordAuditEvent({
      entity: 'org_bank_account', entityId: updated.id, action: 'edit', userId: req.user.id,
    });
    res.json({ success: true, data: updated });
  } catch (e) { return fail(res, e); }
});

router.post('/bank-accounts/:id/make-primary', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo', 'finance_manager', 'accountant_ap'), async (req, res) => {
  try {
    const updated = await org.setPrimaryBankAccount(query, req.body.organization_id, req.params.id);
    await policy.recordAuditEvent({
      entity: 'org_bank_account', entityId: updated.id, action: 'edit',
      after: { is_primary: true }, userId: req.user.id,
    });
    res.json({ success: true, data: updated });
  } catch (e) { return fail(res, e); }
});

// ============ performance scores ============

router.get('/performance-scores', authenticate, authorize(), async (req, res) => {
  try {
    res.json({ success: true, data: await org.listPerformanceScores(query, {
      organization_id: req.query.organization_id || null, period: req.query.period || null,
    }) });
  } catch (e) { return fail(res, e); }
});

router.post('/performance-scores', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo', 'commercial_manager'), async (req, res) => {
  try {
    const schema = Joi.object({
      organization_id: Joi.number().integer().required(),
      period: Joi.string().required(),
      score: Joi.number().min(0).required(),
      notes: Joi.string().allow(null, ''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error' });
    const created = await org.createPerformanceScore(query, req.user, value);
    await policy.recordAuditEvent({
      entity: 'org_performance_score', entityId: created.id, action: 'create', after: created, userId: req.user.id,
    });
    res.status(201).json({ success: true, data: created });
  } catch (e) { return fail(res, e); }
});

// ============ team assignment (inheritance of access; revocation audited) ============

router.get('/team', authenticate, authorize(), async (req, res) => {
  try {
    const rows = await team.listTeamMembers(query, {
      project_id: req.query.project_id || null,
      organization_id: req.query.organization_id || null,
      role_key: req.query.role_key || null,
    });
    res.json({ success: true, data: rows });
  } catch (e) { return fail(res, e); }
});

router.get('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const row = await org.getOrganization(query, req.params.id);
    res.json({ success: true, data: row });
  } catch (e) { return fail(res, e); }
});

router.post('/team', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo', 'projects_director', 'project_manager', 'construction_manager', 'hr_manager'), async (req, res) => {
    try {
      const schema = Joi.object({
        project_id: Joi.number().integer().required(),
        user_id: Joi.number().integer().required(),
        role_key: Joi.string().required(),
        organization_id: Joi.number().integer().allow(null),
        expires_at: Joi.date().iso().allow(null),
      });
      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error' });
      const created = await team.assignTeamMember(query, { ...value, granted_by: req.user.id });
      await policy.recordAuditEvent({
        entity: 'team_assignment', entityId: created.assignment.id, action: 'create',
        after: { user_id: value.user_id, project_id: value.project_id, role_key: value.role_key, expires_at: value.expires_at || null },
        userId: req.user.id,
      });
      await logActivity({
        userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'team',
        description: `Assigned ${value.role_key} to user #${value.user_id} on project #${value.project_id}`,
        entityId: created.assignment.id, entityType: 'team_assignment',
      });
      res.status(201).json({ success: true, data: created });
    } catch (e) { return fail(res, e); }
  });

router.delete('/team/:userProjectRoleId', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo', 'projects_director', 'project_manager', 'construction_manager', 'hr_manager'), async (req, res) => {
  try {
    const removed = await team.removeTeamMember(query, req.params.userProjectRoleId);
    await policy.recordAuditEvent({
      entity: 'team_assignment', entityId: req.params.userProjectRoleId, action: 'delete',
      before: removed.summary, userId: req.user.id,
    });
    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'delete', module: 'team',
      description: `Removed assignment #${req.params.userProjectRoleId} (${removed.summary.role_key})`,
      entityId: req.params.userProjectRoleId, entityType: 'team_assignment',
    });
    res.status(200).json({ success: true, data: removed });
  } catch (e) { return fail(res, e); }
});

module.exports = router;
