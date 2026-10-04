// Phase 5.1 (spec 04) — delegations of authority. Mounted at /api/delegations (server.js).
//
// The rows and their CRUD live in services/orgService.js; this router is the HTTP surface for the
// delegations module (the policy judges these requests as module "delegations", scoped ORGANIZATION
// only — services/policy.ORGANIZATION_MODULES). The ENFORCEMENT side (acting AS the delegator on an
// approval) is services/policy.js evaluateViaDelegation + services/delegationService.js.
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const policy = require('../services/policy');
const org = require('../services/orgService');
const delegationService = require('../services/delegationService');

function fail(res, e) {
  const status = e.status || (e.error_code ? 400 : 500);
  if (status >= 500) console.error('[DELEGATIONS]', e);
  return res.status(status).json({
    success: false,
    error: e.message,
    ...(e.error_code ? { error_code: e.error_code, error_params: e.error_params || {} } : {}),
  });
}

// A user sees their own delegations (both directions); owner/admin see all. Internals also need
// the module view grant, which is what the delegations module grants to the org stakeholders.
router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    res.json({ success: true, data: await org.listDelegations(query, req.user) });
  } catch (e) { return fail(res, e); }
});

// The policy decision carries the delegation evidence as decision.via_delegation.
router.post('/', authenticate, authorize('owner', 'admin', 'owner_ceo', 'coo'), async (req, res) => {
  try {
    const schema = Joi.object({
      delegate_user_id: Joi.number().integer().required(),
      module_scope: Joi.string().default('*'),
      max_amount: Joi.number().min(0).allow(null),
      valid_from: Joi.date().iso().default(null), valid_to: Joi.date().iso().required(),
      notes: Joi.string().allow(null, ''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error' });
    const created = await org.createDelegation(query, req.user, value);
    await policy.recordAuditEvent({
      entity: 'delegation', entityId: created.id, action: 'create',
      after: {
        delegate_user_id: created.delegate_user_id,
        delegate_from_user_id: created.delegate_from_user_id,
        module_scope: created.module_scope,
        max_amount: created.max_amount,
        valid_from: created.valid_from, valid_to: created.valid_to,
      },
      userId: req.user.id,
    });
    res.status(201).json({ success: true, data: created });
  } catch (e) { return fail(res, e); }
});

router.post('/:id/deactivate', authenticate, authorize(), async (req, res) => {
  try {
    const updated = await org.deactivateDelegation(query, req.user, req.params.id);
    await policy.recordAuditEvent({
      entity: 'delegation', entityId: updated.id, action: 'deactivate',
      before: { is_active: true }, after: { is_active: false }, userId: req.user.id,
    });
    res.json({ success: true, data: updated });
  } catch (e) { return fail(res, e); }
});

// Explicit evidence query the policy-engine may reuse in third-party surfaces: the same gates
// (window, scope, cap), a plain function, no side effects.
router.post('/lookup', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      delegate_user_id: Joi.number().integer().required(),
      delegator_user_id: Joi.number().integer().required(),
      module: Joi.string().allow(null, ''), amount: Joi.number().allow(null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message, error_code: 'validation_error' });
    const required = req.user.role === 'owner' || req.user.role === 'admin';
    if (!required && Number(value.delegate_user_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, error: 'Only the delegate (or an owner/admin) may query a delegation', error_code: 'delegation_not_mine' });
    }
    const found = await delegationService.lookupDelegation(query, value.delegate_user_id, value.delegator_user_id, {
      module: value.module || null, amount: value.amount ?? null,
    });
    res.json({ success: true, data: found });
  } catch (e) { return fail(res, e); }
});

module.exports = router;
