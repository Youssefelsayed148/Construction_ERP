const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { getRecentActivities } = require('../utils/activity');
const { routeFail } = require('../utils/typedRoute');

// GET /api/activity - recent activity
router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const activities = await getRecentActivities(limit);
    res.json({ success: true, activities });
  } catch (error) {
    return routeFail(res, error, 'ACTIVITY', req);
  }
});

module.exports = router;
