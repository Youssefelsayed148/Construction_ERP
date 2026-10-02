const express = require('express');
const { nextNumber } = require('../services/numbering');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');
const actionService = require('../services/actionService');

// Mounted at /api/projects — provides /:projectId/site-reports, /:projectId/instructions, /:projectId/site-visits

// ============ DAILY SITE REPORTS ============

router.get('/:projectId/site-reports', authenticate, authorize(), async (req, res) => {
  try {
    const { from, to, limit = 100, offset = 0 } = req.query;
    let conditions = ['sdr.project_id = $1']; let params = [req.params.projectId]; let idx = 2;
    if (from) { conditions.push(`sdr.report_date >= $${idx++}`); params.push(from); }
    if (to) { conditions.push(`sdr.report_date <= $${idx++}`); params.push(to); }
    const result = await query(
      `SELECT sdr.*, u.name as created_by_name FROM site_daily_reports sdr
       LEFT JOIN users u ON sdr.created_by = u.id
       WHERE ${conditions.join(' AND ')} ORDER BY sdr.report_date DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/:projectId/site-reports/:date', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query(
      `SELECT sdr.*, u.name as created_by_name FROM site_daily_reports sdr
       LEFT JOIN users u ON sdr.created_by = u.id
       WHERE sdr.project_id = $1 AND sdr.report_date = $2`,
      [req.params.projectId, req.params.date]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Report not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/:projectId/site-reports', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      report_date: Joi.date().iso().required(),
      weather: Joi.string().allow('').optional(),
      temperature: Joi.string().allow('').optional(),
      workers_count: Joi.number().integer().min(0).default(0),
      work_summary: Joi.string().required(),
      material_received: Joi.string().allow('').optional(),
      equipment_on_site: Joi.string().allow('').optional(),
      issues_notes: Joi.string().allow('').optional(),
      photos: Joi.array().items(Joi.object().unknown(true)).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const result = await query(
      `INSERT INTO site_daily_reports (project_id, report_date, weather, temperature, workers_count, work_summary, material_received, equipment_on_site, issues_notes, photos, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) RETURNING *`,
      [req.params.projectId, value.report_date, value.weather, value.temperature, value.workers_count,
       value.work_summary, value.material_received, value.equipment_on_site, value.issues_notes,
       JSON.stringify(value.photos), req.user.id]
    );

    if (global.eventBus) {
      global.eventBus.emit('site_report.created', {
        entityType: 'site_daily_report', entityId: result.rows[0].id,
        payload: { project_id: parseInt(req.params.projectId), report_date: value.report_date },
      });
    }

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'site', description: `Filed daily site report for project #${req.params.projectId}`, entityId: result.rows[0].id, entityType: 'site_daily_report' });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, error: 'A report already exists for this project and date' });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:projectId/site-reports/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      weather: Joi.string().allow(''), temperature: Joi.string().allow(''),
      workers_count: Joi.number().integer().min(0), work_summary: Joi.string().allow(''),
      material_received: Joi.string().allow(''), equipment_on_site: Joi.string().allow(''),
      issues_notes: Joi.string().allow(''), photos: Joi.array().items(Joi.object().unknown(true)),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (k === 'photos') { sets.push(`photos = $${idx++}::jsonb`); params.push(JSON.stringify(v)); }
      else { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id, req.params.projectId);
    const result = await query(
      `UPDATE site_daily_reports SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx++} AND project_id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Report not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ ENGINEER INSTRUCTIONS ============

const INSTRUCTION_TRANSITIONS = {
  issued: ['acknowledged'],
  acknowledged: ['implemented'],
  implemented: ['closed'],
};

router.get('/:projectId/instructions', authenticate, authorize(), async (req, res) => {
  try {
    const { status, priority } = req.query;
    let conditions = ['ei.project_id = $1']; let params = [req.params.projectId]; let idx = 2;
    if (status) { conditions.push(`ei.status = $${idx++}`); params.push(status); }
    if (priority) { conditions.push(`ei.priority = $${idx++}`); params.push(priority); }
    const result = await query(
      `SELECT ei.*, iu.name as issued_by_name, cu.name as closed_by_name FROM engineer_instructions ei
       LEFT JOIN users iu ON ei.issued_by = iu.id LEFT JOIN users cu ON ei.closed_by = cu.id
       WHERE ${conditions.join(' AND ')} ORDER BY ei.created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/:projectId/instructions', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      title: Joi.string().required(),
      description: Joi.string().allow('').optional(),
      priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
      issued_date: Joi.date().iso().optional(),
      assigned_to_user_id: Joi.number().integer().optional().allow(null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const instructionNumber = await nextNumber(query, { table: 'engineer_instructions', column: 'instruction_number', prefix: `EI-${req.params.projectId}`, pad: 3 });

    const result = await query(
      `INSERT INTO engineer_instructions (instruction_number, project_id, title, description, priority, issued_by, issued_date, assigned_to_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, CURRENT_DATE),$8) RETURNING *`,
      [instructionNumber, req.params.projectId, value.title, value.description, value.priority, req.user.id, value.issued_date, value.assigned_to_user_id || null]
    );
    const instruction = result.rows[0];

    // Phase 7 wiring: the issued instruction becomes an action item in the
    // assignee's "My Actions" queue (not only visible inside site.js).
    try {
      const assignee = value.assigned_to_user_id || req.user.id;
      const actionItem = await actionService.createActionItem({
        source_type: 'engineer_instruction',
        source_id: instruction.id,
        project_id: parseInt(req.params.projectId, 10),
        title: `Acknowledge instruction ${instructionNumber}: ${value.title.slice(0, 120)}`,
        description: value.description || null,
        assigned_user_id: assignee,
        priority: value.priority === 'urgent' ? 'high' : value.priority === 'high' ? 'high' : 'medium',
        due_date: null,
        created_by: req.user.id,
      });
      await query('UPDATE engineer_instructions SET action_item_id = $1 WHERE id = $2', [actionItem.id, instruction.id]);
    } catch (e) {
      console.error('[SITE] instruction action-item sync failed:', e.message);
    }

    await fireEvent({
      eventType: 'instruction.issued',
      entityType: 'engineer_instruction',
      entityId: instruction.id,
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      payload: { project_id: parseInt(req.params.projectId, 10), instruction_number: instructionNumber },
    });

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'site', description: `Issued instruction ${instructionNumber}: ${value.title}`, entityId: instruction.id, entityType: 'engineer_instruction' });
    res.status(201).json({ success: true, data: (await query('SELECT * FROM engineer_instructions WHERE id = $1', [instruction.id])).rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/:projectId/instructions/:id', authenticate, authorize(), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM engineer_instructions WHERE id = $1 AND project_id = $2', [req.params.id, req.params.projectId]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Instruction not found' });
    if (existing.rows[0].status === 'closed') return res.status(400).json({ success: false, error: 'Closed instructions are read-only' });

    const schema = Joi.object({
      title: Joi.string(), description: Joi.string().allow(''),
      priority: Joi.string().valid('low', 'normal', 'high', 'urgent'),
      response: Joi.string().allow(''),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id);
    const result = await query(`UPDATE engineer_instructions SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, params);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Status transitions: acknowledge → implement → close
router.post('/:projectId/instructions/:id/:action(acknowledge|implement|close)', authenticate, authorize(), async (req, res) => {
  try {
    const actionToStatus = { acknowledge: 'acknowledged', implement: 'implemented', close: 'closed' };
    const newStatus = actionToStatus[req.params.action];

    const existing = await query('SELECT * FROM engineer_instructions WHERE id = $1 AND project_id = $2', [req.params.id, req.params.projectId]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Instruction not found' });

    const current = existing.rows[0].status;
    if (!INSTRUCTION_TRANSITIONS[current] || !INSTRUCTION_TRANSITIONS[current].includes(newStatus)) {
      return res.status(400).json({ success: false, error: `Cannot transition from '${current}' to '${newStatus}'` });
    }

    const response = req.body?.response;
    const stampColumn = { acknowledge: 'acknowledged_at', implement: 'implemented_at', close: null }[req.params.action];
    const result = newStatus === 'closed'
      ? await query(
          `UPDATE engineer_instructions SET status = $1, response = COALESCE($2, response),
             closed_by = $3, closed_at = NOW(), updated_at = NOW()
           WHERE id = $4 RETURNING *`,
          [newStatus, response, req.user.id, req.params.id]
        )
      : stampColumn
        ? await query(
            `UPDATE engineer_instructions SET status = $1, response = COALESCE($2, response),
               ${stampColumn} = NOW(), updated_at = NOW()
             WHERE id = $3 RETURNING *`,
            [newStatus, response, req.params.id]
          )
        : await query(
            `UPDATE engineer_instructions SET status = $1, response = COALESCE($2, response), updated_at = NOW()
             WHERE id = $3 RETURNING *`,
            [newStatus, response, req.params.id]
          );

    // Phase 7 wiring: a lifecycle event per transition; the spawned action
    // item is completed when the instruction is acknowledged/implemented so
    // it drops off the assignee's "My Actions" queue.
    await fireEvent({
      eventType: `instruction.${req.params.action}d`.replace('implementedd', 'implemented'),
      entityType: 'engineer_instruction',
      entityId: parseInt(req.params.id, 10),
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      payload: { project_id: parseInt(req.params.projectId, 10), from: current, to: newStatus },
    });

    try {
      const instruction = existing.rows[0];
      if (instruction.action_item_id != null) {
        if (newStatus === 'acknowledged') {
          await actionService.acknowledge(instruction.action_item_id, req.user.id).catch(() => {});
        } else {
          await actionService.complete(instruction.action_item_id, req.user.id).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[SITE] instruction action-item sync failed:', e.message);
    }

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'site', description: `Instruction ${existing.rows[0].instruction_number} → ${newStatus}`, entityId: req.params.id, entityType: 'engineer_instruction' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ SITE VISITS ============

router.get('/:projectId/site-visits', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query(
      `SELECT sv.*, u.name as logged_by_name FROM site_visits sv
       LEFT JOIN users u ON sv.logged_by = u.id
       WHERE sv.project_id = $1 ORDER BY sv.visit_date DESC`,
      [req.params.projectId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/:projectId/site-visits', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      visit_date: Joi.date().iso().required(),
      visitor_name: Joi.string().required(),
      visitor_role: Joi.string().allow('').optional(),
      visitor_organization_id: Joi.number().integer().optional().allow(null),
      visitor_user_id: Joi.number().integer().optional().allow(null),
      visit_type: Joi.string().default('inspection'),
      attendees: Joi.array().items(Joi.object().unknown(true)).default([]),
      purpose: Joi.string().allow('').optional(),
      inspected_activities: Joi.array().items(Joi.object().unknown(true)).default([]),
      referenced_document_ids: Joi.array().items(Joi.number().integer()).default([]),
      notes: Joi.string().allow('').optional(),
      photos: Joi.array().items(Joi.object().unknown(true)).default([]),
      action_items: Joi.array().items(Joi.object({ text: Joi.string().required(), done: Joi.boolean().default(false) })).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const result = await query(
      `INSERT INTO site_visits (project_id, visit_date, visitor_name, visitor_role, visitor_organization_id, visitor_user_id, visit_type, attendees, purpose, inspected_activities, referenced_document_ids, notes, photos, action_items, logged_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11::jsonb,$12,$13::jsonb,$14::jsonb,$15) RETURNING *`,
      [req.params.projectId, value.visit_date, value.visitor_name, value.visitor_role, value.visitor_organization_id || null, value.visitor_user_id || null,
       value.visit_type, JSON.stringify(value.attendees), value.purpose || null, JSON.stringify(value.inspected_activities),
       JSON.stringify(value.referenced_document_ids), value.notes, JSON.stringify(value.photos), JSON.stringify(value.action_items), req.user.id]
    );

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'site', description: `Logged site visit by ${value.visitor_name}`, entityId: result.rows[0].id, entityType: 'site_visit' });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/:projectId/site-visits/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      visit_date: Joi.date().iso(), visitor_name: Joi.string(), visitor_role: Joi.string().allow(''),
      notes: Joi.string().allow(''), photos: Joi.array().items(Joi.object().unknown(true)),
      action_items: Joi.array().items(Joi.object({ text: Joi.string().required(), done: Joi.boolean().default(false) })),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (k === 'photos' || k === 'action_items') { sets.push(`${k} = $${idx++}::jsonb`); params.push(JSON.stringify(v)); }
      else { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id, req.params.projectId);
    const result = await query(`UPDATE site_visits SET ${sets.join(', ')} WHERE id = $${idx++} AND project_id = $${idx} RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Visit not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/:projectId/site-visits/:id', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query('DELETE FROM site_visits WHERE id = $1 AND project_id = $2 RETURNING visitor_name', [req.params.id, req.params.projectId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Visit not found' });
    res.json({ success: true, message: 'Visit deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ PHASE 15 — WORKSPACE + SELF-ASSEMBLING DAILY REPORT ============

const siteEngine = require('../services/siteEngine');

// The site-engineer home screen: today's activities, inspections due, material
// readiness, manpower, equipment, deliveries, safety, open instructions, photos.
router.get('/:projectId/workspace', authenticate, authorize(), async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const data = await siteEngine.getWorkspace(query, parseInt(req.params.projectId, 10), date);
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Generate (or refresh) the day's report from the source records — the
// engineer types only narrative/issues/blockers/next-day plan.
router.post('/:projectId/site-reports/assemble', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      report_date: Joi.date().iso().optional(),
      narrative: Joi.string().allow('').optional(),
      issues_blockers: Joi.string().allow('').optional(),
      next_day_plan: Joi.string().allow('').optional(),
      weather: Joi.string().allow('').optional(),
      temperature: Joi.string().allow('').optional(),
    });
    const { error, value } = schema.validate(req.body || {});
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const { report } = await siteEngine.assembleDailyReport(
      query, parseInt(req.params.projectId, 10),
      value.report_date || new Date().toISOString().slice(0, 10), req.user, value
    );
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'site', description: `Assembled daily site report from source records`, entityId: report.id, entityType: 'site_daily_report' });
    res.status(201).json({ success: true, data: report });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ PHOTOS (shared metadata model) ============

router.post('/:projectId/photos', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      location_id: Joi.number().integer().optional().allow(null),
      linked_entity_type: Joi.string().allow('', null),
      linked_entity_id: Joi.number().integer().optional().allow(null),
      file_name: Joi.string().allow('', null),
      file_url: Joi.string().allow('', null),
      organization_id: Joi.number().integer().optional().allow(null),
      captured_at: Joi.date().iso().optional().allow(null),
      gps_lat: Joi.number().optional().allow(null),
      gps_lng: Joi.number().optional().allow(null),
      caption: Joi.string().allow('', null),
      annotations: Joi.array().default([]),
    });
    const { error, value } = schema.validate(req.body || {});
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const photo = await siteEngine.addPhoto(query, {
      ...value, project_id: parseInt(req.params.projectId, 10), uploader_user_id: req.user.id,
    });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'site', description: 'Captured site photo', entityId: photo.id, entityType: 'photo' });
    res.status(201).json({ success: true, data: photo });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/:projectId/photos', authenticate, authorize(), async (req, res) => {
  try {
    const photos = await siteEngine.getPhotos(query, {
      project_id: parseInt(req.params.projectId, 10),
      linked_entity_type: req.query.linked_entity_type || null,
      linked_entity_id: req.query.linked_entity_id ? parseInt(req.query.linked_entity_id, 10) : null,
    });
    res.json({ success: true, data: photos });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ STICKY NOTES ============

router.get('/:projectId/sticky-notes', authenticate, authorize(), async (req, res) => {
  try {
    const notes = await siteEngine.listStickyNotes(query, {
      project_id: parseInt(req.params.projectId, 10),
      owner_user_id: req.user.id,
    });
    res.json({ success: true, data: notes });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/:projectId/sticky-notes', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      scope: Joi.string().valid(...siteEngine.STICKY_SCOPES).default('personal'),
      location_id: Joi.number().integer().optional().allow(null),
      linked_entity_type: Joi.string().allow('', null),
      linked_entity_id: Joi.number().integer().optional().allow(null),
      text: Joi.string().required(),
      color: Joi.string().default('yellow'),
      reminder_at: Joi.date().iso().optional().allow(null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const note = await siteEngine.createStickyNote(query, {
      ...value, project_id: parseInt(req.params.projectId, 10), owner_user_id: req.user.id,
    });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'site', description: 'Added sticky note', entityId: note.id, entityType: 'sticky_note' });
    res.status(201).json({ success: true, data: note });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// "Convert to action" — the only way a sticky note leaves the workspace: it
// feeds Phase 7's action_items, never formal correspondence.
router.post('/:projectId/sticky-notes/:id/convert-to-action', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      assigned_user_id: Joi.number().integer().optional().allow(null),
      assigned_role: Joi.string().allow('', null),
      priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
      due_date: Joi.date().iso().optional().allow(null),
    });
    const { error, value } = schema.validate(req.body || {});
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const result = await siteEngine.convertStickyToAction(query, parseInt(req.params.id, 10), req.user, value);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'site', description: `Converted sticky note #${req.params.id} to action item`, entityId: req.params.id, entityType: 'sticky_note' });
    res.status(201).json({ success: true, data: result });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

module.exports = router;
