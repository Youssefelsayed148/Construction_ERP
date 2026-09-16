const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// TODO(phase-4): add scoped check — owner|admin|legal_mgr read all; project members see rows where project_id = their project.
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, document_type, limit = 100, offset = 0 } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (document_type) { conditions.push(`document_type = $${idx++}`); params.push(document_type); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const dataResult = await query(`SELECT * FROM legal_documents ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`, [...params, parseInt(limit), parseInt(offset)]);
    res.json({ success: true, data: dataResult.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// TODO(phase-4): add scoped check — same policy as GET /, evaluated against the row's project_id.
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM legal_documents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Document not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// TODO(phase-4): add scoped check — write access owner|admin|legal_mgr; verify project_id (when supplied) is in user_project_roles.
router.post('/', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      title: Joi.string().required(), document_type: Joi.string().optional(),
      description: Joi.string().allow(''), file_path: Joi.string().allow(''),
      submitted_by: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const result = await query(
      `INSERT INTO legal_documents (title, document_type, description, file_path, submitted_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [value.title, value.document_type, value.description, value.file_path, value.submitted_by]
    );

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'legal', description: `Created legal document "${value.title}"`, entityId: result.rows[0].id, entityType: 'legal_document' });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// TODO(phase-4): add scoped check — owner|admin|legal_mgr; row must be in a project the caller can write to.
router.put('/:id', authenticate, async (req, res) => {
  try {
    const existing = await query('SELECT * FROM legal_documents WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Document not found' });

    const schema = Joi.object({
      title: Joi.string(), document_type: Joi.string(), description: Joi.string().allow(''),
      file_path: Joi.string().allow(''), submitted_by: Joi.string().allow(''),
      status: Joi.string().valid('pending', 'verified', 'rejected'),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    if (value.status === 'verified') { sets.push(`verified_by = $${idx++}`); params.push(req.user.id); }
    params.push(req.params.id);
    const result = await query(`UPDATE legal_documents SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, params);

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'legal', description: `Updated legal document "${result.rows[0].title}"`, entityId: req.params.id, entityType: 'legal_document' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// TODO(phase-4): add scoped check — owner|admin only; row must be in a project the caller can delete from.
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await query('DELETE FROM legal_documents WHERE id = $1 RETURNING title', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Document not found' });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'delete', module: 'legal', description: `Deleted legal document "${result.rows[0].title}"`, entityId: req.params.id, entityType: 'legal_document' });
    res.json({ success: true, message: 'Document deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
