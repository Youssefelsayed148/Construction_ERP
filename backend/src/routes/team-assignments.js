const { authorizedProjectId, authorizeProjectPayload } = require('../services/authorizedProject');
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
const { query, transaction } = require('../config/database');
const { queryPaginated } = require('../utils/pagination');
const { authenticate, authorize } = require('../middleware/auth');
const policy = require('../services/policy');
const team = require('../services/teamService');

function fail(res, e) {
  const status = e.status || (e.error_code ? 400 : 500);
  if (status >= 500) console.error('[TEAM]', e);
  // Phase 1 security closeout: a typed (error_code) error's message is deliberate and safe to
  // show; an untyped 500 is unexpected, so the client gets a generic message, never e.message.
  return res.status(status).json({
    success: false,
    error: status >= 500 ? 'The request could not be completed' : e.message,
    ...(e.error_code ? { error_code: e.error_code, error_params: e.error_params || {} }
      : status >= 500 ? { error_code: 'internal_error', error_params: {} } : {}),
  });
}

router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const listQuery = (sql, params) => queryPaginated(req, res, query, { sql, params, orderBy: [{ column: 'id' }] });
    const rows = await team.listTeamMembers(listQuery, {
      project_ids: req.accessScope.companyWide ? null : req.accessScope.projectIds,
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
    authorizeProjectPayload(req, value);
      const created = await transaction(async (client) => {
        const q = client.query.bind(client);
        const result = await team.assignTeamMember(q, { ...value, granted_by: req.user.id });
        await policy.recordAuditEvent({
          entity: 'team_assignment', entityId: result.assignment.id, action: 'create',
          after: { user_id: value.user_id, project_id: authorizedProjectId(req, value), role_key: value.role_key, expires_at: value.expires_at || null },
          userId: req.user.id,
        }, { query: q });
        return result;
      });
      res.status(201).json({ success: true, data: created });
    } catch (e) { return fail(res, e); }
  });

router.delete('/:userProjectRoleId', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo', 'projects_director', 'project_manager', 'construction_manager', 'hr_manager'), async (req, res) => {
    try {
      const removed = await transaction(async (client) => {
        const q = client.query.bind(client);
        const result = await team.removeTeamMember(q, req.params.userProjectRoleId);
        await policy.recordAuditEvent({
          entity: 'team_assignment', entityId: req.params.userProjectRoleId, action: 'delete',
          before: result.summary, userId: req.user.id,
        }, { query: q });
        return result;
      });
      res.status(200).json({ success: true, data: removed });
    } catch (e) { return fail(res, e); }
  });

module.exports = router;
