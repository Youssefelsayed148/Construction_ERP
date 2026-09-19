const express = require('express');
const path = require('path');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { canAccessMedia } = require('../services/mediaAccess');

const router = express.Router();
const uploadDir = path.resolve(__dirname, '../../uploads');

// canAccessMedia is the resource-level authorization for this route.
router.get('/:fileName', authenticate, async (req, res) => {
  try {
    const fileName = req.params.fileName;
    if (!await canAccessMedia(query, req.user, fileName, req.preview)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(uploadDir, fileName), (error) => {
      if (error && !res.headersSent) res.status(error.status || 404).json({ success: false, error: 'File not found' });
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
