const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// -- Employees --
// TODO(phase-4): employees are a company-wide directory; all authenticated users can read (HR uses this widely). Owner|admin can read is_active=false.
router.get('/employees', authenticate, async (req, res) => {
  try {
    const { department, status, search, is_manager, limit = 100 } = req.query;
    let conds = []; let p = []; let i = 1;
    if (department) { conds.push(`department = $${i++}`); p.push(department); }
    if (status) { conds.push(`status = $${i++}`); p.push(status); }
    if (is_manager === 'true') { conds.push(`is_manager = true`); }
    if (search) { conds.push(`(code ILIKE $${i} OR name ILIKE $${i} OR name_en ILIKE $${i} OR name_ar ILIKE $${i})`); p.push(`%${search}%`); i++; }
    const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const data = await query(`SELECT * FROM employees ${w} ORDER BY name LIMIT $${i++} OFFSET 0`, [...p, parseInt(limit)]);
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// TODO(phase-4): same policy as GET /employees (directory read).
router.get('/employees/:id', authenticate, async (req, res) => {
  try {
    const r = await query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Employee not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/employees', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string().optional(), name_ar: Joi.string().required(), name_en: Joi.string().allow(''),
      phone: Joi.string().allow(''), email: Joi.string().email().allow(''),
      national_id: Joi.string().allow(''), department: Joi.string().allow(''),
      designation: Joi.string().allow(''), hire_date: Joi.date().iso().allow(null),
      salary: Joi.number().min(0).default(0), bank_name: Joi.string().allow(''),
      bank_account: Joi.string().allow(''), status: Joi.string().valid('active', 'inactive', 'on_leave', 'terminated').optional(),
      is_manager: Joi.boolean().default(false),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    if (!value.code) {
      const cnt = await query("SELECT COUNT(*) as c FROM employees WHERE code LIKE 'EMP-%'");
      value.code = `EMP-${String(parseInt(cnt.rows[0].c) + 1).padStart(4, '0')}`;
    }

    const r = await query(
      `INSERT INTO employees (code, name, name_ar, name_en, phone, email, national_id, department, designation, hire_date, salary, bank_name, bank_account, is_manager)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [value.code, value.name_ar, value.name_ar, value.name_en || value.name_ar, value.phone, value.email, value.national_id, value.department, value.designation, value.hire_date, value.salary, value.bank_name, value.bank_account, value.is_manager]
    );

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'hr', description: `Created employee ${value.code}`, entityId: r.rows[0].id, entityType: 'employee' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/employees/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Employee not found' });

    const schema = Joi.object({
      name_ar: Joi.string(), name_en: Joi.string().allow(''), phone: Joi.string().allow(''),
      email: Joi.string().email().allow(''), department: Joi.string().allow(''),
      designation: Joi.string().allow(''), salary: Joi.number().min(0),
      bank_name: Joi.string().allow(''), bank_account: Joi.string().allow(''),
      status: Joi.string().valid('active', 'inactive', 'on_leave', 'terminated'),
      hire_date: Joi.date().iso().allow(null),
      is_manager: Joi.boolean(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    if (value.name_ar) value.name = value.name_ar;

    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); }
    }
    p.push(req.params.id);
    const r = await query(`UPDATE employees SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, p);

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'hr', description: `Updated employee ${existing.rows[0].code}`, entityId: req.params.id, entityType: 'employee' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/employees/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const r = await query('DELETE FROM employees WHERE id = $1 RETURNING code', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Employee not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// -- Attendance --
// TODO(phase-4): site engineers see rows for their project only; HR sees all. Filter at the SQL layer using user_project_roles joined via attendance.project_id.
router.get('/attendance', authenticate, async (req, res) => {
  try {
    const { employee_id, date, from_date, to_date, limit = 100 } = req.query;
    let conds = []; let p = []; let i = 1;
    if (employee_id) { conds.push(`employee_id = $${i++}`); p.push(parseInt(employee_id)); }
    if (date) { conds.push(`date = $${i++}`); p.push(date); }
    if (from_date && to_date) { conds.push(`date BETWEEN $${i++} AND $${i++}`); p.push(from_date, to_date); }
    const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const data = await query(`SELECT a.*, e.name FROM attendance a LEFT JOIN employees e ON a.employee_id = e.id ${w} ORDER BY date DESC LIMIT $${i++}`, [...p, parseInt(limit)]);
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// TODO(phase-4): site engineers may post attendance for their project; HR may post for any. Joi should accept project_id (column added in migrate-16.js).
router.post('/attendance', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      employee_id: Joi.number().integer().required(), date: Joi.date().iso().required(),
      status: Joi.string().valid('present', 'absent', 'late', 'on_leave').default('present'),
      check_in: Joi.string().allow(''), check_out: Joi.string().allow(''), notes: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const existing = await query('SELECT id FROM attendance WHERE employee_id = $1 AND date = $2', [value.employee_id, value.date]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Attendance already recorded for this date' });

    const r = await query(
      `INSERT INTO attendance (employee_id, date, status, check_in, check_out, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [value.employee_id, value.date, value.status, value.check_in, value.check_out, value.notes]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// -- Leave Requests --
// TODO(phase-4): employees see their own; managers see their team (employees.is_manager=true chain); HR sees all.
router.get('/leaves', authenticate, async (req, res) => {
  try {
    const { employee_id, status } = req.query;
    let conds = []; let p = []; let i = 1;
    if (employee_id) { conds.push(`lr.employee_id = $${i++}`); p.push(parseInt(employee_id)); }
    if (status) { conds.push(`lr.status = $${i++}`); p.push(status); }
    const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const data = await query(`SELECT lr.*, e.name FROM leave_requests lr LEFT JOIN employees e ON lr.employee_id = e.id ${w} ORDER BY created_at DESC LIMIT 100`, p);
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// TODO(phase-4): an employee may file a leave for themselves; an HR user may file for anyone. Otherwise reject.
router.post('/leaves', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      employee_id: Joi.number().integer().required(), leave_type: Joi.string().optional(),
      start_date: Joi.date().iso().required(), end_date: Joi.date().iso().required(),
      reason: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const r = await query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [value.employee_id, value.leave_type, value.start_date, value.end_date, value.reason]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/leaves/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });

    const r = await query(
      `UPDATE leave_requests SET status = $1, reviewed_by = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [status, req.user.id, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Leave request not found' });

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: status === 'approved' ? 'approve' : 'reject', module: 'hr', description: `${status === 'approved' ? 'Approved' : 'Rejected'} leave request #${req.params.id}`, entityId: req.params.id, entityType: 'leave_request' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// -- Daily Laborers --
// TODO(phase-4): directory read — open to all authenticated users (used by site engineers to pick a worker for a labour payment).
const SKILLS = ['mason', 'carpenter', 'electrician', 'steel_fixer', 'plumber', 'painter', 'tiler', 'general'];

router.get('/laborers', authenticate, async (req, res) => {
  try {
    const { skill_category, is_active, search, limit = 100 } = req.query;
    let conds = []; let p = []; let i = 1;
    if (skill_category && SKILLS.includes(skill_category)) { conds.push(`skill_category = $${i++}`); p.push(skill_category); }
    if (is_active !== undefined) { conds.push(`is_active = $${i++}`); p.push(is_active === 'true'); }
    if (search) { conds.push(`(code ILIKE $${i} OR full_name ILIKE $${i})`); p.push(`%${search}%`); i++; }
    const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const data = await query(`SELECT * FROM daily_laborers ${w} ORDER BY full_name LIMIT $${i++}`, [...p, parseInt(limit)]);
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// TODO(phase-4): static enum read — open to all authenticated users.
router.get('/laborers/skills', authenticate, (req, res) => res.json({ success: true, data: SKILLS }));

// TODO(phase-4): directory read — open to all authenticated users.
router.get('/laborers/:id', authenticate, async (req, res) => {
  try {
    const r = await query('SELECT * FROM daily_laborers WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Laborer not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// TODO(phase-4): owner|admin|hr_manager (or site_engineer for new roster additions on the day).
router.post('/laborers', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string().optional(), full_name: Joi.string().required(),
      full_name_en: Joi.string().allow(''), national_id: Joi.string().allow(''),
      phone: Joi.string().allow(''), skill_category: Joi.string().valid(...SKILLS).default('general'),
      daily_rate: Joi.number().min(0).default(0), bank_account: Joi.string().allow(''),
      is_active: Joi.boolean().optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    if (!value.code) {
      const cnt = await query("SELECT COUNT(*) as c FROM daily_laborers WHERE code LIKE 'DL-%'");
      value.code = `DL-${String(parseInt(cnt.rows[0].c) + 1).padStart(4, '0')}`;
    }

    const r = await query(
      `INSERT INTO daily_laborers (code, full_name, full_name_en, national_id, phone, skill_category, daily_rate, bank_account, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [value.code, value.full_name, value.full_name_en, value.national_id, value.phone, value.skill_category, value.daily_rate, value.bank_account, value.is_active !== undefined ? value.is_active : true]
    );

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'hr', description: `Created daily laborer ${value.code}`, entityId: r.rows[0].id, entityType: 'daily_laborer' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// TODO(phase-4): owner|admin|hr_manager.
router.put('/laborers/:id', authenticate, async (req, res) => {
  try {
    const existing = await query('SELECT * FROM daily_laborers WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Laborer not found' });

    const schema = Joi.object({
      full_name: Joi.string(), full_name_en: Joi.string().allow(''), national_id: Joi.string().allow(''),
      phone: Joi.string().allow(''), skill_category: Joi.string().valid(...SKILLS),
      daily_rate: Joi.number().min(0), bank_account: Joi.string().allow(''),
      is_active: Joi.boolean(),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); }
    }
    p.push(req.params.id);
    const r = await query(`UPDATE daily_laborers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, p);

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'hr', description: `Updated daily laborer ${existing.rows[0].code}`, entityId: req.params.id, entityType: 'daily_laborer' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// TODO(phase-4): owner|admin only; soft-deactivate (is_active=false) to preserve labor_payments history rather than DELETE.
router.delete('/laborers/:id', authenticate, async (req, res) => {
  try {
    const r = await query('DELETE FROM daily_laborers WHERE id = $1 RETURNING code', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Laborer not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// -- Labor Payments --
// TODO(phase-4): site engineers see their project's payments; owner|admin|finance_manager see all.
router.get('/labor-payments', authenticate, async (req, res) => {
  try {
    const { project_id, laborer_id, limit = 100 } = req.query;
    let conds = []; let p = []; let i = 1;
    if (project_id) { conds.push(`lp.project_id = $${i++}`); p.push(parseInt(project_id)); }
    if (laborer_id) { conds.push(`lp.laborer_id = $${i++}`); p.push(parseInt(laborer_id)); }
    const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const data = await query(`SELECT lp.*, dl.full_name, dl.code as laborer_code FROM labor_payments lp LEFT JOIN daily_laborers dl ON lp.laborer_id = dl.id ${w} ORDER BY payment_date DESC LIMIT $${i++}`, [...p, parseInt(limit)]);
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// TODO(phase-4): site engineers may post payments on their project; finance_manager can post any; verify laborer is in the project's daily roster.
router.post('/labor-payments', authenticate, async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(), laborer_id: Joi.number().integer().required(),
      work_order_id: Joi.number().integer().optional().allow(null),
      payment_date: Joi.date().iso().required(), days_worked: Joi.number().min(0).default(1),
      daily_rate: Joi.number().min(0).default(0), paid_by: Joi.string().allow(''), notes: Joi.string().allow(''),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const total_amount = value.days_worked * value.daily_rate;

    const r = await query(
      `INSERT INTO labor_payments (project_id, laborer_id, work_order_id, payment_date, days_worked, daily_rate, total_amount, paid_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [value.project_id, value.laborer_id, value.work_order_id || null, value.payment_date, value.days_worked, value.daily_rate, total_amount, value.paid_by, value.notes]
    );

    // Fire event for job costing (Phase 5 listener)
    const { fireEvent } = require('../utils/activity');
    fireEvent({
      eventType: 'labor_payment.created',
      entityType: 'labor_payment',
      entityId: r.rows[0].id,
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      payload: { project_id: value.project_id, amount: total_amount, laborer_id: value.laborer_id }
    }).catch(() => {});

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'hr', description: `Labor payment: ${total_amount} EGP`, entityId: r.rows[0].id, entityType: 'labor_payment', amount: total_amount });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// TODO(phase-4): owner|admin|finance_manager only; a deleted payment must fire a compensating event so project_costs can be unwound.
router.delete('/labor-payments/:id', authenticate, async (req, res) => {
  try {
    const r = await query('DELETE FROM labor_payments WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Payment not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
