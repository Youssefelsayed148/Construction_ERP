// Phase 18 — subcontractor & supplier portals.
//
// Two separate scoped logins over the same data; neither sees the other's
// pricing. Both resolve their organization through Phase 3 tables
// (organization_users → organizations → project_participants), so the same
// login table gates the procurement-side and portal-side views consistently.
//
// ISOLATION RULES (enforced in the engine, verified by tests):
//   * a subcontractor sees only ITS OWN packages and commercial values
//     (sub_contracts, sub_work_verifications, payment_certificates) —
//     another subcontractor's record resolves to null and the route turns
//     that into 404, never the record;
//   * a supplier never sees a competing vendor's pricing — rfq_vendors /
//     bid_comparisons are filtered to the supplier's own rows BEFORE any
//     price field is read;
//   * expired assignments (project_participants.active_to in the past)
//     vanish from the scope.

'use strict';

const { nextNumber } = require('./numbering');

function toNum(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function dateOf(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function sameDay(v, d) {
  const a = dateOf(v);
  const b = dateOf(d);
  return a != null && a === b;
}

async function safeAll(q, sql, params) {
  try {
    return (await q(sql, params)).rows;
  } catch (e) {
    console.error(`[PORTAL] ${e.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Organization resolution — the SAME login table gates both portal sides.
// ---------------------------------------------------------------------------

async function resolveOrgForUser(q, userId, orgType) {
  const links = (await safeAll(q, 'SELECT organization_id, is_active FROM organization_users WHERE user_id = $1', [userId]))
    .filter((l) => l.is_active !== false);
  if (links.length === 0) return [];
  const all = await safeAll(q, 'SELECT * FROM organizations', []);
  return all.filter((o) => links.some((l) => toNum(l.organization_id) === toNum(o.id)) && o.org_type === orgType);
}

// ---------------------------------------------------------------------------
// SUBCONTRACTOR PORTAL
// ---------------------------------------------------------------------------

// The subcontractor's scope: own packages per project, from the
// legacy_subcontractor_id mapped in project_participants.
async function subcontractorScopeFor(q, userId, opts = {}) {
  const now = opts.now || new Date();
  const orgs = await resolveOrgForUser(q, userId, 'subcontractor');
  const packages = [];
  const seenPackages = new Set();
  const projectIds = new Set();
  for (const org of orgs) {
    const participants = await safeAll(q, 'SELECT * FROM project_participants WHERE organization_id = $1', [org.id]);
    for (const p of participants) {
      if (p.participant_type !== 'subcontractor') continue;
      if (p.portal_access_enabled === false) continue;
      if (p.active_from != null && new Date(p.active_from) > now) continue;
      if (p.active_to != null && new Date(p.active_to) < now) continue;
      const assignedUsers = await safeAll(q, 'SELECT user_id FROM project_participant_users WHERE project_participant_id = $1', [p.id]);
      if (assignedUsers.length > 0 && !assignedUsers.some((u) => toNum(u.user_id) === toNum(userId))) continue;
      const legacySubId = toNum(p.legacy_subcontractor_id);
      const contracts = await safeAll(q, 'SELECT * FROM sub_contracts WHERE subcontractor_id = $1', [legacySubId > 0 ? legacySubId : -1]);
      for (const c of contracts) {
        // The participant row grants the PROJECT; the legacy subcontractor id
        // grants the ORG's contracts. Scope = their intersection.
        if (toNum(c.project_id) !== toNum(p.project_id)) continue;
        if (opts.projectId != null && toNum(c.project_id) !== toNum(opts.projectId)) continue;
        if (seenPackages.has(toNum(c.id))) continue; // same contract reachable via several participants
        seenPackages.add(toNum(c.id));
        packages.push({ ...c, organization_id: toNum(org.id) });
        projectIds.add(toNum(c.project_id));
      }
    }
  }
  return { packages, projectIds: [...projectIds].sort((a, b) => a - b) };
}

// Cross-tenant read: a contract by ID is returned ONLY if it belongs to the
// caller's own packages. Otherwise null (route → 404). Never the record.
async function subContractForOrg(q, contractId, userId) {
  const scope = await subcontractorScopeFor(q, userId);
  const c = (await safeAll(q, 'SELECT * FROM sub_contracts WHERE id = $1', [contractId]))[0];
  if (!c) return null;
  return scope.packages.some((p) => toNum(p.id) === toNum(contractId)) ? c : null;
}

async function subcontractorDashboard(q, userId, { now = new Date() } = {}) {
  const scope = await subcontractorScopeFor(q, userId, { now });
  const packages = scope.packages;
  const contractIds = packages.map((c) => toNum(c.id));
  const projectIds = scope.projectIds;

  if (packages.length === 0) {
    return {
      packages: [], project_ids: [],
      setup_actions: ['You have no awarded packages on your account yet'],
      note: 'No subcontract package is assigned to your organization yet.',
    };
  }

  const dashboard = {
    packages: packages.map((c) => ({
      id: toNum(c.id), contract_number: c.contract_number, project_id: toNum(c.project_id),
      scope: c.scope, status: c.status,
      // Commercial values are the subcontractor's OWN — always visible to them.
      contract_value: toNum(c.contract_value), revised_amount: toNum(c.revised_amount),
    })),
    project_ids: projectIds,
  };

  const forContracts = (rows) => rows.filter((r) => contractIds.includes(toNum(r.sub_contract_id)));
  const today = dateOf(now);

  // Today's assigned work.
  const myWork = (await safeAll(q, 'SELECT * FROM work_orders', []))
    .filter((w) => projectIds.includes(toNum(w.project_id)))
    .filter((w) => toNum(w.assigned_to) === userId || contractIds.includes(toNum(w.sub_contract_id)))
    .filter((w) => sameDay(w.planned_start_date, today) || w.status === 'in_progress');
  dashboard.todays_work = { items: myWork.map((w) => ({ id: toNum(w.id), title: w.title, status: w.status })), count: myWork.length, empty_label: 'No work assigned today' };

  // Latest approved drawings.
  const drawings = (await safeAll(q, 'SELECT * FROM project_documents', []))
    .filter((d) => projectIds.includes(toNum(d.project_id)) && d.status === 'approved'
      && ['subcontractor', 'all_external'].includes(d.portal_visibility));
  dashboard.latest_drawings = { items: drawings.slice(0, 5).map((d) => ({ id: toNum(d.id), title: d.title || d.file_name, file_url: d.file_url })), count: drawings.length, empty_label: 'No approved drawings yet' };

  // Inspections needed + executed/approved quantities (sub_work_verifications).
  const verifications = forContracts(await safeAll(q, 'SELECT * FROM sub_work_verifications', []))
    .map((v) => ({ ...v, status: v.status || 'pending' }));
  dashboard.inspections_needed = {
    items: verifications.filter((v) => v.status === 'pending').map((v) => ({ id: toNum(v.id), sub_contract_id: toNum(v.sub_contract_id) })),
    count: verifications.filter((v) => v.status === 'pending').length,
    empty_label: 'No inspections needed',
  };
  dashboard.executed_quantities = {
    approved: Math.round(verifications.filter((v) => v.status === 'approved').reduce((s, v) => s + toNum(v.quantity_verified), 0) * 1000) / 1000,
    pending: Math.round(verifications.filter((v) => v.status === 'pending').reduce((s, v) => s + toNum(v.quantity_claimed), 0) * 1000) / 1000,
  };

  // Consultant observations + NCRs.
  const observations = (await safeAll(q, 'SELECT * FROM observations', []))
    .filter((o) => projectIds.includes(toNum(o.project_id)) && contractIds.includes(toNum(o.sub_contract_id))
      && ['raised', 'assigned', 'rectification_in_progress', 'submitted_for_verification'].includes(o.status));
  dashboard.observations = { items: observations.map((o) => ({ id: toNum(o.id), title: o.title, status: o.status })), count: observations.length, empty_label: 'No consultant observations open' };
  const ncrs = (await safeAll(q, 'SELECT * FROM ncrs', []))
    .filter((n) => projectIds.includes(toNum(n.project_id)) && contractIds.includes(toNum(n.sub_contract_id)) && n.status !== 'closed');
  dashboard.ncrs = { items: ncrs.map((n) => ({ id: toNum(n.id) })), count: ncrs.length, empty_label: 'No open NCRs' };

  // RFIs / submittals.
  const rfis = (await safeAll(q, 'SELECT * FROM project_rfis', []))
    .filter((r) => projectIds.includes(toNum(r.project_id)) && contractIds.includes(toNum(r.sub_contract_id)) && r.status !== 'closed');
  dashboard.rfis = { items: rfis.map((r) => ({ id: toNum(r.id), rfi_number: r.rfi_number, subject: r.subject, status: r.status })), count: rfis.length, empty_label: 'No RFIs open' };
  const submittals = (await safeAll(q, 'SELECT * FROM project_submittals', []))
    .filter((s) => projectIds.includes(toNum(s.project_id)) && contractIds.includes(toNum(s.sub_contract_id))
      && !['closed', 'resubmit_required'].includes(s.status));
  dashboard.submittals = { items: submittals.map((s) => ({ id: toNum(s.id), submittal_number: s.submittal_number, title: s.title, status: s.status })), count: submittals.length, empty_label: 'No submittals open' };

  // Payment application status (the shared Phase 13 certificates).
  const certificates = forContracts(await safeAll(q, "SELECT * FROM payment_certificates WHERE party_type = 'subcontractor'", []));
  dashboard.payment_applications = {
    items: certificates.map((c) => ({ id: toNum(c.id), certificate_number: c.certificate_number, net_certificate: toNum(c.net_certificate), status: c.status })),
    count: certificates.length,
    empty_label: 'No payment applications yet',
  };

  // Variations on my subcontracts.
  const variations = (await safeAll(q, 'SELECT * FROM variations', []))
    .filter((v) => v.sub_contract_id != null && contractIds.includes(toNum(v.sub_contract_id)));
  dashboard.variations = { items: variations.map((v) => ({ id: toNum(v.id), title: v.title, amount: toNum(v.amount), status: v.status })), count: variations.length, empty_label: 'No variations yet' };

  return dashboard;
}

// Acknowledge an instruction on a project the org is assigned to.
async function acknowledgeInstruction(q, userId, { project_id, instruction_id, response = null }) {
  const scope = await subcontractorScopeFor(q, userId, { projectId: project_id });
  if (scope.packages.length === 0) return null;
  const instruction = (await safeAll(q, 'SELECT * FROM engineer_instructions WHERE id = $1 AND project_id = $2', [instruction_id, project_id]))[0];
  if (!instruction) return null;
  if (!scope.packages.some((p) => toNum(p.id) === toNum(instruction.sub_contract_id))
      && toNum(instruction.assigned_to_user_id) !== toNum(userId)) return null;
  if (instruction.status !== 'issued') return null;
  await q(
    "UPDATE engineer_instructions SET status = 'acknowledged', acknowledged_at = $1, response = $2, updated_at = $1 WHERE id = $3",
    [new Date(), response, instruction_id]
  );
  try {
    const fresh = (await safeAll(q, 'SELECT action_item_id FROM engineer_instructions WHERE id = $1', [instruction_id]))[0];
    if (fresh && fresh.action_item_id != null) {
      await require('./actionService').complete(fresh.action_item_id, userId, { query: q });
    }
  } catch (e) { /* action sync best-effort */ }
  return (await safeAll(q, 'SELECT * FROM engineer_instructions WHERE id = $1', [instruction_id]))[0];
}

// Submit a payment application through the SHARED Phase 13 certificate table
// (party_type 'subcontractor'), cumulative-safe.
async function submitPaymentApplication(q, userId, {
  project_id, sub_contract_id, period_from, period_to, work_value,
  retention = 0, materials_deducted = 0, other_deductions = 0, notes = null,
}) {
  const contract = await subContractForOrg(q, sub_contract_id, userId);
  if (!contract || toNum(contract.project_id) !== toNum(project_id)) return null;

  const prior = (await safeAll(q,
    "SELECT * FROM payment_certificates WHERE party_type = 'subcontractor' AND sub_contract_id = $1",
    [sub_contract_id])).filter((c) => !['cancelled', 'void'].includes(c.status));
  const previousCumulative = Math.round(prior.reduce(
    (max, c) => Math.max(max, toNum(c.cumulative_certified)), 0
  ) * 100) / 100;
  const gross = Math.round(toNum(work_value) * 100) / 100;
  const netBefore = Math.max(gross - toNum(retention) - toNum(materials_deducted) - toNum(other_deductions), 0);

  const certificateNumber = await nextNumber(q, { table: 'payment_certificates', column: 'certificate_number', prefix: 'PC', pad: 4 });

  const r = await q(
    `INSERT INTO payment_certificates (certificate_number, party_type, project_id, sub_contract_id,
       period_from, period_to, gross_current_work, gross_certified, retention_held, advance_recovery,
       other_deductions, net_certificate, previous_cumulative, cumulative_certified, status, created_by)
     VALUES ($1,'subcontractor',$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,'draft',$13) RETURNING *`,
    [certificateNumber, project_id, sub_contract_id, period_from, period_to,
     gross, toNum(retention), toNum(materials_deducted), toNum(other_deductions),
     netBefore, previousCumulative, Math.round((previousCumulative + gross) * 100) / 100, userId]
  );
  return r.rows[0] || null;
}

// ---------------------------------------------------------------------------
// SUPPLIER PORTAL
// ---------------------------------------------------------------------------

async function supplierScope(q, userId, { now = new Date() } = {}) {
  const orgs = await resolveOrgForUser(q, userId, 'supplier');
  const supplierIds = new Set();
  const projectIds = new Set();
  const assignments = [];
  for (const org of orgs) {
    const participants = await safeAll(q, 'SELECT * FROM project_participants WHERE organization_id = $1', [org.id]);
    for (const p of participants) {
      if (p.participant_type !== 'supplier') continue;
      if (p.portal_access_enabled === false) continue;
      if (p.active_from != null && new Date(p.active_from) > now) continue;
      if (p.active_to != null && new Date(p.active_to) < now) continue;
      const assignedUsers = await safeAll(q, 'SELECT user_id FROM project_participant_users WHERE project_participant_id = $1', [p.id]);
      if (assignedUsers.length > 0 && !assignedUsers.some((u) => toNum(u.user_id) === toNum(userId))) continue;
      const legacySupplierId = toNum(p.legacy_supplier_id);
      if (legacySupplierId > 0) {
        supplierIds.add(legacySupplierId);
        assignments.push({ supplier_id: legacySupplierId, project_id: toNum(p.project_id), organization_id: toNum(org.id) });
      }
      projectIds.add(toNum(p.project_id));
    }
  }
  return { orgs, supplierIds: [...supplierIds], projectIds: [...projectIds].sort((a, b) => a - b), assignments };
}

function supplierAssigned(scope, supplierId, projectId) {
  return scope.assignments.some((a) => a.supplier_id === toNum(supplierId) && a.project_id === toNum(projectId));
}

async function supplierDashboard(q, userId, { now = new Date() } = {}) {
  const scope = await supplierScope(q, userId, { now });
  if (scope.supplierIds.length === 0) {
    return {
      setup_actions: ['Your supplier account is not linked to any project yet'],
      note: 'No supplier assignment is active for your account.',
    };
  }
  const dashboard = { supplier_ids: scope.supplierIds, project_ids: scope.projectIds };

  // Open RFQs where this supplier is a vendor — the org sees ONLY its own
  // quotation rows, never a competitor's pricing (Phase 12 quote comparison).
  const myQuotations = (await safeAll(q, 'SELECT * FROM supplier_quotations', []))
    .filter((q0) => scope.supplierIds.includes(toNum(q0.supplier_id)));
  const invitations = (await safeAll(q, 'SELECT * FROM rfq_vendors', []))
    .filter((v) => scope.supplierIds.includes(toNum(v.supplier_id)));
  const rfqIds = [...new Set([...myQuotations, ...invitations].map((row) => toNum(row.rfq_id)))];
  const rfqs = (await safeAll(q, 'SELECT * FROM rfqs', []))
    .filter((r) => rfqIds.includes(toNum(r.id)) && [...myQuotations, ...invitations]
      .some((row) => toNum(row.rfq_id) === toNum(r.id) && supplierAssigned(scope, row.supplier_id, r.project_id)));
  dashboard.open_rfqs = {
    items: rfqs.map((r) => {
      const mine = myQuotations.find((q0) => toNum(q0.rfq_id) === toNum(r.id) && supplierAssigned(scope, q0.supplier_id, r.project_id));
      return { id: toNum(r.id), rfq_number: r.rfq_number || String(r.id), deadline: r.due_date || null, my_quoted_price: mine != null ? toNum(mine.total_price) : null };
    }),
    count: rfqs.length,
    empty_label: 'No open RFQs',
  };

  // Awarded POs.
  const pos = (await safeAll(q, 'SELECT * FROM purchase_orders', []))
    .filter((p) => supplierAssigned(scope, p.supplier_id, p.project_id));
  dashboard.awarded_pos = {
    items: pos.map((p) => ({ id: toNum(p.id), order_number: p.order_number, total_amount: toNum(p.total_amount), status: p.status })),
    count: pos.length,
    empty_label: 'No awarded purchase orders',
  };

  // Deliveries on my POs.
  const myPoIds = pos.map((p) => toNum(p.id));
  const deliveries = (await safeAll(q, 'SELECT * FROM deliveries', []))
    .filter((d) => myPoIds.includes(toNum(d.purchase_order_id)));
  dashboard.deliveries = {
    items: deliveries.map((d) => ({ id: toNum(d.id), status: d.status, delivery_date: d.delivery_date || d.expected_date || null })),
    count: deliveries.length,
    empty_label: 'No deliveries scheduled',
  };

  // Inspection / rejection status (MIRs on my deliveries).
  const myDeliveryIds = deliveries.map((d) => toNum(d.id));
  const mirs = (await safeAll(q, 'SELECT * FROM material_inspection_requests', []))
    .filter((m) => myDeliveryIds.includes(toNum(m.delivery_id)));
  dashboard.inspections = {
    items: mirs.map((m) => ({ id: toNum(m.id), status: m.status })),
    count: mirs.length,
    empty_label: 'No material inspections pending',
  };

  // Invoice / payment status.
  const invoices = (await safeAll(q, 'SELECT * FROM supplier_invoices', []))
    .filter((i) => (i.purchase_order_id != null && myPoIds.includes(toNum(i.purchase_order_id)))
      || (i.project_id != null && supplierAssigned(scope, i.supplier_id, i.project_id)));
  dashboard.invoices = {
    items: invoices.map((i) => ({ id: toNum(i.id), invoice_number: i.invoice_number, total_amount: toNum(i.total_amount), status: i.status })),
    count: invoices.length,
    empty_label: 'No supplier invoices yet',
  };

  // Expiring compliance documents (90-day horizon).
  const horizon = new Date(now.getTime() + 90 * 86400000);
  const expiring = (await safeAll(q, 'SELECT * FROM organization_documents', []))
    .filter((d) => scope.orgs.some((o) => toNum(o.id) === toNum(d.organization_id))
      && d.expiry_date != null && new Date(d.expiry_date) < horizon);
  dashboard.expiring_documents = {
    items: expiring.map((d) => ({ id: toNum(d.id), document_type: d.document_type, expiry_date: d.expiry_date })),
    count: expiring.length,
    empty_label: 'No compliance documents expiring within 90 days',
  };

  return dashboard;
}

async function assertSubcontractorProject(q, userId, projectId) {
  const scope = await subcontractorScopeFor(q, userId, { projectId });
  if (scope.packages.length === 0) throw new Error('Project is outside the subcontractor scope');
  return scope;
}

async function assertSupplierProject(q, userId, projectId) {
  const scope = await supplierScope(q, userId);
  if (!scope.projectIds.includes(toNum(projectId))) throw new Error('Project is outside the supplier scope');
  return scope;
}

async function supplierPurchaseOrder(q, userId, purchaseOrderId) {
  const scope = await supplierScope(q, userId);
  const po = (await safeAll(q, 'SELECT * FROM purchase_orders WHERE id = $1', [purchaseOrderId]))[0];
  if (!po || !supplierAssigned(scope, po.supplier_id, po.project_id)) return null;
  return po;
}

async function supplierRfq(q, userId, rfqId) {
  const scope = await supplierScope(q, userId);
  const rfq = (await safeAll(q, 'SELECT * FROM rfqs WHERE id = $1', [rfqId]))[0];
  if (!rfq || !scope.projectIds.includes(toNum(rfq.project_id))) return null;
  const invitations = await safeAll(q, 'SELECT * FROM rfq_vendors WHERE rfq_id = $1', [rfqId]);
  const quoted = await safeAll(q, 'SELECT * FROM supplier_quotations WHERE rfq_id = $1', [rfqId]);
  const supplierIds = [...new Set([...invitations, ...quoted]
    .filter((r) => supplierAssigned(scope, r.supplier_id, rfq.project_id))
    .map((r) => toNum(r.supplier_id)))];
  if (supplierIds.length === 0) return null;
  return { rfq, scope, supplierIds };
}

async function createPortalSubmission(q, userId, {
  organization_id, project_id, submission_type, related_entity_type = null,
  related_entity_id = null, payload = {},
}) {
  const r = await q(
    `INSERT INTO portal_submissions (organization_id, project_id, submission_type,
       related_entity_type, related_entity_id, payload, submitted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [organization_id || null, project_id, submission_type, related_entity_type,
     related_entity_id, JSON.stringify(payload || {}), userId]
  );
  return r.rows[0];
}

module.exports = {
  resolveOrgForUser,
  subContractForOrg,
  subcontractorScopeFor,
  subcontractorDashboard,
  acknowledgeInstruction,
  submitPaymentApplication,
  supplierScope,
  supplierDashboard,
  assertSubcontractorProject,
  assertSupplierProject,
  supplierPurchaseOrder,
  supplierRfq,
  createPortalSubmission,
};
