const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const { transaction } = require('../config/database');
const { logActivity } = require('../utils/activity');
const { auditedMutation } = require('../utils/auditedMutation');
const Joi = require('joi');
const { typedFail } = require('../utils/typedRoute');

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
    const r = await auditedMutation(req, { action: 'read', module: 'notifications', entityType: 'notification' }, async (q) => {
      const result = await notificationService.markRead(parseInt(req.params.id, 10), req.user.id, { query: q });
      if (!result.updated) return { data: result, skipAudit: true };
      return { data: result, entityId: parseInt(req.params.id, 10), after: { status: 'read' }, newStatus: 'read', description: `Marked notification #${req.params.id} read` };
    });
    res.json({ success: r.data.ok });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/notifications/deliveries — delivery status for the signed-in user.
router.get('/deliveries', authenticate, authorize(), async (req, res) => {
  try {
    const items = await notificationService.getDeliveries(req.user.id, { limit: req.query.limit });
    res.json({ success: true, data: items });
  } catch (error) { return typedFail(res, error, 'NOTIFICATION_DELIVERY_LIST', req); }
});

// POST /api/notifications/deliveries/:id/retry — retry one of the user's failed or undelivered items.
router.post('/deliveries/:id/retry', authenticate, authorize(), async (req, res) => {
  try {
    const result = await transaction(async (client) => {
      const delivery = await notificationService.retryDelivery(req.params.id, req.user.id, { client });
      await logActivity({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'retry',
        module: 'notifications',
        description: `Retried notification delivery #${req.params.id}`,
        entityId: req.params.id,
        entityType: 'notification_delivery',
      }, { query: client.query.bind(client) });
      return delivery;
    });
    res.json({ success: true, data: result });
  } catch (error) { return typedFail(res, error, 'NOTIFICATION_DELIVERY_RETRY', req); }
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
    const { error, value } = Joi.object({
      event_type: Joi.string().trim().min(1).max(255).required(),
      channel: Joi.string().valid(...notificationService.CHANNELS).required(),
      enabled: Joi.boolean().default(true),
    }).unknown(false).validate(req.body);
    if (error) return res.status(400).json({ success: false, error_code: 'invalid_notification_preference' });
    const r = await auditedMutation(req, { action: 'update', module: 'notifications', entityType: 'notification_preference' }, async (q) => {
      const result = await notificationService.setPreference(req.user.id, value.event_type, value.channel, value.enabled, { query: q });
      return { data: result, entityId: req.user.id, after: value, description: `Notification preference ${value.event_type}/${value.channel} ${value.enabled ? 'on' : 'off'}` };
    });
    res.json({ success: r.data.ok });
  } catch (error) {
    return typedFail(res, error, 'NOTIFICATION_PREFERENCE_UPDATE', req);
  }
});

module.exports = router;
