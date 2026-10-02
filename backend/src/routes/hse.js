// Phase 20 — HSE routes (mounted at /api/hse).
//
// Typed safety registers: incidents (replacing safety_incidents via the
// compatibility view), HSE inspections (replacing safety_inspections),
// permits to work routed through the Phase 6 'permit' workflow template,
// JSA / risk assessments, inductions, toolbox talks, near misses, PPE,
// equipment inspections, emergency drills — plus the HSE dashboard.
//
// Every list endpoint filters by ?project_id and returns [] on a fresh
// project (the zero-record contract).

const express = require('express');
const { nextNumber } = require('../services/numbering');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const hseEngine = require('../services/hseEngine');
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
// Dashboard
// ---------------------------------------------------------------------------

router.get('/dashboard', authenticate, authorize(), async (req, res) => {
  try {
    const data = await hseEngine.hseDashboard(query, req.query.project_id ? { projectId: req.query.project_id } : {});
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Incidents (typed) — legacy /incidents shape preserved through the view;
// this endpoint reads the typed base table.
// ---------------------------------------------------------------------------

router.get('/incidents', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status, category, is_lti } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`i.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`i.status = $${idx++}`); params.push(status); }
    if (category) { conditions.push(`i.incident_category = $${idx++}`); params.push(category); }
    if (is_lti === 'true') conditions.push(`i.is_lti = true`);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(
      `SELECT i.*, u.name as reported_by_name, cu.name as closed_by_name
       FROM incidents i LEFT JOIN users u ON i.reported_by = u.id LEFT JOIN users cu ON i.closed_by = cu.id
       ${where} ORDER BY i.incident_date DESC, i.id DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

const INCIDENT_SCHEMA = Joi.object({
  project_id: Joi.number().integer().required(),
  incident_date: Joi.date().iso().optional(),
  incident_type: Joi.string().allow('', null).optional(),
  incident_category: Joi.string().valid('injury', 'environmental', 'property', 'vehicle', 'other').default('other'),
  severity: Joi.string().valid('minor', 'major', 'critical').default('minor'),
  description: Joi.string().required(),
  injured_party: Joi.string().allow('', null).optional(),
  is_lti: Joi.boolean().default(false),
  lost_days: Joi.number().integer().min(0).default(0),
  corrective_action: Joi.string().allow('', null).optional(),
  investigation_notes: Joi.string().allow('', null).optional(),
  root_cause: Joi.string().allow('', null).optional(),
});

router.post('/incidents', authenticate, authorize(), async (req, res) => {
  try {
    const { error, value } = INCIDENT_SCHEMA.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO incidents (project_id, incident_date, incident_type, incident_category, severity, description,
         injured_party, is_lti, lost_days, corrective_action, investigation_notes, root_cause, reported_by)
       VALUES ($1,COALESCE($2, CURRENT_DATE),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [value.project_id, value.incident_date || null, value.incident_type || null, value.incident_category,
       value.severity, value.description, value.injured_party || null, value.is_lti, value.lost_days,
       value.corrective_action || null, value.investigation_notes || null, value.root_cause || null, req.user.id]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'hse', description: `Reported incident (${value.severity}${value.is_lti ? ', LTI' : ''})`, entityId: r.rows[0].id, entityType: 'incident' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/incidents/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = INCIDENT_SCHEMA.fork(Object.keys(INCIDENT_SCHEMA.describe().keys), (s) => s.optional()).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      sets.push(`${k} = $${idx++}`); params.push(v);
    }
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);
    const r = await query(`UPDATE incidents SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Incident not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

const INCIDENT_TRANSITIONS = { open: ['investigating', 'closed'], investigating: ['closed'] };
router.post('/incidents/:id/status', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ status: Joi.string().valid('investigating', 'closed').required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const existing = (await query('SELECT * FROM incidents WHERE id = $1', [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ success: false, error: 'Incident not found' });
    if (!INCIDENT_TRANSITIONS[existing.status] || !INCIDENT_TRANSITIONS[existing.status].includes(value.status)) {
      return res.status(400).json({ success: false, error: `Cannot transition from '${existing.status}' to '${value.status}'` });
    }
    const r = value.status === 'closed'
      ? await query(`UPDATE incidents SET status = 'closed', closed_at = NOW(), closed_by = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [req.user.id, req.params.id])
      : await query(`UPDATE incidents SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [value.status, req.params.id]);
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/incidents/:id/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const incident = (await query('SELECT * FROM incidents WHERE id = $1', [req.params.id])).rows[0];
    if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });
    const name = await projectNameFor(query, incident.project_id);
    const pdf = await renderDocument({
      docType: 'INCIDENT REPORT', number: `INC-${String(incident.id).padStart(5, '0')}`, date: incident.incident_date || incident.created_at,
      meta: [['Project', name], ['Category', incident.incident_category || '-'], ['Severity', incident.severity],
             ['LTI', incident.is_lti ? 'YES' : 'no'], ['Lost days', incident.lost_days || 0]],
      columns: ['Field', 'Value'],
      rows: [['Description', incident.description], ['Injured party', incident.injured_party || '-'],
             ['Corrective action', incident.corrective_action || '-'], ['Root cause', incident.root_cause || '-'],
             ['Investigation', incident.investigation_notes || '-']],
    });
    sendPdf(res, pdf, `incident-${incident.id}.pdf`);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// HSE inspections (typed)
// ---------------------------------------------------------------------------

router.get('/inspections', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status, type } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`si.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`si.status = $${idx++}`); params.push(status); }
    if (type) { conditions.push(`si.inspection_type = $${idx++}`); params.push(type); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(
      `SELECT si.*, u.name as inspector_name FROM hse_inspections si
       LEFT JOIN users u ON si.inspector_id = u.id ${where} ORDER BY si.inspection_date DESC, si.id DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/inspections', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      inspection_date: Joi.date().iso().optional(),
      inspection_type: Joi.string().valid('site', 'equipment', 'housekeeping', 'ppe', 'permit_compliance', 'other').default('site'),
      checklist_items: Joi.array().items(Joi.object({ item: Joi.string().required(), ok: Joi.boolean().default(false), note: Joi.string().allow('').optional() })).default([]),
      findings: Joi.string().allow('').optional(),
      follow_up_due: Joi.date().iso().allow(null).optional(),
      status: Joi.string().valid('pending', 'passed', 'failed').default('pending'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO hse_inspections (project_id, inspection_date, inspector_id, inspection_type, checklist_items, findings, follow_up_due, status)
       VALUES ($1,COALESCE($2, CURRENT_DATE),$3,$4,$5::jsonb,$6,$7,$8) RETURNING *`,
      [value.project_id, value.inspection_date || null, req.user.id, value.inspection_type,
       JSON.stringify(value.checklist_items), value.findings || null, value.follow_up_due || null, value.status]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'hse', description: `Logged ${value.inspection_type} inspection (${value.status})`, entityId: r.rows[0].id, entityType: 'hse_inspection' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/inspections/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      inspection_date: Joi.date().iso(),
      inspection_type: Joi.string().valid('site', 'equipment', 'housekeeping', 'ppe', 'permit_compliance', 'other'),
      checklist_items: Joi.array().items(Joi.object({ item: Joi.string().required(), ok: Joi.boolean().default(false), note: Joi.string().allow('').optional() })),
      findings: Joi.string().allow(''),
      follow_up_due: Joi.date().iso().allow(null),
      status: Joi.string().valid('pending', 'passed', 'failed'),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (k === 'checklist_items') { sets.push(`checklist_items = $${idx++}::jsonb`); params.push(JSON.stringify(v)); }
      else { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id);
    const r = await query(`UPDATE hse_inspections SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Inspection not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/inspections/:id/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const inspection = (await query('SELECT * FROM hse_inspections WHERE id = $1', [req.params.id])).rows[0];
    if (!inspection) return res.status(404).json({ success: false, error: 'Inspection not found' });
    const name = await projectNameFor(query, inspection.project_id);
    const items = typeof inspection.checklist_items === 'string' ? JSON.parse(inspection.checklist_items) : (inspection.checklist_items || []);
    const pdf = await renderDocument({
      docType: 'SAFETY INSPECTION', number: `SI-${String(inspection.id).padStart(5, '0')}`, date: inspection.inspection_date,
      meta: [['Project', name], ['Type', inspection.inspection_type || 'site'], ['Status', inspection.status]],
      columns: ['#', 'Item', 'OK', 'Note'],
      rows: items.map((it, i) => [String(i + 1), it.item, it.ok ? 'YES' : 'NO', it.note || '']),
      notes: inspection.findings || null,
    });
    sendPdf(res, pdf, `inspection-${inspection.id}.pdf`);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Permits to work — Phase 6 'permit' workflow
// ---------------------------------------------------------------------------

const PERMIT_SELECT = `
  SELECT p.*, pl.name as location_name, ru.name as requested_by_name, au.name as approved_by_name
  FROM permits p
  LEFT JOIN project_locations pl ON p.project_location_id = pl.id
  LEFT JOIN users ru ON p.requested_by = ru.id
  LEFT JOIN users au ON p.approved_by = au.id`;

router.get('/permits', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status, permit_type, expiring } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`p.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`p.status = $${idx++}`); params.push(status); }
    if (permit_type) { conditions.push(`p.permit_type = $${idx++}`); params.push(permit_type); }
    if (expiring === 'today') conditions.push(`p.valid_to::date = CURRENT_DATE AND p.status = 'active'`);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`${PERMIT_SELECT} ${where} ORDER BY p.created_at DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/permits', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      permit_type: Joi.string().valid('work', 'hot_work', 'lifting', 'excavation', 'confined_space').default('work'),
      title: Joi.string().required(),
      project_location_id: Joi.number().integer().allow(null).optional(),
      description: Joi.string().allow('', null).optional(),
      conditions: Joi.string().allow('', null).optional(),
      precautions: Joi.array().items(Joi.string()).default([]),
      valid_from: Joi.date().iso().allow(null).optional(),
      valid_to: Joi.date().iso().allow(null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const permit = await hseEngine.createPermit(query, value, req.user);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'hse', description: `Created permit ${permit.permit_number} (${permit.permit_type})`, entityId: permit.id, entityType: 'permit' });
    res.status(201).json({ success: true, data: permit });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/permits/:id/submit', authenticate, authorize(), async (req, res) => {
  try {
    const permit = await hseEngine.submitPermit(query, req.params.id, req.user);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'hse', description: `${permit.permit_number} submitted for approval`, entityId: permit.id, entityType: 'permit' });
    res.json({ success: true, data: permit });
  } catch (error) { res.status(error.statusCode || 500).json({ success: false, error: error.message }); }
});

// Stage decision (HSE review / PM approval). Reject at either stage reopens
// the permit for correction; final approval activates the permit.
router.post('/permits/:id/decision', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      decision: Joi.string().valid('approve', 'reject').required(),
      comment: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const permit = await hseEngine.permitStageDecision(query, req.params.id, req.user, value.decision, { comment: value.comment });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'hse', description: `${permit.permit_number} — ${value.decision}`, entityId: permit.id, entityType: 'permit' });
    res.json({ success: true, data: permit });
  } catch (error) { res.status(error.statusCode || 500).json({ success: false, error: error.message }); }
});

router.post('/permits/:id/status', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      status: Joi.string().valid('active', 'suspended', 'closed', 'pending_approval', 'approved', 'rejected').required(),
      comment: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const permit = await hseEngine.transitionPermit(query, req.params.id, value.status, req.user, { comment: value.comment });
    res.json({ success: true, data: permit });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/permits/:id/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const permit = (await query(`${PERMIT_SELECT} WHERE p.id = $1`, [req.params.id])).rows[0];
    if (!permit) return res.status(404).json({ success: false, error: 'Permit not found' });
    const name = await projectNameFor(query, permit.project_id);
    const precautions = typeof permit.precautions === 'string' ? JSON.parse(permit.precautions) : (permit.precautions || []);
    const pdf = await renderDocument({
      docType: 'PERMIT TO WORK', number: permit.permit_number, date: permit.valid_from || permit.created_at,
      meta: [['Project', name], ['Type', permit.permit_type.replace('_', ' ').toUpperCase()],
             ['Status', permit.status], ['Location', permit.location_name || '-'],
             ['Valid from', permit.valid_from ? String(permit.valid_from).slice(0, 10) : '-'],
             ['Valid to', permit.valid_to ? String(permit.valid_to).slice(0, 10) : '-']],
      columns: ['Field', 'Value'],
      rows: [['Description', permit.description || '-'], ['Conditions', permit.conditions || '-'],
             ...precautions.map((p, i) => [`Precaution ${i + 1}`, p])],
    });
    sendPdf(res, pdf, `${permit.permit_number}.pdf`);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// JSA / risk assessments
// ---------------------------------------------------------------------------

router.get('/jsas', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`j.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`j.status = $${idx++}`); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`SELECT j.*, u.name as created_by_name, ru.name as reviewed_by_name
      FROM jsas j LEFT JOIN users u ON j.created_by = u.id LEFT JOIN users ru ON j.reviewed_by = ru.id
      ${where} ORDER BY j.created_at DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/jsas', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      title: Joi.string().required(),
      activity: Joi.string().allow('', null).optional(),
      hazards: Joi.array().items(Joi.object({ hazard: Joi.string(), risk: Joi.string().allow('', null), control: Joi.string().allow('', null) })).default([]),
      controls: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO jsas (project_id, title, activity, hazards, controls, created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING *`,
      [value.project_id, value.title, value.activity || null, JSON.stringify(value.hazards), value.controls || null, req.user.id]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'hse', description: `Created JSA "${value.title}"`, entityId: r.rows[0].id, entityType: 'jsa' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

const JSA_TRANSITIONS = { draft: ['reviewed'], reviewed: ['approved', 'superseded'] };
router.post('/jsas/:id/status', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ status: Joi.string().valid('reviewed', 'approved', 'superseded').required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const existing = (await query('SELECT status FROM jsas WHERE id = $1', [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ success: false, error: 'JSA not found' });
    if (!JSA_TRANSITIONS[existing.status] || !JSA_TRANSITIONS[existing.status].includes(value.status)) {
      return res.status(400).json({ success: false, error: `Cannot transition from '${existing.status}' to '${value.status}'` });
    }
    const r = await query(`UPDATE jsas SET status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW() WHERE id = $3 RETURNING *`,
      [value.status, req.user.id, req.params.id]);
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/jsas/:id/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const jsa = (await query('SELECT * FROM jsas WHERE id = $1', [req.params.id])).rows[0];
    if (!jsa) return res.status(404).json({ success: false, error: 'JSA not found' });
    const name = await projectNameFor(query, jsa.project_id);
    const hazards = typeof jsa.hazards === 'string' ? JSON.parse(jsa.hazards) : (jsa.hazards || []);
    const pdf = await renderDocument({
      docType: 'JSA — JOB SAFETY ANALYSIS', number: `JSA-${String(jsa.id).padStart(5, '0')}`, date: jsa.created_at,
      meta: [['Project', name], ['Activity', jsa.activity || '-'], ['Status', jsa.status]],
      columns: ['#', 'Hazard', 'Risk', 'Control'],
      rows: hazards.map((h, i) => [String(i + 1), h.hazard || '-', h.risk || '-', h.control || '-']),
      notes: jsa.controls || null,
    });
    sendPdf(res, pdf, `jsa-${jsa.id}.pdf`);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/risk-assessments', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`ra.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`ra.status = $${idx++}`); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`SELECT ra.*, u.name as created_by_name FROM risk_assessments ra
      LEFT JOIN users u ON ra.created_by = u.id ${where} ORDER BY ra.created_at DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/risk-assessments', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      title: Joi.string().required(),
      activity: Joi.string().allow('', null).optional(),
      likelihood: Joi.string().valid('low', 'medium', 'high').default('medium'),
      severity: Joi.string().valid('low', 'medium', 'high').default('medium'),
      controls: Joi.string().allow('', null).optional(),
      residual_risk: Joi.string().valid('low', 'medium', 'high').allow(null).optional(),
      assessor: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const matrix = { 'low+low': 'low', 'low+medium': 'medium', 'medium+low': 'medium', 'low+high': 'high', 'high+low': 'medium', 'medium+medium': 'high', 'medium+high': 'high', 'high+medium': 'high', 'high+high': 'critical' };
    const riskLevel = matrix[`${value.likelihood}+${value.severity}`] || 'medium';
    const r = await query(
      `INSERT INTO risk_assessments (project_id, title, activity, likelihood, severity, risk_level, controls, residual_risk, assessor, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [value.project_id, value.title, value.activity || null, value.likelihood, value.severity, riskLevel,
       value.controls || null, value.residual_risk || null, value.assessor || null, req.user.id]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'hse', description: `Created risk assessment "${value.title}" (${riskLevel})`, entityId: r.rows[0].id, entityType: 'risk_assessment' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Status lifecycle mirrors JSAs (review → approve); risk_assessments has no
// reviewer columns, so only the status itself is stamped.
const RA_TRANSITIONS = { draft: ['reviewed'], reviewed: ['approved', 'superseded'] };
router.post('/risk-assessments/:id/status', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ status: Joi.string().valid('reviewed', 'approved', 'superseded').required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const existing = (await query('SELECT status FROM risk_assessments WHERE id = $1', [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ success: false, error: 'Risk assessment not found' });
    if (!RA_TRANSITIONS[existing.status] || !RA_TRANSITIONS[existing.status].includes(value.status)) {
      return res.status(400).json({ success: false, error: `Cannot transition from '${existing.status}' to '${value.status}'` });
    }
    const r = await query(`UPDATE risk_assessments SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [value.status, req.params.id]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'hse', description: `Risk assessment #${req.params.id} status → ${value.status}`, entityId: parseInt(req.params.id, 10), entityType: 'risk_assessment' });
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/risk-assessments/:id/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const ra = (await query('SELECT * FROM risk_assessments WHERE id = $1', [req.params.id])).rows[0];
    if (!ra) return res.status(404).json({ success: false, error: 'Risk assessment not found' });
    const name = await projectNameFor(query, ra.project_id);
    const pdf = await renderDocument({
      docType: 'RISK ASSESSMENT', number: `RA-${String(ra.id).padStart(5, '0')}`, date: ra.assessment_date,
      meta: [['Project', name], ['Likelihood', ra.likelihood], ['Severity', ra.severity], ['Risk level', ra.risk_level], ['Residual', ra.residual_risk || '-']],
      columns: ['Field', 'Value'],
      rows: [['Activity', ra.activity || '-'], ['Controls', ra.controls || '-'], ['Assessor', ra.assessor || '-']],
    });
    sendPdf(res, pdf, `risk-assessment-${ra.id}.pdf`);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Inductions / toolbox talks / near misses / PPE / equipment / drills
// ---------------------------------------------------------------------------

router.get('/inductions', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`i.project_id = $${idx++}`); params.push(project_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`SELECT i.*, COALESCE(o.name_en, o.name_ar) as organization_name FROM inductions i
      LEFT JOIN organizations o ON i.organization_id = o.id ${where} ORDER BY i.induction_date DESC, i.id DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/inductions', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      person_name: Joi.string().required(),
      organization_id: Joi.number().integer().allow(null).optional(),
      induction_date: Joi.date().iso().optional(),
      induction_type: Joi.string().valid('site', 'general', 'visitor', 'refresher').default('site'),
      trainer: Joi.string().allow('', null).optional(),
      valid_until: Joi.date().iso().allow(null).optional(),
      notes: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO inductions (project_id, person_name, organization_id, induction_date, induction_type, trainer, valid_until, notes, created_by)
       VALUES ($1,$2,$3,COALESCE($4, CURRENT_DATE),$5,$6,$7,$8,$9) RETURNING *`,
      [value.project_id, value.person_name, value.organization_id || null, value.induction_date || null,
       value.induction_type, value.trainer || null, value.valid_until || null, value.notes || null, req.user.id]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/toolbox-talks', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`t.project_id = $${idx++}`); params.push(project_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`SELECT * FROM toolbox_talks t ${where} ORDER BY t.held_at DESC, t.id DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/toolbox-talks', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      title: Joi.string().required(),
      topic: Joi.string().allow('', null).optional(),
      conducted_by: Joi.string().allow('', null).optional(),
      attendees_count: Joi.number().integer().default(0),
      attendees: Joi.array().items(Joi.string()).default([]),
      notes: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO toolbox_talks (project_id, title, topic, conducted_by, attendees_count, attendees, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING *`,
      [value.project_id, value.title, value.topic || null, value.conducted_by || null,
       value.attendees_count, JSON.stringify(value.attendees), value.notes || null, req.user.id]);
    const name = await projectNameFor(query, value.project_id);
    const pdf = await renderDocument({
      docType: 'TOOLBOX TALK', number: `TBT-${String(r.rows[0].id).padStart(5, '0')}`, date: r.rows[0].held_at,
      meta: [['Project', name], ['Topic', value.topic || '-'], ['Attendees', String(value.attendees_count)]],
      columns: ['#', 'Attendee'],
      rows: value.attendees.map((a, i) => [String(i + 1), a]),
      notes: value.notes || null,
    });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'hse', description: `Recorded toolbox talk "${value.title}"`, entityId: r.rows[0].id, entityType: 'toolbox_talk' });
    res.status(201).json({ success: true, data: r.rows[0], pdf_base64: pdf.toString('base64') });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/near-misses', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`n.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`n.status = $${idx++}`); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`SELECT n.*, pl.name as location_name, u.name as reported_by_name
      FROM near_misses n LEFT JOIN project_locations pl ON n.project_location_id = pl.id
      LEFT JOIN users u ON n.reported_by = u.id ${where} ORDER BY n.incident_date DESC, n.id DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/near-misses', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      incident_date: Joi.date().iso().optional(),
      project_location_id: Joi.number().integer().allow(null).optional(),
      category: Joi.string().allow('', null).optional(),
      severity: Joi.string().valid('minor', 'major', 'critical').default('minor'),
      description: Joi.string().required(),
      immediate_action: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const year = new Date().getFullYear();
    const nearMissNumber = await nextNumber(query, { table: 'near_misses', column: 'near_miss_number', prefix: `NM-${year}`, pad: 4 });
    const r = await query(
      `INSERT INTO near_misses (near_miss_number, project_id, incident_date, project_location_id, category, severity, description, immediate_action, reported_by, created_by)
       VALUES ($1,$2,COALESCE($3, CURRENT_DATE),$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
      [nearMissNumber, value.project_id, value.incident_date || null, value.project_location_id || null,
       value.category || null, value.severity, value.description, value.immediate_action || null, req.user.id]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'hse', description: `Reported near miss ${nearMissNumber}`, entityId: r.rows[0].id, entityType: 'near_miss' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/near-misses/:id/status', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ status: Joi.string().valid('open', 'closed').required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(`UPDATE near_misses SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [value.status, req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Near miss not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/near-misses/:id/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const nm = (await query('SELECT * FROM near_misses WHERE id = $1', [req.params.id])).rows[0];
    if (!nm) return res.status(404).json({ success: false, error: 'Near miss not found' });
    const name = await projectNameFor(query, nm.project_id);
    const pdf = await renderDocument({
      docType: 'NEAR-MISS REPORT', number: nm.near_miss_number, date: nm.incident_date,
      meta: [['Project', name], ['Category', nm.category || '-'], ['Severity', nm.severity], ['Status', nm.status]],
      columns: ['Field', 'Value'],
      rows: [['Description', nm.description], ['Immediate action', nm.immediate_action || '-']],
    });
    sendPdf(res, pdf, `${nm.near_miss_number}.pdf`);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/ppe-records', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`p.project_id = $${idx++}`); params.push(project_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`SELECT p.*, COALESCE(o.name_en, o.name_ar) as organization_name FROM ppe_records p
      LEFT JOIN organizations o ON p.organization_id = o.id ${where} ORDER BY p.issue_date DESC, p.id DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/ppe-records', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      person_name: Joi.string().required(),
      organization_id: Joi.number().integer().allow(null).optional(),
      item: Joi.string().required(),
      quantity: Joi.number().integer().min(1).default(1),
      size: Joi.string().allow('', null).optional(),
      issued_by: Joi.string().allow('', null).optional(),
      notes: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO ppe_records (project_id, person_name, organization_id, item, quantity, size, issued_by, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [value.project_id, value.person_name, value.organization_id || null, value.item, value.quantity,
       value.size || null, value.issued_by || null, value.notes || null, req.user.id]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/equipment-inspections', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, result: insResult } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`e.project_id = $${idx++}`); params.push(project_id); }
    if (insResult) { conditions.push(`e.result = $${idx++}`); params.push(insResult); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`SELECT * FROM equipment_inspections e ${where} ORDER BY e.inspection_date DESC, e.id DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/equipment-inspections', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      asset_id: Joi.number().integer().allow(null).optional(),
      equipment_name: Joi.string().required(),
      inspection_date: Joi.date().iso().optional(),
      inspector: Joi.string().allow('', null).optional(),
      result: Joi.string().valid('pass', 'fail').default('pass'),
      defects: Joi.string().allow('', null).optional(),
      next_inspection_date: Joi.date().iso().allow(null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO equipment_inspections (project_id, asset_id, equipment_name, inspection_date, inspector, result, defects, next_inspection_date, created_by)
       VALUES ($1,$2,$3,COALESCE($4, CURRENT_DATE),$5,$6,$7,$8,$9) RETURNING *`,
      [value.project_id, value.asset_id || null, value.equipment_name, value.inspection_date || null,
       value.inspector || null, value.result, value.defects || null, value.next_inspection_date || null, req.user.id]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/emergency-drills', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`d.project_id = $${idx++}`); params.push(project_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`SELECT * FROM emergency_drills d ${where} ORDER BY d.drill_date DESC, d.id DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/emergency-drills', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      drill_type: Joi.string().required(),
      drill_date: Joi.date().iso().optional(),
      participants_count: Joi.number().integer().min(0).default(0),
      findings: Joi.string().allow('', null).optional(),
      improvements: Joi.string().allow('', null).optional(),
      conducted_by: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO emergency_drills (project_id, drill_type, drill_date, participants_count, findings, improvements, conducted_by, created_by)
       VALUES ($1,$2,COALESCE($3, CURRENT_DATE),$4,$5,$6,$7,$8) RETURNING *`,
      [value.project_id, value.drill_type, value.drill_date || null, value.participants_count,
       value.findings || null, value.improvements || null, value.conducted_by || null, req.user.id]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
