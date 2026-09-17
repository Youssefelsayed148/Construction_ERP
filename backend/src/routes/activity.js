const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { getRecentActivities } = require('../utils/activity');

// GET /api/activity - recent activity
router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const activities = await getRecentActivities(limit);
    res.json({ success: true, activities });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
