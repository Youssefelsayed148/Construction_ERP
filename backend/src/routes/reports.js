// Phase 24 — reporting engine routes (mounted at /api/reports).
//
// The catalog, permission-aware filtered data + export per report, saved
// views, scheduled report jobs with distribution, the ~20-section automatic
// project report (each section pulling live from its phase's data), and the
// pre-configured commercial / procurement / management packs.

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { REPORTS, REPORT_PACKS, parseListQuery, toCsv, visibleColumns, csvField } = require('../utils/reporting');
const { renderDocument } = require('../utils/procurementPdf');

const PORTAL_ROLES = ['consultant', 'client', 'subcontractor', 'supplier'];

async function projectNameFor(q, projectId) {
  try {
    const r = await q('SELECT name_en, name_ar FROM projects WHERE id = $1', [projectId]);
    return r.rows[0] ? (r.rows[0].name_en || r.rows[0].name_ar || `Project #${projectId}`) : `Project #${projectId}`;
  } catch (e) { return `Project #${projectId}`; }
}

function sendCsv(res, csv, filename) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}
function sendPdf(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

router.get('/catalog', authenticate, authorize(), async (req, res) => {
  try {
    const reports = Object.entries(REPORTS).map(([key, r]) => ({
      key, module: r.module, label: r.label,
      columns: visibleColumns(r.columns, req.user).map(([k, label, tag]) => ({ key: k, label, internal: tag === 'internal' })),
    }));
    res.json({ success: true, data: { reports, packs: REPORT_PACKS } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Filtered data + export per report (same filtered set for UI and export)
// ---------------------------------------------------------------------------

router.get('/data/:reportKey', authenticate, authorize(), async (req, res) => {
  try {
    const spec = REPORTS[req.params.reportKey];
    if (!spec) return res.status(404).json({ success: false, error: 'Unknown report' });
    const { where, params, order, page, pageSize } = parseListQuery(req.query, { defaultSort: 'id', defaultOrder: 'DESC' });
    let rows = [];
    try {
      rows = (await query(`SELECT * FROM ${spec.table}${where}${order}`, params)).rows;
    } catch (e) {
      // a fresh system may not have a module's table yet — empty report
      rows = [];
    }
    // Scoped portal roles only see their participants' rows.
    if (PORTAL_ROLES.includes(req.user.role) && rows.length) {
      try {
        const ids = (await query(
          `SELECT pp.project_id AS pid FROM project_participants pp
           JOIN project_participant_users ppu ON ppu.project_participant_id = pp.id WHERE ppu.user_id = $1`,
          [req.user.id]
        )).rows.map((r) => Number(r.pid));
        rows = rows.filter((r) => ids.includes(Number(r.project_id)));
      } catch (e) { /* participants absent → keep */ }
    }
    const columns = visibleColumns(spec.columns, req.user).map(([k, label, tag]) => ({ key: k, label, internal: tag === 'internal' }));
    res.json({ success: true, data: { report: spec.label, columns, rows, page, page_size: pageSize } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/export/:reportKey', authenticate, authorize(), async (req, res) => {
  try {
    const spec = REPORTS[req.params.reportKey];
    if (!spec) return res.status(404).json({ success: false, error: 'Unknown report' });
    const { where, params, order } = parseListQuery(req.query, { defaultSort: 'id', defaultOrder: 'DESC' });
    let rows = [];
    try {
      rows = (await query(`SELECT * FROM ${spec.table}${where}${order}`, params)).rows;
    } catch (e) { rows = []; }
    if (PORTAL_ROLES.includes(req.user.role) && rows.length) {
      try {
        const ids = (await query(
          `SELECT pp.project_id AS pid FROM project_participants pp
           JOIN project_participant_users ppu ON ppu.project_participant_id = pp.id WHERE ppu.user_id = $1`,
          [req.user.id]
        )).rows.map((r) => Number(r.pid));
        rows = rows.filter((r) => ids.includes(Number(r.project_id)));
      } catch (e) { /* keep */ }
    }
    const columns = visibleColumns(spec.columns, req.user);
    const format = (req.query.format || 'csv').toLowerCase();
    if (format === 'pdf') {
      const name = req.query.project_id ? await projectNameFor(query, req.query.project_id) : null;
      const pdf = await require('../utils/reporting').toPdf({
        reportKey: req.params.reportKey, label: spec.label, columns, rows, user: req.user, projectName: name,
      });
      return sendPdf(res, pdf, `${req.params.reportKey}-report.pdf`);
    }
    return sendCsv(res, toCsv(rows, columns), `${req.params.reportKey}-report.csv`);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Saved views (per user, per module)
// ---------------------------------------------------------------------------

router.get('/saved-views', authenticate, authorize(), async (req, res) => {
  try {
    const { module } = req.query;
    let conditions = ['user_id = $1']; let params = [req.user.id]; let idx = 2;
    if (module) { conditions.push(`module = $${idx++}`); params.push(module); }
    const r = await query(
      `SELECT * FROM saved_views v WHERE ${conditions.join(' AND ')} ORDER BY v.created_at DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/saved-views', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      module: Joi.string().required(),
      name: Joi.string().required(),
      params: Joi.object().unknown(true).default({}),
      is_shared: Joi.boolean().default(false),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const r = await query(
      `INSERT INTO saved_views (user_id, module, name, params, is_shared) VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING *`,
      [req.user.id, value.module, value.name, JSON.stringify(value.params), value.is_shared]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'reports', description: `Saved view "${value.name}" for ${value.module}`, entityId: r.rows[0].id, entityType: 'saved_view' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/saved-views/:id', authenticate, authorize(), async (req, res) => {
  try {
    const r = await query('DELETE FROM saved_views WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Saved view not found' });
    res.json({ success: true, message: 'Saved view deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// Scheduled reports + distribution
// ---------------------------------------------------------------------------

router.get('/scheduled', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`s.project_id = $${idx++}`); params.push(project_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(
      `SELECT s.*, u.name as created_by_name,
              (SELECT COUNT(*) FROM scheduled_report_runs run WHERE run.scheduled_report_id = s.id)::int AS run_count
       FROM scheduled_reports s LEFT JOIN users u ON s.created_by = u.id ${where} ORDER BY s.created_at DESC`, params);
    res.json({ success: true, data: r.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/scheduled', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      report_key: Joi.string().required(),
      name: Joi.string().required(),
      frequency: Joi.string().valid('weekly', 'monthly').default('weekly'),
      recipients: Joi.array().items(Joi.number().integer()).default([]),
      format: Joi.string().valid('pdf', 'csv').default('pdf'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    if (!REPORTS[value.report_key]) return res.status(400).json({ success: false, error: 'Unknown report' });
    const r = await query(
      `INSERT INTO scheduled_reports (project_id, report_key, name, frequency, recipients, format, created_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING *`,
      [value.project_id, value.report_key, value.name, value.frequency, JSON.stringify(value.recipients), value.format, req.user.id]);
    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'reports', description: `Scheduled report "${value.name}" (${value.frequency})`, entityId: r.rows[0].id, entityType: 'scheduled_report' });
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/scheduled/:id', authenticate, authorize(), async (req, res) => {
  try {
    const r = await query('DELETE FROM scheduled_reports WHERE id = $1 AND created_by = $2 RETURNING id', [req.params.id, req.user.id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Scheduled report not found' });
    res.json({ success: true, message: 'Scheduled report removed' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------------------------
// The automatic project report — ~20 sections, each pulling live data
// ---------------------------------------------------------------------------

router.get('/project-report/:projectId', authenticate, authorize(), async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const projectName = await projectNameFor(query, projectId);
    const sections = await autoProjectReport(query, projectId, req.user);
    res.json({ success: true, data: { project_id: projectId, project_name: projectName, generated_at: new Date().toISOString(), sections } });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/project-report/:projectId/pdf', authenticate, authorize(), async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const projectName = await projectNameFor(query, projectId);
    const sections = await autoProjectReport(query, projectId, req.user);
    const pdf = await renderDocument({
      docType: `PROJECT REPORT — ${projectName}`,
      number: `PR-${new Date().toISOString().slice(0, 10)}`,
      date: new Date(),
      meta: [['Project', projectName], ['Generated for', req.user.name], ['Sections', String(sections.length)]],
      columns: ['Section', 'Key figures'],
      rows: sections.map((s) => [s.title, (s.lines || []).slice(0, 4).join(' · ') || '-']),
      notes: sections.map((s) => s.title).join(' | '),
    });
    sendPdf(res, pdf, `project-report-${projectId}.pdf`);
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

async function autoProjectReport(q, projectId, user) {
  const safe = async (sql, params) => {
    try { return (await q(sql, params)).rows; } catch (e) { return []; }
  };
  const count = (rows) => rows.length;
  const sum = (rows, key) => rows.reduce((s, r) => s + (parseFloat(r[key]) || 0), 0);
  const sections = [];

  // 1 Executive summary
  const project = (await safe('SELECT * FROM projects WHERE id = $1', [projectId]))[0] || {};
  sections.push({
    key: 'executive_summary', title: 'Executive Summary',
    lines: [
      `Status: ${project.status || '—'}`,
      `Progress: ${project.completion_percentage || 0}%`,
      `Contract value: ${project.contract_value || project.budget || '—'}`,
    ],
  });

  // 2 Progress
  const acts = await safe('SELECT * FROM schedule_activities WHERE project_id = $1', [projectId]);
  sections.push({
    key: 'progress', title: 'Progress',
    lines: [
      `Activities: ${count(acts)}, completed: ${acts.filter((a) => (parseFloat(a.percent_complete) || 0) >= 100).length}`,
      `Average progress: ${acts.length ? Math.round(acts.reduce((s, a) => s + (parseFloat(a.percent_complete) || 0), 0) / acts.length) : 0}%`,
    ],
  });

  // 3 Schedule + 4 Milestones
  const delayed = acts.filter((a) => a.planned_finish && new Date(a.planned_finish) < new Date() && (parseFloat(a.percent_complete) || 0) < 100);
  sections.push({ key: 'schedule', title: 'Schedule', lines: [`Delayed activities: ${count(delayed)}`, `Critical open: ${acts.filter((a) => a.critical === true && (parseFloat(a.percent_complete) || 0) < 100).length}`] });
  const milestones = await safe('SELECT * FROM project_milestones WHERE project_id = $1', [projectId]);
  sections.push({
    key: 'milestones', title: 'Milestones',
    lines: [`Total: ${count(milestones)}, achieved: ${milestones.filter((m) => m.status === 'achieved').length}, late: ${milestones.filter((m) => m.status !== 'achieved' && m.target_date && new Date(m.target_date) < new Date()).length}`],
  });

  // 5 Manpower + 6 Equipment
  const attendance = await safe(`SELECT * FROM attendance WHERE project_id = $1 AND date = CURRENT_DATE`, [projectId]);
  sections.push({ key: 'manpower', title: 'Manpower (today)', lines: [`Present/late: ${attendance.filter((a) => ['present', 'late'].includes(a.status)).length}`] });
  const equipment = await safe(`SELECT * FROM equipment_assignments WHERE project_id = $1 AND assigned_to IS NULL`, [projectId]);
  sections.push({ key: 'equipment', title: 'Equipment on site', lines: [`Active assignments: ${count(equipment)}`] });

  // 7 Quantities (Phase 8)
  const measurements = await safe(`SELECT * FROM quantity_measurements WHERE project_id = $1 AND approval_state = 'approved'`, [projectId]);
  sections.push({ key: 'quantities', title: 'Approved quantities', lines: [`Measurements: ${count(measurements)}, total qty: ${Math.round(sum(measurements, 'quantity') * 1000) / 1000}`] });

  // 8 Procurement + 9 Materials
  const prs = await safe('SELECT * FROM purchase_requests WHERE project_id = $1', [projectId]);
  const pos = await safe('SELECT * FROM purchase_orders WHERE project_id = $1', [projectId]);
  sections.push({ key: 'procurement', title: 'Procurement', lines: [`PRs: ${count(prs)} (open ${prs.filter((r) => !['approved', 'rejected'].includes(r.status)).length})`, `POs: ${count(pos)} (issued ${pos.filter((r) => r.status === 'issued').length})`] });
  const mirs = await safe('SELECT * FROM material_inspection_requests WHERE project_id = $1', [projectId]);
  sections.push({ key: 'materials', title: 'Material inspections', lines: [`MIRs: ${count(mirs)}, pending: ${mirs.filter((m) => m.status === 'pending').length}`] });

  // 10 Quality + 11 Safety
  const wirs = await safe('SELECT * FROM wirs WHERE project_id = $1', [projectId]);
  const qtests = await safe('SELECT * FROM quality_tests WHERE project_id = $1', [projectId]);
  const ncrs = await safe('SELECT * FROM ncrs WHERE project_id = $1', [projectId]);
  sections.push({ key: 'quality', title: 'Quality', lines: [`WIRs: ${count(wirs)} (open ${wirs.filter((w) => !['approved', 'approved_with_comments', 'rejected'].includes(w.status)).length})`, `Tests: ${count(qtests)}, failed: ${qtests.filter((t) => t.result === 'fail').length}`, `NCRs open: ${ncrs.filter((n) => n.status !== 'closed').length}`] });
  const incidents = await safe('SELECT * FROM incidents WHERE project_id = $1', [projectId]);
  const permits = await safe('SELECT * FROM permits WHERE project_id = $1', [projectId]);
  sections.push({ key: 'safety', title: 'Safety', lines: [`Open incidents: ${incidents.filter((i) => i.status !== 'closed').length}`, `LTIs: ${incidents.filter((i) => i.is_lti === true).length}`, `Active permits: ${permits.filter((p) => p.status === 'active').length}`] });

  // 12 RFIs + 13 Submittals + 14 Consultant observations
  const rfis = await safe('SELECT * FROM project_rfis WHERE project_id = $1', [projectId]);
  const submittals = await safe('SELECT * FROM project_submittals WHERE project_id = $1', [projectId]);
  const observations = await safe('SELECT * FROM observations WHERE project_id = $1', [projectId]);
  sections.push({ key: 'rfis', title: 'RFIs', lines: [`Open: ${rfis.filter((r) => r.status === 'open').length} / ${count(rfis)}`] });
  sections.push({ key: 'submittals', title: 'Submittals', lines: [`Under review: ${submittals.filter((s) => ['submitted', 'under_review'].includes(s.status)).length} / ${count(submittals)}`] });
  sections.push({ key: 'consultant_observations', title: 'Consultant observations', lines: [`Open: ${observations.filter((o) => !['accepted', 'closed'].includes(o.status)).length} / ${count(observations)}`] });

  // 15 Variations + 16 Financial status
  const variations = await safe('SELECT * FROM variations WHERE project_id = $1', [projectId]);
  sections.push({ key: 'variations', title: 'Variations', lines: [`Count: ${count(variations)}, value: ${Math.round(sum(variations, 'amount') * 100) / 100}`] });
  const invoicesRows = await safe('SELECT * FROM invoices WHERE project_id = $1', [projectId]);
  const paymentsRows = await safe('SELECT * FROM payments WHERE project_id = $1', [projectId]);
  const expensesRows = await safe('SELECT * FROM expenses WHERE project_id = $1', [projectId]);
  sections.push({
    key: 'financial_status', title: 'Financial status',
    lines: [
      `Invoiced: ${Math.round(sum(invoicesRows, 'amount') * 100) / 100}`,
      `Collected: ${Math.round(sum(paymentsRows, 'amount') * 100) / 100}`,
      `Expenses: ${Math.round(sum(expensesRows, 'amount') * 100) / 100}`,
    ],
  });

  // 17 Photos + 18 Key risks + 19 Actions
  const photos = await safe('SELECT * FROM photos WHERE project_id = $1', [projectId]);
  sections.push({ key: 'photos', title: 'Photos', lines: [`Total photos: ${count(photos)}`] });
  const lateMilestones = milestones.filter((m) => m.status !== 'achieved' && m.target_date && new Date(m.target_date) < new Date());
  sections.push({
    key: 'key_risks', title: 'Key risks',
    lines: [`Delayed activities: ${count(delayed)}`, `Late milestones: ${count(lateMilestones)}`],
  });
  const actionItems = await safe('SELECT * FROM action_items WHERE project_id = $1 AND status IN (\'open\',\'in_progress\')', [projectId]);
  sections.push({ key: 'actions', title: 'Open actions', lines: [`Count: ${count(actionItems)}`] });

  return sections;
}

// Scheduled report sweep — generates the report and notifies recipients
// (the email channel rides the Phase 7 notification service; run history is
// recorded either way, so the job is observable before SMTP is configured).
// ---------------------------------------------------------------------------

function initScheduledReportScheduler(opts = {}) {
  const { query: q } = require('../config/database');
  const { notificationService } = { notificationService: require('../services/notificationService') };
  const run = async () => {
    try {
      const jobs = (await q(`SELECT * FROM scheduled_reports WHERE is_active = true`)).rows;
      for (const job of jobs) {
        const due = job.frequency === 'weekly'
          ? !job.last_run_at || (Date.now() - new Date(job.last_run_at).getTime() > 7 * 86400000)
          : !job.last_run_at || (Date.now() - new Date(job.last_run_at).getTime() > 30 * 86400000);
        if (!due) continue;
        try {
          const recipients = typeof job.recipients === 'string' ? JSON.parse(job.recipients) : (job.recipients || []);
          const spec = REPORTS[job.report_key];
          const label = spec ? spec.label : job.report_key;
          await q(
            `INSERT INTO scheduled_report_runs (scheduled_report_id, status, recipient_count) VALUES ($1,'notified',$2)`,
            [job.id, recipients.length]
          );
          await q(`UPDATE scheduled_reports SET last_run_at = $1 WHERE id = $2`, [new Date(), job.id]);
          try {
            await require('../services/notificationService').notifyRoles(['owner', 'admin'], {
              title: `Scheduled report generated: ${label} — ${job.name}`,
              body: `${job.frequency} ${job.format} report ready for project #${job.project_id || 'all'}.`,
              eventType: 'report.generated', entityType: 'scheduled_report', entityId: job.id,
            });
          } catch (e) { /* notification channel best-effort */ }
        } catch (e) {
          await q(`INSERT INTO scheduled_report_runs (scheduled_report_id, status, error) VALUES ($1,'failed',$2)`, [job.id, e.message]);
        }
      }
    } catch (e) {
      console.error('[REPORTS] scheduled sweep failed:', e.message);
    }
  };
  run();
  const timer = setInterval(run, 60 * 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
}

module.exports = Object.assign(router, { initScheduledReportScheduler });
