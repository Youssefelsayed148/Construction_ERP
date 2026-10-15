const { authorizedProjectId, authorizeProjectPayload } = require('../services/authorizedProject');
// Phase 25 — handover, closeout & warranty routes (mounted at /api/handover).
//
// The full §79 lifecycle, the §80 warranty/DLP claim flow with SLA tracking,
// the package checklist with per-item document upload and completion percent,
// asset/as-built/O&M/warranty registers, and the branded document set
// (handover checklist, T&C sheet, asset register, as-built register, O&M
// register, warranty register, handover certificate).
//
// A project with zero punch items renders a correct 0%-complete state, never
// an error.

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { queryPaginated } = require('../utils/pagination');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { auditedTransaction } = require('../utils/auditedTransaction');
const { auditedMutation } = require('../utils/auditedMutation');
const engine = require('../services/handoverEngine');
const { renderDocument } = require('../utils/procurementPdf');
const { nextNumber } = require('../services/numbering');
const { dateOnly } = require('../utils/validation');
const { normalizeDateFields } = require('../utils/dateOnly');
const { typedFail } = require('../utils/typedRoute');

function handoverProjectAllowed(req, projectId) {
  return req.accessScope?.companyWide || (req.accessScope?.projectIds || []).includes(Number(projectId));
}

function handoverFailure(res, status, code) {
  return res.status(status).json({ success: false, error_code: code });
}

function handoverError(res, error, tag, req) {
  if (error.error_code) return handoverFailure(res, error.statusCode || 400, error.error_code);
  return typedFail(res, error, tag, req);
}

async function projectNameFor(q, projectId) {
  try {
    const r = await q('SELECT name_en, name_ar FROM projects WHERE id = $1', [projectId]);
    return r.rows[0] ? (r.rows[0].name_en || r.rows[0].name_ar || `Project #${projectId}`) : `Project #${projectId}`;
  } catch (e) { return `Project #${projectId}`; }
}
function sendPdf(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

// ---------------------------------------------------------------------------
// Handover process
// ---------------------------------------------------------------------------

router.get('/process/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    const process = (await query('SELECT * FROM handover_processes WHERE project_id = $1', [req.params.projectId])).rows[0] || null;
    const readiness = await engine.handoverReadiness(query, req.params.projectId);
    res.json({ success: true, data: { process, readiness } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/process/:projectId/start', authenticate, authorize(), async (req, res) => {
  try {
    const process = await auditedTransaction(async (q) => {
      const started = await engine.startHandover(q, req.params.projectId, req.user);
      await engine.ensureDefaultPackageItems(q, req.params.projectId);
      return started;
    }, (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'handover', description: `Started handover process ${result.process_number}`, entityId: result.id, entityType: 'handover_process' }));
    res.status(201).json({ success: true, data: { process, readiness: await engine.handoverReadiness(query, req.params.projectId) } });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/process/:id/transition', authenticate, authorize('owner', 'admin', 'project_manager'), async (req, res) => {
  try {
    const schema = Joi.object({ status: Joi.string().valid(...engine.HANDOVER_STATES).required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const process = await auditedTransaction((q) => engine.transitionHandover(q, req.params.id, value.status, req.user), (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'handover', description: `Handover advanced to ${value.status}`, entityId: result.id, entityType: 'handover_process' }));
    res.json({ success: true, data: process });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Package checklist
// ---------------------------------------------------------------------------

router.get('/package/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    if (!handoverProjectAllowed(req, req.params.projectId)) return handoverFailure(res, 403, 'project_scope_denied');
    const items = (await query(
      `SELECT hi.*, u.name as uploaded_by_name, vu.name as verified_by_name, d.title AS project_document_title, d.file_url AS project_document_url
       FROM handover_package_items hi LEFT JOIN users u ON hi.uploaded_by = u.id
       LEFT JOIN users vu ON hi.verified_by = vu.id LEFT JOIN project_documents d ON d.id = hi.project_document_id
       WHERE hi.project_id = $1 ORDER BY hi.id`,
      [req.params.projectId]
    )).rows;
    const readiness = await engine.handoverReadiness(query, req.params.projectId);
    res.json({ success: true, data: { items, readiness } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/package/:projectId/items', authenticate, authorize(), async (req, res) => {
  try {
    if (!handoverProjectAllowed(req, req.params.projectId)) return handoverFailure(res, 403, 'project_scope_denied');
    const schema = Joi.object({
      item_type: Joi.string().valid(...engine.PACKAGE_ITEM_TYPES).required(),
      title: Joi.string().required(),
      required: Joi.boolean().default(true),
      notes: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const out = await auditedMutation(req, { action: 'create', module: 'handover', entityType: 'handover_package_item' }, async (q) => {
      const r = await q(
        `INSERT INTO handover_package_items (project_id, item_type, title, required, notes, status) VALUES ($1,$2,$3,$4,$5,'pending') RETURNING *`,
        [req.params.projectId, value.item_type, value.title, value.required, value.notes || null]);
      return { data: r.rows[0], entityId: r.rows[0].id, projectId: r.rows[0].project_id, after: r.rows[0], description: `Added handover package item "${value.title}"` };
    });
    res.status(201).json({ success: true, data: out.data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/package/items/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_document_id: Joi.number().integer().positive().allow(null),
      notes: Joi.string().allow('', null),
      status: Joi.string().valid('pending', 'uploaded'),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const result = await auditedTransaction(async (q) => {
      const item = (await q('SELECT * FROM handover_package_items WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!item || !handoverProjectAllowed(req, item.project_id)) throw Object.assign(new Error('handover_package_item_not_found'), { statusCode: item ? 403 : 404, error_code: 'handover_package_item_not_found' });
      if (Object.prototype.hasOwnProperty.call(value, 'project_document_id') && value.project_document_id != null) {
        const document = await q('SELECT file_url FROM project_documents WHERE id = $1 AND project_id = $2', [value.project_document_id, item.project_id]);
        if (!document.rows.length) throw Object.assign(new Error('handover_document_project_mismatch'), { statusCode: 400, error_code: 'handover_document_project_mismatch' });
        value.document_url = document.rows[0].file_url;
      } else if (Object.prototype.hasOwnProperty.call(value, 'project_document_id')) {
        value.document_url = null;
      }
      const effectiveDocumentId = Object.prototype.hasOwnProperty.call(value, 'project_document_id') ? value.project_document_id : item.project_document_id;
      if (value.status === 'uploaded' && effectiveDocumentId == null) {
        throw Object.assign(new Error('handover_document_required'), { statusCode: 400, error_code: 'handover_document_required' });
      }
      const sets = []; const params = []; let idx = 1;
      for (const key of ['project_document_id', 'document_url', 'notes', 'status']) {
        if (value[key] === undefined) continue;
        sets.push(`${key} = $${idx++}`); params.push(value[key]);
      }
      if (value.project_document_id != null || value.status === 'uploaded') {
        sets.push(`uploaded_by = $${idx++}`, `uploaded_at = $${idx++}`); params.push(req.user.id, new Date());
      }
      params.push(req.params.id);
      return q(`UPDATE handover_package_items SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    }, (r) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'handover', description: `Updated handover package item #${req.params.id}`, entityId: req.params.id, entityType: 'handover_package_item' }));
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { return handoverError(res, error, 'HANDOVER_PACKAGE_UPDATE', req); }
});

router.post('/package/items/:id/verify', authenticate, authorize('owner', 'admin', 'project_manager', 'consultant'), async (req, res) => {
  try {
    const schema = Joi.object({
      status: Joi.string().valid('approved', 'complete', 'pending').required(),
      notes: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const out = await auditedMutation(req, { action: 'verify', module: 'handover', entityType: 'handover_package_item' }, async (q) => {
      const before = (await q('SELECT * FROM handover_package_items WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!before) return { skipAudit: true };
      const r = await q(
        `UPDATE handover_package_items SET status = $1, verified_by = $2, verified_at = NOW(), notes = COALESCE($3, notes) WHERE id = $4 RETURNING *`,
        [value.status, req.user.id, value.notes || null, req.params.id]);
      return { data: r.rows[0], entityId: before.id, projectId: before.project_id, before, after: r.rows[0], oldStatus: before.status, newStatus: value.status, description: `Handover item "${before.title}" ${value.status}` };
    });
    if (!out.data) return res.status(404).json({ success: false, error: 'Package item not found' });
    res.json({ success: true, data: out.data });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Asset register
// ---------------------------------------------------------------------------

router.get('/assets', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return handoverFailure(res, 400, 'project_id_required');
    if (!handoverProjectAllowed(req, project_id)) return handoverFailure(res, 403, 'project_scope_denied');
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`a.project_id = $${idx++}`); params.push(project_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await queryPaginated(req, res, query, { sql: `SELECT a.*, pl.name as location_name,
              COALESCE(so.name_en, so.name_ar) as supplier_name,
              COALESCE(sco.name_en, sco.name_ar) as subcontractor_name
       FROM asset_register a LEFT JOIN project_locations pl ON a.project_location_id = pl.id
       LEFT JOIN organizations so ON a.supplier_organization_id = so.id
       LEFT JOIN organizations sco ON a.subcontractor_organization_id = sco.id
       ${where} ORDER BY a.id`, params: params, orderBy: [{"column":"id","direction":"ASC"}] });
    res.json({ success: true, data: r.rows.map((row) => normalizeDateFields(row, ['commissioning_date', 'warranty_start', 'warranty_end'])) });
  } catch (error) { return handoverError(res, error, 'HANDOVER_ASSET_READ', req); }
});

router.post('/assets', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      asset_code: Joi.string().required(),
      name: Joi.string().required(),
      project_location_id: Joi.number().integer().allow(null).optional(),
      model: Joi.string().allow('', null).optional(),
      serial_no: Joi.string().allow('', null).optional(),
      supplier_organization_id: Joi.number().integer().allow(null).optional(),
      subcontractor_organization_id: Joi.number().integer().allow(null).optional(),
      commissioning_date: dateOnly().allow(null).optional(),
      warranty_start: dateOnly().allow(null).optional(),
      warranty_end: dateOnly().allow(null).optional(),
    }).custom((value, helpers) => value.warranty_start && value.warranty_end && value.warranty_end < value.warranty_start
      ? helpers.error('date.range') : value);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    authorizeProjectPayload(req, value);
    if (!handoverProjectAllowed(req, authorizedProjectId(req, value))) return handoverFailure(res, 403, 'project_scope_denied');
    const r = await auditedTransaction((q) => q(
      `INSERT INTO asset_register (project_id, asset_code, name, project_location_id, model, serial_no,
         supplier_organization_id, subcontractor_organization_id, commissioning_date, warranty_start, warranty_end, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [authorizedProjectId(req, value), value.asset_code, value.name, value.project_location_id || null, value.model || null,
       value.serial_no || null, value.supplier_organization_id || null, value.subcontractor_organization_id || null,
       value.commissioning_date || null, value.warranty_start || null, value.warranty_end || null, req.user.id]), (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'handover', description: `Registered asset ${value.asset_code}`, entityId: result.rows[0].id, entityType: 'asset_register' }));
    res.status(201).json({ success: true, data: normalizeDateFields(r.rows[0], ['commissioning_date', 'warranty_start', 'warranty_end']) });
  } catch (error) { return handoverError(res, error, 'HANDOVER_ASSET_CREATE', req); }
});

router.get('/assets/:id/documents', authenticate, authorize(), async (req, res) => {
  try {
    const asset = (await query('SELECT id, project_id FROM asset_register WHERE id = $1', [req.params.id])).rows[0];
    if (!asset || !handoverProjectAllowed(req, asset.project_id)) return handoverFailure(res, 404, 'asset_not_found');
    const result = await queryPaginated(req, res, query, { sql: `SELECT ad.*, d.doc_number, d.file_url, d.status AS document_status
       FROM asset_documents ad JOIN project_documents d ON d.id = ad.project_document_id
       WHERE ad.asset_id = $1 ORDER BY ad.linked_at DESC, ad.id DESC`, params: [req.params.id], orderBy: [{"column":"linked_at","direction":"DESC"},{"column":"id","direction":"DESC"}] });
    res.json({ success: true, data: result.rows });
  } catch (error) { return handoverError(res, error, 'HANDOVER_ASSET_DOCUMENT_READ', req); }
});

router.post('/assets/:id/documents', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_document_id: Joi.number().integer().positive().required(),
      document_type: Joi.string().valid('manual', 'warranty', 'certificate', 'photo', 'other').default('other'),
      title: Joi.string().max(255).allow('', null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return handoverFailure(res, 400, 'invalid_asset_document');
    const result = await auditedTransaction(async (q) => {
      const asset = (await q('SELECT id, project_id FROM asset_register WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!asset || !handoverProjectAllowed(req, asset.project_id)) throw Object.assign(new Error('asset_not_found'), { statusCode: asset ? 403 : 404, error_code: 'asset_not_found' });
      const document = (await q('SELECT id, title FROM project_documents WHERE id = $1 AND project_id = $2', [value.project_document_id, asset.project_id])).rows[0];
      if (!document) throw Object.assign(new Error('handover_document_project_mismatch'), { statusCode: 400, error_code: 'handover_document_project_mismatch' });
      return q(
        `INSERT INTO asset_documents (project_id, asset_id, project_document_id, document_type, title, linked_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [asset.project_id, asset.id, document.id, value.document_type, value.title || document.title, req.user.id]);
    }, (r) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'handover', description: `Linked a controlled document to asset #${req.params.id}`, entityId: r.rows[0].id, entityType: 'asset_document' }));
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    return handoverError(res, error, 'HANDOVER_ASSET_DOCUMENT_CREATE', req);
  }
});

router.get('/warranties', authenticate, authorize(), async (req, res) => {
  const projectId = Number(req.query.project_id);
  if (!Number.isInteger(projectId) || projectId < 1) return handoverFailure(res, 400, 'invalid_project_id');
  if (!handoverProjectAllowed(req, projectId)) return handoverFailure(res, 403, 'project_scope_denied');
  try {
    const result = await queryPaginated(req, res, query, { sql: `SELECT w.*, a.asset_code, a.name AS asset_name, d.title AS project_document_title, d.file_url AS project_document_url,
              CASE WHEN w.status = 'active' AND w.end_date < CURRENT_DATE THEN 'expired' ELSE w.status END AS effective_status
       FROM warranties w LEFT JOIN asset_register a ON a.id = w.asset_id
       LEFT JOIN project_documents d ON d.id = w.project_document_id
       WHERE w.project_id = $1 ORDER BY w.end_date, w.id`, params: [projectId], orderBy: [{"column":"end_date","direction":"ASC"},{"column":"id","direction":"ASC"}] });
    res.json({ success: true, data: result.rows.map((row) => normalizeDateFields(row, ['start_date', 'end_date'])) });
  } catch (error) { return handoverError(res, error, 'HANDOVER_WARRANTY_READ', req); }
});

router.post('/warranties', authenticate, authorize(), async (req, res) => {
  const schema = Joi.object({
    project_id: Joi.number().integer().positive().required(), asset_id: Joi.number().integer().positive().allow(null),
    handover_package_item_id: Joi.number().integer().positive().allow(null), project_document_id: Joi.number().integer().positive().allow(null),
    title: Joi.string().max(255).required(), issuer: Joi.string().max(255).required(), coverage_description: Joi.string().allow('', null),
    start_date: dateOnly().required(), end_date: dateOnly().required(), notes: Joi.string().allow('', null),
  }).custom((value, helpers) => value.end_date < value.start_date ? helpers.error('date.range') : value);
  const { error, value } = schema.validate(req.body);
  if (error) return handoverFailure(res, 400, 'invalid_warranty');
    authorizeProjectPayload(req, value);
  if (!handoverProjectAllowed(req, authorizedProjectId(req, value))) return handoverFailure(res, 403, 'project_scope_denied');
  try {
    const result = await auditedTransaction(async (q) => {
      if (value.asset_id != null && !(await q('SELECT 1 FROM asset_register WHERE id = $1 AND project_id = $2', [value.asset_id, authorizedProjectId(req, value)])).rows.length) {
        throw Object.assign(new Error('warranty_asset_project_mismatch'), { statusCode: 400, error_code: 'warranty_asset_project_mismatch' });
      }
      if (value.handover_package_item_id != null && !(await q('SELECT 1 FROM handover_package_items WHERE id = $1 AND project_id = $2', [value.handover_package_item_id, authorizedProjectId(req, value)])).rows.length) {
        throw Object.assign(new Error('warranty_package_project_mismatch'), { statusCode: 400, error_code: 'warranty_package_project_mismatch' });
      }
      if (value.project_document_id != null && !(await q('SELECT 1 FROM project_documents WHERE id = $1 AND project_id = $2', [value.project_document_id, authorizedProjectId(req, value)])).rows.length) {
        throw Object.assign(new Error('handover_document_project_mismatch'), { statusCode: 400, error_code: 'handover_document_project_mismatch' });
      }
      const number = await nextNumber(q, { table: 'warranties', column: 'warranty_number', prefix: `WAR-${authorizedProjectId(req, value)}`, pad: 4, where: { project_id: authorizedProjectId(req, value) } });
      return q(
        `INSERT INTO warranties (project_id, warranty_number, asset_id, handover_package_item_id, project_document_id, title, issuer, coverage_description, start_date, end_date, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [authorizedProjectId(req, value), number, value.asset_id || null, value.handover_package_item_id || null, value.project_document_id || null,
          value.title, value.issuer, value.coverage_description || null, value.start_date, value.end_date, value.notes || null, req.user.id]);
    }, (r) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'handover', description: `Created warranty ${r.rows[0].warranty_number}`, entityId: r.rows[0].id, entityType: 'warranty' }));
    res.status(201).json({ success: true, data: normalizeDateFields(result.rows[0], ['start_date', 'end_date']) });
  } catch (error) {
    return handoverError(res, error, 'HANDOVER_WARRANTY_CREATE', req);
  }
});

router.put('/warranties/:id/status', authenticate, authorize(), async (req, res) => {
  const schema = Joi.object({ status: Joi.string().valid('active', 'void').required() });
  const { error, value } = schema.validate(req.body);
  if (error) return handoverFailure(res, 400, 'invalid_warranty_status');
  try {
    const result = await auditedTransaction(async (q) => {
      const warranty = (await q('SELECT * FROM warranties WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!warranty || !handoverProjectAllowed(req, warranty.project_id)) throw Object.assign(new Error('warranty_not_found'), { statusCode: warranty ? 403 : 404, error_code: 'warranty_not_found' });
      const updated = await q(
        `UPDATE warranties SET status = CASE WHEN $1 = 'active' AND end_date < CURRENT_DATE THEN 'expired' ELSE $1 END, updated_at = NOW()
         WHERE id = $2 RETURNING *`, [value.status, req.params.id]);
      return updated;
    }, (r) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'handover', description: `Updated warranty status to ${r.rows[0].status}`, entityId: req.params.id, entityType: 'warranty' }));
    res.json({ success: true, data: normalizeDateFields(result.rows[0], ['start_date', 'end_date']) });
  } catch (error) {
    return handoverError(res, error, 'HANDOVER_WARRANTY_STATUS', req);
  }
});

// ---------------------------------------------------------------------------
// Warranty / DLP claims
// ---------------------------------------------------------------------------

const CLAIM_SELECT = `
  SELECT wc.*, a.asset_code, pl.name as location_name,
         COALESCE(ao.name_en, ao.name_ar) as assigned_organization_name,
         ru.name as raised_by_name, au.name as assigned_user_name
  FROM warranty_claims wc
  LEFT JOIN asset_register a ON wc.asset_id = a.id
  LEFT JOIN project_locations pl ON wc.project_location_id = pl.id
  LEFT JOIN organizations ao ON wc.assigned_organization_id = ao.id
  LEFT JOIN users ru ON wc.raised_by_user_id = ru.id
  LEFT JOIN users au ON wc.assigned_user_id = au.id`;

router.get('/claims', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`wc.project_id = $${idx++}`); params.push(project_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await queryPaginated(req, res, query, { sql: `${CLAIM_SELECT} ${where} ORDER BY wc.created_at DESC`, params: params, orderBy: [{"column":"created_at","direction":"DESC"}] });
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Client or an authorized user raises a claim against an asset/location.
router.post('/claims', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      asset_id: Joi.number().integer().allow(null).optional(),
      project_location_id: Joi.number().integer().allow(null).optional(),
      title: Joi.string().required(),
      description: Joi.string().required(),
      sla_days: Joi.number().integer().min(1).optional(),
      due_date: Joi.date().iso().optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    authorizeProjectPayload(req, value);
    const claim = await auditedTransaction((q) => engine.createWarrantyClaim(q, value, req.user), (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'handover', description: `Raised warranty claim ${result.claim_number}`, entityId: result.id, entityType: 'warranty_claim' }));
    res.status(201).json({ success: true, data: claim });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/claims/:id/status', authenticate, authorize('owner', 'admin', 'project_manager', 'consultant', 'client'), async (req, res) => {
  try {
    const schema = Joi.object({
      status: Joi.string().valid(...engine.WARRANTY_STATES).required(),
      note: Joi.string().allow('', null).optional(),
      assigned_organization_id: Joi.number().integer().allow(null).optional(),
      assigned_user_id: Joi.number().integer().allow(null).optional(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const claim = await auditedTransaction((q) => engine.transitionWarrantyClaim(q, req.params.id, value.status, req.user, value), (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'handover', description: `${result.claim_number} → ${value.status}`, entityId: result.id, entityType: 'warranty_claim' }));
    res.json({ success: true, data: claim });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.get('/claims/:id/sla', authenticate, authorize(), async (req, res) => {
  try {
    res.json({ success: true, data: await engine.warrantySlaStatus(query, req.params.id) });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Document set
// ---------------------------------------------------------------------------

router.get('/checklist/:projectId/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const name = await projectNameFor(query, projectId);
    const items = (await query('SELECT * FROM handover_package_items WHERE project_id = $1 ORDER BY id', [projectId])).rows;
    const readiness = await engine.handoverReadiness(query, projectId);
    const pdf = await renderDocument({
      docType: 'HANDOVER CHECKLIST', number: `HOCHK-${projectId}`, date: new Date(),
      meta: [['Project', name], ['Readiness', `${readiness.percent}%`], ['Open punch items', String(readiness.open_punch_items)]],
      columns: ['#', 'Item', 'Status'],
      rows: items.map((i, idx) => [String(idx + 1), i.title, i.status]),
    });
    sendPdf(res, pdf, `handover-checklist-${projectId}.pdf`);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/assets/:projectId/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const name = await projectNameFor(query, projectId);
    const assets = (await query('SELECT * FROM asset_register WHERE project_id = $1 ORDER BY id', [projectId])).rows;
    const pdf = await renderDocument({
      docType: 'ASSET REGISTER', number: `ASSET-${projectId}`, date: new Date(),
      meta: [['Project', name], ['Assets', String(assets.length)]],
      columns: ['Asset code', 'Name', 'Location', 'Serial no', 'Commissioned', 'Warranty end'],
      rows: assets.map((a) => [a.asset_code, a.name, a.serial_no || '-', a.commissioning_date || '-', a.warranty_end || '-']),
    });
    sendPdf(res, pdf, `asset-register-${projectId}.pdf`);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/warranty-register/:projectId/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (!handoverProjectAllowed(req, projectId)) return handoverFailure(res, 403, 'project_scope_denied');
    const name = await projectNameFor(query, projectId);
    const warranties = (await query(
      `SELECT w.*, a.asset_code, a.name AS asset_name,
              CASE WHEN w.status = 'active' AND w.end_date < CURRENT_DATE THEN 'expired' ELSE w.status END AS effective_status
       FROM warranties w LEFT JOIN asset_register a ON a.id = w.asset_id
       WHERE w.project_id = $1 ORDER BY w.end_date, w.id`, [projectId])).rows;
    const pdf = await renderDocument({
      docType: 'WARRANTY / DLP REGISTER', number: `WREG-${projectId}`, date: new Date(),
      meta: [['Project', name], ['Warranties', String(warranties.length)]],
      columns: ['Warranty', 'Title', 'Asset', 'Issuer', 'Start', 'End', 'Status'],
      rows: warranties.map((w) => [w.warranty_number, w.title, w.asset_code || '-', w.issuer,
        w.start_date, w.end_date, w.effective_status]),
    });
    sendPdf(res, pdf, `warranty-register-${projectId}.pdf`);
  } catch (error) { return handoverError(res, error, 'HANDOVER_WARRANTY_PDF', req); }
});

router.get('/certificate/:projectId/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const name = await projectNameFor(query, projectId);
    const process = (await query('SELECT * FROM handover_processes WHERE project_id = $1', [projectId])).rows[0] || {};
    const readiness = await engine.handoverReadiness(query, projectId);
    const pdf = await renderDocument({
      docType: 'HANDOVER / TAKING-OVER CERTIFICATE',
      number: process.process_number || `HO-${projectId}`,
      date: process.completed_at || new Date(),
      meta: [
        ['Project', name],
        ['Status', process.status || '—'],
        ['Package readiness', `${readiness.percent}%`],
        ['Open punch items', String(readiness.open_punch_items)],
        ['Certified to', req.user.name],
      ],
      columns: ['Package item', 'Status'],
      rows: (await query('SELECT title, status FROM handover_package_items WHERE project_id = $1 ORDER BY id', [projectId])).rows
        .map((i) => [i.title, i.status]),
      notes: 'This certificate is system-generated by the Construction ERP handover module.',
    });
    sendPdf(res, pdf, `handover-certificate-${projectId}.pdf`);
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

module.exports = router;
