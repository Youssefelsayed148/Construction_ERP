// Phase 23 — per-role widget dashboards.
//
// One registry, one resolver. Every dashboard is permission-filtered
// server-side (built from req.user + Phase 3 project-participant scoping,
// never from client hints) and every widget renders with zero underlying
// records (the zero-requirement) — a fresh system gets empty-but-valid
// widgets, never an error.
//
// CEO/Owner extends the existing GET /api/dashboard/overview strip: the
// resolver returns the same summary-strip widgets, so the owner dashboard
// absorbs /overview rather than building a parallel one. The legacy
// dashboard.js response shapes remain untouched until the frontend migrates
// (the legacy-flag requirement).
//
// Aggregations are computed in JS over plain row selects so every widget
// runs identically on PostgreSQL and the test MockDb.

'use strict';

const progressEngine = require('./progressEngine');

function parseJson(v) {
  if (v == null) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return {}; }
}

// Rows of a query. A failure propagates (closeout A2.4): a widget never shows an empty list for a broken query.
async function rowsOf(q, sql, params) {
  return (await q(sql, params)).rows;
}

function w(key, title, data) { return { key, title, data }; }

function num(v) {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Row-level aggregation helper: fetch rows then aggregate in JS.
async function agg(q, table, where = '', params = []) {
  const rows = await rowsOf(q, `SELECT * FROM ${table}${where ? ` WHERE ${where}` : ''}`, params);
  return { rows, count: rows.length };
}

// ---------------------------------------------------------------------------
// CEO / Owner — extends /overview (the owner summary strip)
// ---------------------------------------------------------------------------

async function ceoWidgets(q, { userId, projectId = null }) {
  const { rows: projects } = await agg(q, 'projects', projectId != null ? 'id = $1' : '', projectId != null ? [projectId] : []);
  const { rows: pos } = await agg(q, 'purchase_orders');
  const { rows: ncrs } = await agg(q, 'ncrs');
  const { rows: punch } = await agg(q, 'punch_items');
  const { rows: incidents } = await agg(q, 'incidents');
  const { rows: permits } = await agg(q, 'permits');
  const { rows: invoices } = await agg(q, 'invoices');
  const { rows: payments } = await agg(q, 'payments');
  const invoiced = invoices.reduce((s, i) => s + num(i.amount), 0);
  const collected = payments.reduce((s, p) => s + num(i2amount(p)), 0);
  return [
    w('portfolio', 'Portfolio', {
      projects: projects.length,
      active: projects.filter((p) => p.status === 'active').length,
      // Weighted by contract value (closeout A2.6): each project's own figure is already the weighted derived progress.
      avg_completion: projects.length ? Math.round(progressEngine.weightedPortfolioProgress(projects)) : 0,
    }),
    w('procurement_exposure', 'Procurement exposure', {
      issued_pos: pos.filter((r) => r.status === 'issued').length,
      open_commitment: pos.filter((p) => p.status === 'issued').reduce((s, p) => s + num(p.total_amount), 0),
    }),
    w('quality_safety_risks', 'Quality & safety risks', {
      open_ncrs: ncrs.filter((n) => n.status !== 'closed').length,
      open_punch: punch.filter((p) => p.status !== 'closed' && p.status !== 'verified').length,
      open_incidents: incidents.filter((i) => i.status !== 'closed').length,
      active_permits: permits.filter((p) => p.status === 'active').length,
    }),
    w('financial_position', 'Financial position', {
      invoiced: invoices.reduce((s, i) => s + num(i.amount), 0),
      collected: payments.reduce((s, p) => s + num(p.amount), 0),
      outstanding: invoices.reduce((s, i) => s + num(i.amount), 0) - payments.reduce((s, p) => s + num(p.amount), 0),
    }),
  ];
}
function i2amount(p) { return p.amount; }

// ---------------------------------------------------------------------------
// Projects Director
// ---------------------------------------------------------------------------

async function projectsDirectorWidgets(q, ctx) {
  const { rows: projects } = await agg(q, 'projects');
  const atRisk = projects.filter((p) =>
    num(p.completion_percentage) < 50 && p.expected_completion && new Date(p.expected_completion) < new Date(Date.now() + 30 * 86400000)
  ).length;
  const { rows: actions } = await agg(q, 'action_items');
  const { rows: activities } = await agg(q, 'schedule_activities');
  const { rows: variations } = await agg(q, 'variations');
  return [
    w('project_health', 'Project health', { total: projects.length, at_risk: atRisk }),
    w('pm_actions', 'PM actions', { awaiting: actions.filter((a) => a.status === 'open' || a.status === 'in_progress').length }),
    w('schedule_risk', 'Schedule risk', {
      delayed: activities.filter((a) => a.planned_finish && new Date(a.planned_finish) < new Date() && num(a.percent_complete) < 100).length,
    }),
    w('commercial_risk', 'Commercial risk', {
      open_variations: variations.filter((v) => v.status !== 'incorporated' && v.status !== 'rejected').length,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Construction Manager
// ---------------------------------------------------------------------------

async function constructionManagerWidgets(q, { userId, projectId = null }) {
  const { rows: works } = await agg(q, 'work_orders', projectId != null ? 'project_id = $1' : '', projectId != null ? [projectId] : []);
  const { rows: wirs } = await agg(q, 'wirs', projectId != null ? 'project_id = $1' : '', projectId != null ? [projectId] : []);
  const { rows: mirs } = await agg(q, 'material_inspection_requests', projectId != null ? 'project_id = $1' : '', projectId != null ? [projectId] : []);
  const { rows: stock } = await agg(q, 'warehouse_stock');
  return [
    w('todays_works', 'Works', {
      planned: works.filter((w) => w.status === 'planned').length,
      in_progress: works.filter((w) => w.status === 'in_progress').length,
    }),
    w('inspections', 'Inspections', {
      wirs_open: wirs.filter((w) => !['approved', 'approved_with_comments', 'rejected'].includes(w.status)).length,
      mirs_pending: mirs.filter((m) => m.status === 'pending').length,
    }),
    w('materials', 'Materials', {
      low_stock: stock.filter((s) => num(s.reorder_level) > 0 && num(s.quantity) <= num(s.reorder_level)).length,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Project Manager
// ---------------------------------------------------------------------------

async function projectManagerWidgets(q, { userId, projectId = null }) {
  const wp = projectId != null ? 'project_id = $1' : '';
  const pp = projectId != null ? [projectId] : [];
    const [actions, progress, wirs, mirs, ncrs, rfis, subs, obs, invoices, payments] = await Promise.all([
    agg(q, 'action_items', wp, pp),
    agg(q, 'schedule_activities', wp, pp),
    agg(q, 'wirs', wp, pp),
    agg(q, 'material_inspection_requests', wp, pp),
    agg(q, 'ncrs', wp, pp),
    agg(q, 'project_rfis', wp, pp),
    agg(q, 'project_submittals', wp, pp),
    agg(q, 'observations', wp, pp),
    agg(q, 'invoices', wp, pp),
    agg(q, 'payments', wp, pp),
  ]);
  // The weighted figure (closeout A2.6): for a project, the derived progress (measured quantities weighted by BOQ
  // value, else schedule tasks weighted by duration); across projects, tasks weighted by duration. Never the plain
  // mean of activity percents (a one-day task counted like a one-year task).
  let avg = 0;
  let progressSource = 'none';
  if (projectId != null) {
    const derived = await progressEngine.deriveProjectProgress(q, projectId);
    if (derived.progress != null) { avg = derived.progress; progressSource = derived.source; }
  } else {
    const weighted = progressEngine.durationWeighted(progress.rows);
    if (weighted != null) { avg = weighted; progressSource = 'schedule'; }
  }
  const obsCount = obs.rows.filter((o) => !['accepted', 'closed'].includes(o.status)).length;
  const subOpen = subs.rows.filter((s) => ['submitted', 'under_review'].includes(s.status)).length;
  return [
    w('my_actions', 'My open actions', { open: actions.rows.filter((a) => a.status === 'open' || a.status === 'in_progress').length }),
    w('progress', 'Progress', { avg_percent: Math.round(avg * 10) / 10, source: progressSource }),
    w('wir_mir', 'WIR / MIR', {
      wirs_open: wirs.rows.filter((w) => !['approved', 'approved_with_comments', 'rejected'].includes(w.status)).length,
      mirs_pending: mirs.rows.filter((m) => m.status === 'pending').length,
    }),
    w('ncrs', 'NCRs', { open: ncrs.rows.filter((n) => n.status !== 'closed').length }),
    w('rfis_submittals', 'RFIs & submittals', {
      open_rfis: rfis.rows.filter((r) => r.status === 'open').length,
      open_submittals: subOpen,
    }),
    w('consultant_comments', 'Consultant observations', { open: obsCount }),
    w('cost_invoices', 'Cost & invoices', {
      invoiced: invoices.rows.reduce((s, i) => s + num(i.amount), 0),
      collected: payments.rows.reduce((s, p) => s + num(p.amount), 0),
    }),
    // Phase 25 — handover readiness surfaces on the PM dashboard.
    ...(projectId != null ? [await handoverReadinessWidget(q, projectId)] : []),
  ];
}

async function handoverReadinessWidget(q, projectId) {
  try {
    const handoverEngine = require('./handoverEngine');
    const readiness = await handoverEngine.handoverReadiness(q, projectId);
    return w('handover_readiness', 'Handover readiness', readiness);
  } catch (e) {
    return w('handover_readiness', 'Handover readiness', { percent: 0 });
  }
}
function activities_progress(rows) {
  if (!rows.length) return 0;
  return rows.reduce((s, r) => s + num(r.percent_complete), 0) / rows.length;
}
// ---------------------------------------------------------------------------
// Site Engineer
// ---------------------------------------------------------------------------

async function siteEngineerWidgets(q, { userId, projectId = null }) {
  const [todaysWork, materials, photos] = await Promise.all([
    agg(q, 'work_orders', projectId != null ? `project_id = $1 AND status = 'in_progress'` : `status = 'in_progress'`, projectId != null ? [projectId] : []),
    agg(q, 'warehouse_stock', 'reorder_level > 0 AND quantity <= reorder_level'),
    agg(q, 'photos', projectId != null ? `project_id = $1 AND uploader_user_id = $2` : `uploader_user_id = $1`, projectId != null ? [projectId, userId] : [userId]),
  ]);
  return [
    w('todays_work', "Today's work", { open: todaysWork.rows.length }),
    w('materials', 'Materials', { low_stock: materials.rows.length }),
    w('photos', 'Photos', { recent: photos.rows.length }),
  ];
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

async function planningWidgets(q, { userId, projectId = null }) {
  const { rows: activities } = await agg(q, 'schedule_activities', projectId != null ? 'project_id = $1' : '', projectId != null ? [projectId] : []);
  const { rows: baselines } = await agg(q, 'baselines', projectId != null ? 'project_id = $1' : '', projectId != null ? [projectId] : []);
  const now = new Date();
  return [
    w('baseline_vs_actual', 'Baseline vs actual', {
      total: activities.length,
      completed: activities.filter((a) => num(a.percent_complete) >= 100).length,
      avg_progress: Math.round(activities_progress(activities) * 10) / 10,
      baselines: baselines.length,
    }),
    w('delays', 'Delays', {
      delayed: activities.filter((a) => a.planned_finish && new Date(a.planned_finish) < new Date() && num(a.percent_complete) < 100).length,
    }),
    w('critical_activities', 'Critical activities', {
      open: activities.filter((a) => (a.critical === true || a.critical === 'true') && num(a.percent_complete) < 100).length,
    }),
  ];
}

// ---------------------------------------------------------------------------
// QS / Commercial
// ---------------------------------------------------------------------------

async function commercialWidgets(q, { userId, projectId = null }) {
  const wp = projectId != null ? 'project_id = $1' : '';
  const pp = projectId != null ? [projectId] : [];
  const [boq, measurements, subContracts, variationsV, pos, budgets] = await Promise.all([
    agg(q, 'boq_items', wp, pp),
    agg(q, 'quantity_measurements', wp ? `project_id = $1 AND approval_state = 'approved'` : `approval_state = 'approved'`, pp),
    agg(q, 'sub_contracts', wp, pp),
    agg(q, 'variations', wp, pp),
    agg(q, 'purchase_orders', wp ? `project_id = $1 AND status = 'issued'` : `status = 'issued'`, pp),
    agg(q, 'project_budgets', wp, pp),
  ]);
  return [
    w('boq_measurements', 'BOQ & measurements', {
      items: boq.rows.length,
      approved_measurements: measurements.rows.length,
      approved_qty: measurements.rows.reduce((s, r) => s + num(r.quantity), 0),
    }),
    w('valuations', 'Valuations', { approved_qty: measurements.rows.reduce((s, r) => s + num(r.quantity), 0) }),
    w('subcontracts', 'Subcontracts', {
      count: subContracts.rows.length,
      value: subContracts.rows.reduce((s, r) => s + num(r.contract_value), 0),
    }),
    w('variations', 'Variations', {
      count: variationsV.rows.length,
      value: variationsV.rows.reduce((s, r) => s + num(r.amount), 0),
    }),
    w('budget_eac', 'Budget & commitments', {
      budgets: budgets.rows.length,
      commitments: pos.rows.reduce((s, r) => s + num(r.total_amount), 0),
    }),
  ];
}

// ---------------------------------------------------------------------------
// Procurement
// ---------------------------------------------------------------------------

async function procurementWidgets(q, { userId, projectId = null }) {
  const wp = projectId != null ? 'project_id = $1' : '';
  const pp = projectId != null ? [projectId] : [];
  const [prs, pos, deliveries] = await Promise.all([
    agg(q, 'purchase_requests', wp ? `project_id = $1 AND status NOT IN ('approved','rejected')` : `status NOT IN ('approved','rejected')`, pp),
    agg(q, 'purchase_orders', wp ? `project_id = $1 AND status = 'issued'` : `status = 'issued'`, pp),
    agg(q, 'deliveries', wp ? `project_id = $1 AND status = 'pending'` : `status = 'pending'`, pp),
  ]);
  return [
    w('requisitions', 'Purchase requisitions', { open: prs.rows.length }),
    w('purchase_orders', 'Purchase orders', { issued: pos.rows.length }),
    w('deliveries', 'Deliveries pending MIR', { pending: deliveries.rows.length }),
  ];
}

// ---------------------------------------------------------------------------
// Storekeeper
// ---------------------------------------------------------------------------

async function storekeeperWidgets(q, { userId, projectId = null }) {
  const [stock, grns] = await Promise.all([
    agg(q, 'warehouse_stock'),
    agg(q, 'goods_receipt_notes', projectId != null ? 'project_id = $1 AND received_date >= CURRENT_DATE - INTERVAL \'7 days\'' : `received_date >= CURRENT_DATE - INTERVAL '7 days'`, projectId != null ? [projectId] : []),
  ]);
  return [
    w('stock', 'Stock', {
      lines: stock.rows.length,
      available: stock.rows.reduce((s, r) => s + num(r.available_quantity ?? r.quantity), 0),
    }),
    w('low_stock', 'Low stock', {
      alerts: stock.rows.filter((r) => num(r.reorder_level) > 0 && num(r.quantity) <= num(r.reorder_level)).length,
    }),
    w('receiving', 'GRNs this week', { count: grns.rows.length }),
  ];
}

// ---------------------------------------------------------------------------
// QA/QC
// ---------------------------------------------------------------------------

async function qaqcWidgets(q, { userId, projectId = null }) {
  const wp = projectId != null ? 'project_id = $1' : '';
  const pp = projectId != null ? [projectId] : [];
  const [wirs, mirs, tests, ncrs, capa] = await Promise.all([
    agg(q, 'wirs', wp, pp),
    agg(q, 'material_inspection_requests', wp, pp),
    agg(q, 'quality_tests', wp, pp),
    agg(q, 'ncrs', wp, pp),
    agg(q, 'corrective_actions', wp, pp),
  ]);
  return [
    w('wir_mir', 'WIR / MIR', {
      open_wirs: wirs.rows.filter((w) => !['approved', 'approved_with_comments', 'rejected'].includes(w.status)).length,
      pending_mirs: mirs.rows.filter((m) => m.status === 'pending').length,
    }),
    w('tests', 'Tests', { failed: tests.rows.filter((t) => t.result === 'fail').length }),
    w('ncrs', 'NCRs', { open: ncrs.rows.filter((n) => n.status !== 'closed').length }),
    w('capa', 'Corrective actions', {
      open: capa.rows.filter((c) => c.status !== 'completed' && c.status !== 'verified').length,
    }),
  ];
}

// ---------------------------------------------------------------------------
// HSE
// ---------------------------------------------------------------------------

async function hseWidgets(q, { userId, projectId = null }) {
  const wp = projectId != null ? 'project_id = $1' : '';
  const pp = projectId != null ? [projectId] : [];
  const [permits, inspections, incidents, nearMisses, capa] = await Promise.all([
    agg(q, 'permits', wp, pp),
    agg(q, 'hse_inspections', wp, pp),
    agg(q, 'incidents', wp, pp),
    agg(q, 'near_misses', wp, pp),
    agg(q, 'corrective_actions', wp, pp),
  ]);
  const today = new Date().toDateString();
  return [
    w('permits', 'Permits', {
      active: permits.rows.filter((p) => p.status === 'active').length,
      expiring_today: permits.rows.filter((p) => p.status === 'active' && p.valid_to && new Date(p.valid_to).toDateString() === today).length,
    }),
    w('inspections', 'Inspections', { total: inspections.rows.length }),
    w('incidents', 'Incidents', { open: incidents.rows.filter((i) => i.status !== 'closed').length }),
    w('near_misses', 'Near misses', { open: nearMisses.rows.filter((n) => n.status === 'open').length }),
    w('overdue_actions', 'Overdue corrective actions', {
      overdue: capa.rows.filter((c) => c.due_date && new Date(c.due_date) < new Date() && c.status !== 'completed' && c.status !== 'verified').length,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Document Controller
// ---------------------------------------------------------------------------

async function docControllerWidgets(q, { userId, projectId = null }) {
  const wp = projectId != null ? 'project_id = $1' : '';
  const pp = projectId != null ? [projectId] : [];
  const [transmittals, docs, versions] = await Promise.all([
    agg(q, 'transmittals', wp, pp),
    agg(q, 'project_documents', wp, pp),
    agg(q, 'document_versions', wp ? `document_id IN (SELECT id FROM project_documents WHERE project_id = $1)` : '', wp),
  ]);
  return [
    w('incoming_outgoing', 'Transmittals', {
      incoming_open: transmittals.rows.filter((t) => t.direction === 'incoming' && t.status !== 'closed').length,
      outgoing_open: transmittals.rows.filter((t) => t.direction === 'outgoing' && t.status !== 'closed').length,
    }),
    w('revisions', 'Revisions', { documents: docs.rows.length }),
    w('superseded_control', 'Superseded control', {
      superseded: docs.rows.filter((d) => d.doc_status === 'superseded').length,
    }),
    w('reviews_due', 'Reviews due', {
      due: docs.rows.filter((d) => d.review_due_date && new Date(d.review_due_date) <= new Date() && ['draft', 'review'].includes(d.status)).length,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

async function financeWidgets(q, { userId, projectId = null }) {
  const wp = projectId != null ? 'project_id = $1' : '';
  const pp = projectId != null ? [projectId] : [];
  const [invoices, payments, pos] = await Promise.all([
    agg(q, 'invoices', wp, pp),
    agg(q, 'payments', wp, pp),
    agg(q, 'purchase_orders', wp ? `project_id = $1 AND status = 'issued'` : `status = 'issued'`, pp),
  ]);
  const invoiced = invoices.rows.reduce((s, i) => s + num(i.amount), 0);
  const collected = payments.rows.reduce((s, p) => s + num(p.amount), 0);
  return [
    w('receivables', 'Receivables', { invoiced, collected, outstanding: invoiced - collected }),
    w('payables', 'Payables (open commitments)', { payable: pos.rows.reduce((s, p) => s + num(p.total_amount), 0) }),
    w('overdue', 'Overdue invoices', {
      overdue: invoices.rows.filter((i) => i.status === 'overdue' || (i.due_date && new Date(i.due_date) < new Date() && i.status !== 'paid')).length,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Portal roles — scoped to their project participants
// ---------------------------------------------------------------------------

async function clientWidgets(q, { userId, projectId = null }) {
  const rows = await rowsOf(q,
    `SELECT pp.project_id AS pid FROM project_participants pp
     JOIN project_participant_users ppu ON ppu.project_participant_id = pp.id
     WHERE ppu.user_id = $1 AND pp.participant_type = 'client'
     ${projectId != null ? ' AND pp.project_id = $2' : ''}`,
    projectId != null ? [userId, projectId] : [userId]);
  const ids = [...new Set(rows.map((r) => Number(r.pid)))];
  if (ids.length === 0) {
    return [
      w('projects', 'My projects', { count: 0 }),
      w('milestones', 'Milestones', { upcoming: 0, achieved: 0 }),
      w('handover_readiness', 'Handover readiness', { percent: 0, items_total: 0, items_complete: 0 }),
    ];
  }
  const milestoneRows = await rowsOf(q,
    'SELECT status FROM project_milestones WHERE project_id = ANY($1::int[])', [ids]);
  const handoverRows = await rowsOf(q,
    'SELECT status FROM handover_package_items WHERE project_id = ANY($1::int[])', [ids]);
  const itemsTotal = handoverRows.length;
  const itemsComplete = handoverRows.filter((h) => h.status === 'complete').length;
  const pct = itemsTotal ? Math.round((itemsComplete / itemsTotal) * 100) : 0;
  return [
    w('projects', 'My projects', { count: ids.length }),
    w('milestones', 'Milestones', {
      upcoming: milestoneRows.filter((m) => m.status === 'pending').length,
      achieved: milestoneRows.filter((m) => m.status === 'achieved').length,
    }),
    w('handover_readiness', 'Handover readiness', {
      items_total: itemsTotal,
      items_complete: itemsComplete,
      percent: pct,
    }),
  ];
}

async function consultantWidgets(q, { userId, projectId = null }) {
  const rows = await rowsOf(q,
    `SELECT pp.project_id AS pid FROM project_participants pp
     JOIN project_participant_users ppu ON ppu.project_participant_id = pp.id
     WHERE ppu.user_id = $1 AND pp.participant_type = 'consultant'`, [userId]);
  const ids = [...new Set(rows.map((r) => Number(r.pid)))];
  if (ids.length === 0) {
    return [w('reviews', 'My reviews', { awaiting_rectification: 0, wirs_to_decide: 0, rfis_to_answer: 0 })];
  }
  const [obsRows, wirRows, rfiRows] = await Promise.all([
    rowsOf(q, 'SELECT status FROM observations WHERE consultant_user_id = $1', [userId]),
    rowsOf(q, 'SELECT status FROM wirs WHERE project_id = ANY($1::int[])', [ids]),
    rowsOf(q, 'SELECT status FROM project_rfis WHERE project_id = ANY($1::int[])', [ids]),
  ]);
  return [
    w('reviews', 'My reviews', {
      awaiting_rectification: obsRows.filter((o) => !['accepted', 'closed'].includes(o.status)).length,
      wirs_to_decide: wirRows.filter((w) => w.status === 'consultant_review').length,
      rfis_to_answer: rfiRows.filter((r) => r.status === 'open').length,
    }),
  ];
}

async function subcontractorWidgets(q, { userId, projectId = null }) {
  const orgs = await rowsOf(q, 'SELECT organization_id FROM organization_users WHERE user_id = $1', [userId]);
  const orgIds = [...new Set(orgs.map((r) => Number(r.organization_id)))];
  if (orgIds.length === 0) {
    return [w('scope', 'My scope', { work_orders: 0 })];
  }
  const wo = await rowsOf(q, 'SELECT id FROM work_orders WHERE subcontractor_id = ANY($1::int[])', [orgIds]);
  return [w('scope', 'My work orders', { work_orders: wo.length })];
}

// ---------------------------------------------------------------------------
// Registry — the 16 dashboard roles (+ legacy role aliases)
// ---------------------------------------------------------------------------

const DASHBOARDS = {
  owner: ceoWidgets,
  admin: ceoWidgets,
  projects_director: projectsDirectorWidgets,
  construction_manager: constructionManagerWidgets,
  project_manager: projectManagerWidgets,
  site_engineer: siteEngineerWidgets,
  planning: planningWidgets,
  qs: commercialWidgets,
  commercial: commercialWidgets,
  procurement: procurementWidgets,
  storekeeper: storekeeperWidgets,
  qa_qc: qaqcWidgets,
  hse: hseWidgets,
  document_controller: docControllerWidgets,
  finance_manager: financeWidgets,
  client: clientWidgets,
  consultant: consultantWidgets,
  subcontractor: subcontractorWidgets,
};

const ROLE_ALIASES = {
  owner: 'owner',
  admin: 'admin',
  manager: 'construction_manager',
  staff: 'site_engineer',
  engineer: 'site_engineer',
  accountant: 'finance_manager',
  purchasing_mgr: 'procurement',
  legal_mgr: null,
  maintenance_mgr: null,
};

// Phase 15 sticky notes — the dashboard component (personal + project scope;
// project-scope notes are filtered to the selected project, others follow).
async function stickyNotesWidget(q, user, projectId = null) {
  if (!user) return [];
  const rows = await rowsOf(q,
    'SELECT * FROM sticky_notes WHERE owner_user_id = $1 ORDER BY updated_at DESC', [user.id]);
  return rows
    .filter((r) => projectId == null || r.scope !== 'project' || Number(r.project_id) === Number(projectId))
    .map((r) => ({
      id: r.id, scope: r.scope, text: r.text, color: r.color,
      location_id: r.location_id, linked_entity_type: r.linked_entity_type,
      linked_entity_id: r.linked_entity_id, reminder_at: r.reminder_at,
    }));
}

// Phase 8's location dashboard as an embeddable, permission-filtered widget —
// usable from the internal app and (filtered) from the consultant/client portals.
async function locationWidget(q, user, projectId) {
  if (!user || projectId == null) return null;
  if (['consultant', 'client', 'subcontractor', 'supplier'].includes(user.role)) {
    const visible = await visibleProjectIds(q, user);
    if (!visible.includes(Number(projectId))) return null;
  }
  const locRows = await rowsOf(q,
    'SELECT id, name FROM project_locations WHERE project_id = $1 ORDER BY id', [projectId]);
  const allocRows = await rowsOf(q,
    'SELECT project_location_id, planned_quantity, executed_quantity, certified_quantity FROM boq_location_allocations', []);
  const byLoc = new Map(locRows.map((r) => [r.id, { id: r.id, name: r.name, planned: 0, executed: 0, certified: 0 }]));
  for (const r of allocRows) {
    const loc = byLoc.get(Number(r.project_location_id));
    if (!loc) continue;
    loc.planned += num(r.planned_quantity);
    loc.executed += num(r.executed_quantity);
    loc.certified += num(r.certified_quantity);
  }
  return {
    project_id: Number(projectId),
    locations: [...byLoc.values()].map((loc) => ({
      id: loc.id, name: loc.name,
      planned_quantity: loc.planned, executed_quantity: loc.executed,
      percent: loc.planned > 0 ? Math.round((loc.executed / loc.planned) * 1000) / 10 : 0,
    })),
  };
}

async function visibleProjectIds(q, user) {
  if (!user) return [];
  if (['owner', 'admin'].includes(user.role)) return null; // no filter
  const rows = await rowsOf(q,
    `SELECT pp.project_id AS pid FROM project_participants pp
     JOIN project_participant_users ppu ON ppu.project_participant_id = pp.id
     WHERE ppu.user_id = $1`, [user.id]);
  return [...new Set(rows.map((r) => Number(r.pid)))].sort((a, b) => a - b);
}

// The resolver: role first, then legacy alias; unknown roles get the
// site-engineer-shaped payload (empty widgets, valid structure).
async function roleDashboard(q, user, { projectId = null } = {}) {
  const builder = DASHBOARDS[user.role] || siteEngineerWidgets;
  const widgetsList = await builder(q, { userId: user.id, projectId: projectId != null ? Number(projectId) : null });
  const sticky = await stickyNotesWidget(q, user, projectId);
  const location = projectId != null ? await locationWidget(q, user, projectId) : null;
  return { role: user.role, widgets: widgetsList, sticky_notes: sticky, location_dashboard: location };
}

module.exports = {
  roleDashboard,
  stickyNotesWidget,
  locationWidget,
  visibleProjectIds,
  DASHBOARDS,
  ROLE_ALIASES,
};
