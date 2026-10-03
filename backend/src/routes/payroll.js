const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { isReferenceViolation, recordInUse } = require('../utils/references');
const { logActivity } = require('../utils/activity');
const { journalPayrollPosted } = require('../utils/journal');

router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const { month, year, status, limit = 50 } = req.query;
    let conds = []; let p = []; let i = 1;
    if (month) { conds.push(`month = $${i++}`); p.push(parseInt(month)); }
    if (year) { conds.push(`year = $${i++}`); p.push(parseInt(year)); }
    if (status) { conds.push(`status = $${i++}`); p.push(status); }
    const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const data = await query(`SELECT * FROM payroll_periods ${w} ORDER BY year DESC, month DESC LIMIT $${i++}`, [...p, parseInt(limit)]);
    res.json({ success: true, data: data.rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const period = await query('SELECT * FROM payroll_periods WHERE id = $1', [req.params.id]);
    if (period.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });

    const details = await query(
      `SELECT pd.*, e.name, e.code as emp_code FROM payroll_details pd LEFT JOIN employees e ON pd.employee_id = e.id WHERE pd.payroll_id = $1`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...period.rows[0], details: details.rows } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/', authenticate, authorize('owner', 'admin', 'finance_manager'), async (req, res) => {
  try {
    const schema = Joi.object({
      period_name: Joi.string().optional(), month: Joi.number().integer().min(1).max(12).required(),
      year: Joi.number().integer().required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const existing = await query('SELECT id FROM payroll_periods WHERE month = $1 AND year = $2', [value.month, value.year]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Payroll period already exists for this month/year' });

    const employees = await query("SELECT * FROM employees WHERE status = 'active'");
    const pname = value.period_name || `Payroll ${value.month}/${value.year}`;

    const result = await transaction(async (client) => {
      const period = await client.query(
        `INSERT INTO payroll_periods (period_name, month, year, total_employees, total_basic_salary, total_net_salary, created_by)
         VALUES ($1,$2,$3,$4,0,0,$5) RETURNING *`,
        [pname, value.month, value.year, employees.rows.length, req.user.id]
      );
      const pid = period.rows[0].id;
      let totalBasic = 0, totalNet = 0;

      for (const emp of employees.rows) {
        const net = parseFloat(emp.salary || 0);
        totalBasic += net;
        totalNet += net;
        await client.query(
          `INSERT INTO payroll_details (payroll_id, employee_id, basic_salary, allowances, deductions, net_salary) VALUES ($1,$2,$3,0,0,$3)`,
          [pid, emp.id, net]
        );
      }

      const updated = await client.query(
        `UPDATE payroll_periods SET total_basic_salary = $1, total_net_salary = $2 WHERE id = $3 RETURNING *`,
        [totalBasic, totalNet, pid]
      );
      return updated.rows[0];
    });

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'payroll', description: `Created payroll for ${value.month}/${value.year}`, entityId: result.id, entityType: 'payroll_period' });
    res.status(201).json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id', authenticate, authorize(), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM payroll_periods WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });

    const schema = Joi.object({ status: Joi.string(), posted_to_finance: Joi.boolean() }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const p = []; let i = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) { sets.push(`${k} = $${i++}`); p.push(v); }
    }
    p.push(req.params.id);
    const r = await query(`UPDATE payroll_periods SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, p);

    if (value.posted_to_finance) {
      journalPayrollPosted(r.rows[0]).catch(e => console.error('[JOURNAL] Payroll entry failed:', e.message));
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'post_to_finance', module: 'payroll', description: `Posted payroll to finance`, entityId: req.params.id, entityType: 'payroll_period' });
    }

    res.json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const r = await query('DELETE FROM payroll_periods WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) {
    if (isReferenceViolation(e)) return recordInUse(res, 'Payroll period');   // it has payroll details
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
