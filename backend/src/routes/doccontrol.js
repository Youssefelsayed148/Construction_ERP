const express = require('express');
const { nextNumber } = require('../services/numbering');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity, fireEvent } = require('../utils/activity');

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
      portal_visibility: Joi.string().valid('internal', 'client', 'consultant', 'subcontractor', 'all_external').default('internal'),
      // Phase 21 register dimension
      doc_type: Joi.string().valid('drawing', 'specification', 'contract', 'report', 'method_statement', 'as_built', 'o_m', 'other').default('other'),
      doc_status: Joi.string().valid('draft', 'in_review', 'approved', 'superseded', 'void').default('draft'),
      discipline: Joi.string().valid('architectural', 'structural', 'civil', 'mechanical', 'electrical', 'plumbing', 'hvac', 'fire', 'general').allow(null).optional(),
      project_location_id: Joi.number().integer().allow(null).optional(),
      package: Joi.string().allow('', null).optional(),
      originator_organization_id: Joi.number().integer().allow(null).optional(),
      recipient_organization_id: Joi.number().integer().allow(null).optional(),
      review_due_date: Joi.date().iso().allow(null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const result = await query(
      `INSERT INTO project_documents (project_id, category_id, title, description, document_type, file_url, file_type, file_size_bytes, tags, uploaded_by, portal_visibility,
         doc_type, doc_status, discipline, project_location_id, package, originator_organization_id, recipient_organization_id, review_due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [value.project_id, value.category_id, value.title, value.description, value.document_type,
       value.file_url, value.file_type, value.file_size_bytes, JSON.stringify(value.tags), req.user.id, value.portal_visibility,
       value.doc_type, value.doc_status, value.discipline || null, value.project_location_id || null,
       value.package || null, value.originator_organization_id || null, value.recipient_organization_id || null, value.review_due_date || null]
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

// Upload a new version — bumps version, archives previous file in document_versions.
// Phase 21: the previous current version becomes superseded (immutable), the
// document resets to draft pending re-approval, and the revision code bumps
// (exactly one current revision; superseded files flagged for the UI warning).
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
    const doc = existing.rows[0];

    const newVersion = doc.version + 1;
    const revisionCode = doc.revision_code
      ? `R${(parseInt(String(doc.revision_code).replace(/^R/i, ''), 10) || 0) + 1}`
      : 'R0';
    const result = await query(
      `INSERT INTO document_versions (document_id, version_no, file_url, file_type, file_size_bytes, change_description, uploaded_by, revision_code, is_current, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'current') RETURNING *`,
      [req.params.id, newVersion, value.file_url, value.file_type, value.file_size_bytes, value.change_description, req.user.id, revisionCode]
    );
    // New revision: supersede previous versions + reset the document to draft pending re-approval
    await doccontrolEngine.supersedeForNewRevision(query, req.params.id, revisionCode);
    const updated = await query('SELECT * FROM project_documents WHERE id = $1', [req.params.id]);

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'documents', description: `Uploaded v${newVersion} (${revisionCode}) of "${doc.title}" — previous revision superseded`, entityId: req.params.id, entityType: 'project_document' });
    res.status(201).json({ success: true, data: updated.rows[0], revision: result.rows[0] });
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
      portal_visibility: Joi.string().valid('internal', 'client', 'consultant', 'subcontractor', 'all_external'),
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

// Submit for approval (document controllers submit; approving needs the separate `approve` action).
router.post('/documents/:id/submit', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query(
      `UPDATE project_documents SET status = 'submitted', updated_at = NOW()
        WHERE id = $1 AND status IN ('draft', 'rejected') RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      const exists = await query('SELECT status FROM project_documents WHERE id = $1', [req.params.id]);
      if (exists.rows.length === 0) return res.status(404).json({ success: false, error: 'Document not found' });
      return res.status(409).json({ success: false, error: `A ${exists.rows[0].status} document cannot be submitted` });
    }
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'submit', module: 'documents', description: `Document "${result.rows[0].title}" submitted for approval`, entityId: req.params.id, entityType: 'project_document' });
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

    const rfiNumber = await nextNumber(query, { table: 'project_rfis', column: 'rfi_number', prefix: `RFI-${value.project_id}`, pad: 3 });

    const result = await query(
      `INSERT INTO project_rfis (rfi_number, project_id, subject, question, category, priority, due_date, raised_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [rfiNumber, value.project_id, value.subject, value.question, value.category, value.priority, value.due_date, req.user.id]
    );
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'documents', description: `Raised ${rfiNumber}: ${value.subject}`, entityId: result.rows[0].id, entityType: 'project_rfi' });
    await fireEvent({ eventType: 'rfi.created', entityType: 'project_rfi', entityId: result.rows[0].id, userId: req.user.id, userName: req.user.name, userRole: req.user.role, payload: { project_id: value.project_id, rfi_number: rfiNumber, subject: value.subject, status: 'open' } });
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
    await fireEvent({ eventType: 'rfi.answered', entityType: 'project_rfi', entityId: parseInt(req.params.id, 10), userId: req.user.id, userName: req.user.name, userRole: req.user.role, payload: { project_id: result.rows[0].project_id, rfi_number: result.rows[0].rfi_number, status: 'answered' } });
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
    await fireEvent({ eventType: 'rfi.closed', entityType: 'project_rfi', entityId: parseInt(req.params.id, 10), userId: req.user.id, userName: req.user.name, userRole: req.user.role, payload: { project_id: result.rows[0].project_id, rfi_number: result.rows[0].rfi_number, status: 'closed' } });
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

    const subNumber = await nextNumber(query, { table: 'project_submittals', column: 'submittal_number', prefix: `SUB-${value.project_id}`, pad: 3 });

    const result = await query(
      `INSERT INTO project_submittals (submittal_number, project_id, title, submittal_type, submitted_to, submitted_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [subNumber, value.project_id, value.title, value.submittal_type, value.submitted_to, req.user.id]
    );
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'documents', description: `Submitted ${subNumber}: ${value.title}`, entityId: result.rows[0].id, entityType: 'project_submittal' });
    await fireEvent({ eventType: 'submittal.created', entityType: 'project_submittal', entityId: result.rows[0].id, userId: req.user.id, userName: req.user.name, userRole: req.user.role, payload: { project_id: value.project_id, submittal_number: subNumber, title: value.title, status: 'submitted' } });
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
    await fireEvent({ eventType: `submittal.${value.status}`, entityType: 'project_submittal', entityId: parseInt(req.params.id, 10), userId: req.user.id, userName: req.user.name, userRole: req.user.role, payload: { project_id: result.rows[0].project_id, submittal_number: result.rows[0].submittal_number, status: value.status } });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================================================
// PHASE 21 — enterprise document control: controlled registers, revision
// rules, transmittals, correspondence, auto-numbering, cross-record search.
// The revision-history and approval-reset logic above is kept and extended.
// ============================================================================

const doccontrolEngine = require('../services/doccontrolEngine');
const { renderDocument } = require('../utils/procurementPdf');

const DOC_REGISTER_SELECT = `
  SELECT d.*, dc.name as category_name, COALESCE(oo.name_en, oo.name_ar) as originator_name,
         COALESCE(ro.name_en, ro.name_ar) as recipient_name, u.name as uploaded_by_name,
         au.name as approved_by_name, pl.name as location_name
  FROM project_documents d
  LEFT JOIN document_categories dc ON d.category_id = dc.id
  LEFT JOIN organizations oo ON d.originator_organization_id = oo.id
  LEFT JOIN organizations ro ON d.recipient_organization_id = ro.id
  LEFT JOIN users u ON d.uploaded_by = u.id
  LEFT JOIN users au ON d.approved_by = au.id
  LEFT JOIN project_locations pl ON d.project_location_id = pl.id`;

function sendPdf(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

async function projectNameFor(q, projectId) {
  try {
    const r = await q('SELECT name_en, name_ar FROM projects WHERE id = $1', [projectId]);
    return r.rows[0] ? (r.rows[0].name_en || r.rows[0].name_ar || `Project #${projectId}`) : `Project #${projectId}`;
  } catch (e) { return `Project #${projectId}`; }
}

// ---------------------------------------------------------------------------
// Controlled registers — current documents by type/discipline/package
// ---------------------------------------------------------------------------

router.get('/registers', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, doc_type, discipline, package: pkg, status: docStatus, current } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`d.project_id = $${idx++}`); params.push(project_id); }
    if (doc_type) { conditions.push(`d.doc_type = $${idx++}`); params.push(doc_type); }
    if (discipline) { conditions.push(`d.discipline = $${idx++}`); params.push(discipline); }
    if (pkg) { conditions.push(`d.package = $${idx++}`); params.push(pkg); }
    if (docStatus) { conditions.push(`d.doc_status = $${idx++}`); params.push(docStatus); }
    if (current === 'true') conditions.push(`d.is_current = true`);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`${DOC_REGISTER_SELECT} ${where} ORDER BY d.doc_number NULLS LAST, d.created_at DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Register a document into the controlled register — assigns
// PROJECT-DISCIPLINE-TYPE-SEQ-REV (idempotent per document).
router.post('/documents/:id/register', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ revision_code: Joi.string().allow('', null).optional() });
    const { error, value } = schema.validate(req.body || {});
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const doc = await doccontrolEngine.registerDocument(query, {
      documentId: req.params.id, revisionCode: value.revision_code || 'R0',
    });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'documents', description: `Registered document ${doc.doc_number}`, entityId: doc.id, entityType: 'project_document' });
    res.json({ success: true, data: doc });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// Supersede — point an old document at its replacement.
router.post('/documents/:id/supersede', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({ replacement_document_id: Joi.number().integer().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const doc = await doccontrolEngine.supersedeDocument(query, req.params.id, value.replacement_document_id, req.user);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'documents', description: `Superseded ${doc.doc_number || `#${doc.id}`}`, entityId: doc.id, entityType: 'project_document' });
    res.json({ success: true, data: doc });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// Revision history with current/superseded flags (the superseded warning data).
router.get('/documents/:id/revisions', authenticate, authorize(), async (req, res) => {
  try {
    const doc = (await query('SELECT * FROM project_documents WHERE id = $1', [req.params.id])).rows[0];
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    const versions = (await query(
      `SELECT dv.*, u.name as uploaded_by_name FROM document_versions dv
       LEFT JOIN users u ON dv.uploaded_by = u.id WHERE dv.document_id = $1 ORDER BY dv.version_no DESC`,
      [req.params.id]
    )).rows;
    res.json({ success: true, data: { document: doc, revisions: versions, current_revision_id: (versions.find(v => v.is_current) || {}).id || null } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Transmittals
// ---------------------------------------------------------------------------

const TRANSMITTAL_SELECT = `
  SELECT t.*, COALESCE(so.name_en, so.name_ar) as sender_organization_name,
         COALESCE(ro.name_en, ro.name_ar) as recipient_organization_name,
         su.name as sender_user_name, ru.name as recipient_user_name
  FROM transmittals t
  LEFT JOIN organizations so ON t.sender_organization_id = so.id
  LEFT JOIN organizations ro ON t.recipient_organization_id = ro.id
  LEFT JOIN users su ON t.sender_user_id = su.id
  LEFT JOIN users ru ON t.recipient_user_id = ru.id`;

router.get('/transmittals', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, direction, status } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`t.project_id = $${idx++}`); params.push(project_id); }
    if (direction) { conditions.push(`t.direction = $${idx++}`); params.push(direction); }
    if (status) { conditions.push(`t.status = $${idx++}`); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`${TRANSMITTAL_SELECT} ${where} ORDER BY t.created_at DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/transmittals', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      direction: Joi.string().valid('incoming', 'outgoing').default('outgoing'),
      purpose: Joi.string().allow('', null).optional(),
      sender_organization_id: Joi.number().integer().allow(null).optional(),
      recipient_organization_id: Joi.number().integer().allow(null).optional(),
      recipient_user_id: Joi.number().integer().allow(null).optional(),
      attention: Joi.string().allow('', null).optional(),
      response_due: Joi.date().iso().allow(null).optional(),
      items: Joi.array().items(Joi.object({
        document_id: Joi.number().integer().allow(null).optional(),
        item_description: Joi.string().allow('', null).optional(),
        ref_number: Joi.string().allow('', null).optional(),
        rev_code: Joi.string().allow('', null).optional(),
        copies_note: Joi.string().allow('', null).optional(),
      })).default([]),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const t = await doccontrolEngine.createTransmittal(query, value, req.user);
    for (const item of value.items) {
      await query(
        `INSERT INTO transmittal_items (transmittal_id, document_id, item_description, ref_number, rev_code, copies_note)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [t.id, item.document_id == null ? null : doccontrolEngine.num(item.document_id),
         item.item_description || null, item.ref_number || null, item.rev_code || null, item.copies_note || null]
      );
    }
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'documents', description: `Created transmittal ${t.transmittal_number}`, entityId: t.id, entityType: 'transmittal' });
    res.status(201).json({ success: true, data: t });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/transmittals/:id', authenticate, authorize(), async (req, res) => {
  try {
    const t = (await query(`${TRANSMITTAL_SELECT} WHERE t.id = $1`, [req.params.id])).rows[0];
    if (!t) return res.status(404).json({ success: false, error: 'Transmittal not found' });
    const items = (await query(
      `SELECT ti.*, d.title as document_title, d.doc_number FROM transmittal_items ti
       LEFT JOIN project_documents d ON ti.document_id = d.id WHERE ti.transmittal_id = $1 ORDER BY ti.id`,
      [req.params.id]
    )).rows;
    res.json({ success: true, data: { ...t, items } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/transmittals/:id/items', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      document_id: Joi.number().integer().allow(null).optional(),
      item_description: Joi.string().allow('', null).optional(),
      ref_number: Joi.string().allow('', null).optional(),
      rev_code: Joi.string().allow('', null).optional(),
      copies_note: Joi.string().allow('', null).optional(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO transmittal_items (transmittal_id, document_id, item_description, ref_number, rev_code, copies_note)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, value.document_id || null, value.item_description || null,
       value.ref_number || null, value.rev_code || null, value.copies_note || null]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/transmittals/:id/status', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      status: Joi.string().valid('sent', 'acknowledged', 'closed').required(),
      ack_note: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const t = await doccontrolEngine.transitionTransmittal(query, req.params.id, value.status, req.user, { ackNote: value.ack_note });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'documents', description: `Transmittal ${t.transmittal_number} → ${value.status}`, entityId: t.id, entityType: 'transmittal' });
    res.json({ success: true, data: t });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.get('/transmittals/:id/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const t = (await query(`${TRANSMITTAL_SELECT} WHERE t.id = $1`, [req.params.id])).rows[0];
    if (!t) return res.status(404).json({ success: false, error: 'Transmittal not found' });
    const items = (await query('SELECT * FROM transmittal_items WHERE transmittal_id = $1 ORDER BY id', [req.params.id])).rows;
    const name = await projectNameFor(query, t.project_id);
    const pdf = await renderDocument({
      docType: `TRANSMITTAL — ${t.direction.toUpperCase()}`,
      number: t.transmittal_number,
      date: t.created_at,
      meta: [
        ['Project', name],
        ['Direction', t.direction],
        ['Attention', t.attention || '-'],
        ['Recipient org', t.recipient_organization_name || '-'],
        ['Response due', t.response_due || '-'],
        ['Status', t.status],
      ],
      columns: ['#', 'Document', 'Ref', 'Rev', 'Description', 'Copies'],
      rows: items.map((it, i) => [
        String(i + 1),
        it.document_title || '-',
        it.ref_number || '-',
        it.rev_code || '-',
        it.item_description || '-',
        it.copies_note || '-',
      ]),
      notes: t.purpose || null,
    });
    sendPdf(res, pdf, `${t.transmittal_number}.pdf`);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Correspondence
// ---------------------------------------------------------------------------

const CORR_SELECT = `
  SELECT c.*, COALESCE(so.name_en, so.name_ar) as sender_organization_name,
         COALESCE(ro.name_en, ro.name_ar) as recipient_organization_name,
         su.name as sender_user_name
  FROM correspondence c
  LEFT JOIN organizations so ON c.sender_organization_id = so.id
  LEFT JOIN organizations ro ON c.recipient_organization_id = ro.id
  LEFT JOIN users su ON c.sender_user_id = su.id`;

router.get('/correspondence', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, corr_type, direction, status } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`c.project_id = $${idx++}`); params.push(project_id); }
    if (corr_type) { conditions.push(`c.corr_type = $${idx++}`); params.push(corr_type); }
    if (direction) { conditions.push(`c.direction = $${idx++}`); params.push(direction); }
    if (status) { conditions.push(`c.status = $${idx++}`); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(`${CORR_SELECT} ${where} ORDER BY c.created_at DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/correspondence', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      direction: Joi.string().valid('incoming', 'outgoing').default('outgoing'),
      corr_type: Joi.string().valid('letter', 'notice', 'instruction', 'claim').default('letter'),
      subject: Joi.string().required(),
      body: Joi.string().allow('', null).optional(),
      sender_organization_id: Joi.number().integer().allow(null).optional(),
      recipient_organization_id: Joi.number().integer().allow(null).optional(),
      recipient_user_id: Joi.number().integer().allow(null).optional(),
      linked_entity_type: Joi.string().allow('', null).optional(),
      linked_entity_id: Joi.number().integer().allow(null).optional(),
      contract_ref: Joi.string().allow('', null).optional(),
      response_due: Joi.date().iso().allow(null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const c = await doccontrolEngine.createCorrespondence(query, value, req.user);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'documents', description: `Created ${value.corr_type} ${c.corr_number}: ${value.subject.slice(0, 60)}`, entityId: c.id, entityType: 'correspondence' });
    res.status(201).json({ success: true, data: c });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/correspondence/:id', authenticate, authorize(), async (req, res) => {
  try {
    const c = (await query(`${CORR_SELECT} WHERE c.id = $1`, [req.params.id])).rows[0];
    if (!c) return res.status(404).json({ success: false, error: 'Correspondence not found' });
    const history = (await query(
      `SELECT h.*, u.name as changed_by_name FROM correspondence_history h
       LEFT JOIN users u ON h.changed_by = u.id WHERE h.correspondence_id = $1 ORDER BY h.id DESC`,
      [req.params.id]
    )).rows;
    res.json({ success: true, data: { ...c, history } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/correspondence/:id/status', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      status: Joi.string().valid('sent', 'responded', 'closed').required(),
      note: Joi.string().allow('', null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const c = await doccontrolEngine.transitionCorrespondence(query, req.params.id, value.status, req.user, { note: value.note });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'documents', description: `${c.corr_number} → ${value.status}`, entityId: c.id, entityType: 'correspondence' });
    res.json({ success: true, data: c });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

// Amend — revision-safe content change with an immutable history row.
router.post('/correspondence/:id/amend', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      body: Joi.string().allow('', null).optional(),
      subject: Joi.string().allow('', null).optional(),
      note: Joi.string().allow('', null).optional(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const c = await doccontrolEngine.amendCorrespondence(query, req.params.id, req.user, value);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'documents', description: `${c.corr_number} amended to revision ${c.revision}`, entityId: c.id, entityType: 'correspondence' });
    res.json({ success: true, data: c });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.get('/correspondence/:id/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const c = (await query(`${CORR_SELECT} WHERE c.id = $1`, [req.params.id])).rows[0];
    if (!c) return res.status(404).json({ success: false, error: 'Correspondence not found' });
    const name = await projectNameFor(query, c.project_id);
    const pdf = await renderDocument({
      docType: `CORRESPONDENCE — ${c.corr_type.toUpperCase()}`,
      number: `${c.corr_number} (rev ${c.revision})`,
      date: c.created_at,
      meta: [
        ['Project', name],
        ['Subject', c.subject],
        ['Sender', c.sender_organization_name || c.sender_user_name || '-'],
        ['Recipient', c.recipient_organization_name || '-'],
        ['Contract ref', c.contract_ref || '-'],
        ['Response due', c.response_due || '-'],
        ['Status', c.status],
      ],
      columns: ['#', ''],
      rows: [['', c.body || '']],
      notes: c.linked_entity_type ? `Linked record: ${c.linked_entity_type} #${c.linked_entity_id}` : null,
    });
    sendPdf(res, pdf, `${c.corr_number}.pdf`);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Auto-numbering settings + numbering endpoints
// ---------------------------------------------------------------------------

router.get('/numbering/:project_id', authenticate, authorize(), async (req, res) => {
  try {
    const settings = await doccontrolEngine.loadSettings(query, req.params.project_id);
    res.json({ success: true, data: settings });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/numbering/:project_id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      doc_prefix: Joi.string().allow('', null),
      include_discipline: Joi.boolean(),
      include_type: Joi.boolean(),
      seq_pad: Joi.number().integer().min(1).max(10),
      rev_prefix: Joi.string().allow('', null),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    await doccontrolEngine.loadSettings(query, req.params.project_id); // ensure the row exists
    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      sets.push(`${k} = $${idx++}`); params.push(v);
    }
    sets.push(`updated_at = NOW()`);
    params.push(req.params.project_id);
    const r = await query(`UPDATE project_numbering_settings SET ${sets.join(', ')} WHERE project_id = $${idx} RETURNING *`, params);
    res.json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Cross-record search — documents (current + historical revisions),
// transmittals, correspondence, RFIs and submittals, permission-filtered.
// ---------------------------------------------------------------------------

router.get('/search', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id, q: term, limit = 50 } = req.query;
    if (!term || !term.trim()) return res.json({ success: true, data: [] });
    const like = `%${term.trim()}%`;
    const externalRoles = ['consultant', 'client', 'subcontractor', 'supplier'];
    const isExternal = externalRoles.includes(req.user.role);

    const results = [];
    // Documents — every revision matches, visibility resolved per revision's document.
    const docs = await query(
      `SELECT d.id, d.doc_number, d.title, d.document_type, d.doc_type, d.status, d.doc_status,
              d.is_current, d.revision_code, d.created_at, d.portal_visibility
       FROM project_documents d
       WHERE ($1::text IS NULL OR d.project_id::text = $1)
         AND (d.title ILIKE $2 OR d.description ILIKE $2 OR d.doc_number ILIKE $2 OR d.revision_code ILIKE $2)
       ORDER BY d.created_at DESC LIMIT $3`,
      [project_id || null, like, parseInt(limit, 10)]
    );
    for (const d of docs.rows) {
      if (isExternal && d.portal_visibility !== 'all_external' && d.portal_visibility !== externalRolesKey(req.user.role)) continue;
      results.push({ record_type: 'document', id: d.id, number: d.doc_number, title: d.title, type: d.doc_type || d.document_type, status: d.doc_status || d.status, is_current: d.is_current, revision: d.revision_code, created_at: d.created_at, url: `/projects/documents?doc=${d.id}` });
    }
    const trans = await query(
      `SELECT t.id, t.transmittal_number, t.direction, t.status, t.created_at, t.purpose
       FROM transmittals t WHERE ($1::text IS NULL OR t.project_id::text = $1)
         AND (t.transmittal_number ILIKE $2 OR COALESCE(t.purpose,'') ILIKE $2 OR t.attention ILIKE $2)`,
      [project_id || null, like]
    );
    for (const t of trans.rows) {
      results.push({ record_type: 'transmittal', id: t.id, number: t.transmittal_number, title: t.purpose || t.direction, type: t.direction, status: t.status, created_at: t.created_at, url: `/projects/documents?transmittal=${t.id}` });
    }
    const corr = await query(
      `SELECT c.id, c.corr_number, c.corr_type, c.subject, c.status, c.created_at
       FROM correspondence c WHERE ($1::text IS NULL OR c.project_id::text = $1)
         AND (c.corr_number ILIKE $2 OR c.subject ILIKE $2 OR COALESCE(c.body,'') ILIKE $2)`,
      [project_id || null, like]
    );
    for (const c of corr.rows) {
      results.push({ record_type: 'correspondence', id: c.id, number: c.corr_number, title: c.subject, type: c.corr_type, status: c.status, created_at: c.created_at, url: `/projects/documents?corr=${c.id}` });
    }
    const rfis = await query(
      `SELECT r.id, r.rfi_number, r.subject, r.status, r.created_at
       FROM project_rfis r WHERE ($1::text IS NULL OR r.project_id::text = $1)
         AND (r.rfi_number ILIKE $2 OR r.subject ILIKE $2 OR COALESCE(r.question,'') ILIKE $2)`,
      [project_id || null, like]
    );
    for (const r of rfis.rows) {
      results.push({ record_type: 'rfi', id: r.id, number: r.rfi_number, title: r.subject, type: 'rfi', status: r.status, created_at: r.created_at, url: `/projects/documents?rfi=${r.id}` });
    }
    const subs = await query(
      `SELECT s.id, s.submittal_number, s.title, s.status, s.created_at
       FROM project_submittals s WHERE ($1::text IS NULL OR s.project_id::text = $1)
         AND (s.submittal_number ILIKE $2 OR s.title ILIKE $2)`,
      [project_id || null, like]
    );
    for (const s of subs.rows) {
      results.push({ record_type: 'submittal', id: s.id, number: s.submittal_number, title: s.title, type: 'submittal', status: s.status, created_at: s.created_at, url: `/projects/documents?submittal=${s.id}` });
    }
    res.json({ success: true, data: results.slice(0, parseInt(limit, 10)) });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

function externalRolesKey(role) {
  return role; // portal_visibility values include 'client' / 'consultant' / 'subcontractor'
}

module.exports = router;
