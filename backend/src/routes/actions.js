const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const actionService = require('../services/actionService');
const Joi = require('joi');
const { auditedTransaction } = require('../utils/auditedTransaction');
const { typedFail } = require('../utils/typedRoute');
const { EXTERNAL_ROLES } = require('../services/policy');

router.get('/:id/comments', authenticate, authorize(), async (req, res) => {
  if (EXTERNAL_ROLES.has(req.user.role)) return res.status(403).json({ success: false, error_code: 'action_comments_internal_only' });
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
  try {
    const result = await auditedTransaction(async (q) => {
      const comments = await q(
        `SELECT c.id, c.action_item_id, c.project_id, c.author_id, u.name AS author_name, c.body, c.created_at
         FROM action_comments c LEFT JOIN users u ON u.id = c.author_id
         WHERE c.action_item_id = $1 AND c.visibility = 'internal'
         ORDER BY c.created_at, c.id LIMIT $2`, [req.params.id, limit]);
      return comments;
    }, () => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'read', module: 'actions',
      description: `Read action comments for #${req.params.id}`, entityId: req.params.id, entityType: 'action_item' }));
    res.json({ success: true, data: result.rows });
  } catch (error) { return typedFail(res, error, 'ACTION_COMMENTS_READ', req); }
});

router.post('/:id/comments', authenticate, authorize(), async (req, res) => {
  if (EXTERNAL_ROLES.has(req.user.role)) return res.status(403).json({ success: false, error_code: 'action_comments_internal_only' });
  const { error, value } = Joi.object({ body: Joi.string().trim().min(1).max(5000).required() }).unknown(false).validate(req.body);
  if (error) return res.status(400).json({ success: false, error_code: 'invalid_action_comment' });
  try {
    const result = await auditedTransaction(async (q) => {
      const action = (await q('SELECT id, project_id FROM action_items WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!action) throw Object.assign(new Error('action_item_not_found'), { code: 'action_item_not_found', status: 404 });
      return q(
        `INSERT INTO action_comments (action_item_id, project_id, author_id, body)
         VALUES ($1,$2,$3,$4)
         RETURNING id, action_item_id, project_id, author_id, body, created_at`,
        [action.id, action.project_id, req.user.id, value.body]);
    }, (r) => ({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'actions',
      description: `Added a comment to action #${req.params.id}`, entityId: r.rows[0].id, entityType: 'action_comment' }));
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { return typedFail(res, error, 'ACTION_COMMENTS_CREATE', req); }
});

// GET /api/actions/my — "My Actions" buckets for the logged-in user.
router.get('/my', authenticate, authorize(), async (req, res) => {
  try {
    const { buckets, total } = await actionService.listForUser(req.user.id);
    res.json({ success: true, buckets, total });
  } catch (e) {
    console.error('Error listing my actions:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/actions — raise an action item directly.
router.post('/', authenticate, authorize(), async (req, res) => {
  try {
    const { source_type, source_id, project_id, location_id, title, description,
      assigned_user_id, assigned_role, assigned_organization_id, priority, due_date } = req.body;
    const item = await actionService.createActionItem({
      source_type: source_type || 'manual',
      source_id,
      project_id,
      location_id,
      title,
      description,
      assigned_user_id,
      assigned_role,
      assigned_organization_id,
      priority,
      due_date: due_date ? new Date(due_date) : null,
      created_by: req.user.id,
    });
    res.status(201).json({ success: true, data: item });
  } catch (e) {
    res.status(e.message && e.message.includes('requires') ? 400 : 500).json({ success: false, error: e.message });
  }
});

// POST /api/actions/:id/acknowledge — stops the escalation ladder rung 1.
router.post('/:id/acknowledge', authenticate, authorize(), async (req, res) => {
  try {
    const r = await actionService.acknowledge(parseInt(req.params.id, 10), req.user.id);
    if (!r.ok) return res.status(r.statusCode).json({ success: false, error: r.error });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/actions/:id/complete
router.post('/:id/complete', authenticate, authorize(), async (req, res) => {
  try {
    const r = await actionService.complete(parseInt(req.params.id, 10), req.user.id);
    if (!r.ok) return res.status(r.statusCode).json({ success: false, error: r.error });
    res.json({ success: true, data: r.item });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/actions/:id/delegate — body: { to_user_id, comment }
router.post('/:id/delegate', authenticate, authorize(), async (req, res) => {
  try {
    const toUserId = parseInt(req.body.to_user_id, 10);
    if (!toUserId) return res.status(400).json({ success: false, error: 'to_user_id is required' });
    const r = await actionService.delegate(parseInt(req.params.id, 10), req.user.id, toUserId, { comment: req.body.comment });
    if (!r.ok) return res.status(r.statusCode).json({ success: false, error: r.error });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
