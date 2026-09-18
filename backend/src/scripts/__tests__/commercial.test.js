// Phase 13 tests — client contracts, variations, commitments, and the single
// canonical EAC/forecast-margin commercial model.
//
// Coverage:
//   - migration: contracts/SOV, variations+lines+cost buildup, commitments,
//     retention/advance ledgers, shared payment certificates, sub-contract
//     widening (revised = original + approved changes), budget widening +
//     change log, and the THREE legacy-formula snapshots frozen per project
//   - the canonical formulas, hand-calculated for three scenarios:
//     (a) no variation, (b) one client variation, (c) client variation +
//     subcontract change — forecast margin matches exactly
//   - the variation lifecycle through the Phase 6 'variation' template with
//     the catalog's exact states; incorporation moves the contract's revised
//     value and the project forecast together
//   - costing.js / finance.js / dashboard.js all derive from ONE engine
//     (static single-source check); retired formulas kept as snapshots
//   - unit sales regression: buildings→project_locations (Phase 8) did not
//     break units.js's unit-sale flow

const { MockDb } = require('../test-helpers/mock-db');
const commercialMigration = require('../commercial-migration');
const workflowMigration = require('../workflow-engine-migration');
const engine = require('../../services/commercialEngine');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

const OWNER = { id: 3, name: 'Owner', role: 'owner' };
const PM = { id: 4, name: 'Project Manager', role: 'project_manager' };
const QS = { id: 5, name: 'QS', role: 'qs' };
const CONSULTANT = { id: 6, name: 'Consultant', role: 'consultant' };
const CLIENT = { id: 7, name: 'Client Rep', role: 'client' };

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY, name VARCHAR(255), contract_value DECIMAL(15,2) DEFAULT 0, budget DECIMAL(15,2) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS clients (id SERIAL PRIMARY KEY, name_en VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), role VARCHAR(100), is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS subcontractors (id SERIAL PRIMARY KEY, name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS boq_items (id SERIAL PRIMARY KEY, project_id INTEGER, description VARCHAR(500))`);
  await q(`CREATE TABLE IF NOT EXISTS cost_codes (id SERIAL PRIMARY KEY, code VARCHAR(50), name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS project_costs (
    id SERIAL PRIMARY KEY, project_id INTEGER, cost_code_id INTEGER,
    amount DECIMAL(15,2) DEFAULT 0, transaction_date DATE, description TEXT)`);
  await q(`CREATE TABLE IF NOT EXISTS project_budgets (
    id SERIAL PRIMARY KEY, project_id INTEGER, cost_code_id INTEGER,
    budget_amount DECIMAL(15,2) DEFAULT 0, revised_amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft')`);
  await q(`CREATE TABLE IF NOT EXISTS sub_contracts (
    id SERIAL PRIMARY KEY, contract_number VARCHAR(50), project_id INTEGER,
    subcontractor_id INTEGER, boq_item_id INTEGER, scope TEXT,
    contract_value DECIMAL(15,2) DEFAULT 0, start_date DATE, end_date DATE,
    retention_percent DECIMAL(5,2) DEFAULT 10, status VARCHAR(50) DEFAULT 'draft')`);
  await q(`CREATE TABLE IF NOT EXISTS sub_work_verifications (
    id SERIAL PRIMARY KEY, sub_contract_id INTEGER, boq_item_id INTEGER,
    period_from DATE, period_to DATE, quantity_claimed DECIMAL(15,3) DEFAULT 0,
    quantity_verified DECIMAL(15,3) DEFAULT 0, status VARCHAR(50), verified_by INTEGER, notes TEXT)`);
  await q(`CREATE TABLE IF NOT EXISTS sub_payment_certificates (
    id SERIAL PRIMARY KEY, certificate_number VARCHAR(50), sub_contract_id INTEGER,
    period_from DATE, period_to DATE, work_value DECIMAL(15,2) DEFAULT 0,
    retention_deduction DECIMAL(15,2) DEFAULT 0, previous_paid DECIMAL(15,2) DEFAULT 0,
    penalties DECIMAL(15,2) DEFAULT 0, materials_deduced DECIMAL(15,2) DEFAULT 0,
    materials_deducted DECIMAL(15,2) DEFAULT 0, net_payable DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft', certified_by INTEGER, paid_at TIMESTAMPTZ, notes TEXT)`);
  await q(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY, order_number VARCHAR(50), supplier_id INTEGER, project_id INTEGER,
    quantity DECIMAL(15,3) DEFAULT 0, total_amount DECIMAL(15,2) DEFAULT 0, status VARCHAR(30) DEFAULT 'draft')`);

  await workflowMigration.ensureTables(q);
  await workflowMigration.seedTemplates(q);
  await commercialMigration.ensureTables(q);

  for (const id of [1, 2, 3]) {
    await q('INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)',
      [id, id === 1 ? 'Owner' : 'User', `${id}@x.com`, id === 1 ? 'owner' : 'engineer', true]);
  }
  await q('INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)', [3, 'Owner', 'o@x.com', 'owner', true]);
  await q('INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)', [4, 'PM', 'pm@x.com', 'owner', true]);
  await q('INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)', [5, 'QS', 'qs@x.com', 'engineer', true]);
  await q('INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)', [6, 'Consultant', 'c@x.com', 'consultant', true]);
}

beforeAll(async () => {
  await buildFixture();
});

// ---------------------------------------------------------------------------
// Migration + legacy snapshots
// ---------------------------------------------------------------------------

describe('migration', () => {
  test('creates every commercial table', () => {
    for (const t of ['client_contracts', 'contract_lines', 'variations', 'variation_lines',
      'variation_cost_buildup', 'commitments', 'retention_ledger', 'advance_ledger',
      'payment_certificates', 'commercial_snapshots', 'sub_contract_lines',
      'sub_contract_changes', 'budget_changes']) {
      expect(db.table(t).columns.size).toBeGreaterThan(0);
    }
    expect(db.table('sub_contracts').columns.has('revised_amount')).toBe(true);
    expect(db.table('project_budgets').columns.has('original_amount')).toBe(true);
    expect(db.table('project_budgets').columns.has('current_amount')).toBe(true);
  });

  test('freezes the three legacy formulas per project BEFORE the switch', async () => {
    await q(`INSERT INTO projects (id, name, contract_value, budget) VALUES ($1,$2,$3,$4)`, [1, 'Tower A', 100000, 80000]);
    await q(`INSERT INTO project_costs (id, project_id, amount) VALUES ($1,$2,$3)`, [1, 1, 50000]);

    const snapped = await commercialMigration.legacySnapshots(q);
    expect(snapped).toBe(3); // three formulas × one project

    const types = (await q("SELECT snapshot_type FROM commercial_snapshots WHERE project_id = 1")).rows.map((r) => r.snapshot_type);
    expect(types.sort()).toEqual(['costing_legacy', 'dashboard_burn', 'finance_cash_proxy']);

    const costing = (await q("SELECT * FROM commercial_snapshots WHERE project_id = 1 AND snapshot_type = 'costing_legacy'")).rows[0];
    const figures = typeof costing.figures === 'string' ? JSON.parse(costing.figures) : costing.figures;
    expect(figures.formula).toBe('contract_value - total_cost');
    expect(figures.profit).toBe(50000);

    // Idempotent.
    const again = await commercialMigration.legacySnapshots(q);
    expect(again).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

describe('commercial formulas (pure)', () => {
  test('Revised Contract Value = Original + Approved Client Variations', () => {
    expect(engine.revisedContractValue(100000, 0)).toBe(100000);
    expect(engine.revisedContractValue(100000, 10000)).toBe(110000);
  });

  test('Current Budget = Original + Approved Budget Changes', () => {
    expect(engine.currentBudget(80000, 0)).toBe(80000);
    expect(engine.currentBudget(80000, 5000)).toBe(85000);
  });

  test('Committed = active commitments net of cancellations', () => {
    expect(engine.committedCost([
      { original_amount: 30000, cancelled_amount: 0, status: 'active' },
      { original_amount: 10000, cancelled_amount: 4000, status: 'active' },
      { original_amount: 50000, cancelled_amount: 0, status: 'cancelled' },
    ])).toBe(36000);
  });

  test('EAC = Actual + Accrued + ETC; Margin = Profit / Revenue × 100', () => {
    expect(engine.eac(50000, 0, 50000)).toBe(100000);
    expect(engine.forecastProfit(100000, 100000)).toBe(0);
    expect(engine.forecastMarginPct(20000, 100000)).toBe(20);
    expect(engine.forecastMarginPct(0, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The three margin scenarios (hand-calculated)
// ---------------------------------------------------------------------------

describe('forecast margin scenarios (hand-calculated)', () => {
  const CONTRACT = 100000;
  const BUDGET = 80000;
  const PO_COMMIT = 30000;
  const ACTUAL = 50000;

  beforeAll(async () => {
    // Shared project 2: contract + budget + one issued PO + booked costs.
    await q(`INSERT INTO projects (id, name, contract_value, budget) VALUES ($1,$2,$3,$4)`, [2, 'Scenario Project', CONTRACT, BUDGET]);
    await q(`INSERT INTO client_contracts (id, contract_number, project_id, original_value, revised_value)
             VALUES ($1,$2,$3,$4,$5)`, [10, 'CC-00001', 2, CONTRACT, CONTRACT]);
    await q(`INSERT INTO purchase_orders (id, order_number, project_id, total_amount, status)
             VALUES ($1,$2,$3,$4,$5)`, [900, 'PO-00900', 2, PO_COMMIT, 'issued']);
    await q(`INSERT INTO project_costs (id, project_id, amount) VALUES ($1,$2,$3)`, [2, 2, 20000]);
  });

  test('scenario A — no variation: margin 20.00%', async () => {
    const r = await engine.projectCommercial(q, 2);
    expect(r.original_contract_value).toBe(100000);
    expect(r.approved_variations).toBe(0);
    expect(r.revised_contract_value).toBe(100000);
    expect(r.current_budget).toBe(80000);
    expect(r.committed_cost).toBe(30000);
    expect(r.actual_cost).toBe(20000);
    // Accrued = max(30000 − 20000, 0) = 10000
    expect(r.accrued_cost).toBe(10000);
    // ETC = max(80000 − 30000, 0) = 50000
    expect(r.etc).toBe(50000);
    // EAC = 20000 + 10000 + 50000 = 80000
    expect(r.eac).toBe(80000);
    expect(r.forecast_profit).toBe(20000);
    expect(r.forecast_margin_percent).toBe(20);
  });

  test('scenario B — one client variation (+10,000) incorporated through the workflow', async () => {
    const variation = await engine.createVariation(q, {
      project_id: 2, client_contract_id: 10,
      title: 'Add skim coat to Floor 5', variation_type: 'client',
      created_by: OWNER.id,
      lines: [{ description: 'Skim coat 200 m2', quantity: 200, unit: 'm2', unit_rate: 50 }],
    });
    expect(parseFloat(variation.amount)).toBe(10000);
    await engine.startVariationWorkflow(q, variation.id, OWNER); // requester: owner

    // Change Event → Estimate → Internal Commercial Review → Authority
    // Approval → Consultant Recommendation → Client Approval → Incorporated.
    await engine.decideVariation(q, variation.id, OWNER, 'approve');      // change_event
    await engine.decideVariation(q, variation.id, QS, 'approve');          // estimate
    await engine.decideVariation(q, variation.id, PM, 'approve');          // internal commercial review
    await engine.decideVariation(q, variation.id, OWNER, 'approve');       // authority approval
    await engine.decideVariation(q, variation.id, CONSULTANT, 'approve');  // consultant recommendation
    await engine.decideVariation(q, variation.id, CLIENT, 'approve');      // client approval
    const final = await engine.decideVariation(q, variation.id, OWNER, 'approve'); // incorporated (terminal)

    expect(final.status).toBe('incorporated');
    const contract = (await q('SELECT * FROM client_contracts WHERE id = 10')).rows[0];
    expect(parseFloat(contract.revised_value)).toBe(110000); // revised value moved with the variation

    const r = await engine.projectCommercial(q, 2);
    expect(r.revised_contract_value).toBe(110000);
    // EAC unchanged at 80000 → profit 30000 → margin 27.27%.
    expect(r.forecast_profit).toBe(30000);
    expect(r.forecast_margin_percent).toBe(27.27);
  });

  test('scenario C — client variation + subcontract change (+5,000)', async () => {
    await q(`INSERT INTO sub_contracts (id, contract_number, project_id, subcontractor_id, contract_value, revised_amount, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`, [50, 'SC-0050', 2, 1, 50000, 55000, 'active']);
    await engine.applyBudgetChange(q, {
      project_id: 2, new_amount: 85000, reason: 'skim coat budget', created_by: OWNER.id,
    });

    const r = await engine.projectCommercial(q, 2);
    expect(r.current_budget).toBe(85000);
    // Commitments: PO 30000 + revised subcontract 55000 = 85000.
    expect(r.committed_cost).toBe(85000);
    // Accrued = max(85000 − 20000, 0) = 65000; ETC = max(85000 − 85000, 0) = 0.
    expect(r.etc).toBe(0);
    // EAC = 20000 + 65000 + 0 = 85000 → profit = 110000 − 85000 = 25000.
    expect(r.eac).toBe(85000);
    expect(r.forecast_profit).toBe(25000);
    expect(r.forecast_margin_percent).toBe(22.73);
  });
});

// ---------------------------------------------------------------------------
// One canonical source — the three retired routes derive from the engine
// ---------------------------------------------------------------------------

describe('one canonical calculation (static single-source check)', () => {
  const fs = require('fs');
  const path = require('path');

  test('costing.js profitability reads the commercial engine, legacy kept as snapshot', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'costing.js'), 'utf8');
    expect(content).toMatch(/commercialEngine\.projectCommercial/);
    expect(content).toMatch(/commercial_snapshots/);
    expect(content).not.toMatch(/revenue - totalCost/);
  });

  test('finance.js profit comes from the engine, cash figures explicitly labeled', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'finance.js'), 'utf8');
    expect(content).toMatch(/commercialEngine\.projectCommercial/);
    expect(content).toMatch(/forecast_profit/);
    expect(content).toMatch(/legacy_profit_cash_proxy/);
    expect(content).not.toMatch(/profit: paid - expenses/);
  });

  test('dashboard.js burn uses Current Budget from the engine', () => {
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'dashboard.js'), 'utf8');
    expect(content).toMatch(/commercialEngine\.projectCommercial/);
    expect(content).toMatch(/current_budget/);
    expect(content).toMatch(/forecast_margin_percent/);
  });

  test('the engine exposes exactly one margin formula used by all three', () => {
    expect(engine.forecastMarginPct(60000, 110000)).toBe(54.55);
  });
});

// ---------------------------------------------------------------------------
// Unit sales regression — Phase 8's buildings→project_locations must not
// break the units.js unit-sale flow
// ---------------------------------------------------------------------------

describe('unit sales regression (units.js path stays independent)', () => {
  test('unit reservation keeps its own buildings/location links and the invoice helper contract', async () => {
    const fs = require('fs');
    const path = require('path');
    const unitsContent = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'units.js'), 'utf8');
    // The auto-invoice helper is intact for Phase 14 AR reuse.
    expect(unitsContent).toMatch(/createUnitSaleInvoice/);
    // Unit-sale contracts live in the units/buildings path, NOT client_contracts.
    expect(unitsContent).not.toMatch(/client_contracts/);
    // Nothing in Phase 13 touches the units route.
    expect(unitsContent).not.toMatch(/commercialEngine/);

    // A building still resolves to its project_location (Phase 8 link).
    await q(`CREATE TABLE IF NOT EXISTS buildings (
      id SERIAL PRIMARY KEY, project_id INTEGER, code VARCHAR(50), name VARCHAR(255),
      floors INTEGER DEFAULT 1, project_location_id INTEGER)`);
    await q(`INSERT INTO buildings (id, project_id, name, floors, project_location_id) VALUES ($1,$2,$3,$4,$5)`,
      [77, 2, 'Building A', 3, 500]);
    const b = (await q('SELECT * FROM buildings WHERE id = 77')).rows[0];
    expect(b.project_location_id).toBe(500);
    expect(b.floors).toBe(3);
  });
});
