const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// Mounted at /api/qhse — quality tests, NCRs, safety inspections & incidents.
// All list endpoints filter by ?project_id.

// ============ QUALITY TESTS ============

router.get('/quality-tests', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, result: testResult } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`qt.project_id = $${idx++}`); params.push(project_id); }
    if (testResult) { conditions.push(`qt.result = $${idx++}`); params.push(testResult); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT qt.*, u.name as created_by_name FROM quality_tests qt
       LEFT JOIN users u ON qt.created_by = u.id ${where} ORDER BY qt.test_date DESC, qt.id DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/quality-tests', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      boq_item_id: Joi.number().integer().allow(null).optional(),
      test_type: Joi.string().required(),
      test_date: Joi.date().iso().optional(),
      result: Joi.string().valid('pass', 'fail', 'pending').default('pending'),
      tested_by: Joi.string().allow('').optional(),
      notes: Joi.string().allow('').optional(),
      attachments: Joi.array().items(Joi.object().unknown(true)).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const result = await query(
      `INSERT INTO quality_tests (project_id, boq_item_id, test_type, test_date, result, tested_by, notes, attachments, created_by)
       VALUES ($1,$2,$3,COALESCE($4, CURRENT_DATE),$5,$6,$7,$8::jsonb,$9) RETURNING *`,
      [value.project_id, value.boq_item_id, value.test_type, value.test_date, value.result,
       value.tested_by, value.notes, JSON.stringify(value.attachments), req.user.id]
    );
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'qhse', description: `Logged quality test "${value.test_type}" (${value.result})`, entityId: result.rows[0].id, entityType: 'quality_test' });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/quality-tests/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      test_type: Joi.string(), test_date: Joi.date().iso(),
      result: Joi.string().valid('pass', 'fail', 'pending'),
      tested_by: Joi.string().allow(''), notes: Joi.string().allow(''),
      attachments: Joi.array().items(Joi.object().unknown(true)),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (k === 'attachments') { sets.push(`attachments = $${idx++}::jsonb`); params.push(JSON.stringify(v)); }
      else { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id);
    const result = await query(`UPDATE quality_tests SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Test not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/quality-tests/:id', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query('DELETE FROM quality_tests WHERE id = $1 RETURNING test_type', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Test not found' });
    res.json({ success: true, message: 'Test deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ NCRs ============

const NCR_TRANSITIONS = {
  open: ['in_progress'],
  in_progress: ['resolved'],
  resolved: ['closed', 'in_progress'],
};

router.get('/ncrs', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status, severity } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`n.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`n.status = $${idx++}`); params.push(status); }
    if (severity) { conditions.push(`n.severity = $${idx++}`); params.push(severity); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT n.*, ru.name as raised_by_name, su.name as resolved_by_name FROM ncrs n
       LEFT JOIN users ru ON n.raised_by = ru.id LEFT JOIN users su ON n.resolved_by = su.id
       ${where} ORDER BY n.created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/ncrs', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      boq_item_id: Joi.number().integer().allow(null).optional(),
      quality_test_id: Joi.number().integer().allow(null).optional(),
      description: Joi.string().required(),
      severity: Joi.string().valid('minor', 'major', 'critical').default('minor'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const year = new Date().getFullYear();
    const seq = await query(`SELECT COUNT(*) + 1 as next FROM ncrs WHERE ncr_number LIKE $1`, [`NCR-${year}-%`]);
    const ncrNumber = `NCR-${year}-${String(seq.rows[0].next).padStart(4, '0')}`;

    const result = await query(
      `INSERT INTO ncrs (ncr_number, project_id, boq_item_id, quality_test_id, description, severity, raised_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [ncrNumber, value.project_id, value.boq_item_id, value.quality_test_id, value.description, value.severity, req.user.id]
    );
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'qhse', description: `Raised ${ncrNumber} (${value.severity})`, entityId: result.rows[0].id, entityType: 'ncr' });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// NCR status transitions: open → in_progress → resolved → closed (resolved can reopen to in_progress)
router.post('/ncrs/:id/status', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      status: Joi.string().valid('in_progress', 'resolved', 'closed').required(),
      resolution_notes: Joi.string().allow('').optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const existing = await query('SELECT * FROM ncrs WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'NCR not found' });

    const current = existing.rows[0].status;
    if (!NCR_TRANSITIONS[current] || !NCR_TRANSITIONS[current].includes(value.status)) {
      return res.status(400).json({ success: false, error: `Cannot transition from '${current}' to '${value.status}'` });
    }

    const result = value.status === 'resolved'
      ? await query(
          `UPDATE ncrs SET status = $1, resolution_notes = COALESCE($2, resolution_notes),
             resolved_by = $3, resolved_at = NOW(), updated_at = NOW()
           WHERE id = $4 RETURNING *`,
          [value.status, value.resolution_notes, req.user.id, req.params.id]
        )
      : await query(
          `UPDATE ncrs SET status = $1, resolution_notes = COALESCE($2, resolution_notes), updated_at = NOW()
           WHERE id = $3 RETURNING *`,
          [value.status, value.resolution_notes, req.params.id]
        );
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'qhse', description: `${existing.rows[0].ncr_number} → ${value.status}`, entityId: req.params.id, entityType: 'ncr' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/ncrs/:id', authenticate, authorize(), async (req, res) => {
  try {
    const existing = await query('SELECT status FROM ncrs WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'NCR not found' });
    if (existing.rows[0].status === 'closed') return res.status(400).json({ success: false, error: 'Closed NCRs are read-only' });

    const schema = Joi.object({
      description: Joi.string(),
      severity: Joi.string().valid('minor', 'major', 'critical'),
      resolution_notes: Joi.string().allow(''),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id);
    const result = await query(`UPDATE ncrs SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, params);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ SAFETY INSPECTIONS ============

router.get('/inspections', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`si.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`si.status = $${idx++}`); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT si.*, u.name as inspector_name FROM safety_inspections si
       LEFT JOIN users u ON si.inspector_id = u.id ${where} ORDER BY si.inspection_date DESC, si.id DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/inspections', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      inspection_date: Joi.date().iso().optional(),
      checklist_items: Joi.array().items(Joi.object({ item: Joi.string().required(), ok: Joi.boolean().default(false), note: Joi.string().allow('').optional() })).default([]),
      findings: Joi.string().allow('').optional(),
      status: Joi.string().valid('pending', 'passed', 'failed').default('pending'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const result = await query(
      `INSERT INTO safety_inspections (project_id, inspection_date, inspector_id, checklist_items, findings, status)
       VALUES ($1,COALESCE($2, CURRENT_DATE),$3,$4::jsonb,$5,$6) RETURNING *`,
      [value.project_id, value.inspection_date, req.user.id, JSON.stringify(value.checklist_items), value.findings, value.status]
    );
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'qhse', description: `Logged safety inspection (${value.status})`, entityId: result.rows[0].id, entityType: 'safety_inspection' });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/inspections/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      inspection_date: Joi.date().iso(),
      checklist_items: Joi.array().items(Joi.object({ item: Joi.string().required(), ok: Joi.boolean().default(false), note: Joi.string().allow('').optional() })),
      findings: Joi.string().allow(''),
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
    const result = await query(`UPDATE safety_inspections SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Inspection not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ SAFETY INCIDENTS ============

router.get('/incidents', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`si.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`si.status = $${idx++}`); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT si.*, u.name as reported_by_name FROM safety_incidents si
       LEFT JOIN users u ON si.reported_by = u.id ${where} ORDER BY si.incident_date DESC, si.id DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/incidents', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      incident_date: Joi.date().iso().optional(),
      incident_type: Joi.string().allow('').optional(),
      severity: Joi.string().valid('minor', 'major', 'critical').default('minor'),
      description: Joi.string().required(),
      injured_party: Joi.string().allow('', null).optional(),
      corrective_action: Joi.string().allow('').optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const result = await query(
      `INSERT INTO safety_incidents (project_id, incident_date, incident_type, severity, description, injured_party, reported_by, corrective_action)
       VALUES ($1,COALESCE($2, CURRENT_DATE),$3,$4,$5,$6,$7,$8) RETURNING *`,
      [value.project_id, value.incident_date, value.incident_type, value.severity, value.description,
       value.injured_party, req.user.id, value.corrective_action]
    );
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'qhse', description: `Reported safety incident (${value.severity})`, entityId: result.rows[0].id, entityType: 'safety_incident' });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/incidents/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      incident_type: Joi.string().allow(''), severity: Joi.string().valid('minor', 'major', 'critical'),
      description: Joi.string(), injured_party: Joi.string().allow('', null),
      corrective_action: Joi.string().allow(''),
      status: Joi.string().valid('open', 'investigating', 'closed'),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id);
    const result = await query(`UPDATE safety_incidents SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Incident not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
