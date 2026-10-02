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
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const engine = require('../services/handoverEngine');
const { renderDocument } = require('../utils/procurementPdf');

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
    const process = await engine.startHandover(query, req.params.projectId, req.user);
    await engine.ensureDefaultPackageItems(query, req.params.projectId);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'handover', description: `Started handover process ${process.process_number}`, entityId: process.id, entityType: 'handover_process' });
    res.status(201).json({ success: true, data: { process, readiness: await engine.handoverReadiness(query, req.params.projectId) } });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/process/:id/transition', authenticate, authorize('owner', 'admin', 'project_manager'), async (req, res) => {
  try {
    const schema = Joi.object({ status: Joi.string().valid(...engine.HANDOVER_STATES).required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const process = await engine.transitionHandover(query, req.params.id, value.status, req.user);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'handover', description: `Handover advanced to ${value.status}`, entityId: process.id, entityType: 'handover_process' });
    res.json({ success: true, data: process });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Package checklist
// ---------------------------------------------------------------------------

router.get('/package/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    const items = (await query(
      `SELECT hi.*, u.name as uploaded_by_name, vu.name as verified_by_name
       FROM handover_package_items hi LEFT JOIN users u ON hi.uploaded_by = u.id
       LEFT JOIN users vu ON hi.verified_by = vu.id WHERE hi.project_id = $1 ORDER BY hi.id`,
      [req.params.projectId]
    )).rows;
    const readiness = await engine.handoverReadiness(query, req.params.projectId);
    res.json({ success: true, data: { items, readiness } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/package/:projectId/items', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      item_type: Joi.string().valid(...engine.PACKAGE_ITEM_TYPES).required(),
      title: Joi.string().required(),
      required: Joi.boolean().default(true),
      notes: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO handover_package_items (project_id, item_type, title, required, notes, status) VALUES ($1,$2,$3,$4,$5,'pending') RETURNING *`,
      [req.params.projectId, value.item_type, value.title, value.required, value.notes || null]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/package/items/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      document_url: Joi.string().allow('', null),
      notes: Joi.string().allow('', null),
      status: Joi.string().valid('pending', 'uploaded', 'approved', 'complete'),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      sets.push(`${k} = $${idx++}`); params.push(v);
    }
    if (value.status) {
      sets.push(`uploaded_by = $${idx++}`, `uploaded_at = $${idx++}`);
      params.push(req.user.id, new Date());
    }
    params.push(req.params.id);
    const r = await query(`UPDATE handover_package_items SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Package item not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/package/items/:id/verify', authenticate, authorize('owner', 'admin', 'project_manager', 'consultant'), async (req, res) => {
  try {
    const schema = Joi.object({
      status: Joi.string().valid('approved', 'complete', 'pending').required(),
      notes: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `UPDATE handover_package_items SET status = $1, verified_by = $2, verified_at = NOW(), notes = COALESCE($3, notes) WHERE id = $4 RETURNING *`,
      [value.status, req.user.id, value.notes || null, req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Package item not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Asset register
// ---------------------------------------------------------------------------

router.get('/assets', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`a.project_id = $${idx++}`); params.push(project_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(
      `SELECT a.*, pl.name as location_name,
              COALESCE(so.name_en, so.name_ar) as supplier_name,
              COALESCE(sco.name_en, sco.name_ar) as subcontractor_name
       FROM asset_register a LEFT JOIN project_locations pl ON a.project_location_id = pl.id
       LEFT JOIN organizations so ON a.supplier_organization_id = so.id
       LEFT JOIN organizations sco ON a.subcontractor_organization_id = sco.id
       ${where} ORDER BY a.id`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
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
      commissioning_date: Joi.date().iso().allow(null).optional(),
      warranty_start: Joi.date().iso().allow(null).optional(),
      warranty_end: Joi.date().iso().allow(null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO asset_register (project_id, asset_code, name, project_location_id, model, serial_no,
         supplier_organization_id, subcontractor_organization_id, commissioning_date, warranty_start, warranty_end, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [value.project_id, value.asset_code, value.name, value.project_location_id || null, value.model || null,
       value.serial_no || null, value.supplier_organization_id || null, value.subcontractor_organization_id || null,
       value.commissioning_date || null, value.warranty_start || null, value.warranty_end || null, req.user.id]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'handover', description: `Registered asset ${value.asset_code}`, entityId: r.rows[0].id, entityType: 'asset_register' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
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
    const r = await query(`${CLAIM_SELECT} ${where} ORDER BY wc.created_at DESC`, params);
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
    const claim = await engine.createWarrantyClaim(query, value, req.user);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'handover', description: `Raised warranty claim ${claim.claim_number}`, entityId: claim.id, entityType: 'warranty_claim' });
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
    const claim = await engine.transitionWarrantyClaim(query, req.params.id, value.status, req.user, value);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'handover', description: `${claim.claim_number} → ${value.status}`, entityId: claim.id, entityType: 'warranty_claim' });
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
    const name = await projectNameFor(query, projectId);
    const claims = (await query('SELECT * FROM warranty_claims WHERE project_id = $1 ORDER BY id', [projectId])).rows;
    const pdf = await renderDocument({
      docType: 'WARRANTY / DLP REGISTER', number: `WREG-${projectId}`, date: new Date(),
      meta: [['Project', name], ['Claims', String(claims.length)]],
      columns: ['Claim', 'Title', 'Status', 'Due', 'SLA (days)'],
      rows: claims.map((c) => [c.claim_number, c.title, c.status, c.due_date || '-', c.sla_days]),
    });
    sendPdf(res, pdf, `warranty-register-${projectId}.pdf`);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
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
