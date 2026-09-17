const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const actionService = require('../services/actionService');

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
