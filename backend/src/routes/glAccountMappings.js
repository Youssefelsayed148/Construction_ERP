'use strict';

const express = require('express');
const Joi = require('joi');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const mappings = require('../services/glAccountMappings');
const { auditedTransaction } = require('../utils/auditedTransaction');
const { typedFail } = require('../utils/typedRoute');

router.get('/', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const [rows, accounts] = await Promise.all([mappings.listMappings(query), mappings.listAccounts(query)]);
    const nameField = req.query.locale === 'ar' ? 'name_ar' : 'name_en';
    return res.json({ success: true, data: { mappings: rows, accounts: accounts.map((account) => ({
      ...account, display_name: account[nameField] || account.name_en || account.name_ar || account.code,
    })) } });
  } catch (error) { return typedFail(res, error, 'GL_ACCOUNT_MAPPINGS_LIST', req); }
});

router.put('/:key', authenticate, authorize('owner', 'admin'), async (req, res) => {
  const { error, value } = Joi.object({ account_id: Joi.number().integer().positive().required() }).validate(req.body || {});
  if (error) return res.status(400).json({ success: false, error: 'Choose an active chart account', error_code: 'validation_error' });
  try {
    const row = await auditedTransaction(
      (q) => mappings.updateMapping(q, req.params.key, value.account_id, req.user.id),
      (saved) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'finance',
        description: `Changed provisional GL account mapping ${saved.key}`, entityId: saved.account_id, entityType: 'gl_account_mapping' })
    );
    return res.json({ success: true, data: row });
  } catch (error2) { return typedFail(res, error2, 'GL_ACCOUNT_MAPPING_UPDATE', req); }
});

// Confirmation is a finance-owner decision. Any mapping edit clears its confirmation and returns it to provisional.
router.post('/:key/confirm', authenticate, authorize('owner'), async (req, res) => {
  try {
    const row = await auditedTransaction(
      (q) => mappings.confirmMapping(q, req.params.key, req.user.id),
      (saved) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'approve', module: 'finance',
        description: `Confirmed GL account mapping ${saved.key}`, entityId: saved.account_id, entityType: 'gl_account_mapping' })
    );
    return res.json({ success: true, data: row });
  } catch (error) { return typedFail(res, error, 'GL_ACCOUNT_MAPPING_CONFIRM', req); }
});

module.exports = router;
