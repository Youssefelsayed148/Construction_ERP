const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize, authorizeSelfSession } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const policy = require('../services/policy');

const tokens = require('../services/tokens');
const authLockout = require('../services/authLockout');
const BCRYPT_COST = 12;
const DUMMY_PASSWORD_HASH = '$2a$12$vVbihfowu2ItcbFLrqLSd.OH5/yWImcOd9nLI55t8vfpebkc0SU6y';

// POST /api/auth/register
router.post('/register', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const schema = Joi.object({
      name: Joi.string().required(),
      email: Joi.string().email().required(),
      password: Joi.string().min(12).required(),
      // Any key in `roles`; new accounts default to the least-privilege role, not a working role.
      role: Joi.string().pattern(/^[a-z][a-z0-9_]*$/).default('viewer'),
      department: Joi.string().optional(),
      module_permissions: Joi.array().items(Joi.string()).optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const existing = await query('SELECT id FROM users WHERE email = $1', [value.email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }
    const knownRole = await query('SELECT 1 FROM roles WHERE key = $1', [value.role]);
    if (knownRole.rows.length === 0) return res.status(400).json({ success: false, error: `Unknown role: ${value.role}` });
    if (value.role === 'owner' && req.user.role !== 'owner') {
      return res.status(403).json({ success: false, error: 'Only an owner can create an owner' });
    }

    const hashedPassword = await bcrypt.hash(value.password, BCRYPT_COST);

    // The user and their company-wide role assignment are created together: a user without a
    // user_project_roles row has no access at all (Phase 1.2).
    const result = await transaction(async (client) => {
      const created = await client.query(
        `INSERT INTO users (name, email, password, role, department, module_permissions, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id, name, email, role, department, module_permissions, is_active, created_at`,
        [value.name, value.email, hashedPassword, value.role, value.department || null, value.module_permissions || []]
      );
      // Project-bound external roles get no company-wide row; they are assigned per project.
      if (!policy.EXTERNAL_ROLES.has(value.role)) {
        await client.query(
          `INSERT INTO user_project_roles (user_id, project_id, role_id, granted_by)
           SELECT $1, NULL, id, $3 FROM roles WHERE key = $2`,
          [created.rows[0].id, value.role, req.user.id]
        );
      }
      await logActivity({
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        action: 'create', module: 'users',
        description: `Created user ${value.name} (${value.email}) with role ${value.role}`,
        entityId: created.rows[0].id, entityType: 'user'
      }, { query: client.query.bind(client) });
      return created;
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const result = await query(
      'SELECT id, name, email, password, role, department, module_permissions, is_active, token_version FROM users WHERE email = $1',
      [value.email]
    );
    const user = result.rows[0];
    const emailKey = value.email.trim().toLowerCase();
    const attempt = await authLockout.getAttempt(query, emailKey);
    // Always pay for one bcrypt comparison, including unknown and disabled accounts,
    // then return one generic denial to avoid identity/account-state disclosure.
    const validPassword = await bcrypt.compare(value.password, user && user.is_active && user.password ? user.password : DUMMY_PASSWORD_HASH);
    if (!user || !user.is_active || !validPassword || authLockout.isLocked(attempt)) {
      if (!authLockout.isLocked(attempt)) await authLockout.recordFailure(query, emailKey);
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const upgradedHash = bcrypt.getRounds(user.password) < BCRYPT_COST
      ? await bcrypt.hash(value.password, BCRYPT_COST)
      : null;
    const token = tokens.signSession({ userId: user.id, tokenVersion: user.token_version });
    await transaction(async (client) => {
      const q = client.query.bind(client);
      await authLockout.clearAttempt(q, emailKey);
      if (upgradedHash) await q('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [upgradedHash, user.id]);
      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: 'login', module: 'auth',
        description: `User ${user.name} logged in`
      }, { query: q });
    });

    const access = await policy.listGrants(user);
    const policyModules = [...new Set(access.grants.map((grant) => grant.perm_module).filter(Boolean))];
    const policyPermissions = [...new Map(access.grants
      .filter((grant) => grant.perm_module && grant.perm_action)
      .map((grant) => [`${grant.perm_module}:${grant.perm_action}:${grant.project_id ?? '*'}`, {
        module: grant.perm_module, action: grant.perm_action, project_id: grant.project_id,
      }])).values()];

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          module_permissions: user.module_permissions,
          policy_modules: policyModules,
          policy_permissions: policyPermissions,
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, authorize(), async (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      department: req.user.department
    }
  });
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, authorize(), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 12) {
      return res.status(400).json({ success: false, error: 'Current password and new password (min 12 chars) required' });
    }

    const result = await query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!valid) return res.status(400).json({ success: false, error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, BCRYPT_COST);
    // Bumping token_version signs the user out everywhere; the response carries a fresh session token.
    const updated = await transaction(async (client) => {
      const q = client.query.bind(client);
      const changed = await q(
        'UPDATE users SET password = $1, token_version = token_version + 1, updated_at = NOW() WHERE id = $2 RETURNING token_version',
        [hashed, req.user.id]
      );
      await logActivity({
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        action: 'password_change', module: 'auth', description: `User ${req.user.name} changed their password`,
      }, { query: q });
      return changed;
    });

    res.json({
      success: true, message: 'Password changed successfully',
      data: { token: tokens.signSession({ userId: req.user.id, tokenVersion: updated.rows[0].token_version }) },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/auth/logout-all — revoke every session and delegated token issued to this user.
router.post('/logout-all', authenticate, authorizeSelfSession(), async (req, res) => {
  try {
    await transaction(async (client) => {
      const q = client.query.bind(client);
      await q('UPDATE users SET token_version = token_version + 1, updated_at = NOW() WHERE id = $1', [req.user.id]);
      await logActivity({
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        action: 'logout_all', module: 'auth', description: `User ${req.user.name} revoked all sessions`,
      }, { query: q });
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
