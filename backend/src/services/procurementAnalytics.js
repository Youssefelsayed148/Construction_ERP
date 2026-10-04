// Phase 5.4 (spec 08) - vendor performance and spend queries. Read-only, derived from the documents; no
// stored scores. Every figure is documented here:
//
//   Live PO              status in LIVE_PO_STATUSES (issued onwards; drafts, approvals in progress, rejected and
//                        cancelled orders are not spend).
//   committed            Σ over live PO lines of qty x unit rate - discount.
//   delivered_value      Σ delivered quantity x unit rate over the same lines.
//   invoiced             Σ line_total of the lines of APPROVED supplier invoices (invoices without lines are not
//                        attributable to a category or project and are left out).
//   on_time_rate         deliveries received on or before the PO's needed_by date / deliveries of POs that have one.
//   acceptance_rate      accepted quantity / inspected quantity over decided MIRs.
//   exception_rate       invoices with at least one AP review exception / invoices.
//   response_rate        RFQs the supplier answered / RFQs it was invited to.
//   win_rate             quotations awarded / quotations submitted.
//   avg_lead_days        mean days from PO issue to the first delivery.
//   score                the unweighted mean of the rates that exist (on_time, acceptance, 1 - exception, response),
//                        NULL when none exists. A summary for sorting, not a rating of record.
//
// A project-bound caller passes projectIds: only those projects' orders count.
'use strict';

const LIVE_PO_STATUSES = ['approved', 'confirmed', 'issued', 'acknowledged', 'partially_fully_delivered', 'partially_delivered', 'fully_delivered', 'closed'];
const GROUPS = { category: "COALESCE(im.category, 'uncategorised')", project: 'po.project_id', supplier: 'po.supplier_id' };

const toNum = (v) => (v == null ? 0 : Number(v));
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;
const round3 = (n) => Math.round((toNum(n) + Number.EPSILON) * 1000) / 1000;

class AnalyticsError extends Error {
  constructor(status, code, message, params = {}) { super(message); this.status = status; this.error_code = code; this.error_params = params; }
}

function windowClause(column, { from, to }, params) {
  const conds = [];
  if (from) conds.push(`${column} >= $${params.push(from)}::date`);
  if (to) conds.push(`${column} < ($${params.push(to)}::date + 1)`);
  return conds;
}

function projectClause(column, projectIds, params, projectId) {
  const conds = [];
  if (projectId != null) conds.push(`${column} = $${params.push(Number(projectId))}`);
  if (Array.isArray(projectIds)) conds.push(`${column} = ANY($${params.push(projectIds.map(Number))}::int[])`);
  return conds;
}

function validateWindow({ from, to }) {
  for (const [k, v] of [['from', from], ['to', to]]) {
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new AnalyticsError(400, 'date_invalid', `${k} must be YYYY-MM-DD`, { field: k, value: v });
  }
  if (from && to && String(from) > String(to)) throw new AnalyticsError(400, 'date_range_inverted', 'from is after to', { from, to });
}

// ---------------------------------------------------------------------------------------------------
// Spend by category | project | supplier
// ---------------------------------------------------------------------------------------------------
async function spend(q, { group_by = 'category', from = null, to = null, project_id = null, projectIds = null } = {}) {
  if (!GROUPS[group_by]) throw new AnalyticsError(400, 'group_by_invalid', `group_by must be one of ${Object.keys(GROUPS).join(', ')}`, { group_by });
  validateWindow({ from, to });
  const key = GROUPS[group_by];

  const params = [LIVE_PO_STATUSES];
  const conds = ['po.status = ANY($1::text[])', ...windowClause('po.created_at', { from, to }, params), ...projectClause('po.project_id', projectIds, params, project_id)];
  const committed = (await q(
    `SELECT ${key} AS key,
            SUM(GREATEST(l.quantity * COALESCE(l.unit_rate, 0) - COALESCE(l.discount, 0), 0)) AS committed,
            SUM(COALESCE(l.delivered_quantity, 0) * COALESCE(l.unit_rate, 0)) AS delivered_value,
            COUNT(DISTINCT po.id)::int AS orders
       FROM purchase_orders po
       JOIN purchase_order_lines l ON l.purchase_order_id = po.id
       LEFT JOIN item_master im ON im.id = l.material_id
      WHERE ${conds.join(' AND ')} GROUP BY 1`, params)).rows;

  const iparams = [];
  const iconds = ["si.status IN ('approved', 'paid')", ...windowClause('si.created_at', { from, to }, iparams)];
  const projectCol = 'po.project_id';
  iconds.push(...projectClause(projectCol, projectIds, iparams, project_id));
  const invoiced = (await q(
    `SELECT ${key} AS key, SUM(sil.line_total) AS invoiced
       FROM supplier_invoice_lines sil
       JOIN supplier_invoices si ON si.id = sil.supplier_invoice_id
       LEFT JOIN purchase_orders po ON po.id = si.purchase_order_id
       LEFT JOIN item_master im ON im.id = sil.material_id
      WHERE ${iconds.join(' AND ')} GROUP BY 1`.replace(/po\.supplier_id/g, group_by === 'supplier' ? 'si.supplier_id' : 'po.supplier_id'),
    iparams)).rows;

  const rows = new Map();
  const ensure = (k) => { const id = k == null ? 'none' : String(k); if (!rows.has(id)) rows.set(id, { key: k == null ? null : k, committed: 0, delivered_value: 0, invoiced: 0, orders: 0 }); return rows.get(id); };
  for (const r of committed) { const e = ensure(r.key); e.committed = round2(r.committed); e.delivered_value = round2(r.delivered_value); e.orders = r.orders; }
  for (const r of invoiced) { ensure(r.key).invoiced = round2(r.invoiced); }

  const data = [...rows.values()];
  if (group_by === 'project' || group_by === 'supplier') {
    const ids = data.map((d) => d.key).filter((k) => k != null);
    if (ids.length) {
      const table = group_by === 'project' ? 'projects' : 'suppliers';
      const names = (await q(`SELECT id, ${group_by === 'project' ? 'name' : 'name_en'} AS name FROM ${table} WHERE id = ANY($1::int[])`, [ids])).rows;
      const byId = new Map(names.map((n) => [n.id, n.name]));
      for (const d of data) d.name = d.key == null ? null : (byId.get(d.key) || null);
    }
  }
  data.sort((a, b) => b.committed - a.committed || b.invoiced - a.invoiced);
  const totals = data.reduce((t, d) => ({ committed: round2(t.committed + d.committed), delivered_value: round2(t.delivered_value + d.delivered_value), invoiced: round2(t.invoiced + d.invoiced), orders: t.orders + d.orders }),
    { committed: 0, delivered_value: 0, invoiced: 0, orders: 0 });
  return { group_by, from, to, rows: data, totals };
}

// ---------------------------------------------------------------------------------------------------
// Vendor performance
// ---------------------------------------------------------------------------------------------------
async function vendorPerformance(q, { from = null, to = null, supplier_id = null, project_id = null, projectIds = null } = {}) {
  validateWindow({ from, to });
  const base = (column, extra = []) => {
    const params = [];
    const conds = [...windowClause(column, { from, to }, params), ...extra];
    return { params, conds };
  };
  const poScope = (alias, params) => {
    const c = [];
    if (supplier_id != null) c.push(`${alias}.supplier_id = $${params.push(Number(supplier_id))}`);
    c.push(...projectClause(`${alias}.project_id`, projectIds, params, project_id));
    return c;
  };

  // orders and value
  let b = base('po.created_at');
  b.conds.push('po.status = ANY($' + (b.params.push(LIVE_PO_STATUSES)) + '::text[])', ...poScope('po', b.params));
  const orders = (await q(
    `SELECT po.supplier_id, COUNT(DISTINCT po.id)::int AS po_count,
            SUM(GREATEST(l.quantity * COALESCE(l.unit_rate, 0) - COALESCE(l.discount, 0), 0)) AS po_value
       FROM purchase_orders po JOIN purchase_order_lines l ON l.purchase_order_id = po.id
      WHERE ${b.conds.join(' AND ')} GROUP BY po.supplier_id`, b.params)).rows;

  // deliveries: on time, lead time
  b = base('d.delivery_date');
  b.conds.push(...poScope('po', b.params));
  const deliveries = (await q(
    `SELECT po.supplier_id,
            COUNT(*) FILTER (WHERE po.needed_by IS NOT NULL)::int AS dated,
            COUNT(*) FILTER (WHERE po.needed_by IS NOT NULL AND d.delivery_date <= po.needed_by)::int AS on_time
       FROM deliveries d JOIN purchase_orders po ON po.id = d.purchase_order_id
      ${b.conds.length ? 'WHERE ' + b.conds.join(' AND ') : ''} GROUP BY po.supplier_id`, b.params)).rows;
  b = base('po.issued_at');
  b.conds.push('po.issued_at IS NOT NULL', ...poScope('po', b.params));
  const lead = (await q(
    `SELECT t.supplier_id, AVG(t.days) AS avg_lead_days FROM (
       SELECT po.supplier_id, (MIN(d.delivery_date) - po.issued_at::date) AS days
         FROM purchase_orders po JOIN deliveries d ON d.purchase_order_id = po.id
        WHERE ${b.conds.join(' AND ')} GROUP BY po.id, po.supplier_id) t GROUP BY t.supplier_id`, b.params)).rows;

  // inspection outcome
  b = base('mir.created_at');
  b.conds.push("mir.status <> 'pending'");
  if (supplier_id != null) b.conds.push(`mir.supplier_id = $${b.params.push(Number(supplier_id))}`);
  b.conds.push(...projectClause('mir.project_id', projectIds, b.params, project_id));
  const inspections = (await q(
    `SELECT mir.supplier_id, SUM(ml.quantity) AS inspected, SUM(ml.accepted_quantity) AS accepted, SUM(ml.rejected_quantity) AS rejected
       FROM mir_lines ml JOIN material_inspection_requests mir ON mir.id = ml.mir_id
      WHERE ${b.conds.join(' AND ')} GROUP BY mir.supplier_id`, b.params)).rows;

  // invoices and AP exceptions
  b = base('si.created_at');
  if (supplier_id != null) b.conds.push(`si.supplier_id = $${b.params.push(Number(supplier_id))}`);
  if (project_id != null || Array.isArray(projectIds)) b.conds.push(...projectClause('po.project_id', projectIds, b.params, project_id));
  const invoices = (await q(
    `SELECT si.supplier_id, COUNT(*)::int AS invoices,
            COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM ap_review_queue aq WHERE aq.supplier_invoice_id = si.id))::int AS with_exceptions
       FROM supplier_invoices si LEFT JOIN purchase_orders po ON po.id = si.purchase_order_id
      ${b.conds.length ? 'WHERE ' + b.conds.join(' AND ') : ''} GROUP BY si.supplier_id`, b.params)).rows;

  // sourcing
  b = base('r.created_at');
  if (supplier_id != null) b.conds.push(`rv.supplier_id = $${b.params.push(Number(supplier_id))}`);
  b.conds.push(...projectClause('r.project_id', projectIds, b.params, project_id));
  const sourcing = (await q(
    `SELECT rv.supplier_id, COUNT(*)::int AS invited,
            COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM supplier_quotations sq WHERE sq.rfq_id = rv.rfq_id AND sq.supplier_id = rv.supplier_id))::int AS quoted,
            COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM supplier_quotations sq WHERE sq.rfq_id = rv.rfq_id AND sq.supplier_id = rv.supplier_id AND sq.awarded))::int AS awarded
       FROM rfq_vendors rv JOIN rfqs r ON r.id = rv.rfq_id
      ${b.conds.length ? 'WHERE ' + b.conds.join(' AND ') : ''} GROUP BY rv.supplier_id`, b.params)).rows;

  const ids = new Set([...orders, ...deliveries, ...inspections, ...invoices, ...sourcing].map((r) => r.supplier_id));
  const names = ids.size ? (await q('SELECT id, code, name_en, name_ar FROM suppliers WHERE id = ANY($1::int[])', [[...ids]])).rows : [];
  const nameOf = new Map(names.map((n) => [n.id, n]));
  const idx = (rows) => new Map(rows.map((r) => [r.supplier_id, r]));
  const o = idx(orders); const d = idx(deliveries); const l = idx(lead); const i = idx(inspections); const inv = idx(invoices); const s = idx(sourcing);

  const rate = (num, den) => (den > 0 ? round3(num / den) : null);
  const data = [...ids].map((id) => {
    const sup = nameOf.get(id) || {};
    const del = d.get(id) || {}; const ins = i.get(id) || {}; const iv = inv.get(id) || {}; const so = s.get(id) || {};
    const on_time_rate = rate(toNum(del.on_time), toNum(del.dated));
    const acceptance_rate = rate(toNum(ins.accepted), toNum(ins.inspected));
    const exception_rate = rate(toNum(iv.with_exceptions), toNum(iv.invoices));
    const response_rate = rate(toNum(so.quoted), toNum(so.invited));
    const win_rate = rate(toNum(so.awarded), toNum(so.quoted));
    const parts = [on_time_rate, acceptance_rate, exception_rate == null ? null : round3(1 - exception_rate), response_rate].filter((x) => x != null);
    return {
      supplier_id: id, supplier_code: sup.code || null, supplier_name_en: sup.name_en || null, supplier_name_ar: sup.name_ar || null,
      po_count: toNum((o.get(id) || {}).po_count), po_value: round2((o.get(id) || {}).po_value),
      deliveries: toNum(del.dated), on_time_rate,
      avg_lead_days: (l.get(id) || {}).avg_lead_days == null ? null : round3((l.get(id) || {}).avg_lead_days),
      inspected_quantity: round3(ins.inspected), accepted_quantity: round3(ins.accepted), rejected_quantity: round3(ins.rejected), acceptance_rate,
      invoices: toNum(iv.invoices), invoices_with_exceptions: toNum(iv.with_exceptions), exception_rate,
      rfqs_invited: toNum(so.invited), quotations_submitted: toNum(so.quoted), quotations_awarded: toNum(so.awarded), response_rate, win_rate,
      score: parts.length ? round3(parts.reduce((a, b2) => a + b2, 0) / parts.length) : null,
    };
  });
  data.sort((a, b2) => b2.po_value - a.po_value || a.supplier_id - b2.supplier_id);
  return { from, to, rows: data };
}

module.exports = { AnalyticsError, LIVE_PO_STATUSES, spend, vendorPerformance };
