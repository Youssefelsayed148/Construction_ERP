// Phase 18 tests — subcontractor & supplier portals.
//
// Scenarios per portal:
//   1. no assigned project / org        → setup actions, never an error
//   2. project with zero records        → every widget empty-labeled
//   3. one project                      → widgets fill from real records
//   4. multiple projects                → scope covers all own packages
//   5. expired assignment               → excluded from scope
// Isolation (the hard rules):
//   * a subcontractor querying another subcontractor's contract/certificate by
//     ID gets 404 behavior (null → route 404), NEVER the record;
//   * a supplier never sees a competitor's pricing — quote data is filtered
//     to the supplier's own rows BEFORE prices are read.

const { MockDb } = require('../test-helpers/mock-db');
const portalMigration = require('../portal-migration');
const engine = require('../../services/portalEngine');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

const SUB_A = { id: 40, name: 'Sub A Rep', role: 'subcontractor' };
const SUB_B = { id: 41, name: 'Sub B Rep', role: 'subcontractor' };
const SUPPLIER_A = { id: 50, name: 'Supplier A Rep', role: 'supplier' };

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name VARCHAR(255), org_type VARCHAR(30))`);
  await q(`CREATE TABLE IF NOT EXISTS organization_users (
    id SERIAL PRIMARY KEY, organization_id INTEGER, user_id INTEGER, role_at_org VARCHAR(100), is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS project_participants (
    id SERIAL PRIMARY KEY, project_id INTEGER, organization_id INTEGER, participant_type VARCHAR(50),
    portal_access_enabled BOOLEAN, active_from TIMESTAMPTZ, active_to TIMESTAMPTZ,
    legacy_subcontractor_id INTEGER, legacy_supplier_id INTEGER, legacy_client_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS sub_contracts (
    id SERIAL PRIMARY KEY, contract_number VARCHAR(50), project_id INTEGER, subcontractor_id INTEGER,
    boq_item_id INTEGER, scope TEXT, contract_value DECIMAL(15,2) DEFAULT 0, revised_amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft')`);
  await q(`CREATE TABLE IF NOT EXISTS sub_work_verifications (
    id SERIAL PRIMARY KEY, sub_contract_id INTEGER, boq_item_id INTEGER, period_from DATE, period_to DATE,
    quantity_claimed DECIMAL(15,3) DEFAULT 0, quantity_verified DECIMAL(15,3) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending', verified_by INTEGER, notes TEXT)`);
  await q(`CREATE TABLE IF NOT EXISTS payment_certificates (
    id SERIAL PRIMARY KEY, certificate_number VARCHAR(50), party_type VARCHAR(30), project_id INTEGER,
    client_contract_id INTEGER, sub_contract_id INTEGER, period_from DATE, period_to DATE,
    gross_current_work DECIMAL(15,2) DEFAULT 0, approved_variations_period DECIMAL(15,2) DEFAULT 0,
    gross_certified DECIMAL(15,2) DEFAULT 0, retention_held DECIMAL(15,2) DEFAULT 0,
    advance_recovery DECIMAL(15,2) DEFAULT 0, other_deductions DECIMAL(15,2) DEFAULT 0,
    tax_pct DECIMAL(5,3) DEFAULT 0, tax_amount DECIMAL(15,2) DEFAULT 0, net_certificate DECIMAL(15,2) DEFAULT 0,
    previous_cumulative DECIMAL(15,2) DEFAULT 0, cumulative_certified DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft', certified_by INTEGER, paid_at TIMESTAMPTZ, notes TEXT,
    created_by INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS engineer_instructions (
    id SERIAL PRIMARY KEY, instruction_number VARCHAR(50), project_id INTEGER, title VARCHAR(255),
    description TEXT, priority VARCHAR(20) DEFAULT 'normal', status VARCHAR(30) DEFAULT 'issued',
    issued_by INTEGER, issued_date DATE, response TEXT, acknowledged_at TIMESTAMPTZ,
    action_item_id INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS action_items (
    id SERIAL PRIMARY KEY, source_type VARCHAR(50), source_id INTEGER, project_id INTEGER,
    title VARCHAR(500), description TEXT, assigned_user_id INTEGER, assigned_role VARCHAR(100),
    priority VARCHAR(20) DEFAULT 'medium', due_date TIMESTAMPTZ, status VARCHAR(30) DEFAULT 'open',
    reminder_policy JSONB, escalation_policy JSONB, created_by INTEGER, acknowledged_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ, completed_by INTEGER, workflow_instance_id INTEGER,
    workflow_step_instance_id INTEGER, event_log_id INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS work_orders (
    id SERIAL PRIMARY KEY, project_id INTEGER, title VARCHAR(255), status VARCHAR(50) DEFAULT 'planned',
    planned_start_date DATE, actual_start_date DATE, actual_end_date DATE, assigned_to INTEGER,
    completion_percentage DECIMAL(5,2) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS project_documents (
    id SERIAL PRIMARY KEY, project_id INTEGER, category_id INTEGER, title VARCHAR(255), status VARCHAR(30) DEFAULT 'draft')`);
  await q(`CREATE TABLE IF NOT EXISTS observations (
    id SERIAL PRIMARY KEY, observation_number VARCHAR(50), project_id INTEGER, title VARCHAR(255),
    description TEXT, status VARCHAR(50) DEFAULT 'raised', discipline VARCHAR(100))`);
  await q(`CREATE TABLE IF NOT EXISTS ncrs (
    id SERIAL PRIMARY KEY, project_id INTEGER, ncr_number VARCHAR(50), title VARCHAR(255), status VARCHAR(30) DEFAULT 'open')`);
  await q(`CREATE TABLE IF NOT EXISTS project_rfis (
    id SERIAL PRIMARY KEY, rfi_number VARCHAR(50), project_id INTEGER, subject VARCHAR(255), status VARCHAR(20) DEFAULT 'open')`);
  await q(`CREATE TABLE IF NOT EXISTS project_submittals (
    id SERIAL PRIMARY KEY, submittal_number VARCHAR(50), project_id INTEGER, title VARCHAR(255), status VARCHAR(30) DEFAULT 'submitted')`);
  await q(`CREATE TABLE IF NOT EXISTS variations (
    id SERIAL PRIMARY KEY, variation_number VARCHAR(50), project_id INTEGER, client_contract_id INTEGER,
    sub_contract_id INTEGER, title VARCHAR(255), amount DECIMAL(15,2) DEFAULT 0, status VARCHAR(50) DEFAULT 'change_event')`);
  await q(`CREATE TABLE IF NOT EXISTS suppliers (id SERIAL PRIMARY KEY, name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS rfqs (
    id SERIAL PRIMARY KEY, rfq_number VARCHAR(50), project_id INTEGER, title VARCHAR(255),
    due_date DATE, status VARCHAR(30) DEFAULT 'draft')`);
  await q(`CREATE TABLE IF NOT EXISTS supplier_quotations (
    id SERIAL PRIMARY KEY, quotation_number VARCHAR(50), rfq_id INTEGER, supplier_id INTEGER,
    total_price DECIMAL(15,2) DEFAULT 0, status VARCHAR(30) DEFAULT 'submitted')`);
  await q(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY, order_number VARCHAR(50), project_id INTEGER, supplier_id INTEGER,
    total_amount DECIMAL(15,2) DEFAULT 0, status VARCHAR(30) DEFAULT 'draft')`);
  await q(`CREATE TABLE IF NOT EXISTS deliveries (
    id SERIAL PRIMARY KEY, delivery_number VARCHAR(50), purchase_order_id INTEGER, supplier_id INTEGER,
    delivery_date DATE, status VARCHAR(30) DEFAULT 'received')`);
  await q(`CREATE TABLE IF NOT EXISTS material_inspection_requests (
    id SERIAL PRIMARY KEY, project_id INTEGER, delivery_id INTEGER, title VARCHAR(255), status VARCHAR(30) DEFAULT 'pending')`);
  await q(`CREATE TABLE IF NOT EXISTS supplier_invoices (
    id SERIAL PRIMARY KEY, invoice_number VARCHAR(100), supplier_id INTEGER, purchase_order_id INTEGER,
    total_amount DECIMAL(15,2) DEFAULT 0, status VARCHAR(30) DEFAULT 'received')`);
  await q(`CREATE TABLE IF NOT EXISTS organization_documents (
    id SERIAL PRIMARY KEY, organization_id INTEGER, title VARCHAR(255), document_type VARCHAR(100),
    expiry_date DATE, file_url TEXT, uploaded_by INTEGER, created_at TIMESTAMPTZ)`);

  await portalMigration.ensureTables(q);
  await portalMigration.ensureTables(q); // idempotent

  // Organizations: SubOrg A (user 40) → legacy subcontractor 11,
  //                SubOrg B (user 41) → legacy subcontractor 22,
  //                SupplierOrg A (user 50) → legacy supplier 70.
  await q(`INSERT INTO organizations (id, name, org_type) VALUES ($1,$2,$3)`, [3, 'Sub Org A', 'subcontractor']);
  await q(`INSERT INTO organizations (id, name, org_type) VALUES ($1,$2,$3)`, [4, 'Sub Org B', 'subcontractor']);
  await q(`INSERT INTO organizations (id, name, org_type) VALUES ($1,$2,$3)`, [8, 'Supplier Org A', 'supplier']);
  await q(`INSERT INTO organization_users (id, organization_id, user_id, role_at_org, is_active) VALUES ($1,$2,$3,$4,$5)`, [1, 3, 40, 'manager', true]);
  await q(`INSERT INTO organization_users (id, organization_id, user_id, role_at_org, is_active) VALUES ($1,$2,$3,$4,$5)`, [2, 4, 41, 'manager', true]);
  await q(`INSERT INTO organization_users (id, organization_id, user_id, role_at_org, is_active) VALUES ($1,$2,$3,$4,$5)`, [3, 8, 50, 'manager', true]);
  // Project 5: Sub A + Supplier A active. Project 6: zero records for both.
  // Project 7: Sub A only. Project 8: Sub A's assignment EXPIRED.
  await q(`INSERT INTO sub_contracts (id, contract_number, project_id, subcontractor_id, scope, contract_value, revised_amount, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [1, 'SC-0001', 1, 11, 'Structure works', 500000, 520000, 'active']);
  await q(`INSERT INTO sub_contracts (id, contract_number, project_id, subcontractor_id, scope, contract_value, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`, [2, 'SC-0002', 2, 22, 'MEP works', 300000, 'active']);
  await q(`INSERT INTO sub_contracts (id, contract_number, project_id, subcontractor_id, scope, contract_value, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`, [3, 'SC-0003', 7, 11, 'Finishes', 100000, 'active']);
  await q(`INSERT INTO sub_contracts (id, contract_number, project_id, subcontractor_id, scope, contract_value, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`, [4, 'SC-0004', 8, 11, 'Expired scope', 50000, 'active']);
  await q(`INSERT INTO project_participants (id, project_id, organization_id, participant_type, portal_access_enabled, legacy_subcontractor_id)
           VALUES ($1,$2,$3,$4,$5,$6)`, [1, 1, 3, 'subcontractor', true, 11]);
  await q(`INSERT INTO project_participants (id, project_id, organization_id, participant_type, portal_access_enabled, legacy_subcontractor_id)
           VALUES ($1,$2,$3,$4,$5,$6)`, [2, 1, 4, 'subcontractor', true, 22]);
  await q(`INSERT INTO project_participants (id, project_id, organization_id, participant_type, portal_access_enabled, legacy_subcontractor_id)
           VALUES ($1,$2,$3,$4,$5,$6)`, [3, 2, 4, 'subcontractor', true, 22]);
  await q(`INSERT INTO project_participants (id, project_id, organization_id, participant_type, portal_access_enabled, legacy_subcontractor_id)
           VALUES ($1,$2,$3,$4,$5,$6)`, [4, 7, 3, 'subcontractor', true, 11]);
  await q(`INSERT INTO project_participants (id, project_id, organization_id, participant_type, portal_access_enabled, legacy_subcontractor_id, active_to)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`, [5, 8, 3, 'subcontractor', true, 11, '2026-01-01']);
  // Supplier participant.
  await q(`INSERT INTO project_participants (id, project_id, organization_id, participant_type, portal_access_enabled, legacy_supplier_id)
           VALUES ($1,$2,$3,$4,$5,$6)`, [6, 1, 8, 'supplier', true, 70]);
}

beforeAll(buildFixture);

// ---------------------------------------------------------------------------
// Subcontractor portal
// ---------------------------------------------------------------------------

describe('subcontractor portal', () => {
  test('no assigned org → setup actions, not an error', async () => {
    const dash = await engine.subcontractorDashboard(q, 999);
    expect(dash.packages).toEqual([]);
    expect(dash.setup_actions.length).toBeGreaterThan(0);
  });

  test('one project, zero records → every widget empty-labeled', async () => {
    // Sub B has a contract on project 2 with no other records.
    const dash = await engine.subcontractorDashboard(q, SUB_B.id);
    expect(dash.packages.length).toBe(1);
    expect(dash.packages[0].contract_value).toBe(300000);
    expect(dash.todays_work.empty_label).toBe('No work assigned today');
    expect(dash.latest_drawings.empty_label).toBe('No approved drawings yet');
    expect(dash.inspections_needed.empty_label).toBe('No inspections needed');
    expect(dash.observations.empty_label).toBe('No consultant observations open');
    expect(dash.rfis.empty_label).toBe('No RFIs open');
    expect(dash.submittals.empty_label).toBe('No submittals open');
    expect(dash.payment_applications.empty_label).toBe('No payment applications yet');
    expect(dash.variations.empty_label).toBe('No variations yet');
  });

  test('multiple projects: scope covers all own packages across projects', async () => {
    const dash = await engine.subcontractorDashboard(q, SUB_A.id);
    // Projects 1 and 7 active (8 expired → excluded).
    expect(dash.project_ids).toEqual([1, 7]);
    const ids = dash.packages.map((c) => c.id).sort((a, b) => a - b);
    expect(ids).toEqual([1, 3]);
    expect(dash.packages.find((c) => c.id === 1).revised_amount).toBe(520000);
  });

  test('expired assignment: project 8 is invisible', async () => {
    const dash = await engine.subcontractorDashboard(q, SUB_A.id);
    expect(dash.project_ids).not.toContain(8);
    expect(dash.packages.some((c) => c.project_id === 8)).toBe(false);
  });

  test('ISOLATION: another subcontractor\u2019s contract resolves to null (404), never the record', async () => {
    // Sub A asking for Sub B's contract #2 → null.
    const foreign = await engine.subContractForOrg(q, 2, SUB_A.id);
    expect(foreign).toBeNull();
    // Sub B asking for its own contract #2 → the record.
    const own = await engine.subContractForOrg(q, 2, SUB_B.id);
    expect(own).not.toBeNull();
    expect(parseFloat(own.contract_value)).toBe(300000);
  });

  test('ISOLATION: another subcontractor\u2019s certificates never appear in the dashboard', async () => {
    // A certificate on Sub B's contract #2.
    await q(`INSERT INTO payment_certificates (id, certificate_number, party_type, project_id, sub_contract_id, net_certificate, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`, [1, 'PC-0001', 'subcontractor', 2, 2, 90000, 'draft']);
    const dashA = await engine.subcontractorDashboard(q, SUB_A.id);
    expect(dashA.payment_applications.items.some((c) => c.id === 1)).toBe(false);
    const dashB = await engine.subcontractorDashboard(q, SUB_B.id);
    expect(dashB.payment_applications.items.some((c) => c.id === 1)).toBe(true);
  });

  test('acknowledge instruction: works only on own project, completes the action item', async () => {
    await q(`INSERT INTO engineer_instructions (id, instruction_number, project_id, sub_contract_id, title, status, action_item_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`, [1, 'EI-1-001', 1, 1, 'Protect slab edges', 'issued', 900]);
    await q(`INSERT INTO action_items (id, source_type, source_id, assigned_user_id, title, status) VALUES ($1,$2,$3,$4,$5,$6)`, [900, 'engineer_instruction', 1, 40, 'ack', 'open']);
    const result = await engine.acknowledgeInstruction(q, SUB_A.id, { project_id: 1, instruction_id: 1, response: 'Noted' });
    expect(result).not.toBeNull();
    expect(result.status).toBe('acknowledged');
    // Sub B cannot acknowledge Sub A's project's instruction → null.
    const foreign = await engine.acknowledgeInstruction(q, SUB_B.id, { project_id: 1, instruction_id: 1 });
    expect(foreign).toBeNull();
    const item = (await q('SELECT * FROM action_items WHERE id = 900')).rows[0];
    expect(item.status).toBe('completed');
  });

  test('submitPaymentApplication uses the shared Phase 13 certificates, cumulative-safe', async () => {
    const first = await engine.submitPaymentApplication(q, SUB_A.id, {
      project_id: 1, sub_contract_id: 1, period_from: '2026-09-01', period_to: '2026-09-15',
      work_value: 100000, retention: 10000, materials_deducted: 5000,
    });
    expect(first.party_type).toBe('subcontractor');
    expect(parseFloat(first.net_certificate)).toBe(85000);
    expect(parseFloat(first.previous_cumulative)).toBe(0);
    expect(parseFloat(first.cumulative_certified)).toBe(100000);

    const second = await engine.submitPaymentApplication(q, SUB_A.id, {
      project_id: 1, sub_contract_id: 1, period_from: '2026-09-16', period_to: '2026-09-30',
      work_value: 50000,
    });
    expect(parseFloat(second.previous_cumulative)).toBe(100000);
    expect(parseFloat(second.cumulative_certified)).toBe(150000);
  });

  test('submit progress quantities inserts a pending verification on own contract', async () => {
    const r = await q(
      `INSERT INTO sub_work_verifications (id, sub_contract_id, boq_item_id, period_from, period_to, quantity_claimed)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [70, 1, 1, '2026-09-01', '2026-09-15', 250]
    );
    expect(parseFloat(r.rows[0].quantity_claimed)).toBe(250);
    const dash = await engine.subcontractorDashboard(q, SUB_A.id);
    expect(dash.inspections_needed.count).toBe(1);
    expect(dash.executed_quantities.pending).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// Supplier portal
// ---------------------------------------------------------------------------

describe('supplier portal', () => {
  beforeAll(async () => {
    // RFQ 10 with quotations from BOTH suppliers — the isolation case.
    await q(`INSERT INTO rfqs (id, rfq_number, project_id, title, due_date, status)
             VALUES ($1,$2,$3,$4,$5,$6)`, [10, 'RFQ-0010', 1, 'Cement supply', '2026-10-01', 'issued']);
    await q(`INSERT INTO supplier_quotations (id, quotation_number, rfq_id, supplier_id, total_price, status)
             VALUES ($1,$2,$3,$4,$5,$6)`, [10, 'QT-A', 10, 70, 100000, 'submitted']);
    // Competitor's quotation — MUST never surface to Supplier A's dashboard.
    await q(`INSERT INTO supplier_quotations (id, quotation_number, rfq_id, supplier_id, total_price, status)
             VALUES ($1,$2,$3,$4,$5,$6)`, [11, 'QT-B', 10, 88, 90000, 'submitted']);
    // Awarded PO + delivery + MIR + invoice for supplier 70.
    await q(`INSERT INTO purchase_orders (id, order_number, project_id, supplier_id, total_amount, status)
             VALUES ($1,$2,$3,$4,$5,$6)`, [10, 'PO-0010', 1, 70, 80000, 'issued']);
    await q(`INSERT INTO deliveries (id, delivery_number, purchase_order_id, supplier_id, delivery_date, status)
             VALUES ($1,$2,$3,$4,$5,$6)`, [10, 'DLV-0010', 10, 70, '2026-09-20', 'in_transit']);
    await q(`INSERT INTO material_inspection_requests (id, project_id, delivery_id, title, status)
             VALUES ($1,$2,$3,$4,$5)`, [10, 1, 10, 'Cement MIR', 'pending']);
    await q(`INSERT INTO supplier_invoices (id, invoice_number, supplier_id, purchase_order_id, total_amount, status)
             VALUES ($1,$2,$3,$4,$5,$6)`, [10, 'SI-0010', 70, 10, 80000, 'received']);
    // A competing supplier's PO — must NOT appear.
    await q(`INSERT INTO purchase_orders (id, order_number, project_id, supplier_id, total_amount, status)
             VALUES ($1,$2,$3,$4,$5,$6)`, [11, 'PO-0011', 1, 88, 70000, 'issued']);
    await q(`INSERT INTO supplier_invoices (id, invoice_number, supplier_id, total_amount, status)
             VALUES ($1,$2,$3,$4,$5)`, [11, 'SI-0011', 88, 70000, 'received']);
    // Compliance doc expiring within 90 days.
    await q(`INSERT INTO organization_documents (id, organization_id, document_type, expiry_date)
             VALUES ($1,$2,$3,$4)`, [1, 8, 'ISO certificate', '2026-10-15']);
  });

  test('no assigned supplier org → setup actions, not an error', async () => {
    const dash = await engine.supplierDashboard(q, 999);
    expect(dash.setup_actions.length).toBeGreaterThan(0);
  });

  test('dashboard fills from the supplier\u2019s own records only', async () => {
    const dash = await engine.supplierDashboard(q, SUPPLIER_A.id);
    expect(dash.open_rfqs.count).toBe(1);
    expect(dash.open_rfqs.items[0].my_quoted_price).toBe(100000);
    expect(dash.awarded_pos.count).toBe(1);
    expect(dash.awarded_pos.items[0].order_number).toBe('PO-0010');
    expect(dash.deliveries.count).toBe(1);
    expect(dash.inspections.count).toBe(1);
    expect(dash.invoices.count).toBe(1);
    expect(dash.expiring_documents.count).toBe(1);
  });

  test('ISOLATION: a supplier never sees a competing vendor\u2019s pricing', async () => {
    const dash = await engine.supplierDashboard(q, SUPPLIER_A.id);
    // Only supplier 70's own quotation (100000) is visible.
    const quotedPrices = dash.open_rfqs.items.map((i) => i.my_quoted_price);
    expect(quotedPrices).toEqual([100000]);
    expect(JSON.stringify(dash.open_rfqs)).not.toContain('90000'); // competitor's price
    expect(JSON.stringify(dash.invoices.items.map((i) => i.invoice_number))).toBe(JSON.stringify(['SI-0010']));
    expect(JSON.stringify(dash.awarded_pos.items.map((p) => p.order_number))).toBe(JSON.stringify(['PO-0010']));
  });

  test('mobile viewport readiness is a frontend concern — the dashboard payload is flat JSON', async () => {
    const dash = await engine.supplierDashboard(q, SUPPLIER_A.id);
    // Every widget is a plain { count, items, empty_label } object — renderable
    // on any viewport without transformation.
    for (const key of ['open_rfqs', 'awarded_pos', 'deliveries', 'inspections', 'invoices', 'expiring_documents']) {
      expect(typeof dash[key].count).toBe('number');
      expect(Array.isArray(dash[key].items)).toBe(true);
      expect(typeof dash[key].empty_label).toBe('string');
    }
  });
});
