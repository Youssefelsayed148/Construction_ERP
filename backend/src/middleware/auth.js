const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const policy = require('../services/policy');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET environment variable is required');

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Sign a preview-as-role token. The token carries the ACTING user's id plus
// the role being previewed; authenticate() swaps req.user.role to the
// previewed role and forces read-only. Every preview start is audited by the
// endpoint that issues the token (POST /api/users/preview/:role).
const createPreviewToken = ({ user, role, expiresIn = '30m' }) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      preview: true,
      previewRole: role,
    },
    SECRET,
    { expiresIn }
  );
};

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, SECRET);

    const result = await query(
      'SELECT id, email, name, role, department, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    if (!user.is_active) {
      return res.status(401).json({ success: false, error: 'Account is disabled' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department
    };
    req.token = token;

    // Preview-as-role demo mode: an authorized admin's read-only session
    // viewed as another role. The acting user stays in req.user.id (audit
    // attribution), the effective role is the previewed one.
    if (decoded.preview && decoded.previewRole) {
      if (!READ_ONLY_METHODS.has(req.method)) {
        return res.status(403).json({ success: false, error: 'Preview mode is read-only' });
      }
      req.user.role = decoded.previewRole;
      req.preview = {
        actor_id: user.id,
        actor_email: user.email,
        role: decoded.previewRole,
        read_only: true,
      };
    }

    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// authorize(...roles) — call signature unchanged: every existing call site in
// backend/src/routes/ keeps working untouched.
//
// Internally the flat role check is replaced by the scoped policy engine:
//   1. The policy service (services/policy.js) resolves the user's
//      user_project_roles rows against the request's module (Express mount
//      path), action (HTTP method) and project (path/query params).
//   2. Legacy fallback: only when the user has NO user_project_roles rows yet
//      (migration not complete for that user) is the flat role-list check
//      used, matching pre-Phase-4 behavior exactly. The old hardcoded
//      `role === 'owner' || role === 'admin'` bypass is gone — owner/admin
//      are granted via explicit seeded policy grants (('*', '*')) and the
//      coarse role list passed by the call site.
//   3. When a role list is passed, it still acts as a coarse filter on top of
//      the policy decision, so owner|admin-only endpoints stay that way in
//      both paths.
const authorize = (...roles) => {
  const middleware = async function authorizeMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    let decision;
    try {
      decision = await policy.evaluateRequest(req);
    } catch (error) {
      // Fail closed on policy evaluation errors.
      return res.status(500).json({ success: false, error: 'Policy evaluation failed' });
    }

    if (decision.source === 'legacy') {
      // Migration incomplete for this user — legacy flat check.
      if (roles.length > 0 && !roles.includes(req.user.role)) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      }
      return next();
    }

    if (!decision.allowed) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    next();
  };
  // Exposed for tooling/tests: the coarse role list the call site declared.
  middleware.authorizeRoles = Object.freeze([...roles]);
  return middleware;
};

module.exports = { authenticate, authorize, createPreviewToken };
