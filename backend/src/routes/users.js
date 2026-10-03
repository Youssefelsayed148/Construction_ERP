const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize, createPreviewToken } = require('../middleware/auth');
const policy = require('../services/policy');
const { logActivity } = require('../utils/activity');

// GET /api/users - list all users (owner/admin)
router.get('/', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, email, role, department, module_permissions, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/users/preview/roles — the roles an admin can preview.
// Registered before GET /:id so "preview" is not captured as an id.
router.get('/preview/roles', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const result = await query('SELECT key, name FROM roles WHERE is_system = true ORDER BY key');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/users/:id
router.get('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, email, role, department, module_permissions, is_active, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/users/:id
// A role change is an access change: in one transaction it updates users.role, replaces the user's grants
// for the old role (user_project_roles, company-wide and per-project) with the new role's, and bumps
// token_version so sessions issued under the old role stop working. Explicit grants of other roles are kept.
// External roles (consultant, client, subcontractor, supplier) are project-bound: they get no company-wide row.
router.put('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const schema = Joi.object({
      name: Joi.string(),
      role: Joi.string().pattern(/^[a-z][a-z0-9_]*$/),
      department: Joi.string().allow(''),
      module_permissions: Joi.array().items(Joi.string()),
      is_active: Joi.boolean()
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    if (Object.keys(value).length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    const outcome = await transaction(async (client) => {
      const q = (text, params) => client.query(text, params);
      const current = (await q('SELECT id, role FROM users WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!current) return { status: 404, error: 'User not found' };

      const roleChanging = value.role !== undefined && value.role !== current.role;
      if (roleChanging) {
        const known = (await q('SELECT 1 FROM roles WHERE key = $1', [value.role])).rows.length > 0;
        if (!known) return { status: 400, error: `Unknown role: ${value.role}` };
        // Only an owner may grant the owner role or change an owner's role.
        if ((value.role === 'owner' || current.role === 'owner') && req.user.role !== 'owner') {
          return { status: 403, error: 'Only an owner can grant or change the owner role' };
        }
      }

      const sets = [];
      const params = [];
      for (const [k, v] of Object.entries(value)) {
        sets.push(`${k} = $${params.length + 1}`);
        params.push(v);
      }
      if (roleChanging) sets.push('token_version = token_version + 1');
      params.push(id);
      const updated = await q(
        `UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING id, name, email, role, department, module_permissions, is_active`,
        params
      );

      if (roleChanging) {
        await q(
          'DELETE FROM user_project_roles WHERE user_id = $1 AND role_id IN (SELECT id FROM roles WHERE key = $2)',
          [id, current.role]
        );
        if (!policy.EXTERNAL_ROLES.has(value.role)) {
          await q(
            `INSERT INTO user_project_roles (user_id, project_id, role_id, granted_by)
             SELECT $1, NULL, r.id, $3 FROM roles r
              WHERE r.key = $2
                AND NOT EXISTS (SELECT 1 FROM user_project_roles x WHERE x.user_id = $1 AND x.project_id IS NULL AND x.role_id = r.id)`,
            [id, value.role, req.user.id]
          );
        }
        await policy.recordAuditEvent({
          entity: 'user', entityId: Number(id), action: 'role_change',
          before: { role: current.role }, after: { role: value.role }, userId: req.user.id,
        }, { query: q });
      }
      return { row: updated.rows[0] };
    });
    if (outcome.error) return res.status(outcome.status).json({ success: false, error: outcome.error });

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'update', module: 'users',
      description: `Updated user ${outcome.row.name}`,
      entityId: id, entityType: 'user'
    });

    res.json({ success: true, data: outcome.row });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/users/:id (soft-deactivate)
router.delete('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const result = await query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING name',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'deactivate', module: 'users',
      description: `Deactivated user ${result.rows[0].name}`,
      entityId: req.params.id, entityType: 'user'
    });

    res.json({ success: true, message: 'User deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/users/preview/:role — "preview as role" demo mode (Phase 4).
// An authorized admin can view any screen as if logged in with a different
// role. The issued preview token is read-only (enforced in authenticate) and
// every preview start writes an audit_events row.
router.post('/preview/:role', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const { role } = req.params;

    const roleRow = await query('SELECT id, name FROM roles WHERE key = $1', [role]);
    if (roleRow.rows.length === 0) {
      return res.status(400).json({ success: false, error: `Unknown role: ${role}` });
    }

    const token = createPreviewToken({ user: req.user, role });
    if (!token) {
      return res.status(500).json({ success: false, error: 'Failed to create preview token' });
    }

    await policy.recordAuditEvent({
      entity: 'user',
      entityId: req.user.id,
      action: 'preview_as_role',
      before: null,
      after: { preview_role: role, role_name: roleRow.rows[0].name },
      userId: req.user.id,
      projectId: null,
    });

    res.json({ success: true, preview_role: role, token, expires_in: '30m' });
  } catch (error) {
    console.error('Error starting preview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
