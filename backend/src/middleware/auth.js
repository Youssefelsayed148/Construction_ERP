const { query } = require('../config/database');
const policy = require('../services/policy');
const tokens = require('../services/tokens');

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXTERNAL_PORTAL_PATHS = {
  consultant: '/api/consultant',
  client: '/api/client-portal',
  subcontractor: '/api/portal/subcontractor',
  supplier: '/api/portal/supplier',
};

function externalPortalAllowed(req) {
  const prefix = EXTERNAL_PORTAL_PATHS[req.user?.role];
  if (!prefix) return true;
  const path = String(req.originalUrl || '').split('?')[0];
  if (path === prefix || path.startsWith(prefix + '/')) return true;
  return path === '/api/documents/upload' && req.method === 'POST';
}

const OMIT = Symbol('omit-out-of-scope-record');

// Defense in depth for collection endpoints. Handlers built before scoped
// policy often return mixed-project arrays; prune any object carrying a
// foreign project_id before it reaches a project-scoped caller.
function filterScopedPayload(value, allowedProjectIds) {
  const allowed = allowedProjectIds instanceof Set
    ? allowedProjectIds
    : new Set((allowedProjectIds || []).map(Number));

  function visit(node, key = '') {
    if (Array.isArray(node)) {
      if (key === 'project_ids') return node.filter((id) => allowed.has(Number(id)));
      return node.map((item) => visit(item)).filter((item) => item !== OMIT);
    }
    if (!node || typeof node !== 'object' || Buffer.isBuffer(node)) return node;
    const projectId = node.project_id ?? node.projectId;
    if (projectId != null && !allowed.has(Number(projectId))) return OMIT;
    const output = {};
    for (const [childKey, child] of Object.entries(node)) {
      const filtered = visit(child, childKey);
      if (filtered !== OMIT) output[childKey] = filtered;
    }
    return output;
  }

  const filtered = visit(value);
  return filtered === OMIT ? null : filtered;
}

// Sign a preview-as-role token. The token carries the ACTING user's id plus
// the role being previewed; authenticate() swaps req.user.role to the
// previewed role and forces read-only. Every preview start is audited by the
// endpoint that issues the token (POST /api/users/preview/:role).
const createPreviewToken = ({ user, role, scopedProjectIds = [] }) => tokens.signPreview({ user, role, scopedProjectIds });

const authenticate = async (req, res, next) => {
  // v1 and MCP authenticate the bearer themselves (typed, scoped, revocation-checked) and then
  // run the internal handler chain. Only server code can set this flag; a request header cannot.
  if (req.preAuthenticated === true && req.user) return next();
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    // Only session and preview tokens authenticate the internal API; v1 access and refresh tokens do not.
    const decoded = tokens.verify(token, ['session', 'preview']);

    const result = await query(
      'SELECT id, email, name, role, department, is_active, token_version FROM users WHERE id = $1',
      [decoded.userId]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    if (!user.is_active) {
      return res.status(401).json({ success: false, error: 'Account is disabled' });
    }

    if ((decoded.tv || 0) !== (user.token_version || 0)) {
      return res.status(401).json({ success: false, error: 'Session expired' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
      token_version: user.token_version,
    };
    req.token = token;

    // Preview-as-role demo mode: an authorized admin's read-only session
    // viewed as another role. The acting user stays in req.user.id (audit
    // attribution), the effective role is the previewed one.
    if (decoded.kind === 'preview' && decoded.previewRole) {
      if (!READ_ONLY_METHODS.has(req.method)) {
        return res.status(403).json({ success: false, error: 'Preview mode is read-only' });
      }
      req.user.role = decoded.previewRole;
      req.preview = {
        actor_id: user.id,
        actor_email: user.email,
        role: decoded.previewRole,
        read_only: true,
        scoped_project_ids: Array.isArray(decoded.scopedProjectIds) ? decoded.scopedProjectIds : [],
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
//   2. No fallback: a user with NO user_project_roles rows is denied (Phase 1.2).
//      owner/admin are granted via explicit seeded policy grants (('*', '*')) and
//      the coarse role list passed by the call site.
//   3. When a role list is passed, it still acts as a coarse filter on top of
//      the policy decision, so owner|admin-only endpoints stay that way in
//      both paths.
const authorize = (...roles) => {
  const middleware = async function authorizeMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (!externalPortalAllowed(req)) {
      return res.status(403).json({ success: false, error: 'This account can access only its scoped portal' });
    }

    let decision;
    try {
      decision = await policy.evaluateRequest(req);
    } catch (error) {
      // Fail closed on policy evaluation errors.
      return res.status(500).json({ success: false, error: 'Policy evaluation failed' });
    }

    if (!decision.allowed) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    if (!decision.company_wide && decision.project_id == null && decision.scoped_project_ids?.length) {
      const originalJson = res.json.bind(res);
      res.json = (payload) => originalJson(filterScopedPayload(payload, decision.scoped_project_ids));
    }

    next();
  };
  // Exposed for tooling/tests: the coarse role list the call site declared.
  middleware.authorizeRoles = Object.freeze([...roles]);
  return middleware;
};

module.exports = { authenticate, authorize, createPreviewToken, externalPortalAllowed, filterScopedPayload };
