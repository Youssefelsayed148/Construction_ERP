const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
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
router.put('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const schema = Joi.object({
      name: Joi.string(),
      role: Joi.string().valid('admin', 'manager', 'staff', 'accountant', 'engineer', 'site_supervisor'),
      department: Joi.string().allow(''),
      module_permissions: Joi.array().items(Joi.string()),
      is_active: Joi.boolean()
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = [];
    const params = [];
    let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        sets.push(`${k} = $${idx++}`);
        params.push(v);
      }
    }
    if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    params.push(id);
    const result = await query(
      `UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING id, name, email, role, department, module_permissions, is_active`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'update', module: 'users',
      description: `Updated user ${result.rows[0].name}`,
      entityId: id, entityType: 'user'
    });

    res.json({ success: true, data: result.rows[0] });
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
