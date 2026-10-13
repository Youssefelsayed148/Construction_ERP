'use strict';

const express = require('express');
const Joi = require('joi');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const approvalLimits = require('../services/approvalLimits');
const { typedFail } = require('../utils/typedRoute');

const filterSchema = Joi.object({ role: Joi.string().max(80), action: Joi.string().valid(...approvalLimits.MONEY_TOOLS) });
const updateSchema = Joi.object({
  role: Joi.string().trim().min(1).max(80).required(),
  action: Joi.string().valid(...approvalLimits.MONEY_TOOLS).required(),
  max_amount: Joi.number().min(0).precision(2).required(),
  currency: Joi.string().uppercase().length(3).default('EGP'),
  enabled: Joi.boolean().default(true),
});

router.get('/', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const { error, value } = filterSchema.validate(req.query, { convert: true });
  if (error) return res.status(400).json({ success: false, error: 'Invalid approval limit filter', error_code: 'validation_error' });
  try {
    const data = await approvalLimits.getLimits({ role: value.role, action: value.action }, query);
    return res.json({ success: true, data });
  } catch (error2) { return typedFail(res, error2, 'APPROVAL_LIMITS_LIST', req); }
});

router.put('/', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const { error, value } = updateSchema.validate(req.body || {}, { abortEarly: false });
  if (error) return res.status(400).json({ success: false, error: 'Invalid approval limit', error_code: 'validation_error', error_params: { fields: error.details.map((d) => d.path.join('.')) } });
  try {
    const data = await transaction(async (client) => {
      const q = client.query.bind(client);
      const saved = await approvalLimits.setLimit({
        role: value.role, action: value.action, maxAmount: value.max_amount,
        currency: value.currency, enabled: value.enabled, userId: req.user.id,
      }, q);
      await logActivity({
        userId: req.user.id, userName: req.user.name, userRole: req.user.role,
        action: 'update', module: 'approvals', description: `Updated approval limit for ${value.role}/${value.action}`,
        entityId: null, entityType: 'role_action_approval_limit',
      }, { query: q });
      return saved;
    });
    return res.json({ success: true, data });
  } catch (error2) {
    if (error2.code === 'invalid_approval_limit') return res.status(400).json({ success: false, error: error2.message, error_code: error2.code });
    return typedFail(res, error2, 'APPROVAL_LIMITS_UPDATE', req);
  }
});

module.exports = router;
