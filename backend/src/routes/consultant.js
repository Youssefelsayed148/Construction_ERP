const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const engine = require('../services/consultantEngine');

// Mounted at /api/consultant — the consultant portal surface.

// The consultant's project scope comes from organization_users +
// project_participants (Phase 3). No assignment → empty list, never an error.
router.get('/projects', authenticate, authorize(), async (req, res) => {
  try {
    const projectIds = await engine.resolveConsultantProjects(query, req.user.id);
    res.json({ success: true, data: projectIds });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Dashboard — every widget renders with an explicit empty label.
router.get('/dashboard', authenticate, authorize(), async (req, res) => {
  try {
    const data = await engine.consultantDashboard(query, req.user, {
      project_id: req.query.project_id ? parseInt(req.query.project_id, 10) : null,
    });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// My Reviews — one inbox, sorted by due date/priority, filterable.
router.get('/reviews', authenticate, authorize(), async (req, res) => {
  try {
    const filters = {};
    if (req.query.project_id) filters.project_id = parseInt(req.query.project_id, 10);
    if (req.query.discipline) filters.discipline = req.query.discipline;
    if (req.query.type) filters.type = req.query.type;
    const rows = await engine.myReviews(query, req.user, filters);
    res.json({ success: true, data: rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Observations.
router.post('/observations', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      title: Joi.string().required(),
      description: Joi.string().allow('').optional(),
      discipline: Joi.string().allow('', null),
      location_id: Joi.number().integer().optional().allow(null),
      severity: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const observation = await transaction((client) => engine.createObservation(
      client.query.bind(client), { ...value, user: req.user }
    ));
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'observations', description: `Raised observation ${observation.observation_number}`, entityId: observation.id, entityType: 'observation' });
    res.status(201).json({ success: true, data: observation });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/observations/:id/comments', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      comment_type: Joi.string().valid('comment', 'rectification', 'rejection', 'verification', 'assignment').default('comment'),
      body: Joi.string().required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const comment = await engine.addObservationComment(query, {
      observation_id: parseInt(req.params.id, 10), user: req.user, ...value,
    });
    res.status(201).json({ success: true, data: comment });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/observations/:id/advance', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      action: Joi.string().valid('acknowledge', 'assign', 'start_rectification',
        'submit_for_verification', 'accept', 'reject', 'close').required(),
      comment: Joi.string().allow('', null),
      note: Joi.string().allow('', null),
      assigned_user_id: Joi.number().integer().optional().allow(null),
      assigned_organization_id: Joi.number().integer().optional().allow(null),
      photos: Joi.array().items(Joi.object({
        file_name: Joi.string().allow('', null),
        file_url: Joi.string().allow('', null),
        caption: Joi.string().allow('', null),
      })).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const observation = await transaction((client) => engine.advanceObservation(
      client.query.bind(client), parseInt(req.params.id, 10), req.user, value.action, value
    ));
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'observations', description: `Observation → ${observation.status}`, entityId: observation.id, entityType: 'observation' });
    res.json({ success: true, data: observation });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// Official consultant RFI response — the audited record.
router.post('/rfis/:id/response', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      stage: Joi.string().valid('coordinator', 'discipline_review', 'official_response').default('coordinator'),
      body: Joi.string().required(),
      attachments: Joi.array().default([]),
      revision: Joi.number().integer().min(1).default(1),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const response = await transaction(async (client) => {
      await client.query('SELECT id FROM project_rfis WHERE id = $1 FOR UPDATE', [parseInt(req.params.id, 10)]);
      return engine.recordRfiResponse(client.query.bind(client), { ...value, rfi_id: parseInt(req.params.id, 10), user: req.user });
    });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'doccontrol', description: `RFI ${value.stage} recorded (rev ${value.revision})`, entityId: response.id, entityType: 'rfi_response' });
    res.status(201).json({ success: true, data: response });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/rfis/:id/close', authenticate, authorize(), async (req, res) => {
  try {
    const row = await transaction(async (client) => {
      await client.query('SELECT id FROM project_rfis WHERE id = $1 FOR UPDATE', [parseInt(req.params.id, 10)]);
      return engine.closeRfi(client.query.bind(client), parseInt(req.params.id, 10), req.user);
    });
    res.json({ success: true, data: row });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// Submittal review with A/B/C/D code.
router.post('/submittals/:id/response', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      stage: Joi.string().valid('internal_technical_review', 'pm', 'consultant_coordinator', 'reviewer', 'response').default('internal_technical_review'),
      response_code: Joi.string().valid('A', 'B', 'C', 'D').optional(),
      comments: Joi.string().allow('', null),
      attachments: Joi.array().default([]),
      revision: Joi.number().integer().min(1).default(1),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const row = await transaction(async (client) => {
      await client.query('SELECT id FROM project_submittals WHERE id = $1 FOR UPDATE', [parseInt(req.params.id, 10)]);
      return engine.recordSubmittalResponse(client.query.bind(client), { ...value, submittal_id: parseInt(req.params.id, 10), user: req.user });
    });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'doccontrol', description: `Submittal ${value.stage} recorded (rev ${value.revision})`, entityId: row.id, entityType: 'submittal_revision' });
    res.status(201).json({ success: true, data: row });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

module.exports = router;
