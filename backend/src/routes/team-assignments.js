// Phase 5.1 (spec 04) — team assignments. Mounted at /api/team (server.js).
//
// Re-exports the same service surface as the /api/organizations/team endpoints (services/teamService.js):
//   *  POST /            assign a role seat to a project (notify subscriptions activated at assign time),
//   *  GET /?project_id= list the project's team membership with expiry labels,
//   *  DELETE /:id      revoke the assignment (hard-remove of the ASSIGNMENT row; users are never deleted).
//
// Policy module "team": project-scoped ON PURPOSE (see policy.ORGANIZATION_MODULES comment) — a
// project-bound seat with team.create can only assign on its own project, a company-wide row anywhere.
// Both this router and the organizations router drive the same module, actions create (POST), edit (PUT)
// is unused today and delete (DELETE) for revocation.
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const policy = require('../services/policy');
const team = require('../services/teamService');

function fail(res, e) {
  const status = e.status || (e.error_code ? 400 : 500);
  if (status >= 500) console.error('[TEAM]', e);
  return res.status(status).json({
    success: false,
    error: e.message,
    ...(e.error_code ? { error_code: e.error_code, error_params: e.error_params || {} } : {}),
  });
}

router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const rows = await team.listTeamMembers(query, {
      project_id: req.query.project_id || null,
      organization_id: req.query.organization_id || null,
      role_key: req.query.role_key || null,
    });
    res.json({ success: true, data: rows });
  } catch (e) { return fail(res, e); }
});

router.post('/', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo', 'projects_director', 'project_manager', 'construction_manager', 'hr_manager'), async (req, res) => {
    try {
      const schema = Joi.object({
        project_id: Joi.number().integer().required(),
        user_id: Joi.number().integer().required(),
        role_key: Joi.string().required(),
        organization_id: Joi.number().integer().allow(null),
        expires_at: Joi.date().iso().allow(null),
      });
      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error' });
      const created = await team.assignTeamMember(query, { ...value, granted_by: req.user.id });
      await policy.recordAuditEvent({
        entity: 'team_assignment', entityId: created.assignment.id, action: 'create',
        after: { user_id: value.user_id, project_id: value.project_id, role_key: value.role_key, expires_at: value.expires_at || null },
        userId: req.user.id,
      });
      res.status(201).json({ success: true, data: created });
    } catch (e) { return fail(res, e); }
  });

router.delete('/:userProjectRoleId', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo', 'projects_director', 'project_manager', 'construction_manager', 'hr_manager'), async (req, res) => {
    try {
      const removed = await team.removeTeamMember(query, req.params.userProjectRoleId);
      await policy.recordAuditEvent({
        entity: 'team_assignment', entityId: req.params.userProjectRoleId, action: 'delete',
        before: removed.summary, userId: req.user.id,
      });
      res.status(200).json({ success: true, data: removed });
    } catch (e) { return fail(res, e); }
  });

module.exports = router;
