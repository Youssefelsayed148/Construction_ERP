const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
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
    const projectIds = await engine.resolveClientProjects(query, req.user.id);
    res.json({ success: true, data: projectIds });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Portfolio view — the landing page when the client has multiple projects.
router.get('/portfolio', authenticate, authorize(), async (req, res) => {
  try {
    const data = await engine.clientPortfolio(query, req.user);
    res.json({ success: true, data: strip(data) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/dashboard', authenticate, authorize(), async (req, res) => {
  try {
    // Server-side visibility gate (Phase 4 flags) — recorded for the audit
    // trail, and the portal forces the safest flags regardless.
    const flags = await policy.visibilityFlags(req.user, { query });
    const data = await engine.clientDashboard(query, req.user, {
      project_id: req.query.project_id ? parseInt(req.query.project_id, 10) : null,
    });
    res.json({
      success: true,
      data: {
        ...strip(data),
        visibility: engine.clientVisibilityFlags(req.user, flags),
        preview: req.preview ? { read_only: true, role: req.preview.role } : undefined,
      },
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/action-center', authenticate, authorize(), async (req, res) => {
  try {
    const data = await engine.clientActionCenter(query, req.user, {
      project_id: req.query.project_id ? parseInt(req.query.project_id, 10) : null,
    });
    res.json({ success: true, data: strip(data) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Preview-as-Client: authorized internal admins/PMs get a read-only, audited
// preview session. No fake account is created — the acting user's id stays in
// the audit trail.
router.post('/preview', authenticate, authorize('owner', 'admin', 'project_manager'), async (req, res) => {
  try {
    const { createPreviewToken } = require('../middleware/auth');
    const token = createPreviewToken({ user: req.user, role: 'client' });
    await policy.recordAuditEvent({
      entity: 'user', entityId: req.user.id, action: 'preview_as_client',
      before: null, after: { preview_role: 'client', project_id: req.body?.project_id ?? null },
      userId: req.user.id,
    }, { query });
    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'preview_as_client', module: 'client-portal',
      description: 'Started a read-only preview of the client portal',
      entityId: req.user.id, entityType: 'user',
    });
    res.json({ success: true, data: { token, read_only: true, role: 'client' } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
