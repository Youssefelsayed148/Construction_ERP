const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

// GET /api/notifications — the in-app inbox (frontend polls).
router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const items = await notificationService.getNotifications(req.user.id, {
      unreadOnly,
      limit: req.query.limit,
    });
    const count = await notificationService.unreadCount(req.user.id);
    res.json({ success: true, data: items, unread: count });
  } catch (e) {
    console.error('Error listing notifications:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/notifications/:id/read
router.post('/:id/read', authenticate, authorize(), async (req, res) => {
  try {
    const r = await notificationService.markRead(parseInt(req.params.id, 10), req.user.id);
    res.json({ success: r.ok });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/notifications/preferences
router.get('/preferences', authenticate, authorize(), async (req, res) => {
  try {
    const prefs = await notificationService.getPreferences(req.user.id);
    res.json({ success: true, data: prefs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/notifications/preferences — body: { event_type, channel, enabled }
router.put('/preferences', authenticate, authorize(), async (req, res) => {
  try {
    const { event_type, channel, enabled } = req.body;
    if (!event_type || !channel) {
      return res.status(400).json({ success: false, error: 'event_type and channel are required' });
    }
    const r = await notificationService.setPreference(req.user.id, event_type, channel, enabled !== false);
    res.json({ success: r.ok });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
