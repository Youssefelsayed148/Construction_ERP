// Phase 5.1 (spec 04) — team assignment inheritance, the six points outside the wizard:
//   1. the assignment row itself (user_project_roles, which drives every policy decision),
//   2. the role's own grants apply automatically (policy USER_POLICY_SQL joins roles → role_permissions →
//      permissions; nothing is copied per user),
//   3. notification subscriptions are activated at assign time (notification_preferences rows for the
//      project's approval/action events),
//   4. an optional expires_at honors expiry (policy ignores expired rows),
//   5. organization_id records which subcontractor/supplier the seat belongs to,
//   6. revocation removes the row (hard delete of the ASSIGNMENT — never the user) and is audited.
'use strict';

class TeamValidationError extends Error {
  constructor(message, code, params = {}) { super(message); this.status = 400; this.error_code = code; this.error_params = params; }
}
class TeamNotFoundError extends Error {
  constructor(message, code, params = {}) { super(message); this.status = 404; this.error_code = code; this.error_params = params; }
}
class TeamConflictError extends Error {
  constructor(message, code, params = {}) { super(message); this.status = 409; this.error_code = code; this.error_params = params; }
}

function toNum(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// The project event types the assigned member is told about. Real routes of the dispatcher
// (services/eventDispatcher.js): approval.requested, action.overdue; a plain member is subscribed
// in-app only, matching notificationService.resolveChannels' default.
const MEMBER_SUBSCRIPTIONS = ['approval.requested', 'action.overdue'];

// Grant access: creates the assignment row + the subscriptions; the caller (route) audits and checks
// that the acting user may do so (policy module "team", action "create").
async function assignTeamMember(q, {
  project_id, user_id, role_key, organization_id = null, expires_at = null, granted_by = null,
}) {
  if (toNum(project_id) == null) throw new TeamValidationError('project_id is required', 'team_project_required');
  if (toNum(user_id) == null) throw new TeamValidationError('user_id is required', 'team_user_required');
  if (!role_key) throw new TeamValidationError('role_key is required', 'team_role_required');

  const project = (await q('SELECT id, name FROM projects WHERE id = $1', [toNum(project_id)])).rows[0];
  if (!project) throw new TeamNotFoundError(`Project #${project_id} not found`, 'project_not_found', { project_id: toNum(project_id) });
  const user = (await q('SELECT id, name, is_active FROM users WHERE id = $1', [toNum(user_id)])).rows[0];
  if (!user) throw new TeamNotFoundError(`User #${user_id} not found`, 'user_not_found', { user_id: toNum(user_id) });
  if (!user.is_active) throw new TeamValidationError(`User #${user_id} is deactivated`, 'user_deactivated', { user_id: toNum(user_id) });
  const role = (await q('SELECT id, key, name FROM roles WHERE key = $1', [role_key])).rows[0];
  if (!role) throw new TeamNotFoundError(`Role "${role_key}" not found`, 'role_not_found', { role_key });
  if (organization_id != null) {
    const org = (await q('SELECT id FROM organizations WHERE id = $1', [toNum(organization_id)])).rows[0];
    if (!org) throw new TeamNotFoundError(`Organization #${organization_id} not found`, 'organization_not_found', { organization_id: toNum(organization_id) });
  }
  const existing = (await q(
    'SELECT id FROM user_project_roles WHERE user_id = $1 AND project_id = $2 AND role_id = $3',
    [toNum(user_id), toNum(project_id), role.id]
  )).rows[0];
  if (existing) {
    throw new TeamConflictError(`User #${user_id} already holds "${role_key}" on project #${project_id} (assignment #${existing.id})`,
      'team_assignment_exists', { assignment_id: existing.id, user_id: toNum(user_id), role_key });
  }
  const r = await q(
    `INSERT INTO user_project_roles (user_id, project_id, role_id, organization_id, expires_at, granted_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [toNum(user_id), toNum(project_id), role.id, organization_id == null ? null : toNum(organization_id), expires_at || null, toNum(granted_by) ?? null]
  );
  const assignment = r.rows[0];
  for (const eventType of MEMBER_SUBSCRIPTIONS) {
    const pref = (await q(
      'SELECT id FROM notification_preferences WHERE user_id = $1 AND event_type = $2 AND channel = $3',
      [toNum(user_id), eventType, 'in_app']
    )).rows[0];
    if (!pref) {
      await q('INSERT INTO notification_preferences (user_id, event_type, channel, enabled) VALUES ($1, $2, $3, true)',
        [toNum(user_id), eventType, 'in_app']);
    }
  }
  // Activate the user if a seat was granted to a deactivated account is NOT done: assignment expiry
  // and reactivation stay a users-route concern (5.1 does not silently reactivate deactivations).
  return { assignment, role, user, subscriptions: MEMBER_SUBSCRIPTIONS };
}

// Revoke (point 6): hard-remove the ASSIGNMENT row (the user row is never touched) and audit.
async function removeTeamMember(q, userProjectRoleId) {
  const existing = (await q(
    `SELECT upr.*, r.key AS role_key, u.name AS user_name, p.name AS project_name
       FROM user_project_roles upr
       JOIN roles r ON r.id = upr.role_id
       JOIN users u ON u.id = upr.user_id
       LEFT JOIN projects p ON p.id = upr.project_id
      WHERE upr.id = $1`, [toNum(userProjectRoleId)]
  )).rows[0];
  if (!existing) {
    throw new TeamNotFoundError(`Team assignment #${userProjectRoleId} not found`, 'team_assignment_not_found', { assignment_id: toNum(userProjectRoleId) });
  }
  await q('DELETE FROM user_project_roles WHERE id = $1', [toNum(userProjectRoleId)]);
  return {
    removed: existing,
    // Keep the audit payload compact + bilingual neutral (the removed row is carried whole).
    summary: { role_key: existing.role_key, user_id: existing.user_id, project_id: existing.project_id },
  };
}

// Listing a project's team, optionally scoped "within its window" (expired seats labelled).
async function listTeamMembers(q, { project_id = null, organization_id = null, role_key = null } = {}) {
  const params = [];
  const conds = [];
  if (project_id != null) conds.push(`upr.project_id = $${params.push(toNum(project_id))}`);
  if (organization_id != null) conds.push(`upr.organization_id = $${params.push(toNum(organization_id))}`);
  if (role_key != null) conds.push(`r.key = $${params.push(role_key)}`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const r = await q(
    `SELECT upr.id, upr.user_id, upr.project_id, upr.organization_id, upr.granted_at,
            upr.expires_at, upr.expires_at <= CURRENT_DATE AS expired,
            r.key AS role_key, r.name AS role_name, re.name_en AS organization_name_en,
            u.name AS user_name, u.email AS user_email, u.role AS legacy_role
       FROM user_project_roles upr
       JOIN roles r ON r.id = upr.role_id
       JOIN users u ON u.id = upr.user_id
       LEFT JOIN organizations re ON re.id = upr.organization_id
       ${where} ORDER BY upr.id`, params);
  return r.rows;
}

module.exports = {
  MEMBER_SUBSCRIPTIONS,
  TeamValidationError,
  TeamNotFoundError,
  TeamConflictError,
  assignTeamMember,
  removeTeamMember,
  listTeamMembers,
};
