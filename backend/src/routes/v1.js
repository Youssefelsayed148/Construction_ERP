// Phase 26 — Versioned external API: /api/v1
//
// Design notes (see also ERP_BUILD_PROMPTS.html, Prompt 26):
//
// 1. PARITY OVER REIMPLEMENTATION. Instead of duplicating business logic into
//    parallel v1 handlers, each v1 operation that exists internally is the
//    internal route handler chain REMOUNTED verbatim (authenticate →
//    authorize → handler). Before invoking it, req.baseUrl is pointed at the
//    internal mount so services/policy.moduleFromRequest resolves the same
//    module it would resolve for the internal call — the v1 endpoint then
//    enforces the exact same permission result as the equivalent UI/internal
//    call for the same user, by construction. Phases 9–25 already delegate
//    their core logic to backend/src/services/* engines; the legacy modules
//    (users, invoices, payments, clients) keep working untouched and are
//    exposed through the same remount, so no behavior can drift between
//    internal and external callers.
//
// 2. v1-ONLY READ LISTS for resources with no internal list endpoint are thin
//    queries in services/apiResources.js, gated by the same policy modules and
//    project scoping (no cross-project enumeration).
//
// 3. PLATFORM MIDDLEWARE (middleware/v1.js): correlation IDs, rate limiting,
//    OAuth bearer auth (v1 scoped tokens + internal tokens at full parity),
//    scope enforcement, idempotency keys on POST, structured error shape
//    {"error":{"code","message","correlation_id","details"}}, and standard
//    pagination/filter/sort on list responses.

'use strict';

const express = require('express');
const Joi = require('joi');
const { authenticate, authorize } = require('../middleware/auth');
const v1 = require('../middleware/v1');
const oauthService = require('../services/oauthService');
const webhookService = require('../services/webhookService');
const apiResources = require('../services/apiResources');
const assistantService = require('../services/assistantService');
const { healthCheck } = require('../config/database');
const buildOpenApi = require('../utils/openapi');

// Internal router modules, mounted in server.js (see route-inventory comments).
const ROUTERS = {
  projects: { router: require('./projects'), mount: '/api/projects' },
  site: { router: require('./site'), mount: '/api/projects' },
  locations: { router: require('./locations'), mount: '/api/locations' },
  boq: { router: require('./boq'), mount: '/api/boq' },
  quantities: { router: require('./quantities'), mount: '/api/quantities' },
  materials: { router: require('./materials'), mount: '/api/materials' },
  items: { router: require('./items'), mount: '/api/items' },
  warehouses: { router: require('./warehouses'), mount: '/api/warehouses' },
  procurement: { router: require('./procurement'), mount: '/api/procurement' },
  dashboard: { router: require('./dashboard'), mount: '/api/dashboard' },
  commercial: { router: require('./commercial'), mount: '/api/commercial' },
  subcontractors: { router: require('./subcontractors'), mount: '/api/subcontractors' },
  financeLedger: { router: require('./financeLedger'), mount: '/api/finance-ledger' },
  invoices: { router: require('./invoices'), mount: '/api/invoices' },
  payments: { router: require('./payments'), mount: '/api/payments' },
  approvals: { router: require('./approvals'), mount: '/api/approvals' },
  consultant: { router: require('./consultant'), mount: '/api/consultant' },
  doccontrol: { router: require('./doccontrol'), mount: '/api/docs' },
  qhse: { router: require('./qhse'), mount: '/api/qhse' },
  hse: { router: require('./hse'), mount: '/api/hse' },
  schedule: { router: require('./schedule'), mount: '/api/schedule' },
  actions: { router: require('./actions'), mount: '/api/actions' },
  notifications: { router: require('./notifications'), mount: '/api/notifications' },
  reports: { router: require('./reports'), mount: '/api/reports' },
  users: { router: require('./users'), mount: '/api/users' },
  clients: { router: require('./clients'), mount: '/api/clients' },
};

// Remount one internal handler chain under a v1 path. Guarantees the SAME
// permission decision by pointing req.baseUrl at the internal mount while the
// chain runs. remountFrom is the generic (testable) form.
function remountFrom({ router, internalMount, method, path }) {
  const methodLower = method.toLowerCase();
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[methodLower]
  );
  if (!layer) {
    throw new Error(`v1 remount table: ${method} ${internalMount}${path} not found`);
  }
  const chain = layer.route.stack.map((s) => s.handle);
  return function v1Remounted(req, res, next) {
    const prevBaseUrl = req.baseUrl;
    req.baseUrl = internalMount;
    // The chain is run by hand, so Express never sets req.route: tell the policy which internal route this is.
    req.policyRoute = path;
    let idx = 0;
    // The wrapper resolves when the chain finalized a response (json/send/end)
    // or when it exhausted — direct callers (MCP tool execution) need to await
    // the RESPONSE, not just the dispatch.
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; req.baseUrl = prevBaseUrl; resolve(); } };
      const step = (err) => {
        if (err) { req.baseUrl = prevBaseUrl; if (!settled) { settled = true; resolve(); } return next && next(err); }
        if (idx >= chain.length) { if (!settled) { settled = true; req.baseUrl = prevBaseUrl; resolve(); } return; }
        const handler = chain[idx++];
        try {
          const out = handler(req, res, step);
          Promise.resolve(out).catch((e) => { if (!settled) { settled = true; req.baseUrl = prevBaseUrl; resolve(); } next && next(e); });
        } catch (e) { if (!settled) { settled = true; req.baseUrl = prevBaseUrl; resolve(); } next && next(e); }
      };
      const origJson = res.json.bind(res);
      res.json = (payload) => { const r = origJson(payload); finish(); return r; };
      if (res.send) { const origSend = res.send.bind(res); res.send = (payload) => { const out2 = origSend(payload); finish(); return out2; }; }
      if (res.end) { const origEnd = res.end.bind(res); res.end = (payload) => { const out3 = origEnd(payload); finish(); return out3; }; }
      step();
    });
  };
}

function remount(routerName, method, fromPath) {
  const def = ROUTERS[routerName];
  return remountFrom({ router: def.router, internalMount: def.mount, method, path: fromPath });
}

// ---------------------------------------------------------------------------
// FAMILY MAP — v1 family → remounted internal operations.
// [routerName, method, internalPath, v1Path]
// ---------------------------------------------------------------------------

const FAMILY_MAP = {
  companies: [
    ['clients', 'GET', '/', '/'],
    ['clients', 'POST', '/', '/'],
    ['clients', 'GET', '/:id', '/:id'],
    ['clients', 'PUT', '/:id', '/:id'],
    ['clients', 'DELETE', '/:id', '/:id'],
  ],
  users: [
    ['users', 'GET', '/', '/'],
    ['users', 'GET', '/:id', '/:id'],
    ['users', 'PUT', '/:id', '/:id'],
  ],
  projects: [
    ['projects', 'GET', '/', '/'],
    ['projects', 'POST', '/', '/'],
    ['projects', 'GET', '/portfolio', '/portfolio'],
    ['projects', 'GET', '/:id', '/:id'],
    ['projects', 'PUT', '/:id', '/:id'],
    ['projects', 'POST', '/:id/team', '/:id/participants'],          // team == participants
    ['projects', 'DELETE', '/:projectId/team/:teamId', '/:projectId/participants/:teamId'],
    ['projects', 'POST', '/:id/phases', '/:id/phases'],
    ['projects', 'PUT', '/:projectId/phases/:phaseId', '/:projectId/phases/:phaseId'],
    ['projects', 'DELETE', '/:projectId/phases/:phaseId', '/:projectId/phases/:phaseId'],
    ['projects', 'POST', '/:id/milestones', '/:id/milestones'],
    ['projects', 'PUT', '/:projectId/milestones/:milestoneId', '/:projectId/milestones/:milestoneId'],
    ['projects', 'DELETE', '/:projectId/milestones/:milestoneId', '/:projectId/milestones/:milestoneId'],
    // locations under projects (wbs/location hierarchy)
    ['locations', 'GET', '/project/:projectId', '/:projectId/locations'],
    ['locations', 'POST', '/', '/:projectId/locations'],
  ],
  'work-packages': [
    ['boq', 'GET', '/items/:projectId', '/:projectId/work-packages'],
    ['boq', 'POST', '/items', '/work-packages'],
    ['boq', 'PUT', '/items/:id', '/work-packages/:id'],
    ['boq', 'DELETE', '/items/:id', '/work-packages/:id'],
  ],
  boq: [
    ['boq', 'GET', '/sections/:projectId', '/:projectId/sections'],
    ['boq', 'POST', '/sections', '/sections'],
    ['boq', 'PUT', '/sections/:id', '/sections/:id'],
    ['boq', 'DELETE', '/sections/:id', '/sections/:id'],
    ['boq', 'GET', '/items/:projectId', '/:projectId/items'],
    ['boq', 'GET', '/summary/:projectId', '/:projectId/summary'],
  ],
  quantities: [
    ['quantities', 'GET', '/measurements', '/measurements'],
    ['quantities', 'POST', '/measurements', '/measurements'],
    ['quantities', 'POST', '/measurements/:id/review', '/measurements/:id/review'],
    ['quantities', 'GET', '/allocations/:boqItemId', '/allocations/:boqItemId'],
    ['quantities', 'POST', '/allocations', '/allocations'],
    ['quantities', 'PUT', '/allocations/:id', '/allocations/:id'],
    ['quantities', 'GET', '/progress/project/:projectId', '/progress/project/:projectId'],
    ['quantities', 'GET', '/progress/location/:locationId', '/progress/location/:locationId'],
    ['quantities', 'GET', '/locations/:locationId/dashboard', '/locations/:locationId/dashboard'],
  ],
  materials: [
    ['items', 'GET', '/', '/'],
    ['items', 'GET', '/categories', '/categories'],
    ['items', 'GET', '/:id', '/:id'],
    ['items', 'GET', '/:id/suppliers', '/:id/suppliers'],
    ['items', 'POST', '/', '/'],
    ['items', 'PUT', '/:id', '/:id'],
    ['materials', 'GET', '/recipes', '/recipes'],
    ['materials', 'GET', '/recipes/:id', '/recipes/:id'],
    ['materials', 'POST', '/recipes', '/recipes'],
    ['materials', 'PUT', '/recipes/:id', '/recipes/:id'],
    ['materials', 'GET', '/requirements', '/requirements'],
  ],
  inventory: [
    ['warehouses', 'GET', '/', '/warehouses'],
    ['warehouses', 'GET', '/:id', '/warehouses/:id'],
    ['warehouses', 'GET', '/:id/movements', '/warehouses/:id/movements'],
    ['warehouses', 'POST', '/:id/movements', '/warehouses/:id/movements'],
    ['warehouses', 'POST', '/movements/:id/reverse', '/movements/:id/reverse'],
    ['warehouses', 'GET', '/transfers', '/transfers'],
    ['warehouses', 'POST', '/transfers', '/transfers'],
    ['warehouses', 'PUT', '/transfers/:id/complete', '/transfers/:id/complete'],
    ['warehouses', 'GET', '/reservations', '/reservations'],
    ['warehouses', 'POST', '/reservations', '/reservations'],
    ['warehouses', 'POST', '/reservations/:id/release', '/reservations/:id/release'],
  ],
  'purchase-requisitions': [
    ['procurement', 'POST', '/pr', '/'],
    ['procurement', 'POST', '/pr/:id/submit', '/:id/submit'],
    ['procurement', 'POST', '/pr/:id/decide', '/:id/decide'],
  ],
  rfqs: [
    ['procurement', 'POST', '/rfq', '/'],
    ['procurement', 'POST', '/rfq/:id/vendors', '/:id/vendors'],
    ['procurement', 'POST', '/rfq/:id/quotations', '/:id/quotations'],
    ['procurement', 'GET', '/rfq/:id/comparison', '/:id/comparison'],
    ['procurement', 'GET', '/rfq/:id/quotations/vendor/:supplierId', '/:id/quotations/vendor/:supplierId'],
    ['procurement', 'POST', '/rfq/:id/award', '/:id/award'],
  ],
  'purchase-orders': [
    ['procurement', 'POST', '/po', '/'],
    ['procurement', 'POST', '/po/:id/issue', '/:id/issue'],
    ['procurement', 'POST', '/po/:id/decide', '/:id/decide'],
  ],
  deliveries: [
    ['procurement', 'POST', '/deliveries', '/'],
    ['procurement', 'POST', '/deliveries/:id/mir', '/:id/mir'],
    ['procurement', 'POST', '/mir/:id/decide', '/mir/:id/decide'],
  ],
  grns: [
    ['procurement', 'POST', '/mir/:id/grn', '/from-mir/:id'],
    ['procurement', 'POST', '/grn/:id/returns', '/:id/returns'],
  ],
  'supplier-invoices': [
    ['procurement', 'POST', '/invoices', '/'],
    ['procurement', 'POST', '/invoices/:id/approve', '/:id/approve'],
  ],
  approvals: [
    // Phase 3 (open item): non-destructive cancel for stale approvals + its dry-run report.
    ['approvals', 'PUT', '/:id/cancel', '/:id/cancel'],
    ['approvals', 'GET', '/stale', '/stale'],
  ],
  contracts: [
    ['commercial', 'GET', '/contracts/:projectId', '/:projectId'],
    ['commercial', 'POST', '/contracts', '/'],
    ['commercial', 'GET', '/project/:projectId/commercial', '/projects/:projectId'],
  ],
  subcontracts: [
    ['subcontractors', 'GET', '/contracts/:projectId', '/:projectId'],
    ['subcontractors', 'POST', '/contracts', '/'],
    ['subcontractors', 'GET', '/verifications/:contractId', '/:contractId/verifications'],
    ['subcontractors', 'POST', '/verifications', '/verifications'],
    ['subcontractors', 'PUT', '/verifications/:id', '/verifications/:id'],
    ['subcontractors', 'GET', '/certificates/:contractId', '/:contractId/certificates'],
    ['subcontractors', 'POST', '/certificates', '/certificates'],
    ['subcontractors', 'PUT', '/certificates/:id', '/certificates/:id'],
  ],
  variations: [
    ['commercial', 'GET', '/variations/:projectId', '/:projectId'],
    ['commercial', 'POST', '/variations', '/'],
    ['commercial', 'POST', '/variations/:id/start', '/:id/start'],
    ['commercial', 'POST', '/variations/:id/decide', '/:id/decide'],
  ],
  'payment-certificates': [
    ['financeLedger', 'POST', '/valuations', '/valuations'],
    ['subcontractors', 'GET', '/certificates/:contractId', '/:contractId'],
  ],
  invoices: [
    ['invoices', 'GET', '/', '/'],
    ['invoices', 'GET', '/:id', '/:id'],
    ['invoices', 'POST', '/', '/'],
    ['invoices', 'PUT', '/:id', '/:id'],
    ['financeLedger', 'POST', '/invoices/:id/transition', '/:id/transition'],
    ['financeLedger', 'POST', '/payments/:id/allocate', '/payments/:id/allocate'],
    ['financeLedger', 'POST', '/retention', '/retention'],
    ['financeLedger', 'GET', '/retention', '/retention'],
  ],
  payments: [
    ['payments', 'GET', '/', '/'],
    ['payments', 'POST', '/', '/'],
    ['financeLedger', 'POST', '/payments/:id/allocate', '/:id/allocate'],
  ],
  'daily-reports': [
    ['site', 'GET', '/:projectId/site-reports', '/:projectId'],
    ['site', 'GET', '/:projectId/site-reports/:date', '/:projectId/:date'],
    ['site', 'POST', '/:projectId/site-reports', '/:projectId'],
    ['site', 'PUT', '/:projectId/site-reports/:id', '/:projectId/:id'],
    ['site', 'POST', '/:projectId/site-reports/assemble', '/:projectId/assemble'],
  ],
  'site-visits': [
    ['site', 'GET', '/:projectId/site-visits', '/:projectId'],
    ['site', 'POST', '/:projectId/site-visits', '/:projectId'],
    ['site', 'PUT', '/:projectId/site-visits/:id', '/:projectId/:id'],
    ['site', 'DELETE', '/:projectId/site-visits/:id', '/:projectId/:id'],
  ],
  observations: [
    ['consultant', 'POST', '/observations', '/'],
    ['consultant', 'POST', '/observations/:id/comments', '/:id/comments'],
    ['consultant', 'POST', '/observations/:id/advance', '/:id/advance'],
  ],
  rfis: [
    ['doccontrol', 'GET', '/rfis', '/'],
    ['doccontrol', 'POST', '/rfis', '/'],
    ['doccontrol', 'POST', '/rfis/:id/respond', '/:id/respond'],
    ['doccontrol', 'POST', '/rfis/:id/close', '/:id/close'],
  ],
  submittals: [
    ['doccontrol', 'GET', '/submittals', '/'],
    ['doccontrol', 'POST', '/submittals', '/'],
    ['doccontrol', 'POST', '/submittals/:id/respond', '/:id/respond'],
  ],
  inspections: [
    ['qhse', 'GET', '/inspections', '/'],
    ['qhse', 'POST', '/inspections', '/'],
    ['qhse', 'PUT', '/inspections/:id', '/:id'],
    ['hse', 'GET', '/inspections', '/safety'],
    ['hse', 'POST', '/inspections', '/safety'],
  ],
  ncrs: [
    ['qhse', 'GET', '/ncrs', '/'],
    ['qhse', 'POST', '/ncrs', '/'],
    ['qhse', 'POST', '/ncrs/:id/status', '/:id/status'],
    ['qhse', 'PUT', '/ncrs/:id', '/:id'],
    ['qhse', 'POST', '/ncrs/:id/verify', '/:id/verify'],
    ['qhse', 'GET', '/ncrs/:id/pdf', '/:id/pdf'],
  ],
  documents: [
    ['doccontrol', 'GET', '/documents', '/'],
    ['doccontrol', 'GET', '/documents/:id', '/:id'],
    ['doccontrol', 'POST', '/documents', '/'],
    ['doccontrol', 'PUT', '/documents/:id', '/:id'],
    ['doccontrol', 'DELETE', '/documents/:id', '/:id'],
    ['doccontrol', 'POST', '/documents/:id/versions', '/:id/versions'],
    ['doccontrol', 'POST', '/documents/:id/submit', '/:id/submit'],
    ['doccontrol', 'POST', '/documents/:id/:action(approve|reject)', '/:id/:action(approve|reject)'],
    ['doccontrol', 'GET', '/documents/:id/revisions', '/:id/revisions'],
    ['doccontrol', 'GET', '/search', '/search'],
  ],
  transmittals: [
    ['doccontrol', 'GET', '/transmittals', '/'],
    ['doccontrol', 'POST', '/transmittals', '/'],
    ['doccontrol', 'GET', '/transmittals/:id', '/:id'],
    ['doccontrol', 'POST', '/transmittals/:id/items', '/:id/items'],
    ['doccontrol', 'POST', '/transmittals/:id/status', '/:id/status'],
  ],
  schedule: [
    ['schedule', 'GET', '/calendars', '/calendars'],
    ['schedule', 'POST', '/calendars', '/calendars'],
    ['schedule', 'GET', '/activities', '/activities'],
    ['schedule', 'GET', '/activities/:id', '/activities/:id'],
    ['schedule', 'POST', '/activities', '/activities'],
    ['schedule', 'PUT', '/activities/:id', '/activities/:id'],
    ['schedule', 'DELETE', '/activities/:id', '/activities/:id'],
    ['schedule', 'POST', '/activities/:id/progress', '/activities/:id/progress'],
    ['schedule', 'GET', '/relationships', '/relationships'],
    ['schedule', 'POST', '/relationships', '/relationships'],
    ['schedule', 'DELETE', '/relationships/:id', '/relationships/:id'],
    ['schedule', 'GET', '/schedule/cpm', '/cpm'],
    ['schedule', 'GET', '/schedule/lookahead', '/lookahead'],
    ['schedule', 'GET', '/schedule/delayed', '/delayed'],
    ['schedule', 'GET', '/schedule/kpis', '/kpis'],
    ['schedule', 'GET', '/schedule/s-curve', '/s-curve'],
    ['schedule', 'GET', '/schedule/alerts', '/alerts'],
    ['schedule', 'GET', '/schedule/milestones', '/milestones'],
    ['schedule', 'GET', '/baselines', '/baselines'],
    ['schedule', 'POST', '/baselines', '/baselines'],
  ],
  actions: [
    ['actions', 'GET', '/my', '/my'],
    ['actions', 'POST', '/', '/'],
    ['actions', 'POST', '/:id/acknowledge', '/:id/acknowledge'],
    ['actions', 'POST', '/:id/complete', '/:id/complete'],
    ['actions', 'POST', '/:id/delegate', '/:id/delegate'],
  ],
  notifications: [
    ['notifications', 'GET', '/', '/'],
    ['notifications', 'POST', '/:id/read', '/:id/read'],
    ['notifications', 'GET', '/preferences', '/preferences'],
    ['notifications', 'PUT', '/preferences', '/preferences'],
  ],
  reports: [
    ['reports', 'GET', '/catalog', '/catalog'],
    ['reports', 'GET', '/data/:reportKey', '/:reportKey/data'],
    ['reports', 'GET', '/export/:reportKey', '/:reportKey/export'],
    ['reports', 'GET', '/saved-views', '/saved-views'],
    ['reports', 'POST', '/saved-views', '/saved-views'],
    ['reports', 'DELETE', '/saved-views/:id', '/saved-views/:id'],
    ['reports', 'GET', '/scheduled', '/scheduled'],
    ['reports', 'POST', '/scheduled', '/scheduled'],
    ['reports', 'DELETE', '/scheduled/:id', '/scheduled/:id'],
  ],
};

// Family -> policy module used for v1-only endpoints (matches the module the
// equivalent internal calls resolve via moduleFromRequest).
const FAMILY_POLICY_MODULE = {
  companies: 'clients',
  users: 'users',
  organizations: 'organizations',
  projects: 'projects',
  'work-packages': 'boq',
  boq: 'boq',
  quantities: 'quantities',
  materials: 'items',
  inventory: 'warehouses',
  'purchase-requisitions': 'procurement',
  rfqs: 'procurement',
  'purchase-orders': 'procurement',
  deliveries: 'procurement',
  grns: 'procurement',
  contracts: 'commercial',
  subcontracts: 'subcontractors',
  variations: 'commercial',
  'payment-certificates': 'commercial',
  invoices: 'invoices',
  payments: 'payments',
  'daily-reports': 'site',
  'site-visits': 'site',
  observations: 'consultant',
  rfis: 'doccontrol',
  submittals: 'doccontrol',
  inspections: 'qhse',
  ncrs: 'qhse',
  documents: 'doccontrol',
  transmittals: 'doccontrol',
  schedule: 'schedule',
  actions: 'actions',
  notifications: 'notifications',
  reports: 'reports',
};

// Registration spec for OpenAPI generation: paths are introspected from the
// mounted v1 router itself; the generator only adds tags/servers info.

function buildV1Router() {
  const router = express.Router();
  const api = express.Router(); // token-protected sub-router

  // Platform middleware for every v1 request.
  router.use(v1.correlationId);
  router.use(v1.rateLimit);
  router.use(v1.normalizeResponses);

  // --- Public endpoints (no token): health + OAuth token issuance ---
  router.get('/health', async (req, res) => {
    const health = await healthCheck();
    res.json({ success: true, data: { status: health.status, timestamp: new Date().toISOString() } });
  });

  router.post('/oauth/token', async (req, res, next) => {
    try {
      let result;
      if (req.body.grant_type === 'password') result = await oauthService.issueForPassword(req.body);
      else if (req.body.grant_type === 'client_credentials') result = await oauthService.issueForClientCredentials(req.body);
      else if (req.body.grant_type === 'refresh_token') result = await oauthService.issueForRefresh(req.body);
      else {
        const err = new Error('Unsupported grant_type (password | client_credentials | refresh_token)');
        err.status = 400; err.code = 'unsupported_grant_type';
        return next(err);
      }
      res.json({ success: true, data: result });
    } catch (e) {
      e.status = e.status || 401; e.code = e.code || 'invalid_grant';
      next(e);
    }
  });

  // --- Public: OpenAPI spec (generated below, served via closure) ---
  let openApiSpec = null;
  router.get('/openapi.json', (req, res) => res.json(openApiSpec));

  // --- Everything below requires a token ---
  router.use(v1.authenticateV1);

  // --- Webhook management (owner/admin only) ---
  const webhookSchema = Joi.object({
    url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
    events: Joi.array().items(Joi.string().max(100)).min(1).required(),
    description: Joi.string().allow('', null),
  });
  api.post('/webhooks', authorize('owner', 'admin'), async (req, res, next) => {
    try {
      const { error, value } = webhookSchema.validate(req.body);
      if (error) { const err = new Error(error.details[0].message); err.status = 400; return next(err); }
      const hook = await webhookService.createWebhook({
        url: value.url, secret: require('crypto').randomBytes(24).toString('hex'),
        events: value.events, description: value.description, userId: req.user.id,
      });
      // The secret is shown exactly once, at creation.
      res.status(201).json({ success: true, data: { id: hook.id, url: hook.url, events: hook.events, secret: hook.secret, description: hook.description } });
    } catch (e) { next(e); }
  });
  api.get('/webhooks', authorize('owner', 'admin'), async (req, res, next) => {
    try { res.json({ success: true, data: await webhookService.listWebhooks() }); } catch (e) { next(e); }
  });
  api.get('/webhooks/:id', authorize('owner', 'admin'), async (req, res, next) => {
    try {
      const hook = await webhookService.getWebhook(parseInt(req.params.id, 10));
      if (!hook) { const err = new Error('Webhook not found'); err.status = 404; return next(err); }
      res.json({ success: true, data: hook });
    } catch (e) { next(e); }
  });
  api.put('/webhooks/:id', authorize('owner', 'admin'), async (req, res, next) => {
    try {
      const patchSchema = Joi.object({
        url: Joi.string().uri({ scheme: ['http', 'https'] }),
        events: Joi.array().items(Joi.string().max(100)).min(1),
        description: Joi.string().allow('', null),
        is_active: Joi.boolean(),
      }).min(1);
      const { error, value } = patchSchema.validate(req.body);
      if (error) { const err = new Error(error.details[0].message); err.status = 400; return next(err); }
      const updated = await webhookService.updateWebhook(parseInt(req.params.id, 10), value);
      if (!updated) { const err = new Error('Webhook not found'); err.status = 404; return next(err); }
      res.json({ success: true, data: updated });
    } catch (e) { next(e); }
  });
  api.delete('/webhooks/:id', authorize('owner', 'admin'), async (req, res, next) => {
    try {
      const deleted = await webhookService.deleteWebhook(parseInt(req.params.id, 10));
      if (!deleted) { const err = new Error('Webhook not found'); err.status = 404; return next(err); }
      res.json({ success: true, data: { deleted: true } });
    } catch (e) { next(e); }
  });
  api.get('/webhooks/:id/deliveries', authorize('owner', 'admin'), async (req, res, next) => {
    try {
      const deliveries = await webhookService.listDeliveries(parseInt(req.params.id, 10));
      res.json({ success: true, data: deliveries });
    } catch (e) { next(e); }
  });
  api.post('/webhooks/deliveries/:deliveryId/redrive', authorize('owner', 'admin'), async (req, res, next) => {
    try {
      const result = await webhookService.redriveDelivery(parseInt(req.params.deliveryId, 10));
      if (!result) { const err = new Error('Delivery not found or not in a redrivable state'); err.status = 404; return next(err); }
      res.json({ success: true, data: result });
    } catch (e) { next(e); }
  });

  // Every v1-only route declares its family so a token's scopes apply to it (UI sessions are unaffected).
  const scoped = (family) => (req, res, next) => { req.family = family; v1.requireScope(req, res, next); };

  // --- v1-only read lists (thin, policy-gated, project-scoped) ---
  api.get('/organizations', scoped('organizations'), (req, res, next) =>
    apiResources.listFamily('organizations', req, res).catch(next));
  api.get('/organizations/:id', scoped('organizations'), (req, res, next) =>
    apiResources.getFamilyRecord('organizations', req, res).catch(next));
  api.get('/purchase-requisitions', scoped('purchase-requisitions'), (req, res, next) =>
    apiResources.listFamily('purchase-requisitions', req, res).catch(next));
  api.get('/purchase-requisitions/:id', scoped('purchase-requisitions'), (req, res, next) =>
    apiResources.getFamilyRecord('purchase-requisitions', req, res).catch(next));
  api.get('/purchase-orders', scoped('purchase-orders'), (req, res, next) =>
    apiResources.listFamily('purchase-orders', req, res).catch(next));
  api.get('/purchase-orders/:id', scoped('purchase-orders'), (req, res, next) =>
    apiResources.getFamilyRecord('purchase-orders', req, res).catch(next));
  api.get('/deliveries', scoped('deliveries'), (req, res, next) =>
    apiResources.listFamily('deliveries', req, res).catch(next));
  api.get('/deliveries/:id', scoped('deliveries'), (req, res, next) =>
    apiResources.getFamilyRecord('deliveries', req, res).catch(next));
  api.get('/grns', scoped('grns'), (req, res, next) =>
    apiResources.listFamily('grns', req, res).catch(next));
  api.get('/grns/:id', scoped('grns'), (req, res, next) =>
    apiResources.getFamilyRecord('grns', req, res).catch(next));
  api.get('/payment-certificates', scoped('payment-certificates'), (req, res, next) =>
    apiResources.listFamily('payment-certificates', req, res).catch(next));
  api.get('/payment-certificates/:id', scoped('payment-certificates'), (req, res, next) =>
    apiResources.getFamilyRecord('payment-certificates', req, res).catch(next));
  api.get('/observations', scoped('observations'), (req, res, next) =>
    apiResources.listFamily('observations', req, res).catch(next));

  // --- Phase 28: the six assistants (orchestration on the Phase 27 tools) ---
  api.get('/assistants/:assistant/summary', scoped('assistants'), (req, res, next) => {
    if (!assistantService.ASSISTANTS.includes(req.params.assistant)) {
      return res.status(404).json({ success: false, error: `Unknown assistant '${req.params.assistant}'` });
    }
    // Tool calls the assistant makes on this user's behalf carry the token's scopes.
    const actingUser = Object.defineProperty({ ...req.user }, 'tokenScopes', { value: req.authType === 'v1' ? req.v1Scopes : null, enumerable: false });
    assistantService.summarize(req.params.assistant, actingUser, {
      project_id: req.query.project_id ? Number(req.query.project_id) : undefined,
      rfq_id: req.query.rfq_id ? Number(req.query.rfq_id) : undefined,
      q: req.query.q,
    }).then((data) => res.json({ success: true, data })).catch(next);
  });
  api.post('/assistants/:assistant/draft', scoped('assistants'), (req, res, next) => {
    if (!assistantService.ASSISTANTS.includes(req.params.assistant)) {
      return res.status(404).json({ success: false, error: `Unknown assistant '${req.params.assistant}'` });
    }
    assistantService.draftFor(req.params.assistant, req.body || {})
      .then((data) => res.json({ success: true, data })).catch(next);
  });

  // Idempotency wraps POSTs (before the remounted chains so their responses
  // are captured for replay).
  api.use(v1.idempotency);

  // --- Remounted families ---
  registerFamilies(api);

  // OpenAPI (generated from source AFTER families are mounted, so paths are
  // introspected from the actual routers). The route itself is registered
  // BEFORE the auth gate above, so the spec is publicly readable.
  openApiSpec = buildOpenApi({ v1Routers: [router, api], families: FAMILY_POLICY_MODULE });

  // Token-protected resources mount here.
  router.use(api);

  // B5 contract: a request that matches no /api/v1 route must still answer the
  // documented JSON envelope — Express's HTML 404 never leaks past this router.
  // (Written before the error handler so errors keep flowing after it.)
  router.use((req, res) => {
    res.status(404).json({ success: false, error: `No /api/v1 route: ${req.method} ${req.originalUrl}` });
  });

  // Structured errors for anything that slipped past handler-level catching.
  router.use(v1.structuredErrorHandler);

  return router;
}

// Register remounted operations per family. Each mount sets req.family before
// the chain so requireScope can enforce token scopes; internal (UI) tokens
// skip scope enforcement (full parity).
function registerFamilies(router) {
  for (const [key, ops] of Object.entries(FAMILY_MAP)) {
    for (const [routerName, method, internalPath, v1Path] of ops) {
      const handler = remount(routerName, method, internalPath);
      const m = method.toLowerCase();
      router[m](
        `/${key}${v1Path}`,
        (req, res, next) => { req.family = key; next(); },
        v1.requireScope,
        handler
      );
    }
  }
}

module.exports = { buildV1Router, remount, remountFrom, FAMILY_MAP, ROUTERS };
