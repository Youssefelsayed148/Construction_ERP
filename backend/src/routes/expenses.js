const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { journalExpenseCreated } = require('../utils/journal');

const EXPENSE_CATEGORIES = ['materials', 'labor', 'equipment', 'fuel', 'maintenance', 'transport', 'utilities', 'rent', 'office', 'legal', 'insurance', 'other'];

router.get('/categories', authenticate, authorize(), (req, res) => {
  res.json({ success: true, data: EXPENSE_CATEGORIES });
});

router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const { category, status, project_id, limit = 100, offset = 0 } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (category && EXPENSE_CATEGORIES.includes(category)) { conditions.push(`category = $${idx++}`); params.push(category); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (project_id) { conditions.push(`project_id = $${idx++}`); params.push(parseInt(project_id)); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const dataResult = await query(`SELECT e.*, u.name as created_by_name, p.name_ar as project_name_ar, p.name_en as project_name_en, p.code as project_code FROM expenses e LEFT JOIN users u ON e.created_by = u.id LEFT JOIN projects p ON e.project_id = p.id ${where} ORDER BY e.date DESC, e.created_at DESC LIMIT $${idx++} OFFSET $${idx}`, [...params, parseInt(limit), parseInt(offset)]);
    res.json({ success: true, data: dataResult.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query('SELECT e.*, u.name as created_by_name FROM expenses e LEFT JOIN users u ON e.created_by = u.id WHERE e.id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Expense not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      category: Joi.string().valid(...EXPENSE_CATEGORIES).required(),
      description: Joi.string().allow(''), amount: Joi.number().positive().required(),
      date: Joi.date().iso().optional(), project_id: Joi.number().integer().optional().allow(null),
      paid_by: Joi.string().allow(''), notes: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const result = await query(
      `INSERT INTO expenses (category, description, amount, date, project_id, paid_by, notes, created_by)
       VALUES ($1,$2,$3,COALESCE($4,CURRENT_DATE),$5,$6,$7,$8) RETURNING *`,
      [value.category, value.description, value.amount, value.date, value.project_id || null, value.paid_by, value.notes, req.user.id]
    );

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'expenses', description: `Created expense: ${value.category} - ${value.amount} EGP`, entityId: result.rows[0].id, entityType: 'expense', amount: value.amount });

    journalExpenseCreated(result.rows[0]).catch(e => console.error('[JOURNAL] Expense entry failed:', e.message));

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM expenses WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Expense not found' });

    const schema = Joi.object({
      category: Joi.string().valid(...EXPENSE_CATEGORIES), description: Joi.string().allow(''),
      amount: Joi.number().positive(), date: Joi.date().iso(),
      project_id: Joi.number().integer().optional().allow(null), paid_by: Joi.string().allow(''),
      notes: Joi.string().allow(''), status: Joi.string().valid('pending', 'approved', 'rejected'),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id);
    const result = await query(`UPDATE expenses SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, params);

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'expenses', description: `Updated expense #${req.params.id}`, entityId: req.params.id, entityType: 'expense' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const result = await query('DELETE FROM expenses WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Expense not found' });
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'delete', module: 'expenses', description: `Deleted expense #${req.params.id}`, entityId: req.params.id, entityType: 'expense' });
    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
