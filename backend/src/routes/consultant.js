const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { auditedTransaction } = require('../utils/auditedTransaction');
const { typedFail, typedBody } = require('../utils/typedRoute');
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

// Record the consultant's final WIR inspection result through the formal QA/QC
// workflow. Project assignment is checked again inside the audited transaction.
router.post('/wirs/:id/result', authenticate, authorize('consultant'), async (req, res) => {
  const value = typedBody(Joi.object({
    result: Joi.string().valid('approved', 'approved_with_comments', 'rejected', 'reinspect').required(),
    comment: Joi.string().max(4000).allow('', null).optional(),
  }), req, res);
  if (!value) return;
  try {
    const wir = await auditedTransaction(
      (q) => engine.decideConsultantWir(q, parseInt(req.params.id, 10), req.user, value.result, { comment: value.comment }),
      (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'qhse', description: `${result.wir_number} consultant result: ${value.result}`, entityId: result.id, entityType: 'wir' })
    );
    res.json({ success: true, data: wir });
  } catch (error) { return typedFail(res, error, 'CONSULTANT_WIR_RESULT', req); }
});

router.post('/variations/:id/recommendation', authenticate, authorize('consultant'), async (req, res) => {
  const value = typedBody(Joi.object({
    decision: Joi.string().valid('approve', 'reject').required(),
    comment: Joi.string().max(4000).allow('', null).optional(),
  }), req, res);
  if (!value) return;
  try {
    const row = await auditedTransaction(
      (q) => engine.decideConsultantVariation(q, parseInt(req.params.id, 10), req.user, value.decision, value.comment),
      (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'commercial', description: `Variation ${result.id} consultant recommendation: ${value.decision}`, entityId: result.id, entityType: 'variation' })
    );
    res.json({ success: true, data: row });
  } catch (error) { return typedFail(res, error, 'CONSULTANT_VARIATION_RECOMMENDATION', req); }
});

router.post('/payment-certificates/:id/recommendation', authenticate, authorize('consultant'), async (req, res) => {
  const value = typedBody(Joi.object({
    decision: Joi.string().valid('approve', 'reject').required(),
    comment: Joi.string().max(4000).allow('', null).optional(),
  }), req, res);
  if (!value) return;
  try {
    const row = await auditedTransaction(
      (q) => engine.decideConsultantCertificate(q, parseInt(req.params.id, 10), req.user, value.decision, value.comment),
      (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'commercial', description: `Payment certificate ${result.certificate_number} consultant recommendation: ${value.decision}`, entityId: result.id, entityType: 'payment_certificate' })
    );
    res.json({ success: true, data: row });
  } catch (error) { return typedFail(res, error, 'CONSULTANT_CERTIFICATE_RECOMMENDATION', req); }
});

router.post('/instructions/:id/recommendation', authenticate, authorize('consultant'), async (req, res) => {
  const id = Joi.number().integer().positive().validate(Number(req.params.id));
  if (id.error) return typedFail(res, Object.assign(new Error('Invalid engineer instruction id'), { status: 400, error_code: 'invalid_id' }), 'CONSULTANT_INSTRUCTION_RECOMMENDATION', req);
  const value = typedBody(Joi.object({
    decision: Joi.string().valid('approve', 'reject').required(),
    comment: Joi.string().max(4000).allow('', null).optional(),
  }), req, res);
  if (!value) return;
  try {
    const result = await auditedTransaction(
      (q) => engine.recommendEngineerInstruction(q, id.value, req.user, value.decision, value.comment),
      (row) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'site', description: `Engineer instruction ${row.instruction_number} consultant recommendation: ${value.decision}`, entityId: row.instruction_id, entityType: 'engineer_instruction' })
    );
    res.json({ success: true, data: result });
  } catch (error) { return typedFail(res, error, 'CONSULTANT_INSTRUCTION_RECOMMENDATION', req); }
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
      due_date: Joi.string().isoDate().allow(null),
      drawing_reference: Joi.string().trim().max(255).allow('', null),
      drawing_document_id: Joi.number().integer().positive().allow(null),
      before_photos: Joi.array().max(5).items(Joi.object({
        file_name: Joi.string().pattern(/^[a-zA-Z0-9_.-]+$/).required(),
        file_url: Joi.string().max(1000).required(), caption: Joi.string().max(1000).allow('', null),
      })).default([]),
      after_photos: Joi.array().max(5).items(Joi.object({
        file_name: Joi.string().pattern(/^[a-zA-Z0-9_.-]+$/).required(),
        file_url: Joi.string().max(1000).required(), caption: Joi.string().max(1000).allow('', null),
      })).default([]),
      severity: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const observation = await auditedTransaction((q) => engine.createObservation(q, { ...value, user: req.user }), (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'observations', description: `Raised observation ${result.observation_number}`, entityId: result.id, entityType: 'observation' }));
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
    const observation = await auditedTransaction((q) => engine.advanceObservation(q, parseInt(req.params.id, 10), req.user, value.action, value), (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'observations', description: `Observation → ${result.status}`, entityId: result.id, entityType: 'observation' }));
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
    const response = await auditedTransaction(async (q) => {
      await q('SELECT id FROM project_rfis WHERE id = $1 FOR UPDATE', [parseInt(req.params.id, 10)]);
      return engine.recordRfiResponse(q, { ...value, rfi_id: parseInt(req.params.id, 10), user: req.user });
    }, (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'doccontrol', description: `RFI ${value.stage} recorded (rev ${value.revision})`, entityId: result.id, entityType: 'rfi_response' }));
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
    const row = await auditedTransaction(async (q) => {
      await q('SELECT id FROM project_submittals WHERE id = $1 FOR UPDATE', [parseInt(req.params.id, 10)]);
      return engine.recordSubmittalResponse(q, { ...value, submittal_id: parseInt(req.params.id, 10), user: req.user });
    }, (result) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'doccontrol', description: `Submittal ${value.stage} recorded (rev ${value.revision})`, entityId: result.id, entityType: 'submittal_revision' }));
    res.status(201).json({ success: true, data: row });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

module.exports = router;
