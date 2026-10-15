require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { securityHeaders, requestId, sanitizeServerError, validateRuntimeConfig, validateCorsOrigins, parseTrustProxy } = require('./src/middleware/security');
const { createPostgresRateLimit } = require('./src/middleware/postgresRateLimit');
const logger = require('./src/utils/logger');
const { healthCheck } = require('./src/config/database');
if (process.env.R4_BASELINE_ID) {
  const { monitorEventLoopDelay } = require('perf_hooks');
  const eventLoop = monitorEventLoopDelay({ resolution: 10 });
  eventLoop.enable();
  const eventLoopReporter = setInterval(() => {
    logger.info(`R4_BASELINE_EVENT_LOOP id=${process.env.R4_BASELINE_ID} p95_ms=${(eventLoop.percentile(95) / 1e6).toFixed(2)} max_ms=${(eventLoop.max / 1e6).toFixed(2)}`);
    eventLoop.reset();
  }, 100);
  eventLoopReporter.unref();
}

validateRuntimeConfig();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:3000';
// Phase 26: v1 also serves non-browser API clients; extra origins (sandbox UI,
// partner portals) come in via a comma-separated env list.
const EXTRA_ORIGINS = (process.env.CORS_EXTRA_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = validateCorsOrigins(FRONTEND_ORIGIN, EXTRA_ORIGINS,
  process.env.NODE_ENV === 'production', process.env.CORS_ALLOW_HTTP_LOCAL === 'true');
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(securityHeaders);
app.use(requestId);
app.use(sanitizeServerError((message, detail) => logger.error(message, { detail })));
app.use(createPostgresRateLimit({
  scope: 'auth',
  windowMs: 15 * 60 * 1000,
  limit: parseInt(process.env.AUTH_RATE_LIMIT_PER_15_MIN || '20', 10),
  applies: (req) => req.path === '/api/auth/login' || req.path === '/api/v1/oauth/token',
  key: (req) => `${req.ip || 'unknown'}:${req.path}`,
}));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.FORM_BODY_LIMIT || '1mb' }));
app.use('/uploads', require('./src/routes/media'));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

app.get('/api/health', async (req, res) => {
  const database = await healthCheck();
  res.status(database.status === 'healthy' ? 200 : 503).json({
    name: 'Construction ERP',
    version: '1.0.0',
    status: database.status === 'healthy' ? 'ready' : 'degraded',
    database,
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/approvals', require('./src/routes/approvals'));
app.use('/api/approval-limits', require('./src/routes/approvalLimits'));
app.use('/api/activity', require('./src/routes/activity'));
app.use('/api/dashboard', require('./src/routes/dashboard'));
app.use('/api/items', require('./src/routes/items'));
app.use('/api/suppliers', require('./src/routes/suppliers'));
app.use('/api/clients', require('./src/routes/clients'));
app.use('/api/legal', require('./src/routes/legal'));
app.use('/api/expenses', require('./src/routes/expenses'));
app.use('/api/invoices', require('./src/routes/invoices'));
app.use('/api/payments', require('./src/routes/payments'));
app.use('/api/finance', require('./src/routes/finance'));
app.use('/api/assets', require('./src/routes/assets'));
app.use('/api/maintenance', require('./src/routes/maintenance'));
app.use('/api/hr', require('./src/routes/hr'));
app.use('/api/payroll', require('./src/routes/payroll'));
app.use('/api/projects', require('./src/routes/projects'));
app.use('/api/warehouses', require('./src/routes/warehouses'));
app.use('/api/inventory', require('./src/routes/inventory'));
app.use('/api/boq', require('./src/routes/boq'));
app.use('/api/work-orders', require('./src/routes/workorders'));
app.use('/api/subcontractors', require('./src/routes/subcontractors'));
app.use('/api/costing', require('./src/routes/costing'));
app.use('/api/documents', require('./src/routes/documents'));
app.use('/api/projects', require('./src/routes/site'));
app.use('/api/projects', require('./src/routes/project-setup'));
app.use('/api/qhse', require('./src/routes/qhse'));
app.use('/api/hse', require('./src/routes/hse'));
app.use('/api/schedule', require('./src/routes/schedule'));
app.use('/api/reports', require('./src/routes/reports'));
app.use('/api/handover', require('./src/routes/handover'));
app.use('/api/docs', require('./src/routes/doccontrol'));
app.use('/api/sales', require('./src/routes/units'));
app.use('/api/actions', require('./src/routes/actions'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/locations', require('./src/routes/locations'));
app.use('/api/quantities', require('./src/routes/quantities'));
app.use('/api/materials', require('./src/routes/materials'));
app.use('/api/procurement', require('./src/routes/procurement'));
app.use('/api/commercial', require('./src/routes/commercial'));
app.use('/api/finance-ledger', require('./src/routes/financeLedger'));
app.use('/api/consultant', require('./src/routes/consultant'));
app.use('/api/client-portal', require('./src/routes/client'));
app.use('/api/portal', require('./src/routes/portal'));
// Phase 5.1 (spec 03, 04): organization & RBAC surface (departments, job positions, delegations,
// qualifications, bank accounts, performance scores, organizations CRUD and team assignments).
// The write paths run through services/orgService.js / delegationService.js / teamService.js and are
// judged by the policy as modules organizations/delegations/team (see services/policy.js).
app.use('/api/organizations', require('./src/routes/organizations'));
app.use('/api/delegations', require('./src/routes/delegations'));
app.use('/api/team', require('./src/routes/team-assignments'));

// Phase 26 — versioned external API: /api/v1
app.use('/api/v1', require('./src/routes/v1').buildV1Router());

// Phase 27 — MCP server (authenticates itself; same bearer tokens as v1)
app.use('/api/mcp', require('./src/routes/mcp'));

// Phase 27 — admin Agent Activity surface
app.use('/api/agent', require('./src/routes/agents'));

app.use('/api', (req, res) => {
  res.status(404).json({
    success: false, error: 'API route not found',
    error_code: 'api_route_not_found', error_key: 'errors.apiRouteNotFound', error_params: {},
    request_id: req.requestId,
  });
});

app.use((err, req, res, next) => {
  const requestedStatus = Number(err.status || err.statusCode);
  const status = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599
    ? requestedStatus : 500;
  const errorCode = err.error_code
    || (typeof err.code === 'string' && /^[a-z][a-z0-9_]*$/i.test(err.code) ? err.code : null)
    || ({ 400: 'validation_error', 401: 'unauthenticated', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 429: 'rate_limited' }[status])
    || 'internal_error';
  if (status >= 500) logger.error(err.stack);
  else logger.warn(`${status} ${errorCode}: ${err.message || 'Request failed'}`);
  res.status(status).json({
    success: false,
    error: status >= 500 ? 'Internal server error' : (err.message || 'Request failed'),
    error_code: errorCode,
    ...(err.error_params ? { error_params: err.error_params } : {}),
    request_id: req.requestId,
  });
});

const PORT = process.env.PORT || 5000;
function startBackgroundServices() {
  // The routed event consumers (notifications, action items, material recompute, cost postings) are
  // delivered from the transactional outbox; unrouted events reach the bus through the dispatcher, so
  // the webhook subscriber sees the same events it always did, but post-commit and never inside a
  // state-changing transaction.
  require('./src/services/outboxDispatcher').initOutboxDispatcher();
  require('./src/services/escalationScheduler').initEscalationScheduler();
  require('./src/services/replenishment').initReplenishmentScheduler();
  require('./src/services/financeEngine').initReceivableReminderScheduler();
  require('./src/services/hseEngine').initPermitExpiryScheduler();
  require('./src/services/webhookService').initWebhookDeliveryScheduler();
  require('./src/routes/reports').initScheduledReportScheduler();
}

function startServer() {
  startBackgroundServices();
  return app.listen(PORT, () => {
    logger.info(`Construction ERP Server running on port ${PORT}`);
    logger.info(`Database: ${process.env.DB_NAME || 'construction_erp'}`);
  });
}

if (require.main === module) startServer();

module.exports = { app, startServer, startBackgroundServices };
