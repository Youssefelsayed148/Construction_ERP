// Phase 27 — admin "Agent Activity" API (prompt 27 point 7).
//
// Serves the Agent Activity screen: every MCP tool call with its
// authorization decision and response summary, plus the pending gated
// action requests with approve/reject (which executes through the same
// guarded chain as the original tool call).
//
// Access: owner/admin — this is the oversight surface for the agent layer.

'use strict';

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const mcpService = require('../services/mcpService');
const { logActivity } = require('../utils/activity');

// Every tool call (audit trail) ----------------------------------------------
router.get('/activity', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const calls = (await query(
      `SELECT c.*, u.name as user_name
       FROM agent_tool_calls c LEFT JOIN users u ON c.user_id = u.id
       ORDER BY c.created_at DESC LIMIT $1`, [limit]
    )).rows;
    res.json({ success: true, data: calls });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Gated action requests (pending + history) -----------------------------------
router.get('/requests', authenticate, authorize('owner', 'admin', 'finance_manager'), async (req, res) => {
  try {
    const status = req.query.status; // pending | draft | all
    let sql = 'SELECT r.*, ru.name as requesting_user_name, au.name as approver_name FROM agent_action_requests r';
    let where = ' WHERE 1 = 1'; const params = [];
    if (status === 'pending') where = " WHERE r.decision IS NULL AND r.execution_status = 'awaiting_approval'";
    else if (status === 'draft') where = " WHERE r.execution_status = 'draft' AND r.decision IS NULL";
    params.push(Math.min(parseInt(req.query.limit, 10) || 100, 500));
    const rows = (await query(
      `SELECT r.*, ru.name as requesting_user_name, au.name as approver_name
       FROM agent_action_requests r
       LEFT JOIN users ru ON r.requesting_user_id = ru.id
       LEFT JOIN users au ON r.approver_user_id = au.id${where}
       ORDER BY r.created_at DESC LIMIT $${params.length}`, params
    )).rows;
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Approve / reject a gated request; approve EXECUTES the stored operation.
router.post('/requests/:id/decision', authenticate, authorize('owner', 'admin', 'finance_manager'), async (req, res) => {
  try {
    const schema = Joi.object({ decision: Joi.string().valid('approve', 'reject').required(), comment: Joi.string().allow('', null) });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const result = await mcpService.decideRequest(parseInt(req.params.id, 10), req.user, value.decision, value.comment);
    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: value.decision, module: 'agents',
      description: `Agent request #${req.params.id} (${result.request ? result.request.tool : ''}) ${value.decision === 'approve' ? 'approved and executed' : 'rejected'}`,
      entityId: parseInt(req.params.id, 10), entityType: 'agent_action_request',
    });
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, error: e.message });
  }
});

module.exports = router;
