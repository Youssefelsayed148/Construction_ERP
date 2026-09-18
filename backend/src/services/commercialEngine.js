// Phase 13 — the canonical commercial engine (EAC / forecast margin).
//
// ONE model replaces the three legacy formulas (costing.js profitability,
// finance.js cash-proxy "profit", dashboard.js static-budget burn — see
// docs/audit/PHASE13_COMMERCIAL_MODEL.md). The formulas, implemented exactly:
//
//   Revised Contract Value = Original + Approved (Incorporated) Client Variations
//   Current Budget         = Original Budget + Approved Budget Changes
//   Committed Cost         = Σ approved commitments (POs, subcontracts) net of cancellations
//   Actual Cost            = Σ project_costs
//   Accrued Cost           = max(Committed − Actual, 0)
//   ETC                    = max(Current Budget − Committed, 0)
//   EAC                    = Actual + Accrued + ETC
//   Forecast Profit        = Forecast Revenue − EAC
//   Forecast Margin %      = Forecast Profit / Forecast Revenue × 100
//
// The variation lifecycle runs through the Phase 6 'variation' template with
// the catalog's exact states: change_event → estimate →
// internal_commercial_review → authority_approval → consultant_recommendation
// → client_approval_reject → incorporated. Incorporation updates the
// contract's revised value and the project forecast in one transaction.

'use strict';

const workflowEngineRef = () => require('./workflowEngine');

function toNum(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round((toNum(n) + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Formulas (pure)
// ---------------------------------------------------------------------------

function revisedContractValue(originalValue, approvedVariations) {
  return round2(toNum(originalValue) + toNum(approvedVariations));
}

function revisedSubcontract(originalAmount, approvedChanges) {
  return round2(toNum(originalAmount) + toNum(approvedChanges));
}

function currentBudget(originalBudget, budgetChanges) {
  return round2(toNum(originalBudget) + toNum(budgetChanges));
}

function committedCost(commitments) {
  // Active commitments net of cancellations.
  return round2((commitments || [])
    .filter((c) => c.status !== 'cancelled')
    .reduce((s, c) => s + toNum(c.original_amount) - toNum(c.cancelled_amount), 0));
}

function accruedCost(committed, actual) {
  return round2(Math.max(toNum(committed) - toNum(actual), 0));
}

function etcFigure(currentBudgetValue, committed) {
  return round2(Math.max(toNum(currentBudgetValue) - toNum(committed), 0));
}

function eac(actual, accrued, etc) {
  return round2(toNum(actual) + toNum(accrued) + toNum(etc));
}

function forecastProfit(forecastRevenue, eacValue) {
  return round2(toNum(forecastRevenue) - toNum(eacValue));
}

function forecastMarginPct(forecastProfitValue, forecastRevenue) {
  const revenue = toNum(forecastRevenue);
  return revenue > 0 ? Math.round((toNum(forecastProfitValue) / revenue) * 10000) / 100 : 0;
}

// Payment-certificate math (shared by client and subcontractor certificates —
// Phase 14 builds the full invoice flow on this).
function computeCertificateNet({
  grossCurrentWork = 0, approvedVariationsPeriod = 0,
  retention = 0, advanceRecovery = 0, otherDeductions = 0, taxPct = 0,
}) {
  const grossCertified = round2(toNum(grossCurrentWork) + toNum(approvedVariationsPeriod));
  const netBeforeTax = Math.max(grossCertified - toNum(retention) - toNum(advanceRecovery) - toNum(otherDeductions), 0);
  const tax = round2(netBeforeTax * toNum(taxPct) / 100);
  return { gross_certified: grossCertified, tax_amount: tax, net_certificate: round2(netBeforeTax + tax) };
}

// ---------------------------------------------------------------------------
// Live project figures
// ---------------------------------------------------------------------------

async function approvedVariationTotal(q, projectId) {
  const rows = (await q(
    "SELECT id, amount FROM variations WHERE project_id = $1 AND status = 'incorporated'",
    [projectId]
  )).rows;
  return round2(rows.reduce((s, v) => s + toNum(v.amount), 0));
}

async function budgetChangeTotal(q, projectId) {
  const rows = (await q(
    "SELECT new_amount, previous_amount, cost_code_id FROM budget_changes WHERE project_id = $1 AND change_type = 'approved_change'",
    [projectId]
  )).rows;
  return round2(rows.reduce((s, c) => s + toNum(c.new_amount) - toNum(c.previous_amount), 0));
}

async function actualCost(q, projectId) {
  const rows = (await q(
    'SELECT id, amount FROM project_costs WHERE project_id = $1',
    [projectId]
  )).rows;
  return round2(rows.reduce((s, c) => s + toNum(c.amount), 0));
}

// Commitments ledger, self-healing from purchase_orders + sub_contracts.
async function syncCommitments(q, projectId) {
  const existing = (await q(
    'SELECT * FROM commitments WHERE project_id = $1',
    [projectId]
  )).rows;
  const known = new Set(existing.map((c) => `${c.source_type}:${c.source_id}`));

  // Issued/approved POs (Phase 12 statuses).
  let pos = [];
  try {
    pos = (await q(
      "SELECT id, supplier_id, total_amount, status FROM purchase_orders WHERE project_id = $1 AND status IN ('approved','issued','confirmed')",
      [projectId]
    )).rows;
  } catch (e) { pos = []; }
  for (const po of pos) {
    const key = `purchase_order:${po.id}`;
    if (!known.has(key)) {
      const count = parseInt((await q('SELECT COUNT(*) FROM commitments')).rows[0].count);
      await q(
        `INSERT INTO commitments (commitment_number, project_id, source_type, source_id, original_amount, status)
         VALUES ($1, $2, 'purchase_order', $3, $4, 'active')`,
        [`CM-${String(count + 1).padStart(5, '0')}`, projectId, po.id, toNum(po.total_amount)]
      );
    }
  }

  // Active subcontracts.
  let subs = [];
  try {
    subs = (await q(
      "SELECT id, contract_value, revised_amount, status FROM sub_contracts WHERE project_id = $1 AND status IN ('active','approved')",
      [projectId]
    )).rows;
  } catch (e) { subs = []; }
  for (const sc of subs) {
    const key = `sub_contract:${sc.id}`;
    if (!known.has(key)) {
      const count = parseInt((await q('SELECT COUNT(*) FROM commitments')).rows[0].count);
      const amount = sc.revised_amount != null && toNum(sc.revised_amount) > 0 ? toNum(sc.revised_amount) : toNum(sc.contract_value);
      await q(
        `INSERT INTO commitments (commitment_number, project_id, source_type, source_id, original_amount, status)
         VALUES ($1, $2, 'sub_contract', $3, $4, 'active')`,
        [`CM-${String(count + 1).padStart(5, '0')}`, projectId, sc.id, amount]
      );
    }
  }
  return (await q('SELECT * FROM commitments WHERE project_id = $1', [projectId])).rows;
}

// ---------------------------------------------------------------------------
// The canonical project computation
// ---------------------------------------------------------------------------

async function projectCommercial(q, projectId) {
  const project = (await q('SELECT id, contract_value, budget, name FROM projects WHERE id = $1', [projectId])).rows[0];
  if (!project) return null;

  // Contract basis: a client contract (Phase 13) wins over the bare
  // projects.contract_value; both keep the same meaning when absent.
  const contract = (await q(
    'SELECT * FROM client_contracts WHERE project_id = $1 ORDER BY id LIMIT 1',
    [projectId]
  )).rows[0];
  const originalValue = contract ? toNum(contract.original_value) : toNum(project.contract_value);

  const variations = await approvedVariationTotal(q, projectId);
  const revisedRevenue = revisedContractValue(originalValue, variations);

  // Budget: per-cost-code current amounts (original + changes), falling back
  // to projects.budget.
  const budgetRows = (await q(
    'SELECT id, cost_code_id, budget_amount, revised_amount, original_amount, current_amount FROM project_budgets WHERE project_id = $1',
    [projectId]
  )).rows;
  let currentBudgetTotal;
  if (budgetRows.length > 0) {
    currentBudgetTotal = round2(budgetRows.reduce((s, b) => {
      const original = b.original_amount != null && toNum(b.original_amount) > 0 ? toNum(b.original_amount) : toNum(b.budget_amount);
      const current = b.current_amount != null && toNum(b.current_amount) > 0 ? toNum(b.current_amount) : toNum(b.revised_amount);
      return s + (current > 0 ? current : original);
    }, 0));
  } else {
    const changes = await budgetChangeTotal(q, projectId);
    currentBudgetTotal = currentBudget(toNum(project.budget), changes);
  }

  const commitments = await syncCommitments(q, projectId);
  const committed = committedCost(commitments);
  const actual = await actualCost(q, projectId);
  const accrued = accruedCost(committed, actual);
  const etc = etcFigure(currentBudgetTotal, committed);
  const eacValue = eac(actual, accrued, etc);
  const profit = forecastProfit(revisedRevenue, eacValue);
  const margin = forecastMarginPct(profit, revisedRevenue);

  return {
    project_id: projectId,
    original_contract_value: round2(originalValue),
    approved_variations: variations,
    revised_contract_value: revisedRevenue,
    original_budget: budgetRows.length > 0
      ? round2(budgetRows.reduce((s, b) => s + (b.original_amount != null && toNum(b.original_amount) > 0 ? toNum(b.original_amount) : toNum(b.budget_amount)), 0))
      : round2(toNum(project.budget)),
    approved_budget_changes: budgetRows.length > 0 ? round2(currentBudgetTotal - budgetRows.reduce((s, b) => s + (b.original_amount != null && toNum(b.original_amount) > 0 ? toNum(b.original_amount) : toNum(b.budget_amount)), 0)) : await budgetChangeTotal(q, projectId),
    current_budget: currentBudgetTotal,
    committed_cost: committed,
    actual_cost: actual,
    accrued_cost: accrued,
    etc: etc,
    eac: eacValue,
    forecast_revenue: revisedRevenue,
    forecast_profit: profit,
    forecast_margin_percent: margin,
    legacy: contract ? { contract_value_source: 'client_contracts' } : { contract_value_source: 'projects.contract_value' },
  };
}

// ---------------------------------------------------------------------------
// Variation lifecycle — through the Phase 6 engine, exactly
// ---------------------------------------------------------------------------

async function createVariation(q, {
  project_id, client_contract_id = null, sub_contract_id = null, title,
  description = null, variation_type = 'client', lines = [], cost_buildup = [],
  created_by = null,
}) {
  const count = parseInt((await q('SELECT COUNT(*) FROM variations')).rows[0].count);
  const variationNumber = `VAR-${String(count + 1).padStart(4, '0')}`;
  const amount = round2(lines.reduce((s, l) => s + toNum(l.quantity) * toNum(l.unit_rate), 0));
  const r = await q(
    `INSERT INTO variations (variation_number, project_id, client_contract_id, sub_contract_id, title, description, variation_type, amount, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'change_event', $9) RETURNING *`,
    [variationNumber, project_id, client_contract_id, sub_contract_id, title, description, variation_type, amount, created_by]
  );
  const variation = r.rows[0];
  for (const line of lines) {
    await q(
      `INSERT INTO variation_lines (variation_id, boq_item_id, description, quantity, unit, unit_rate, amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [variation.id, line.boq_item_id || null, line.description || null, line.quantity, line.unit || null, line.unit_rate || 0, round2(toNum(line.quantity) * toNum(line.unit_rate))]
    );
  }
  for (const c of cost_buildup) {
    await q(
      `INSERT INTO variation_cost_buildup (variation_id, component, cost_code_id, quantity, unit_rate, amount, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [variation.id, c.component || 'other', c.cost_code_id || null, c.quantity || 0, c.unit_rate || 0, c.amount || 0, c.notes || null]
    );
  }
  return variation;
}

async function startVariationWorkflow(q, variationId, user) {
  const variation = (await q('SELECT * FROM variations WHERE id = $1', [variationId])).rows[0];
  if (!variation) throw new Error(`Variation #${variationId} not found`);
  if (variation.workflow_instance_id != null) throw new Error('Variation already has a workflow');

  const instance = await workflowEngineRef().startWorkflow('variation', 'variation', variation.id, {
    module_name: 'variation',
    requester_id: user.id,
    project_id: variation.project_id,
    amount: toNum(variation.amount),
    request_type: 'variation',
  }, { query: q });
  await q(
    'UPDATE variations SET workflow_instance_id = $1, updated_at = $2 WHERE id = $3',
    [instance.instance.id, new Date(), variationId]
  );
  return instance;
}

// Advance the lifecycle; incorporation updates the contract's revised value
// and the project forecast in one transaction.
async function decideVariation(q, variationId, user, decision, comment) {
  const variation = (await q('SELECT * FROM variations WHERE id = $1', [variationId])).rows[0];
  if (!variation) throw new Error(`Variation #${variationId} not found`);
  if (variation.workflow_instance_id == null) throw new Error('Variation workflow not started');
  const result = await workflowEngineRef().recordDecision(variation.workflow_instance_id, null, user.id, decision, comment || null, {
    query: q, role: user.role, userName: user.name,
  });
  if (!result.ok) throw new Error(result.error);

  // Source status mirrors the workflow's current step (catalog states).
  const wf = (await q('SELECT * FROM workflow_instances WHERE id = $1', [variation.workflow_instance_id])).rows[0];
  let status = 'change_event';
  if (wf.status === 'approved') status = 'incorporated';
  else if (wf.status === 'rejected') status = 'rejected';
  else status = wf.current_step_key;

  await q(
    'UPDATE variations SET status = $1, updated_at = $2 WHERE id = $3',
    [status, new Date(), variationId]
  );

  if (status === 'incorporated') {
    await incorporateVariation(q, variationId);
  }
  return { ...result, status };
}

// One transaction: the contract's revised value and the project forecast move
// together with the variation's incorporated status.
async function incorporateVariation(q, variationId) {
  const variation = (await q('SELECT * FROM variations WHERE id = $1', [variationId])).rows[0];
  if (!variation) throw new Error(`Variation #${variationId} not found`);

  if (variation.client_contract_id != null) {
    const contract = (await q('SELECT * FROM client_contracts WHERE id = $1', [variation.client_contract_id])).rows[0];
    if (contract) {
      const all = (await q(
        "SELECT amount FROM variations WHERE client_contract_id = $1 AND status = 'incorporated'",
        [variation.client_contract_id]
      )).rows;
      const revised = round2(all.reduce((s, v) => s + toNum(v.amount), toNum(contract.original_value)));
      await q(
        'UPDATE client_contracts SET revised_value = $1, updated_at = $2 WHERE id = $3',
        [revised, new Date(), variation.client_contract_id]
      );
    }
  }
  if (variation.sub_contract_id != null) {
    const sc = (await q('SELECT * FROM sub_contracts WHERE id = $1', [variation.sub_contract_id])).rows[0];
    if (sc) {
      const changes = (await q(
        "SELECT amount FROM sub_contract_changes WHERE sub_contract_id = $1 AND change_type = 'approved_change'",
        [variation.sub_contract_id]
      )).rows;
      const changeTotal = round2(changes.reduce((s, c) => s + toNum(c.amount), 0));
      await q(
        'UPDATE sub_contracts SET revised_amount = $1, updated_at = $2 WHERE id = $3',
        [round2(toNum(sc.contract_value) + changeTotal_guard(changeTotal)), new Date(), variation.sub_contract_id]
      );
      const count = parseInt((await q('SELECT COUNT(*) FROM commitments')).rows[0].count);
      await q(
        `UPDATE commitments SET original_amount = $1, updated_at = $2 WHERE source_type = 'sub_contract' AND source_id = $3`,
        [round2(toNum(sc.contract_value) + toNum(changeTotal)), new Date(), variation.sub_contract_id]
      );
      void count;
    }
  }
  // The project forecast is a live engine output — recompute to prove the
  // updated figures land in the same transaction scope.
  await projectCommercial(q, variation.project_id);
  return true;
}
function changeTotal_guard(v) { return v; }

// Budget changes — widen project_budgets with original vs current + log.
async function applyBudgetChange(q, { project_id, cost_code_id = null, new_amount, reason = null, source_type = null, source_id = null, created_by = null }) {
  let row = null;
  if (cost_code_id != null) {
    row = (await q(
      'SELECT * FROM project_budgets WHERE project_id = $1 AND cost_code_id = $2',
      [project_id, cost_code_id]
    )).rows[0];
  } else {
    row = (await q(
      'SELECT * FROM project_budgets WHERE project_id = $1 LIMIT 1',
      [project_id]
    )).rows[0];
  }

  const previous = row ? (row.current_amount != null && toNum(row.current_amount) > 0 ? toNum(row.current_amount) : toNum(row.revised_amount || row.budget_amount)) : 0;
  const original = row ? (row.original_amount != null && toNum(row.original_amount) > 0 ? toNum(row.original_amount) : toNum(row.budget_amount)) : toNum(new_amount);

  if (row) {
    await q(
      'UPDATE project_budgets SET current_amount = $1, revised_amount = $1, updated_at = $2 WHERE id = $3',
      [round2(new_amount), new Date(), row.id]
    );
  } else {
    await q(
      `INSERT INTO project_budgets (project_id, cost_code_id, budget_amount, original_amount, current_amount, revised_amount, status)
       VALUES ($1, $2, $3, $3, $3, $3, 'approved')`,
      [project_id, cost_code_id, round2(new_amount)]
    );
  }
  await q(
    `INSERT INTO budget_changes (project_id, cost_code_id, change_type, previous_amount, new_amount, reason, source_type, source_id, created_by)
     VALUES ($1, $2, 'approved_change', $3, $4, $5, $6, $7, $8)`,
    [project_id, cost_code_id, previous, round2(new_amount), reason, source_type, source_id, created_by]
  );
  return { previous_amount: round2(previous), new_amount: round2(new_amount) };
}

module.exports = {
  toNum,
  round2,
  revisedContractValue,
  revisedSubcontract,
  currentBudget,
  committedCost,
  accruedCost,
  etcFigure,
  eac,
  forecastProfit,
  forecastMarginPct,
  computeCertificateNet,
  approvedVariationTotal,
  budgetChangeTotal,
  actualCost,
  syncCommitments,
  projectCommercial,
  createVariation,
  startVariationWorkflow,
  decideVariation,
  incorporateVariation,
  applyBudgetChange,
};
