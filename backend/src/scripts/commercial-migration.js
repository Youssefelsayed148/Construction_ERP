// Phase 13 migration core — client contracts, variations, commitments,
// shared payment certificates, budget widening, and the legacy-formula
// snapshot (see docs/audit/PHASE13_COMMERCIAL_MODEL.md).
//
// Steps (all idempotent):
//   ensureTables        — client_contracts + contract_lines (SOV),
//                         variations + variation_lines + variation_cost_buildup,
//                         commitments, retention_ledger, advance_ledger,
//                         payment_certificates (the shared client/subcontractor
//                         certificate), commercial_snapshots
//   widenSubContracts   — sub_contract_lines + sub_contract_changes +
//                         revised_amount (Revised = Original + Approved Changes)
//   widenBudgets        — project_budgets original/current amounts + the
//                         budget_changes log
//   legacySnapshots     — one commercial_snapshots row per project per legacy
//                         formula BEFORE the canonical switch (idempotent)
//   createTransitionView— real-Postgres VIEW: sub_payment_certificates stays
//                         readable while the shared table carries new flow

'use strict';

const DDL = [
  // ------------------------------------------------------------------
  // Client contracts + SOV
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS client_contracts (
    id SERIAL PRIMARY KEY,
    contract_number VARCHAR(50) UNIQUE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    title VARCHAR(255),
    original_value DECIMAL(15,2) DEFAULT 0,
    revised_value DECIMAL(15,2) DEFAULT 0,
    retention_percent DECIMAL(5,3) DEFAULT 10,
    advance_percent DECIMAL(5,3) DEFAULT 0,
    advance_amount DECIMAL(15,2) DEFAULT 0,
    contract_date DATE,
    start_date DATE,
    end_date DATE,
    status VARCHAR(30) DEFAULT 'active',
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_client_contracts_project ON client_contracts(project_id)`,
  `CREATE TABLE IF NOT EXISTS contract_lines (
    id SERIAL PRIMARY KEY,
    client_contract_id INTEGER NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
    boq_item_id INTEGER REFERENCES boq_items(id) ON DELETE SET NULL,
    description VARCHAR(500),
    quantity DECIMAL(15,3) DEFAULT 0,
    unit VARCHAR(50),
    unit_rate DECIMAL(15,2) DEFAULT 0,
    amount DECIMAL(15,2) DEFAULT 0,
    sort_order INTEGER DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_contract_lines_contract ON contract_lines(client_contract_id)`,

  // ------------------------------------------------------------------
  // Variations — the lifecycle runs through the Phase 6 'variation' template:
  // Change Event → Estimate → Internal Commercial Review → Authority Approval
  // → Consultant Recommendation → Client Approval/Reject → Incorporated
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS variations (
    id SERIAL PRIMARY KEY,
    variation_number VARCHAR(50) UNIQUE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    client_contract_id INTEGER REFERENCES client_contracts(id) ON DELETE SET NULL,
    sub_contract_id INTEGER REFERENCES sub_contracts(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    variation_type VARCHAR(30) DEFAULT 'client',
    amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'change_event',
    workflow_instance_id INTEGER,
    decided_at TIMESTAMPTZ,
    incorporated_at TIMESTAMPTZ,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_variations_project ON variations(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_variations_contract ON variations(client_contract_id)`,
  `CREATE TABLE IF NOT EXISTS variation_lines (
    id SERIAL PRIMARY KEY,
    variation_id INTEGER NOT NULL REFERENCES variations(id) ON DELETE CASCADE,
    boq_item_id INTEGER REFERENCES boq_items(id) ON DELETE SET NULL,
    description VARCHAR(500),
    quantity DECIMAL(15,3) DEFAULT 0,
    unit VARCHAR(50),
    unit_rate DECIMAL(15,2) DEFAULT 0,
    amount DECIMAL(15,2) DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS variation_cost_buildup (
    id SERIAL PRIMARY KEY,
    variation_id INTEGER NOT NULL REFERENCES variations(id) ON DELETE CASCADE,
    component VARCHAR(50) NOT NULL,
    cost_code_id INTEGER REFERENCES cost_codes(id) ON DELETE SET NULL,
    quantity DECIMAL(15,3) DEFAULT 0,
    unit_rate DECIMAL(15,2) DEFAULT 0,
    amount DECIMAL(15,2) DEFAULT 0,
    notes TEXT
  )`,

  // ------------------------------------------------------------------
  // Commitments — approved spend (POs, subcontracts) net of cancellations
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS commitments (
    id SERIAL PRIMARY KEY,
    commitment_number VARCHAR(50) UNIQUE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_type VARCHAR(50) NOT NULL,
    source_id INTEGER NOT NULL,
    party_name VARCHAR(255),
    original_amount DECIMAL(15,2) DEFAULT 0,
    cancelled_amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_type, source_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_commitments_project ON commitments(project_id)`,

  // ------------------------------------------------------------------
  // Retention + advance ledgers
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS retention_ledger (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    party_type VARCHAR(30) NOT NULL,
    source_type VARCHAR(50),
    source_id INTEGER,
    direction VARCHAR(20) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_retention_ledger_project ON retention_ledger(project_id)`,
  `CREATE TABLE IF NOT EXISTS advance_ledger (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    party_type VARCHAR(30) NOT NULL,
    source_type VARCHAR(50),
    source_id INTEGER,
    direction VARCHAR(30) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_advance_ledger_project ON advance_ledger(project_id)`,

  // ------------------------------------------------------------------
  // Shared payment certificates — usable for client and subcontractor
  // certificates alike (Phase 14 builds the full certificate math on this)
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS payment_certificates (
    id SERIAL PRIMARY KEY,
    certificate_number VARCHAR(50) UNIQUE,
    party_type VARCHAR(30) NOT NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    client_contract_id INTEGER REFERENCES client_contracts(id) ON DELETE SET NULL,
    sub_contract_id INTEGER REFERENCES sub_contracts(id) ON DELETE SET NULL,
    period_from DATE,
    period_to DATE,
    gross_current_work DECIMAL(15,2) DEFAULT 0,
    approved_variations_period DECIMAL(15,2) DEFAULT 0,
    gross_certified DECIMAL(15,2) DEFAULT 0,
    retention_held DECIMAL(15,2) DEFAULT 0,
    advance_recovery DECIMAL(15,2) DEFAULT 0,
    other_deductions DECIMAL(15,2) DEFAULT 0,
    tax_pct DECIMAL(5,3) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    net_certificate DECIMAL(15,2) DEFAULT 0,
    previous_cumulative DECIMAL(15,2) DEFAULT 0,
    cumulative_certified DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft',
    certified_by INTEGER REFERENCES users(id),
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payment_certificates_project ON payment_certificates(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_certificates_status ON payment_certificates(status)`,

  // ------------------------------------------------------------------
  // Legacy formula snapshots (see PHASE13_COMMERCIAL_MODEL.md)
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS commercial_snapshots (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    snapshot_type VARCHAR(50) NOT NULL,
    figures JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, snapshot_type)
  )`,

  // ------------------------------------------------------------------
  // sub_contracts widening: line model + revised amount
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS sub_contract_lines (
    id SERIAL PRIMARY KEY,
    sub_contract_id INTEGER NOT NULL REFERENCES sub_contracts(id) ON DELETE CASCADE,
    boq_item_id INTEGER REFERENCES boq_items(id) ON DELETE SET NULL,
    description VARCHAR(500),
    quantity DECIMAL(15,3) DEFAULT 0,
    unit VARCHAR(50),
    unit_rate DECIMAL(15,2) DEFAULT 0,
    amount DECIMAL(15,2) DEFAULT 0,
    sort_order INTEGER DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sub_contract_lines_contract ON sub_contract_lines(sub_contract_id)`,
  `CREATE TABLE IF NOT EXISTS sub_contract_changes (
    id SERIAL PRIMARY KEY,
    sub_contract_id INTEGER NOT NULL REFERENCES sub_contracts(id) ON DELETE CASCADE,
    change_type VARCHAR(50) DEFAULT 'approved_change',
    amount DECIMAL(15,2) DEFAULT 0,
    reason TEXT,
    source_type VARCHAR(50),
    source_id INTEGER,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `ALTER TABLE sub_contracts ADD COLUMN IF NOT EXISTS revised_amount DECIMAL(15,2) DEFAULT 0`,

  // ------------------------------------------------------------------
  // project_budgets widening: original vs current + change log
  // ------------------------------------------------------------------
  `ALTER TABLE project_budgets ADD COLUMN IF NOT EXISTS original_amount DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE project_budgets ADD COLUMN IF NOT EXISTS current_amount DECIMAL(15,2) DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS budget_changes (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cost_code_id INTEGER REFERENCES cost_codes(id) ON DELETE SET NULL,
    change_type VARCHAR(50) DEFAULT 'approved_change',
    previous_amount DECIMAL(15,2) DEFAULT 0,
    new_amount DECIMAL(15,2) DEFAULT 0,
    reason TEXT,
    source_type VARCHAR(50),
    source_id INTEGER,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_budget_changes_project ON budget_changes(project_id)`,
];

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

// ---------------------------------------------------------------------------
// Legacy snapshots — one row per project per legacy formula, computed from
// the live tables BEFORE the canonical engine takes over. Idempotent.
// ---------------------------------------------------------------------------

function toNum(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

async function legacySnapshots(query) {
  const projects = (await query('SELECT id, contract_value, budget FROM projects')).rows;
  let written = 0;
  for (const p of projects) {
    const costs = (await query(
      'SELECT id, amount FROM project_costs WHERE project_id = $1', [p.id]
    )).rows;
    const totalCost = costs.reduce((s, c) => s + toNum(c.amount), 0);

    // costing.js legacy: contract_value − total_cost
    if (await writeSnapshot(query, p.id, 'costing_legacy', {
      formula: 'contract_value - total_cost',
      revenue: toNum(p.contract_value), total_cost: totalCost,
      profit: toNum(p.contract_value) - totalCost,
    })) written++;
    // finance.js legacy cash proxy: paid − expenses
    // (invoices/payments/expenses reads are best-effort — pre-Phase-14 tables)
    let paid = 0; let expenses = 0;
    try {
      paid = (await query('SELECT COALESCE(SUM(amount), 0) AS t FROM payments WHERE project_id = $1', [p.id])).rows[0].t;
      expenses = (await query('SELECT COALESCE(SUM(amount), 0) AS t FROM expenses WHERE project_id = $1', [p.id])).rows[0].t;
    } catch (e) { /* tables absent — zeros */ }
    if (await writeSnapshot(query, p.id, 'finance_cash_proxy', {
      formula: 'paid - expenses',
      paid: toNum(paid), expenses: toNum(expenses),
      profit: toNum(paid) - toNum(expenses),
    })) written++;
    // dashboard.js legacy burn
    if (await writeSnapshot(query, p.id, 'dashboard_burn', {
      formula: 'total_spent / budget * 100',
      total_spent: totalCost, budget: toNum(p.budget),
      budget_burn_percent: toNum(p.budget) > 0 ? totalCost / toNum(p.budget) * 100 : 0,
    })) written++;
  }
  return written;
}

async function writeSnapshot(query, projectId, type, figures) {
  const existing = await query(
    'SELECT id FROM commercial_snapshots WHERE project_id = $1 AND snapshot_type = $2',
    [projectId, type]
  );
  if (existing.rows[0]) return false;
  await query(
    'INSERT INTO commercial_snapshots (project_id, snapshot_type, figures) VALUES ($1, $2, $3)',
    [projectId, type, JSON.stringify(figures)]
  );
  return true;
}
const writeSnapshotAlias = writeSnapshot;
async function writeSnapshotWrapper(q, projectId, type, figures) {
  return writeSnapshot(q, projectId, type, figures);
}
void writeSnapshotAlias; void writeSnapshotWrapper;

async function writeSnapshotMulti(query, projectId, type, figures) {
  return writeSnapshot(query, projectId, type, figures);
}
void writeSnapshotMulti;

// Real-Postgres only: the shared certificate table's subcontractor slice is
// exposed under the legacy name during transition.
async function createTransitionView(query) {
  await query('DROP VIEW IF EXISTS v_sub_payment_certificates');
  await query(`
    CREATE VIEW v_sub_payment_certificates AS
    SELECT id, certificate_number, sub_contract_id, period_from, period_to,
           gross_current_work AS work_value, retention_held AS retention_deduction,
           previous_cumulative AS previous_paid, other_deductions AS penalties,
           advance_recovery AS materials_deducted, net_certificate AS net_payable,
           status, certified_by, paid_at, notes, project_id, created_at, updated_at
    FROM payment_certificates WHERE party_type = 'subcontractor'
  `);
}

module.exports = {
  DDL,
  ensureTables,
  legacySnapshots,
  createTransitionView,
};
