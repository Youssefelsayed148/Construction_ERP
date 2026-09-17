const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// Mounted at /api/docs — document library with versioning, RFIs, submittals.
// File uploads go through /api/documents/upload first; this router stores the returned URLs.

// ============ CATEGORIES ============

router.get('/categories', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query('SELECT * FROM document_categories ORDER BY parent_id NULLS FIRST, name');
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/categories', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ name: Joi.string().required(), parent_id: Joi.number().integer().allow(null).optional() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const result = await query('INSERT INTO document_categories (name, parent_id) VALUES ($1,$2) RETURNING *', [value.name, value.parent_id]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ DOCUMENTS ============

router.get('/documents', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, category_id, document_type, status, search, limit = 200, offset = 0 } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`d.project_id = $${idx++}`); params.push(project_id); }
    if (category_id) { conditions.push(`d.category_id = $${idx++}`); params.push(category_id); }
    if (document_type) { conditions.push(`d.document_type = $${idx++}`); params.push(document_type); }
    if (status) { conditions.push(`d.status = $${idx++}`); params.push(status); }
    if (search) { conditions.push(`(d.title ILIKE $${idx} OR d.description ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT d.*, dc.name as category_name, u.name as uploaded_by_name, au.name as approved_by_name
       FROM project_documents d
       LEFT JOIN document_categories dc ON d.category_id = dc.id
       LEFT JOIN users u ON d.uploaded_by = u.id
       LEFT JOIN users au ON d.approved_by = au.id
       ${where} ORDER BY d.updated_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/documents/:id', authenticate, authorize(), async (req, res) => {
  try {
    const [doc, versions] = await Promise.all([
      query(
        `SELECT d.*, dc.name as category_name, u.name as uploaded_by_name FROM project_documents d
         LEFT JOIN document_categories dc ON d.category_id = dc.id
         LEFT JOIN users u ON d.uploaded_by = u.id WHERE d.id = $1`,
        [req.params.id]
      ),
      query(
        `SELECT dv.*, u.name as uploaded_by_name FROM document_versions dv
         LEFT JOIN users u ON dv.uploaded_by = u.id WHERE dv.document_id = $1 ORDER BY dv.version_no DESC`,
        [req.params.id]
      ),
    ]);
    if (doc.rows.length === 0) return res.status(404).json({ success: false, error: 'Document not found' });
    res.json({ success: true, data: { ...doc.rows[0], versions: versions.rows } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/documents', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      category_id: Joi.number().integer().allow(null).optional(),
      title: Joi.string().required(),
      description: Joi.string().allow('').optional(),
      document_type: Joi.string().valid('drawing', 'contract', 'report', 'photo', 'rfi', 'other').default('drawing'),
      file_url: Joi.string().required(),
      file_type: Joi.string().allow('').optional(),
      file_size_bytes: Joi.number().integer().optional(),
      tags: Joi.array().items(Joi.string()).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const result = await query(
      `INSERT INTO project_documents (project_id, category_id, title, description, document_type, file_url, file_type, file_size_bytes, tags, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING *`,
      [value.project_id, value.category_id, value.title, value.description, value.document_type,
       value.file_url, value.file_type, value.file_size_bytes, JSON.stringify(value.tags), req.user.id]
    );

    // Record v1 in version history
    await query(
      `INSERT INTO document_versions (document_id, version_no, file_url, file_type, file_size_bytes, change_description, uploaded_by)
       VALUES ($1,1,$2,$3,$4,'Initial version',$5)`,
      [result.rows[0].id, value.file_url, value.file_type, value.file_size_bytes, req.user.id]
    );

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'documents', description: `Uploaded document "${value.title}"`, entityId: result.rows[0].id, entityType: 'project_document' });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Upload a new version — bumps version, archives previous file in document_versions
router.post('/documents/:id/versions', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      file_url: Joi.string().required(),
      file_type: Joi.string().allow('').optional(),
      file_size_bytes: Joi.number().integer().optional(),
      change_description: Joi.string().allow('').optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const existing = await query('SELECT * FROM project_documents WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Document not found' });

    const newVersion = existing.rows[0].version + 1;
    await query(
      `INSERT INTO document_versions (document_id, version_no, file_url, file_type, file_size_bytes, change_description, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.params.id, newVersion, value.file_url, value.file_type, value.file_size_bytes, value.change_description, req.user.id]
    );
    // New version resets the document to draft pending re-approval
    const result = await query(
      `UPDATE project_documents SET version = $1, file_url = $2, file_type = $3, file_size_bytes = $4,
         status = 'draft', approved_by = NULL, approved_at = NULL, updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [newVersion, value.file_url, value.file_type, value.file_size_bytes, req.params.id]
    );

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'documents', description: `Uploaded v${newVersion} of "${existing.rows[0].title}"`, entityId: req.params.id, entityType: 'project_document' });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/documents/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      category_id: Joi.number().integer().allow(null),
      title: Joi.string(), description: Joi.string().allow(''),
      document_type: Joi.string().valid('drawing', 'contract', 'report', 'photo', 'rfi', 'other'),
      status: Joi.string().valid('draft', 'review', 'archived'),
      tags: Joi.array().items(Joi.string()),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (k === 'tags') { sets.push(`tags = $${idx++}::jsonb`); params.push(JSON.stringify(v)); }
      else { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id);
    const result = await query(`UPDATE project_documents SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Document not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/documents/:id/:action(approve|reject)', authenticate, authorize(), async (req, res) => {
  try {
    const newStatus = req.params.action === 'approve' ? 'approved' : 'rejected';
    const result = await query(
      `UPDATE project_documents SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW() WHERE id = $3 RETURNING *`,
      [newStatus, req.user.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Document not found' });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'documents', description: `Document "${result.rows[0].title}" ${newStatus}`, entityId: req.params.id, entityType: 'project_document' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/documents/:id', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query('DELETE FROM project_documents WHERE id = $1 RETURNING title', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Document not found' });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'delete', module: 'documents', description: `Deleted document "${result.rows[0].title}"`, entityId: req.params.id, entityType: 'project_document' });
    res.json({ success: true, message: 'Document deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ RFIs ============

router.get('/rfis', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`r.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`r.status = $${idx++}`); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT r.*, ru.name as raised_by_name, au.name as answered_by_name,
              (r.status = 'open' AND r.due_date IS NOT NULL AND r.due_date < CURRENT_DATE) as is_overdue
       FROM project_rfis r
       LEFT JOIN users ru ON r.raised_by = ru.id LEFT JOIN users au ON r.answered_by = au.id
       ${where} ORDER BY r.created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/rfis', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      subject: Joi.string().required(),
      question: Joi.string().allow('').optional(),
      category: Joi.string().allow('').optional(),
      priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
      due_date: Joi.date().iso().allow(null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const seq = await query('SELECT COUNT(*) + 1 as next FROM project_rfis WHERE project_id = $1', [value.project_id]);
    const rfiNumber = `RFI-${value.project_id}-${String(seq.rows[0].next).padStart(3, '0')}`;

    const result = await query(
      `INSERT INTO project_rfis (rfi_number, project_id, subject, question, category, priority, due_date, raised_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [rfiNumber, value.project_id, value.subject, value.question, value.category, value.priority, value.due_date, req.user.id]
    );
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'documents', description: `Raised ${rfiNumber}: ${value.subject}`, entityId: result.rows[0].id, entityType: 'project_rfi' });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/rfis/:id/respond', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ answer: Joi.string().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const result = await query(
      `UPDATE project_rfis SET status = 'answered', answer = $1, answered_by = $2, answered_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND status = 'open' RETURNING *`,
      [value.answer, req.user.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'RFI not found or not open' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/rfis/:id/close', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query(
      `UPDATE project_rfis SET status = 'closed', updated_at = NOW() WHERE id = $1 AND status = 'answered' RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'RFI not found or not answered yet' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ SUBMITTALS ============

router.get('/submittals', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`s.project_id = $${idx++}`); params.push(project_id); }
    if (status) { conditions.push(`s.status = $${idx++}`); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT s.*, su.name as submitted_by_name, ru.name as responded_by_name FROM project_submittals s
       LEFT JOIN users su ON s.submitted_by = su.id LEFT JOIN users ru ON s.responded_by = ru.id
       ${where} ORDER BY s.created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/submittals', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      title: Joi.string().required(),
      submittal_type: Joi.string().valid('material', 'shop_drawing', 'sample', 'method').default('material'),
      submitted_to: Joi.string().allow('').optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const seq = await query('SELECT COUNT(*) + 1 as next FROM project_submittals WHERE project_id = $1', [value.project_id]);
    const subNumber = `SUB-${value.project_id}-${String(seq.rows[0].next).padStart(3, '0')}`;

    const result = await query(
      `INSERT INTO project_submittals (submittal_number, project_id, title, submittal_type, submitted_to, submitted_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [subNumber, value.project_id, value.title, value.submittal_type, value.submitted_to, req.user.id]
    );
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'documents', description: `Submitted ${subNumber}: ${value.title}`, entityId: result.rows[0].id, entityType: 'project_submittal' });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/submittals/:id/respond', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      status: Joi.string().valid('under_review', 'approved', 'rejected', 'revised').required(),
      response: Joi.string().allow('').optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const result = await query(
      `UPDATE project_submittals SET status = $1, response = COALESCE($2, response),
         responded_by = $3, responded_at = NOW(), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [value.status, value.response, req.user.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Submittal not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
