// Phase 17 — client portal engine.
//
// Core rule: a client NEVER sees internal cost or vendor pricing. The gate is
// SERVER-SIDE: policy.visibilityFlags() (Phase 4) is consulted on every
// dashboard/assembly call and internal-only fields are stripped from the
// response — the UI hiding alone is never trusted.
//
// Zero-client requirement: every read works before a client organization or
// portal user is assigned — the response carries setup_actions instead of
// erroring.
//
// Preview-as-Client: an authorized internal admin/PM reuses the Phase 4
// preview-token mechanism (POST /api/users/preview/client) — read-only and
// audited (audit_events) — no fake account is created.

'use strict';

const { query: defaultQuery } = require('../config/database');

// Fields a client must never receive, whatever the UI does. Stripped
// server-side from every portal payload.
const INTERNAL_ONLY_FIELDS = [
  'budget', 'original_budget', 'current_budget', 'committed_cost', 'actual_cost',
  'accrued_cost', 'etc', 'eac', 'internal_profit', 'forecast_profit',
  'unit_cost', 'cost_rate', 'supplier_price', 'subcontract_price',
  'purchase_orders', 'commitments', 'payroll', 'expenses',
];

function toNum(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

async function safeAll(q, sql, params) {
  try {
    return (await q(sql, params)).rows;
  } catch (e) {
    console.error(`[CLIENT] ${e.message}`);
    return [];
  }
}

// Server-side gate: for a client-role viewer the internal-cost flags are
// ALWAYS false (the Phase 4 legacy fallback grants external roles nothing),
// and stripInternalFields removes every internal-only key from the payload.
function clientVisibilityFlags(user, policyFlags) {
  // Defense in depth: even if policy somehow returned true for an external
  // role, a client portal viewer is forced to the safest flags.
  return {
    see_internal_cost: false,
    see_client_price: false,
    see_subcontractor_price: false,
    ...policyFlags,
    see_internal_cost: false, // never for the client portal, enforced here
  };
}

function stripInternalFields(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripInternalFields);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (INTERNAL_ONLY_FIELDS.includes(k)) continue;
    out[k] = stripInternalFields(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scoped project resolution
// ---------------------------------------------------------------------------

async function resolveClientProjects(q, userId) {
  const orgLinks = await safeAll(q, 'SELECT organization_id FROM organization_users WHERE user_id = $1', [userId]);
  const projects = [];
  for (const link of orgLinks) {
    const participants = await safeAll(q,
      'SELECT project_id, participant_type, portal_access_enabled FROM project_participants WHERE organization_id = $1',
      [link.organization_id]);
    for (const p of participants) {
      if (p.participant_type !== 'client') continue;
      if (p.portal_access_enabled === false) continue;
      const id = toNum(p.project_id);
      if (!projects.includes(id)) projects.push(id);
    }
  }
  return projects.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Dashboard assembly (client-safe values only)
// ---------------------------------------------------------------------------

// Certified / billed / paid / outstanding from the Phase 13/14 commercial and
// finance engines' client-facing figures — never cost breakdowns.
async function clientFinancials(q, projectId) {
  const invoices = (await safeAll(q, 'SELECT * FROM invoices WHERE project_id = $1', [projectId]))
    .filter((i) => !['cancelled', 'void'].includes(i.status));
  const billed = invoices.reduce((s, i) => s + toNum(i.net_amount != null && toNum(i.net_amount) > 0 ? i.net_amount : i.amount), 0);
  let paid = 0;
  let certified = 0;
  try {
    const allocs = (await safeAll(q, "SELECT * FROM payment_allocations WHERE target_type = 'client_invoice'", []));
    const byInvoice = new Map();
    for (const a of allocs) {
      byInvoice.set(toNum(a.invoice_id), (byInvoice.get(toNum(a.invoice_id)) || 0) + toNum(a.amount));
    }
    for (const inv of invoices) {
      const net = toNum(inv.net_amount != null && toNum(inv.net_amount) > 0 ? inv.net_amount : inv.amount);
      certified += toNum(inv.certified_gross);
      paid += toNum(byInvoice.get(toNum(inv.id)) || 0);
    }
  } catch (e) { /* allocations absent — zeros */ }
  const outstanding = Math.round((billed - paid) * 100) / 100;
  return { certified: Math.round(certified * 100) / 100, billed: Math.round(billed * 100) / 100, paid: Math.round(paid * 100) / 100, outstanding };
}

async function clientDashboard(q, user, { project_id = null, now = new Date() } = {}) {
  const projectIds = await resolveClientProjects(q, user.id);
  const scoped = project_id != null && projectIds.includes(toNum(project_id)) ? [toNum(project_id)] : projectIds;

  const projects = [];
  for (const pid of scoped) {
    const p = (await safeAll(q, 'SELECT id, name, name_en, status, progress_percent, client_id FROM projects WHERE id = $1', [pid]))[0];
    if (p) projects.push(p);
  }

  // Zero-client: no assignment yet → setup actions, not an error.
  if (scoped.length === 0) {
    return {
      setup_actions: ['Assign a client to preview this portal'],
      projects: [], portfolio: { items: [] },
      note: 'No client is assigned to your account yet.',
    };
  }

  const dashboard = { projects, project_ids: scoped, setup_actions: [] };
  const forProjects = (rows) => rows.filter((r) => scoped.includes(toNum(r.project_id)));

  // Project health / progress.
  const health = [];
  for (const p of projects) {
    const boqRows = await safeAll(q, 'SELECT quantity FROM boq_items WHERE project_id = $1', [p.id]);
    const measRows = await safeAll(q, 'SELECT quantity, approval_state FROM quantity_measurements WHERE project_id = $1', [p.id]);
    const planned = boqRows.reduce((s, b) => s + toNum(b.quantity), 0);
    const executed = measRows
      .filter((m) => m.approval_state === 'approved')
      .reduce((s, m) => s + toNum(m.quantity), 0);
    health.push({
      project_id: p.id, name: p.name || p.name_en, status: p.status,
      progress_percent: toNum(p.progress_percent) || (planned > 0 ? Math.round((executed / planned) * 10000) / 100 : 0),
      planned_quantity: Math.round(planned * 1000) / 1000,
      executed_quantity: Math.round(executed * 1000) / 1000,
    });
  }
  dashboard.project_health = health;

  // High-level schedule + milestones.
  const milestones = forProjects(await safeAll(q, 'SELECT * FROM project_milestones', []));
  dashboard.milestones = {
    items: milestones.map((m) => ({ id: m.id, title: m.title || m.title_en, target_date: m.target_date, achieved_date: m.achieved_date, status: m.status })),
    planned: milestones.length,
    achieved: milestones.filter((m) => m.achieved_date != null).length,
    empty_label: 'No milestones defined yet',
  };
  const orders = forProjects(await safeAll(q, 'SELECT * FROM work_orders', []));
  dashboard.schedule = {
    items: orders.map((w) => ({ id: w.id, title: w.title, planned_start_date: w.planned_start_date, planned_end_date: w.planned_end_date, status: w.status, completion_percentage: toNum(w.completion_percentage) })),
    planned: orders.length,
    started: orders.filter((w) => w.actual_start_date != null).length,
    completed: orders.filter((w) => w.actual_end_date != null).length,
    empty_label: 'No scheduled activities yet',
  };

  // Latest progress photos (Phase 15 model).
  const photos = forProjects((await safeAll(q, 'SELECT * FROM photos ORDER BY uploaded_at DESC', [])));
  dashboard.latest_photos = {
    items: photos.slice(0, 8).map((p) => ({ id: p.id, caption: p.caption, uploaded_at: p.uploaded_at })),
    count: photos.length,
    empty_label: 'No progress photos yet',
  };

  // Variations: approved vs pending (client-facing values only).
  const variations = forProjects(await safeAll(q, 'SELECT * FROM variations', []));
  dashboard.variations = {
    approved: variations.filter((v) => v.status === 'incorporated'),
    pending: variations.filter((v) => ['change_event', 'estimate', 'internal_commercial_review', 'authority_approval', 'consultant_recommendation', 'client_approval_reject'].includes(v.status)),
    approved_count: variations.filter((v) => v.status === 'incorporated').length,
    pending_count: variations.filter((v) => !['incorporated', 'rejected'].includes(v.status)).length,
    empty_label: 'No variations raised yet',
  };

  // Client approvals required (variations at the client-approval step + issued
  // payment certificates awaiting client countersign are out of scope here).
  const approvalRequests = forProjects((await safeAll(q, "SELECT * FROM approval_requests WHERE status = 'pending'", [])));
  dashboard.client_approvals_required = {
    items: approvalRequests.map((a) => ({ id: a.id, title: a.title || a.module || 'Approval', requested_at: a.created_at })),
    count: approvalRequests.length,
    empty_label: 'No client approvals pending',
  };

  // Financials (client-facing): certified/billed/paid/outstanding.
  const financials = [];
  for (const p of projects) {
    const f = await clientFinancials(q, p.id);
    financials.push({ project_id: p.id, ...f });
  }
  dashboard.financials = financials;

  // Owner-facing documents.
  const documents = forProjects(await safeAll(q, 'SELECT * FROM project_documents', []));
  dashboard.owner_documents = {
    items: documents.slice(0, 10).map((d) => ({ id: d.id, title: d.title || d.file_name })),
    count: documents.length,
    empty_label: 'No owner-facing documents yet',
  };

  // Future phases (24 weekly/monthly reports, 25 handover readiness) — the
  // widgets exist now and degrade to their empty state until those phases ship.
  dashboard.periodic_reports = { items: [], count: 0, empty_label: 'Weekly/monthly reports arrive with Phase 24' };
  dashboard.handover_readiness = { percent: null, empty_label: 'Handover readiness arrives with Phase 25' };

  return dashboard;
}

// ---------------------------------------------------------------------------
// Portfolio view — when the client organization has multiple projects the
// portal lands here.
// ---------------------------------------------------------------------------

async function clientPortfolio(q, user) {
  const projectIds = await resolveClientProjects(q, user.id);
  const items = [];
  for (const pid of projectIds) {
    const p = (await safeAll(q, 'SELECT id, name, name_en, status, progress_percent FROM projects WHERE id = $1', [pid]))[0];
    if (!p) continue;
    const planned = (await safeAll(q, 'SELECT quantity FROM boq_items WHERE project_id = $1', [pid]))
      .reduce((s, b) => s + toNum(b.quantity), 0);
    const executed = (await safeAll(q, 'SELECT quantity, approval_state FROM quantity_measurements WHERE project_id = $1', [pid]))
      .filter((m) => m.approval_state === 'approved')
      .reduce((s, m) => s + toNum(m.quantity), 0);
    const f = await clientFinancials(q, pid);
    items.push({
      project_id: pid, name: p.name || p.name_en, status: p.status,
      progress_percent: toNum(p.progress_percent) || (planned > 0 ? Math.round((executed / planned) * 10000) / 100 : 0),
      outstanding: f.outstanding,
    });
  }
  return { items, is_portfolio: items.length > 1, empty_label: items.length === 0 ? 'Assign a client to preview this portal' : null };
}

// ---------------------------------------------------------------------------
// Action center — approvals, variation responses, document acknowledgements,
// overdue owner inputs.
// ---------------------------------------------------------------------------

async function clientActionCenter(q, user, { project_id = null } = {}) {
  const projectIds = await resolveClientProjects(q, user.id);
  const scoped = project_id != null && projectIds.includes(toNum(project_id)) ? [toNum(project_id)] : projectIds;
  // approval_requests rows have no project link — they are client-scoped by
  // nature; records WITH a project_id are project-filtered.
  const forProjects = (rows) => rows.filter((r) => r.project_id == null || scoped.includes(toNum(r.project_id)));
  const now = new Date();

  const pendingApprovals = forProjects((await safeAll(q, "SELECT * FROM approval_requests WHERE status = 'pending'", [])));
  const variationResponses = forProjects((await safeAll(q, "SELECT * FROM variations WHERE status = 'client_approval_reject'", [])));
  const documentAcks = forProjects((await safeAll(q, "SELECT * FROM project_documents WHERE status = 'awaiting_acknowledgement'", [])));
  const overdueInputs = pendingApprovals.filter((a) => a.due_date && new Date(a.due_date) < now);

  return {
    approvals: { items: pendingApprovals.map((a) => ({ id: a.id, title: a.title || 'Approval request', requested_at: a.created_at })), count: pendingApprovals.length, empty_label: 'No client approvals pending' },
    variation_responses: { items: variationResponses.map((v) => ({ id: v.id, variation_number: v.variation_number, title: v.title, amount: toNum(v.amount) })), count: variationResponses.length, empty_label: 'No variations awaiting your response' },
    document_acknowledgements: { items: documentAcks.map((d) => ({ id: d.id, title: d.title || d.file_name })), count: documentAcks.length, empty_label: 'No documents awaiting acknowledgement' },
    overdue_inputs: { items: overdueInputs.map((a) => ({ id: a.id, due_date: a.due_date })), count: overdueInputs.length, empty_label: 'No overdue owner inputs' },
  };
}

module.exports = {
  INTERNAL_ONLY_FIELDS,
  clientVisibilityFlags,
  stripInternalFields,
  resolveClientProjects,
  clientFinancials,
  clientDashboard,
  clientPortfolio,
  clientActionCenter,
};
