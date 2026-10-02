const express = require('express');
const { nextNumber } = require('../services/numbering');
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
    const ncrNumber = await nextNumber(query, { table: 'ncrs', column: 'ncr_number', prefix: `NCR-${year}`, pad: 4 });

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

// ============================================================================
// PHASE 19 — QA/QC deepening: ITP, WIR, checklists, CAPA, mock-ups,
// calibration, punch items, NCR widening, MIR links, QA/QC document set.
// ============================================================================

const workflowEngine = require('../services/workflowEngine');
const qaqcEngine = require('../services/qaqcEngine');
const qcPdf = require('../utils/qcPdf');

async function projectNameFor(q, projectId) {
  try {
    const r = await q('SELECT name FROM projects WHERE id = $1', [projectId]);
    return r.rows[0] ? r.rows[0].name : `Project #${projectId}`;
  } catch (e) { return `Project #${projectId}`; }
}

// ---------------------------------------------------------------------------
// ITPs + ITP points
// ---------------------------------------------------------------------------

router.get('/itps', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status, discipline } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`i.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`i.status = $${idx++}`); params.push(status); }
    if (discipline) { conditions.push(`i.discipline = $${idx++}`); params.push(discipline); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT i.*, pl.name as location_name, u.name as created_by_name,
              (SELECT COUNT(*) FROM itp_points p WHERE p.itp_id = i.id)::int as point_count
       FROM itps i
       LEFT JOIN project_locations pl ON i.project_location_id = pl.id
       LEFT JOIN users u ON i.created_by = u.id
       ${where} ORDER BY i.created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/itps/:id', authenticate, authorize(), async (req, res) => {
  try {
    const itp = (await query(
      `SELECT i.*, pl.name as location_name, u.name as created_by_name FROM itps i
       LEFT JOIN project_locations pl ON i.project_location_id = pl.id
       LEFT JOIN users u ON i.created_by = u.id WHERE i.id = $1`, [req.params.id]
    )).rows[0];
    if (!itp) return res.status(404).json({ success: false, error: 'ITP not found' });
    const points = (await query(
      `SELECT p.*, ru.name as responsible_user_name FROM itp_points p
       LEFT JOIN users ru ON p.responsible_user_id = ru.id
       WHERE p.itp_id = $1 ORDER BY p.seq, p.id`, [req.params.id]
    )).rows;
    res.json({ success: true, data: { ...itp, points } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/itps', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      title: Joi.string().required(),
      discipline: Joi.string().allow('', null).optional(),
      work_package: Joi.string().allow('', null).optional(),
      project_location_id: Joi.number().integer().allow(null).optional(),
      points: Joi.array().items(Joi.object({
        seq: Joi.number().integer().default(1),
        title: Joi.string().required(),
        point_type: Joi.string().valid('hold', 'witness', 'review').default('review'),
        required_documents: Joi.array().items(Joi.string()).default([]),
        responsible_party: Joi.string().allow('', null).optional(),
        responsible_user_id: Joi.number().integer().allow(null).optional(),
        consultant_responsibility: Joi.string().allow('', null).optional(),
        acceptance_criteria: Joi.string().allow('', null).optional(),
        checklist_template_id: Joi.number().integer().allow(null).optional(),
      })).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const itpNumber = await qaqcEngine.nextNumber(query, 'itps', 'itp_number', 'ITP');
    const r = await query(
      `INSERT INTO itps (itp_number, project_id, title, discipline, work_package, project_location_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [itpNumber, value.project_id, value.title, value.discipline || null, value.work_package || null,
       value.project_location_id || null, req.user.id]
    );
    const itp = r.rows[0];
    for (const p of value.points) {
      await query(
        `INSERT INTO itp_points (itp_id, seq, title, point_type, required_documents, responsible_party,
           responsible_user_id, consultant_responsibility, acceptance_criteria, checklist_template_id)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)`,
        [itp.id, p.seq, p.title, p.point_type, JSON.stringify(p.required_documents),
         p.responsible_party || null, p.responsible_user_id || null,
         p.consultant_responsibility || null, p.acceptance_criteria || null, p.checklist_template_id || null]
      );
    }
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'qhse', description: `Created ITP ${itpNumber} (${value.points.length} points)`, entityId: itp.id, entityType: 'itp' });
    res.status(201).json({ success: true, data: { ...itp, points: value.points } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/itps/:id/points', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      seq: Joi.number().integer().default(1),
      title: Joi.string().required(),
      point_type: Joi.string().valid('hold', 'witness', 'review').default('review'),
      required_documents: Joi.array().items(Joi.string()).default([]),
      responsible_party: Joi.string().allow('', null).optional(),
      responsible_user_id: Joi.number().integer().allow(null).optional(),
      consultant_responsibility: Joi.string().allow('', null).optional(),
      acceptance_criteria: Joi.string().allow('', null).optional(),
      checklist_template_id: Joi.number().integer().allow(null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO itp_points (itp_id, seq, title, point_type, required_documents, responsible_party,
         responsible_user_id, consultant_responsibility, acceptance_criteria, checklist_template_id)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.id, value.seq, value.title, value.point_type, JSON.stringify(value.required_documents),
       value.responsible_party || null, value.responsible_user_id || null,
       value.consultant_responsibility || null, value.acceptance_criteria || null, value.checklist_template_id || null]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/itps/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      title: Joi.string(), discipline: Joi.string().allow('', null), work_package: Joi.string().allow('', null),
      project_location_id: Joi.number().integer().allow(null),
      status: Joi.string().valid('draft', 'active', 'archived'),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      sets.push(`${k} = $${idx++}`); params.push(k === 'project_location_id' && !v ? null : v);
    }
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);
    const r = await query(`UPDATE itps SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'ITP not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ITP document (branded PDF)
router.get('/itps/:id/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const itp = (await query('SELECT * FROM itps WHERE id = $1', [req.params.id])).rows[0];
    if (!itp) return res.status(404).json({ success: false, error: 'ITP not found' });
    const points = (await query('SELECT * FROM itp_points WHERE itp_id = $1 ORDER BY seq, id', [itp.id])).rows;
    const name = await projectNameFor(query, itp.project_id);
    const pdf = await qcPdf.renderITP({ itp, points, projectName: name });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${itp.itp_number}.pdf"`);
    res.send(pdf);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// WIRs — routed through the Phase 6 'wir' workflow template
// (Site -> QA/QC -> PM optional -> Consultant -> final result).
// ---------------------------------------------------------------------------

const WIR_SELECT = `
  SELECT w.*, pl.name as location_name, ip.title as itp_point_title, i.title as itp_title,
         COALESCE(o.name_en, o.name_ar) as subcontractor_name, su.name as submitted_by_name,
         du.name as decided_by_name, qu.name as qa_qc_by_name, pu.name as pm_by_name, cu.name as consultant_by_name
  FROM wirs w
  LEFT JOIN project_locations pl ON w.project_location_id = pl.id
  LEFT JOIN itp_points ip ON w.itp_point_id = ip.id
  LEFT JOIN itps i ON w.itp_id = i.id
  LEFT JOIN organizations o ON w.subcontractor_organization_id = o.id
  LEFT JOIN users su ON w.submitted_by = su.id
  LEFT JOIN users du ON w.decided_by = du.id
  LEFT JOIN users qu ON w.qa_qc_by = qu.id
  LEFT JOIN users pu ON w.pm_by = pu.id
  LEFT JOIN users cu ON w.consultant_by = cu.id`;

router.get('/wirs', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status, result: wirResult } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`w.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`w.status = $${idx++}`); params.push(status); }
    if (wirResult) { conditions.push(`w.result = $${idx++}`); params.push(wirResult); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`${WIR_SELECT} ${where} ORDER BY w.created_at DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/wirs/:id', authenticate, authorize(), async (req, res) => {
  try {
    const wir = (await query(`${WIR_SELECT} WHERE w.id = $1`, [req.params.id])).rows[0];
    if (!wir) return res.status(404).json({ success: false, error: 'WIR not found' });
    let checklist = null;
    if (wir.checklist_instance_id) {
      checklist = (await query('SELECT * FROM checklist_instances WHERE id = $1', [wir.checklist_instance_id])).rows[0] || null;
    }
    res.json({ success: true, data: { ...wir, checklist } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/wirs', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      itp_id: Joi.number().integer().allow(null).optional(),
      itp_point_id: Joi.number().integer().allow(null).optional(),
      boq_item_id: Joi.number().integer().allow(null).optional(),
      project_location_id: Joi.number().integer().allow(null).optional(),
      work_package: Joi.string().allow('', null).optional(),
      subcontractor_organization_id: Joi.number().integer().allow(null).optional(),
      inspection_date: Joi.date().iso().allow(null).optional(),
      latest_drawing_ref: Joi.string().allow('', null).optional(),
      method_statement_ref: Joi.string().allow('', null).optional(),
      checklist_instance_id: Joi.number().integer().allow(null).optional(),
      photos: Joi.array().items(Joi.object().unknown(true)).default([]),
      notes: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const wir = await qaqcEngine.createWir(query, value, req.user);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'qhse', description: `Created ${wir.wir_number}`, entityId: wir.id, entityType: 'wir' });
    res.status(201).json({ success: true, data: wir });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Requester submits the draft into the QA/QC stage.
router.post('/wirs/:id/submit', authenticate, authorize(), async (req, res) => {
  try {
    const wir = await qaqcEngine.submitWir(query, req.params.id, req.user);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'qhse', description: `${wir.wir_number} submitted for QA/QC`, entityId: wir.id, entityType: 'wir' });
    res.json({ success: true, data: wir });
  } catch (error) {
    const code = error.statusCode || 500;
    res.status(code).json({ success: false, error: error.message });
  }
});

// Reviewer decision at the current engine step (qa_qc / pm / consultant).
// decision: approve | reject | return
router.post('/wirs/:id/decision', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      decision: Joi.string().valid('approve', 'reject', 'return').required(),
      comment: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const wir = await qaqcEngine.wirStepDecision(query, req.params.id, null, req.user, value.decision, value.comment);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'qhse', description: `${wir.wir_number} — ${value.decision} at ${wir.status}`, entityId: wir.id, entityType: 'wir' });
    res.json({ success: true, data: wir });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// Final result by the consultant stage: approved / approved_with_comments /
// rejected / reinspect. reinspect loops back to QA/QC.
router.post('/wirs/:id/result', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      result: Joi.string().valid('approved', 'approved_with_comments', 'rejected', 'reinspect').required(),
      comment: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const wir = await qaqcEngine.decideWir(query, req.params.id, req.user, value.result, { comment: value.comment });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'qhse', description: `${wir.wir_number} result: ${value.result}`, entityId: wir.id, entityType: 'wir' });
    res.json({ success: true, data: wir });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.get('/wirs/:id/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const wir = (await query(`${WIR_SELECT} WHERE w.id = $1`, [req.params.id])).rows[0];
    if (!wir) return res.status(404).json({ success: false, error: 'WIR not found' });
    let checklist = null;
    if (wir.checklist_instance_id) {
      checklist = (await query('SELECT * FROM checklist_instances WHERE id = $1', [wir.checklist_instance_id])).rows[0] || null;
    }
    const name = await projectNameFor(query, wir.project_id);
    const pdf = await qcPdf.renderWIR({ wir, projectName: name, checklist });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${wir.wir_number}.pdf"`);
    res.send(pdf);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Checklists — templates + instances
// ---------------------------------------------------------------------------

router.get('/checklists/templates', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, discipline } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`t.project_id = $${idx++}`); params.push(project_id); }
    if (discipline) { conditions.push(`t.discipline = $${idx++}`); params.push(discipline); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(
      `SELECT t.*, u.name as created_by_name FROM checklist_templates t
       LEFT JOIN users u ON t.created_by = u.id
       ${where} ORDER BY t.created_at DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/checklists/templates', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().allow(null).optional(),
      name: Joi.string().required(),
      discipline: Joi.string().allow('', null).optional(),
      items: Joi.array().items(Joi.object({ item: Joi.string().required(), acceptance_criteria: Joi.string().allow('', null).optional(), point_type: Joi.string().allow('', null).optional() })).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO checklist_templates (project_id, name, discipline, items, created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING *`,
      [value.project_id || null, value.name, value.discipline || null, JSON.stringify(value.items), req.user.id]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'qhse', description: `Created checklist template "${value.name}"`, entityId: r.rows[0].id, entityType: 'checklist_template' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Instantiate a checklist from a template (or ad-hoc) for a context record.
router.post('/checklists/instances', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      template_id: Joi.number().integer().allow(null).optional(),
      context_type: Joi.string().valid('wir', 'mir', 'quality_test', 'mock_up', 'general').default('general'),
      context_id: Joi.number().integer().allow(null).optional(),
      title: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    let items = [];
    let templateTitle = null;
    if (value.template_id) {
      const t = (await query('SELECT * FROM checklist_templates WHERE id = $1', [value.template_id])).rows[0];
      if (!t) return res.status(404).json({ success: false, error: 'Checklist template not found' });
      items = typeof t.items === 'string' ? JSON.parse(t.items) : (t.items || []);
      templateTitle = t.name;
    }
    const r = await query(
      `INSERT INTO checklist_instances (template_id, context_type, context_id, project_id, title, items, created_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING *`,
      [value.template_id || null, value.context_type, value.context_id || null, value.project_id,
       value.title || templateTitle, JSON.stringify(items.map((it) => ({ ...it, ok: false, note: '' }))), req.user.id]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/checklists/instances', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, context_type, context_id } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`ci.project_id = $${idx++}`); params.push(project_id); }
    if (context_type) { conditions.push(`ci.context_type = $${idx++}`); params.push(context_type); }
    if (context_id) { conditions.push(`ci.context_id = $${idx++}`); params.push(context_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`SELECT ci.*, u.name as created_by_name FROM checklist_instances ci
      LEFT JOIN users u ON ci.created_by = u.id ${where} ORDER BY ci.created_at DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Fill in checklist items (ok/note), optionally completing the instance.
router.put('/checklists/instances/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      items: Joi.array().items(Joi.object({ item: Joi.string(), acceptance_criteria: Joi.string().allow('', null), point_type: Joi.string().allow('', null), ok: Joi.boolean(), note: Joi.string().allow('', null) })),
      complete: Joi.boolean(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const existing = (await query('SELECT * FROM checklist_instances WHERE id = $1', [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ success: false, error: 'Checklist instance not found' });
    const current = typeof existing.items === 'string' ? JSON.parse(existing.items) : (existing.items || []);
    const updated = (value.items || current).map((it) => ({ ok: false, note: '', ...it }));
    const r = await query(
      `UPDATE checklist_instances SET items = $1::jsonb,
         completed_at = $2, completed_by = $3 WHERE id = $4 RETURNING *`,
      [JSON.stringify(updated), value.complete ? new Date() : (existing.completed_at || null), value.complete ? req.user.id : existing.completed_by, req.params.id]);
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/checklists/instances/:id/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const instance = (await query('SELECT * FROM checklist_instances WHERE id = $1', [req.params.id])).rows[0];
    if (!instance) return res.status(404).json({ success: false, error: 'Checklist instance not found' });
    const name = await projectNameFor(query, instance.project_id);
    const pdf = await qcPdf.renderChecklist({ instance, projectName: name });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="checklist-${instance.id}.pdf"`);
    res.send(pdf);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// CAPA — corrective + preventive actions
// ---------------------------------------------------------------------------

const CAPA_TABLES = { corrective: 'corrective_actions', preventive: 'preventive_actions' };

router.get('/actions', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, kind = 'corrective', status, overdue } = req.query;
    const table = CAPA_TABLES[kind] || CAPA_TABLES.corrective;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`ca.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`ca.status = $${idx++}`); params.push(status); }
    if (overdue === 'true') { conditions.push(`ca.due_date IS NOT NULL AND ca.due_date < CURRENT_DATE AND ca.status NOT IN ('completed','verified')`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(
      `SELECT ca.*, u.name as assigned_user_name, cu.name as created_by_name,
              (ca.due_date IS NOT NULL AND ca.due_date < CURRENT_DATE AND ca.status NOT IN ('completed','verified')) as is_overdue
       FROM ${table} ca LEFT JOIN users u ON ca.assigned_user_id = u.id LEFT JOIN users cu ON ca.created_by = cu.id
       ${where} ORDER BY ca.created_at DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/actions', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      kind: Joi.string().valid('corrective', 'preventive').default('corrective'),
      project_id: Joi.number().integer().required(),
      source_type: Joi.string().allow('', null).optional(),
      source_id: Joi.number().integer().allow(null).optional(),
      description: Joi.string().required(),
      assigned_user_id: Joi.number().integer().allow(null).optional(),
      assigned_role: Joi.string().allow('', null).optional(),
      due_date: Joi.date().iso().allow(null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const table = CAPA_TABLES[value.kind];
    const r = await query(
      `INSERT INTO ${table} (project_id, source_type, source_id, description, assigned_user_id, assigned_role, due_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [value.project_id, value.source_type || 'manual', value.source_id || null, value.description,
       value.assigned_user_id || null, value.assigned_role || null, value.due_date || null, req.user.id]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'qhse', description: `Raised ${value.kind} action`, entityId: r.rows[0].id, entityType: `${value.kind}_action` });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// CAPA lifecycle: open → in_progress → completed → verified
const CAPA_TRANSITIONS = {
  open: ['in_progress', 'completed'],
  in_progress: ['completed'],
  completed: ['verified'],
  verified: [],
};
router.post('/actions/:id/status', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      kind: Joi.string().valid('corrective', 'preventive').default('corrective'),
      status: Joi.string().valid('in_progress', 'completed', 'verified').required(),
      notes: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const table = CAPA_TABLES[value.kind];
    const existing = (await query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ success: false, error: `${value.kind} action not found` });
    if (!CAPA_TRANSITIONS[existing.status] || !CAPA_TRANSITIONS[existing.status].includes(value.status)) {
      return res.status(400).json({ success: false, error: `Cannot transition from '${existing.status}' to '${value.status}'` });
    }
    let r;
    if (value.status === 'completed') {
      r = await query(`UPDATE ${table} SET status = 'completed', completed_at = NOW(), completed_by = $1 WHERE id = $2 RETURNING *`, [req.user.id, req.params.id]);
    } else if (value.status === 'verified') {
      r = await query(`UPDATE ${table} SET status = 'verified', verified_by = $1, verified_at = NOW(), verification_notes = COALESCE($2, verification_notes) WHERE id = $3 RETURNING *`, [req.user.id, value.notes, req.params.id]);
    } else {
      r = await query(`UPDATE ${table} SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [value.status, req.params.id]);
    }
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/actions/:id/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const kind = req.query.kind === 'preventive' ? 'preventive' : 'corrective';
    const table = CAPA_TABLES[kind];
    const action = (await query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id])).rows[0];
    if (!action) return res.status(404).json({ success: false, error: `${kind} action not found` });
    const name = await projectNameFor(query, action.project_id);
    const pdf = await qcPdf.renderCorrectiveAction({ action, kind, projectName: name });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${kind}-action-${action.id}.pdf"`);
    res.send(pdf);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Mock-ups
// ---------------------------------------------------------------------------

router.get('/mock-ups', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`m.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`m.status = $${idx++}`); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(
      `SELECT m.*, pl.name as location_name, COALESCE(o.name_en, o.name_ar) as subcontractor_name, u.name as created_by_name
       FROM mock_ups m LEFT JOIN project_locations pl ON m.project_location_id = pl.id
       LEFT JOIN organizations o ON m.subcontractor_organization_id = o.id
       LEFT JOIN users u ON m.created_by = u.id ${where} ORDER BY m.created_at DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/mock-ups', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      title: Joi.string().required(),
      discipline: Joi.string().allow('', null).optional(),
      project_location_id: Joi.number().integer().allow(null).optional(),
      subcontractor_organization_id: Joi.number().integer().allow(null).optional(),
      remarks: Joi.string().allow('', null).optional(),
      photos: Joi.array().items(Joi.object().unknown(true)).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO mock_ups (project_id, title, discipline, project_location_id, subcontractor_organization_id, remarks, photos, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *`,
      [value.project_id, value.title, value.discipline || null, value.project_location_id || null,
       value.subcontractor_organization_id || null, value.remarks || null, JSON.stringify(value.photos), req.user.id]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'qhse', description: `Proposed mock-up "${value.title}"`, entityId: r.rows[0].id, entityType: 'mock_up' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

const MOCK_UP_TRANSITIONS = {
  proposed: ['under_review', 'approved', 'rejected'],
  under_review: ['approved', 'rejected', 'rework'],
  rework: ['under_review', 'rejected'],
};
router.post('/mock-ups/:id/status', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      status: Joi.string().valid('under_review', 'approved', 'rejected', 'rework').required(),
      remarks: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const existing = (await query('SELECT * FROM mock_ups WHERE id = $1', [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ success: false, error: 'Mock-up not found' });
    if (!MOCK_UP_TRANSITIONS[existing.status] || !MOCK_UP_TRANSITIONS[existing.status].includes(value.status)) {
      return res.status(400).json({ success: false, error: `Cannot transition from '${existing.status}' to '${value.status}'` });
    }
    const r = value.status === 'approved'
      ? await query(`UPDATE mock_ups SET status = $1, remarks = COALESCE($2, remarks), approved_by = $3, approved_at = NOW(), updated_at = NOW() WHERE id = $4 RETURNING *`,
          [value.status, value.remarks, req.user.id, req.params.id])
      : await query(`UPDATE mock_ups SET status = $1, remarks = COALESCE($2, remarks), updated_at = NOW() WHERE id = $3 RETURNING *`,
          [value.status, value.remarks, req.params.id]);
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Calibration records
// ---------------------------------------------------------------------------

router.get('/calibration-records', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, result: calResult } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`cr.project_id = $${idx++}`); params.push(project_id); }
    if (calResult) { conditions.push(`cr.result = $${idx++}`); params.push(calResult); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(
      `SELECT cr.*, a.name as asset_name, u.name as created_by_name,
              (cr.next_calibration_date IS NOT NULL AND cr.next_calibration_date < CURRENT_DATE) as calibration_overdue
       FROM calibration_records cr LEFT JOIN users u ON cr.created_by = u.id
       ${where} ORDER BY cr.calibration_date DESC, cr.id DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/calibration-records', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().allow(null).optional(),
      asset_id: Joi.number().integer().allow(null).optional(),
      instrument_name: Joi.string().required(),
      serial_no: Joi.string().allow('', null).optional(),
      calibration_date: Joi.date().iso().optional(),
      next_calibration_date: Joi.date().iso().allow(null).optional(),
      certificate_ref: Joi.string().allow('', null).optional(),
      result: Joi.string().valid('pass', 'fail').default('pass'),
      issued_by: Joi.string().allow('', null).optional(),
      notes: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO calibration_records (project_id, asset_id, instrument_name, serial_no, calibration_date, next_calibration_date, certificate_ref, result, issued_by, notes, created_by)
       VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE),$6,$7,$8,$9,$10,$11) RETURNING *`,
      [value.project_id || null, value.asset_id || null, value.instrument_name, value.serial_no || null,
       value.calibration_date || null, value.next_calibration_date || null, value.certificate_ref || null,
       value.result, value.issued_by || null, value.notes || null, req.user.id]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'qhse', description: `Recorded calibration for "${value.instrument_name}"`, entityId: r.rows[0].id, entityType: 'calibration_record' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Punch items (Phase 25 handover reuses this register + workflow)
// ---------------------------------------------------------------------------

const PUNCH_SELECT = `
  SELECT p.*, pl.name as location_name, COALESCE(o.name_en, o.name_ar) as responsible_name,
         ru.name as responsible_user_name, rb.name as raised_by_name
  FROM punch_items p
  LEFT JOIN project_locations pl ON p.project_location_id = pl.id
  LEFT JOIN organizations o ON p.responsible_subcontractor_id = o.id
  LEFT JOIN users ru ON p.responsible_user_id = ru.id
  LEFT JOIN users rb ON p.raised_by = rb.id`;

router.get('/punch-items', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`p.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`p.status = $${idx++}`); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`${PUNCH_SELECT} ${where} ORDER BY p.created_at DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/punch-items', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      project_location_id: Joi.number().integer().allow(null).optional(),
      discipline: Joi.string().allow('', null).optional(),
      description: Joi.string().required(),
      photos: Joi.array().items(Joi.object().unknown(true)).default([]),
      responsible_subcontractor_id: Joi.number().integer().allow(null).optional(),
      responsible_user_id: Joi.number().integer().allow(null).optional(),
      due_date: Joi.date().iso().allow(null).optional(),
      verification_authority: Joi.string().allow('', null).optional(),
      severity: Joi.string().valid('minor', 'major', 'critical').default('minor'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const punch = await qaqcEngine.createPunchItem(query, value, req.user);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'qhse', description: `Raised ${punch.punch_number}`, entityId: punch.id, entityType: 'punch_item' });
    res.status(201).json({ success: true, data: punch });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/punch-items/:id/status', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      status: Joi.string().valid('assigned', 'rectified', 'verified', 'closed', 'open').required(),
      comment: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const punch = await qaqcEngine.transitionPunchItem(query, req.params.id, value.status, req.user, { comment: value.comment });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'qhse', description: `${punch.punch_number} → ${value.status}`, entityId: punch.id, entityType: 'punch_item' });
    res.json({ success: true, data: punch });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/punch-items/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ success: false, error: 'project_id is required' });
    const items = (await query(`${PUNCH_SELECT} WHERE p.project_id = $1 ORDER BY p.created_at`, [project_id])).rows;
    const name = await projectNameFor(query, project_id);
    const pdf = await qcPdf.renderPunchList({ items, projectName: name });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="punch-list-${project_id}.pdf"`);
    res.send(pdf);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// NCR widening — exact location, responsible party, root cause, corrective/
// preventive action, cost & schedule impact, verification, closure authority.
// Existing severity + open → in_progress → resolved → closed progression is
// untouched; the field set and PDF are added beside it.
// ---------------------------------------------------------------------------

router.put('/ncrs/:id', authenticate, authorize(), async (req, res) => {
  try {
    const existing = (await query('SELECT status FROM ncrs WHERE id = $1', [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ success: false, error: 'NCR not found' });
    if (existing.status === 'closed') return res.status(400).json({ success: false, error: 'Closed NCRs are read-only' });

    const schema = Joi.object({
      description: Joi.string(),
      severity: Joi.string().valid('minor', 'major', 'critical'),
      resolution_notes: Joi.string().allow(''),
      project_location_id: Joi.number().integer().allow(null),
      exact_location: Joi.string().allow('', null),
      responsible_party: Joi.string().allow('', null),
      responsible_organization_id: Joi.number().integer().allow(null),
      root_cause: Joi.string().allow('', null),
      corrective_action: Joi.string().allow('', null),
      preventive_action: Joi.string().allow('', null),
      cost_impact: Joi.number().precision(2),
      schedule_impact_days: Joi.number().integer(),
      verification_notes: Joi.string().allow('', null),
      closure_authority: Joi.string().allow('', null),
      corrective_action_id: Joi.number().integer().allow(null),
      preventive_action_id: Joi.number().integer().allow(null),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      sets.push(`${k} = $${idx++}`); params.push(v);
    }
    params.push(req.params.id);
    const result = await query(`UPDATE ncrs SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, params);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Verification + closure — closes the NCR with verification + closure
// authority (extended closure path beside the legacy status transitions).
router.post('/ncrs/:id/verify', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      verification_notes: Joi.string().required(),
      closure_authority: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const existing = (await query('SELECT status FROM ncrs WHERE id = $1', [req.params.id])).rows[0];
    if (!existing) return res.status(404).json({ success: false, error: 'NCR not found' });
    if (!['resolved', 'in_progress'].includes(existing.status)) {
      return res.status(400).json({ success: false, error: `Cannot verify an NCR in '${existing.status}' state` });
    }
    const r = await query(
      `UPDATE ncrs SET status = 'closed', verification_notes = $1, closure_authority = COALESCE($2, closure_authority),
         verified_by = $3, verified_at = NOW(), closed_at = NOW(), resolved_by = COALESCE(resolved_by, $3), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [value.verification_notes, value.closure_authority || null, req.user.id, req.params.id]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'qhse', description: `NCR #${req.params.id} verified & closed`, entityId: req.params.id, entityType: 'ncr' });
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/ncrs/:id/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const ncr = (await query('SELECT * FROM ncrs WHERE id = $1', [req.params.id])).rows[0];
    if (!ncr) return res.status(404).json({ success: false, error: 'NCR not found' });
    const name = await projectNameFor(query, ncr.project_id);
    const pdf = await qcPdf.renderNCR({ ncr, projectName: name });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${ncr.ncr_number}.pdf"`);
    res.send(pdf);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Quality tests — link to an ITP/ITP point/checklist + test report PDF.
// ---------------------------------------------------------------------------

router.put('/quality-tests/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      test_type: Joi.string(), test_date: Joi.date().iso(),
      result: Joi.string().valid('pass', 'fail', 'pending'),
      tested_by: Joi.string().allow(''), notes: Joi.string().allow(''),
      attachments: Joi.array().items(Joi.object().unknown(true)),
      itp_id: Joi.number().integer().allow(null),
      itp_point_id: Joi.number().integer().allow(null),
      checklist_instance_id: Joi.number().integer().allow(null),
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
    const r = await query(`UPDATE quality_tests SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Test not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/quality-tests/:id/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const test = (await query('SELECT * FROM quality_tests WHERE id = $1', [req.params.id])).rows[0];
    if (!test) return res.status(404).json({ success: false, error: 'Test not found' });
    const name = await projectNameFor(query, test.project_id);
    const pdf = await qcPdf.renderTestReport({ test, projectName: name });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="test-report-${test.id}.pdf"`);
    res.send(pdf);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// MIRs — the Phase 12 gate, surfaced here with its remaining links
// (material submittal, certificates, GRN) and the Phase 6 'mir' workflow sync.
// The accept/reject decision itself stays in the procurement module — its
// accepted quantity already controls usable stock through the quarantine gate.
// ---------------------------------------------------------------------------

router.get('/mirs', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`m.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`m.status = $${idx++}`); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(
      `SELECT m.*, s.name as supplier_name, u.name as created_by_name, d.id as delivery_id
       FROM material_inspection_requests m
       LEFT JOIN suppliers s ON m.supplier_id = s.id
       LEFT JOIN users u ON m.created_by = u.id
       LEFT JOIN deliveries d ON m.delivery_id = d.id
       ${where} ORDER BY m.created_at DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Attach the submittal/certificate links to a MIR.
router.put('/mirs/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().allow(null),
      material_submittal_id: Joi.number().integer().allow(null),
      grn_id: Joi.number().integer().allow(null),
      certificates: Joi.array().items(Joi.object().unknown(true)),
      notes: Joi.string().allow('', null),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (k === 'certificates') { sets.push(`certificates = $${idx++}::jsonb`); params.push(JSON.stringify(v)); }
      else { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id);
    const r = await query(`UPDATE material_inspection_requests SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'MIR not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Sync a MIR into the Phase 6 'mir' template (idempotent per MIR).
router.post('/mirs/:id/workflow', authenticate, authorize(), async (req, res) => {
  try {
    const mir = (await query('SELECT * FROM material_inspection_requests WHERE id = $1', [req.params.id])).rows[0];
    if (!mir) return res.status(404).json({ success: false, error: 'MIR not found' });
    if (mir.workflow_instance_id) {
      return res.json({ success: true, data: { workflow_instance_id: mir.workflow_instance_id, existing: true } });
    }
    const workflow = await workflowEngine.startWorkflow('mir', 'mir', mir.id, {
      project_id: mir.project_id || null, requester_id: req.user.id,
      mir_number: mir.mir_number, module_name: 'mir',
    });
    await workflowEngine.syncExternalState(workflow.instance.id, 'delivery', {
      userId: req.user.id, userName: req.user.name, role: req.user.role,
    }, { comment: 'MIR raised from delivery' });
    await query('UPDATE material_inspection_requests SET workflow_instance_id = $1 WHERE id = $2', [workflow.instance.id, mir.id]);
    res.status(201).json({ success: true, data: { workflow_instance_id: workflow.instance.id, existing: false } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Sync the MIR decision outcome into its workflow instance (called after
// the procurement module's decideMir posts the quarantine movements).
router.post('/mirs/:id/workflow/decision', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      result: Joi.string().valid('accepted', 'rejected', 'partial').required(),
      comment: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const mir = (await query('SELECT * FROM material_inspection_requests WHERE id = $1', [req.params.id])).rows[0];
    if (!mir) return res.status(404).json({ success: false, error: 'MIR not found' });
    if (!mir.workflow_instance_id) return res.status(400).json({ success: false, error: 'MIR has no workflow instance — POST /mirs/:id/workflow first' });
    const stepKey = value.result === 'accepted' ? 'grn_eligibility'
      : (value.result === 'rejected' ? 'accepted_rejected_quarantine' : 'accepted_rejected_quarantine');
    await workflowEngine.syncExternalState(mir.workflow_instance_id, stepKey, {
      userId: req.user.id, userName: req.user.name, role: req.user.role,
    }, { comment: value.comment || `MIR ${value.result}`, terminal: true });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
