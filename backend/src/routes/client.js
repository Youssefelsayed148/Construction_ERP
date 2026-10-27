const express = require('express');
const Joi = require('joi');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { paginateRows } = require('../utils/pagination');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { auditedTransaction } = require('../utils/auditedTransaction');
const { typedFail, typedBody, routeFail } = require('../utils/typedRoute');
const policy = require('../services/policy');
const engine = require('../services/clientEngine');

// Mounted at /api/client-portal — the client portal surface.
//
// EVERY response passes through stripInternalFields — the server, not the UI,
// owns the no-internal-cost guarantee. Preview-as-client sessions
// (req.preview set by the Phase 4 preview token) are read-only by
// construction: authenticate() rejects non-GET methods.

const strip = engine.stripInternalFields;

router.get('/projects', authenticate, authorize(), async (req, res) => {
  try {
    const projectIds = await engine.resolveClientProjects(query, req.user.id, {
      previewProjectId: req.preview?.scoped_project_ids?.[0] ?? null,
    });
    res.json({ success: true, data: paginateRows(req, res, projectIds).rows });
  } catch (error) { routeFail(res, error, 'client.GET /projects', req); }
});

// Portfolio view — the landing page when the client has multiple projects.
router.get('/portfolio', authenticate, authorize(), async (req, res) => {
  try {
    const data = await engine.clientPortfolio(query, req.user, {
      preview_project_id: req.preview?.scoped_project_ids?.[0] ?? null,
    });
    res.json({ success: true, data: strip(data) });
  } catch (error) { routeFail(res, error, 'client.GET /portfolio', req); }
});

router.get('/dashboard', authenticate, authorize(), async (req, res) => {
  try {
    // Server-side visibility gate (Phase 4 flags) — recorded for the audit
    // trail, and the portal forces the safest flags regardless.
    const flags = await policy.visibilityFlags(req.user, { query });
    const data = await engine.clientDashboard(query, req.user, {
      project_id: req.query.project_id ? parseInt(req.query.project_id, 10) : null,
      preview_project_id: req.preview?.scoped_project_ids?.[0] ?? null,
    });
    res.json({
      success: true,
      data: {
        ...strip(data),
        visibility: engine.clientVisibilityFlags(req.user, flags),
        preview: req.preview ? { read_only: true, role: req.preview.role } : undefined,
      },
    });
  } catch (error) { routeFail(res, error, 'client.GET /dashboard', req); }
});

router.get('/action-center', authenticate, authorize(), async (req, res) => {
  try {
    const data = await engine.clientActionCenter(query, req.user, {
      project_id: req.query.project_id ? parseInt(req.query.project_id, 10) : null,
      preview_project_id: req.preview?.scoped_project_ids?.[0] ?? null,
    });
    res.json({ success: true, data: strip(data) });
  } catch (error) { routeFail(res, error, 'client.GET /action-center', req); }
});

router.post('/variations/:id/response', authenticate, authorize('client'), async (req, res) => {
  const id = Joi.number().integer().positive().validate(Number(req.params.id));
  if (id.error) return typedFail(res, Object.assign(new Error('Invalid variation id'), { status: 400, error_code: 'invalid_id' }), 'CLIENT_VARIATION_RESPONSE', req);
  const value = typedBody(Joi.object({
    decision: Joi.string().valid('approve', 'reject').required(),
    comment: Joi.string().max(4000).allow('', null).optional(),
  }), req, res);
  if (!value) return;
  try {
    const result = await auditedTransaction(
      (q) => engine.decideClientVariation(q, id.value, req.user, value.decision, value.comment),
      (row) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: value.decision, module: 'client-portal', description: `Client ${value.decision} variation ${row.id}`, entityId: row.id, entityType: 'variation' })
    );
    res.json({ success: true, data: strip(result) });
  } catch (error) { return typedFail(res, error, 'CLIENT_VARIATION_RESPONSE', req); }
});

router.post('/documents/:id/acknowledgement', authenticate, authorize('client'), async (req, res) => {
  const id = Joi.number().integer().positive().validate(Number(req.params.id));
  if (id.error) return typedFail(res, Object.assign(new Error('Invalid document id'), { status: 400, error_code: 'invalid_id' }), 'CLIENT_DOCUMENT_ACKNOWLEDGEMENT', req);
  const value = typedBody(Joi.object({ comment: Joi.string().max(4000).allow('', null).optional() }).default({}), req, res);
  if (!value) return;
  try {
    const result = await auditedTransaction(
      (q) => engine.acknowledgeClientDocument(q, id.value, req.user, value.comment),
      (row) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'client-portal', description: `Client acknowledged document ${row.document_id}`, entityId: row.document_id, entityType: 'project_document' })
    );
    res.json({ success: true, data: strip(result) });
  } catch (error) { return typedFail(res, error, 'CLIENT_DOCUMENT_ACKNOWLEDGEMENT', req); }
});

// Preview-as-Client: authorized internal admins/PMs get a read-only, audited
// preview session. No fake account is created — the acting user's id stays in
// the audit trail.
router.post('/preview', authenticate, authorize('owner', 'admin', 'project_manager'), async (req, res) => {
  try {
    const { createPreviewToken } = require('../middleware/auth');
    const projectId = Number(req.body?.project_id);
    if (!Number.isInteger(projectId) || projectId <= 0) return res.status(400).json({ success: false, error: 'project_id is required' });
    const project = (await query('SELECT id FROM projects WHERE id = $1', [projectId])).rows[0];
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const token = createPreviewToken({ user: req.user, role: 'client', scopedProjectIds: [projectId] });
    await transaction(async (client) => {
      const q = client.query.bind(client);
      await policy.recordAuditEvent({
        entity: 'user', entityId: req.user.id, action: 'preview_as_client',
        before: null, after: { preview_role: 'client', project_id: projectId },
        userId: req.user.id,
      }, { query: q });
      await logActivity({
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        action: 'preview_as_client', module: 'client-portal',
        description: 'Started a read-only preview of the client portal',
        entityId: req.user.id, entityType: 'user',
      }, { query: q });
    });
    res.json({ success: true, data: { token, read_only: true, role: 'client' } });
  } catch (error) { routeFail(res, error, 'client.POST /preview', req); }
});

module.exports = router;
