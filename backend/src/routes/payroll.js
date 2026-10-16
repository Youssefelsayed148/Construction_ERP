const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { queryPaginated } = require('../utils/pagination');
const { authenticate, authorize } = require('../middleware/auth');
const { isReferenceViolation, recordInUse } = require('../utils/references');
const { logActivity } = require('../utils/activity');
const { auditedMutation } = require('../utils/auditedMutation');
const { journalPayrollPosted } = require('../utils/journal');
const costAccrual = require('../services/costAccrual');

router.get('/', authenticate, authorize(), async (req, res) => {
  try {
    const { month, year, status } = req.query;
    let conds = []; let p = []; let i = 1;
    if (month) { conds.push(`month = $${i++}`); p.push(parseInt(month)); }
    if (year) { conds.push(`year = $${i++}`); p.push(parseInt(year)); }
    if (status) { conds.push(`status = $${i++}`); p.push(status); }
    const w = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const data = await queryPaginated(req, res, query, { sql: `SELECT * FROM payroll_periods ${w}`, params: p, orderBy: [{ column: 'year', direction: 'DESC' }, { column: 'month', direction: 'DESC' }] });
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
      await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'payroll', description: `Created payroll for ${value.month}/${value.year}`, entityId: pid, entityType: 'payroll_period' }, { query: client.query.bind(client) });
      return updated.rows[0];
    });
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
    // The update and, the first time it is posted to finance, its ledger entry commit together.
    const r = await auditedMutation(req, { action: 'update', module: 'payroll', entityType: 'payroll_period' }, async (q) => {
      const locked = await q('SELECT * FROM payroll_periods WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!locked.rows[0]) return { skipAudit: true };
      const alreadyPosted = locked.rows[0].posted_to_finance === true;
      const updated = await q(`UPDATE payroll_periods SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`, p);
      if (value.posted_to_finance && !alreadyPosted) {
        await journalPayrollPosted(q, updated.rows[0], req.user.id);
        await costAccrual.allocatePayrollCost(q, updated.rows[0]);
      }
      // Every change is audited (status moves included), not only the finance posting.
      const posted = value.posted_to_finance && !alreadyPosted;
      return {
        data: updated.rows[0], entityId: locked.rows[0].id, action: posted ? 'post_to_finance' : 'update',
        before: locked.rows[0], after: updated.rows[0], oldStatus: locked.rows[0].status, newStatus: updated.rows[0].status,
        amount: posted ? Number(updated.rows[0].total_net_salary) : undefined,
        description: posted ? 'Posted payroll to finance' : `Updated payroll period ${locked.rows[0].period_name}`,
      };
    });

    if (!r.data) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: r.data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const r = await auditedMutation(req, { action: 'delete', module: 'payroll', entityType: 'payroll_period' }, async (q) => {
      const deleted = await q('DELETE FROM payroll_periods WHERE id = $1 RETURNING *', [req.params.id]);
      if (deleted.rows.length === 0) return { skipAudit: true };
      return { data: deleted.rows[0], entityId: deleted.rows[0].id, before: deleted.rows[0], description: `Deleted payroll period ${deleted.rows[0].period_name}` };
    });
    if (!r.data) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (e) {
    if (isReferenceViolation(e)) return recordInUse(res, 'Payroll period');   // it has payroll details
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
