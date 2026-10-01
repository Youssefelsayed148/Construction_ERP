const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const policy = require('../services/policy');

const SECRET = process.env.JWT_SECRET;

// POST /api/auth/register
router.post('/register', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const schema = Joi.object({
      name: Joi.string().required(),
      email: Joi.string().email().required(),
      password: Joi.string().min(12).required(),
      role: Joi.string().valid('admin', 'manager', 'staff', 'accountant', 'engineer', 'site_supervisor').default('staff'),
      department: Joi.string().optional(),
      module_permissions: Joi.array().items(Joi.string()).optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const existing = await query('SELECT id FROM users WHERE email = $1', [value.email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(value.password, 10);

    const result = await query(
      `INSERT INTO users (name, email, password, role, department, module_permissions, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id, name, email, role, department, module_permissions, is_active, created_at`,
      [value.name, value.email, hashedPassword, value.role, value.department || null, value.module_permissions || []]
    );

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'create', module: 'users',
      description: `Created user ${value.name} (${value.email}) with role ${value.role}`,
      entityId: result.rows[0].id, entityType: 'user'
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
      'SELECT id, name, email, password, role, department, module_permissions, is_active FROM users WHERE email = $1',
      [value.email]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return res.status(401).json({ success: false, error: 'Account is disabled' });
    }

    const validPassword = await bcrypt.compare(value.password, user.password);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id }, SECRET, { expiresIn: '7d' });

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: 'login', module: 'auth',
      description: `User ${user.name} logged in`
    });

    const access = await policy.listGrants(user);
    const policyModules = access.source === 'policy'
      ? [...new Set(access.grants.map((grant) => grant.perm_module).filter(Boolean))]
      : (user.module_permissions || []);

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

    const hashed = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hashed, req.user.id]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
