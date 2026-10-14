const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { transaction } = require('../config/database');
const { auditedMutation } = require('../utils/auditedMutation');
const { authenticate, authorize } = require('../middleware/auth');
const { MAX_UPLOAD_BYTES, ALLOWED_EXTENSIONS, validateUploadFile } = require('../utils/uploadValidation');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) return cb(new Error(`File type ${ext} not allowed`));
    cb(null, true);
  },
});

// Generic file upload — returns URL(s) served from /uploads. Reused by site reports,
// document control, QHSE attachments, etc.
router.post('/upload', authenticate, authorize(), (req, res) => {
  upload.array('files', 10)(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, error: 'No files uploaded' });
    const valid = await Promise.all(req.files.map((file) => validateUploadFile(file)));
    if (valid.some((isValid) => !isValid)) {
      await Promise.all(req.files.map((file) => fs.promises.unlink(file.path).catch(() => {})));
      return res.status(400).json({ success: false, error: 'File content does not match an allowed file type', error_code: 'invalid_file_content' });
    }
    const files = req.files.map(f => ({
      file_url: `/uploads/${f.filename}`,
      original_name: f.originalname,
      file_type: path.extname(f.originalname).toLowerCase().replace('.', ''),
      file_size_bytes: f.size,
    }));
    try {
      await auditedMutation(req, { action: 'upload', module: 'documents', entityType: 'uploaded_file' }, async (q) => {
        for (const file of req.files) {
          await q('INSERT INTO uploaded_files (file_name, uploaded_by) VALUES ($1, $2)', [file.filename, req.user.id]);
        }
        return {
          data: files, entityId: null, after: { files: req.files.map((f) => ({ file_name: f.filename, original_name: f.originalname, size: f.size })) },
          description: `Uploaded ${req.files.length} file(s): ${req.files.map((f) => f.originalname).join(', ').slice(0, 200)}`,
        };
      });
    } catch (error) {
      await Promise.all(req.files.map((file) => fs.promises.unlink(file.path).catch(() => {})));
      return res.status(500).json({ success: false, error: 'Could not register uploaded files' });
    }
    res.status(201).json({ success: true, data: files });
  });
});

module.exports = router;
