const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate, authorize } = require('../middleware/auth');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.dwg', '.dxf', '.zip', '.txt', '.csv'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_؀-ۿ-]/g, '_').slice(0, 60);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) return cb(new Error(`File type ${ext} not allowed`));
    cb(null, true);
  },
});

// Generic file upload — returns URL(s) served from /uploads. Reused by site reports,
// document control, QHSE attachments, etc.
router.post('/upload', authenticate, authorize(), (req, res) => {
  upload.array('files', 10)(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, error: 'No files uploaded' });
    const files = req.files.map(f => ({
      file_url: `/uploads/${f.filename}`,
      original_name: f.originalname,
      file_type: path.extname(f.originalname).toLowerCase().replace('.', ''),
      file_size_bytes: f.size,
    }));
    res.status(201).json({ success: true, data: files });
  });
});

module.exports = router;
