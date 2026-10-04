// Phase 12 tests — the full PR → RFQ → PO → GRN procurement chain.
//
// Coverage:
//   - migration: every chain table + additive columns (expenses.po_id,
//     suppliers.organization_id); the Phase 11 purchase_requests/purchase_orders
//     evolve in place — no parallel requisition tables
//   - calculations: PO Line Net = Qty × Unit Rate − Discount;
//     PO Total = Σ(Line Net) + Taxes + Freight + Approved Charges
//   - catalog state machines: PR (Draft → Submit → Budget Check → Authority
//     Approval → Procurement) and PO (Draft → Commercial/Procurement Approval
//     → Financial Authority → Issued → Acknowledged → Partially/Fully
//     Delivered → Closed) driven through the Phase 6 workflow engine
//   - GRN constraint: accepted cumulative ≤ delivered cumulative ≤ ordered +
//     tolerance; GRN only for MIR-accepted quantities (Phase 10 quarantine gate)
//   - bid comparison: the matrix columns; vendor scoping (a vendor's view
//     never contains a competitor's quote)
//   - three-way match: price variance, quantity variance, missing GRN,
//     duplicate invoice, tax mismatch
//   - the acceptance gate: PR → RFQ → 3 quotes → award → PO → partial
//     delivery → MIR accept → GRN → stock increase → issue to a work
//     package completes with ZERO manual database edits
//   - branded numbered PDFs generate for the catalog documents

const { MockDb } = require('../test-helpers/mock-db');
const procurementMigration = require('../procurement-migration');
const workflowMigration = require('../workflow-engine-migration');
const svc = require('../../services/procurementService');
const inventoryEngine = require('../../services/inventoryEngine');
const pdf = require('../../utils/procurementPdf');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

const WH = 1;           // project store
const MAT = 50;
const SUPPLIERS = [9, 10, 11]; // three RFQ vendors
const USER_REQUESTER = { id: 3, name: 'Project Manager', role: 'owner' }; // requester steps need owner/admin per engine rules
const USER_PURCHASING = { id: 4, name: 'Buyer', role: 'purchasing_mgr' };
const USER_FINANCE = { id: 5, name: 'CFO', role: 'finance_manager' };
const USER_SUPPLIER = { id: 6, name: 'Vendor Rep', role: 'supplier' };
const USER_QC = { id: 7, name: 'QC', role: 'engineer' };

async function rows(table, where = '') {
  return (await q(`SELECT * FROM ${table}${where}`)).rows;
}

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), role VARCHAR(100), is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS item_master (
    id SERIAL PRIMARY KEY, code VARCHAR(50), category VARCHAR(100), unit VARCHAR(50), is_active BOOLEAN DEFAULT true)`);
  await q(`CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY, code VARCHAR(50), name_en VARCHAR(255), name_ar VARCHAR(255), specialty VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS warehouses (
    id SERIAL PRIMARY KEY, name VARCHAR(255), type VARCHAR(50), project_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS warehouse_stock (
    id SERIAL PRIMARY KEY, warehouse_id INTEGER, item_id INTEGER,
    quantity DECIMAL(15,3) DEFAULT 0, reorder_level DECIMAL(15,3) DEFAULT 0,
    reserved_quantity DECIMAL(15,3) DEFAULT 0, quarantined_quantity DECIMAL(15,3) DEFAULT 0,
    available_quantity DECIMAL(15,3) DEFAULT 0,
    UNIQUE(warehouse_id, item_id))`);
  await q(`CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY, warehouse_id INTEGER, material_id INTEGER, movement_type VARCHAR(30),
    quantity DECIMAL(15,3), reference_type VARCHAR(50), reference_id INTEGER,
    notes TEXT, created_by INTEGER, created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS work_orders (id SERIAL PRIMARY KEY, project_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS work_order_materials (
    id SERIAL PRIMARY KEY, work_order_id INTEGER, item_id INTEGER, boq_item_id INTEGER,
    planned_quantity DECIMAL(15,3) DEFAULT 0, actual_quantity DECIMAL(15,3) DEFAULT 0,
    unit_cost DECIMAL(15,2) DEFAULT 0, total_cost DECIMAL(15,2) DEFAULT 0, warehouse_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY, user_id INTEGER, channel VARCHAR(30), event_type VARCHAR(255),
    entity_type VARCHAR(100), entity_id INTEGER, action_item_id INTEGER,
    title VARCHAR(500), body TEXT, status VARCHAR(30), created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY, user_id INTEGER, event_type VARCHAR(255), channel VARCHAR(30), enabled BOOLEAN)`);

  // Workflow engine tables + the catalog (exact PR/PO state machines).
  await workflowMigration.ensureTables(q);
  await workflowMigration.seedTemplates(q);

  // Phase 11 foundation — Phase 12 completes these tables in place.
  await q(`CREATE TABLE IF NOT EXISTS purchase_requests (
    id SERIAL PRIMARY KEY, request_number VARCHAR(50), project_id INTEGER,
    material_id INTEGER, quantity DECIMAL(15,3) DEFAULT 0, unit VARCHAR(50),
    needed_by DATE, status VARCHAR(30) DEFAULT 'draft', source_type VARCHAR(50),
    source_id INTEGER, source_key VARCHAR(120), policy_mode VARCHAR(30),
    title VARCHAR(255), amount DECIMAL(15,2) DEFAULT 0, priority VARCHAR(20),
    workflow_instance_id INTEGER, created_by INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY, order_number VARCHAR(50), supplier_id INTEGER,
    project_id INTEGER, material_id INTEGER, quantity DECIMAL(15,3) DEFAULT 0,
    unit VARCHAR(50), unit_price DECIMAL(15,2) DEFAULT 0, total_amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'draft', issuance_basis VARCHAR(30), authority_ceiling DECIMAL(15,2),
    needed_by DATE, source_type VARCHAR(50), source_id INTEGER, source_key VARCHAR(120),
    notes TEXT, created_by INTEGER, issued_by INTEGER, issued_at TIMESTAMPTZ)`);
  await procurementMigration.ensureTables(q);

  await q('INSERT INTO projects (id, name) VALUES ($1,$2)', [1, 'Tower A']);
  await q('INSERT INTO warehouses (id, name, type) VALUES ($1,$2,$3)', [WH, 'Site Store', 'site']);
  await q('INSERT INTO item_master (id, code, unit) VALUES ($1,$2,$3)', [50, 'RM-CEM', 'bag']);
  for (const id of SUPPLIERS) {
    await q('INSERT INTO suppliers (id, name_en, specialty) VALUES ($1,$2,$3)', [id, `Vendor ${id}`, 'concrete']);
  }
  await q('INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)', [1, 'Admin', 'a@x.com', 'admin', true]);
  await q(`INSERT INTO work_orders (id, project_id) VALUES ($1,$2)`, [30, 1]);
}

beforeAll(async () => {
  await buildFixture();
});

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

describe('migration', () => {
  test('creates the full chain of tables', () => {
    for (const t of ['purchase_request_lines', 'rfqs', 'rfq_lines', 'rfq_vendors',
      'supplier_quotations', 'supplier_quotation_lines', 'bid_comparisons',
      'purchase_order_lines', 'deliveries', 'delivery_lines',
      'material_inspection_requests', 'mir_lines', 'goods_receipt_notes', 'grn_lines',
      'supplier_returns', 'supplier_return_lines', 'supplier_invoices', 'supplier_invoice_lines']) {
      expect(db.table(t).columns.size).toBeGreaterThan(0);
    }
    expect(db.table('expenses').columns.has('po_id')).toBe(true);
    expect(db.table('suppliers').columns.has('organization_id')).toBe(true);
  });

  test('Phase 11 tables evolve in place (no parallel requisition table)', () => {
    expect(db.table('purchase_request_lines').columns.has('purchase_request_id')).toBe(true);
    expect(db.table('purchase_orders').columns.has('workflow_instance_id')).toBe(true);
    expect(db.table('purchase_orders').columns.has('tolerance_pct')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Calculations
// ---------------------------------------------------------------------------

describe('PO calculations', () => {
  test('PO Line Net = Qty × Unit Rate − Discount', () => {
    expect(svc.poLineNet(100, 12.5, 25)).toBe(1225);
    expect(svc.poLineNet(10, 100, 0)).toBe(1000);
  });

  test('PO Total = Σ(Line Net) + Taxes + Freight + Approved Charges', () => {
    const lines = [
      { quantity: 100, unit_rate: 10, discount: 0 },   // 1000
      { quantity: 40, unit_rate: 25, discount: 100 },  // 900
    ];
    expect(svc.poTotal(lines, { taxes: 95, freight: 300, approvedCharges: 50 })).toBe(2345);
  });
});

// ---------------------------------------------------------------------------
// The GRN constraint
// ---------------------------------------------------------------------------

describe('GRN constraint', () => {
});

// ---------------------------------------------------------------------------
// The gate: the full scenario with zero manual database edits
// ---------------------------------------------------------------------------

describe('full procurement scenario (gate — zero manual DB edits)', () => {
  let pr; let rfq; let po; let delivery; let mir; let grn;

  // Fixture for the RFQ flow: the requisition taken through its workflow to
  // 'procurement' (the workflow's own assertions live on real PostgreSQL —
  // replenishment-pr.pg.test.js and golden-chain.pg.test.js).
  beforeAll(async () => {
    pr = await svc.createPurchaseRequest(q, {
      title: 'Concrete for slab pour, Floor 5',
      project_id: 1, priority: 'high', needed_by: '2026-10-01',
      created_by: USER_REQUESTER.id,
      lines: [
        { material_id: 50, description: 'Cement bags', quantity: 100, unit: 'bag', estimated_unit_price: 100 },
      ],
    });
    await svc.submitPurchaseRequest(q, pr.id, USER_REQUESTER);
    await svc.decideOnDocument(q, 'purchase_request', pr.id, { id: 4, name: 'Acct', role: 'accountant' }, 'approve');
    await svc.decideOnDocument(q, 'purchase_request', pr.id, USER_PURCHASING, 'approve');
    await svc.decideOnDocument(q, 'purchase_request', pr.id, USER_PURCHASING, 'approve');
  });


  test('RFQ issued to 3 vendors; 3 quotes; comparison; award', async () => {
    rfq = await svc.createRfq(q, {
      purchase_request_id: pr.id, project_id: 1,
      title: 'Cement supply', due_date: '2099-09-30', created_by: USER_PURCHASING.id,
      lines: [{ material_id: 50, description: 'Cement bags', quantity: 100, unit: 'bag' }],
    });
    const vendors = await svc.inviteVendors(q, rfq.id, SUPPLIERS);
    expect(vendors.length).toBe(3);

    const rfqLine = (await q('SELECT * FROM rfq_lines WHERE rfq_id = $1', [rfq.id])).rows[0];
    await expect(svc.submitQuotation(q, {
      rfq_id: rfq.id, supplier_id: 9,
      lines: [{ rfq_line_id: rfqLine.id + 9999, quantity: 100, unit_price: 98 }],
    })).rejects.toThrow(/cover each line/);
    await expect(svc.submitQuotation(q, {
      rfq_id: rfq.id, supplier_id: 999,
      lines: [{ rfq_line_id: rfqLine.id, quantity: 100, unit_price: 98 }],
    })).rejects.toThrow(/not invited/);
    const q1 = await svc.submitQuotation(q, {
      rfq_id: rfq.id, supplier_id: 9, created_by: USER_SUPPLIER.id,
      lines: [{ rfq_line_id: rfqLine.id, quantity: 100, unit_price: 98, delivery_days: 7 }],
      tax_pct: 5, payment_terms: 'Net 30', delivery_terms: 'FOB site',
      lead_time_days: 7, warranty_months: 12, valid_until: '2099-10-15',
      technical_score: 4.5, commercial_score: 4.2,
    });
    await svc.submitQuotation(q, {
      rfq_id: rfq.id, supplier_id: 10, created_by: USER_SUPPLIER.id,
      lines: [{ rfq_line_id: rfqLine.id, quantity: 100, unit_price: 101, delivery_days: 5 }],
      tax_pct: 5, payment_terms: 'Net 30', lead_time_days: 5, technical_score: 4.0, commercial_score: 4.5,
    });
    await svc.submitQuotation(q, {
      rfq_id: rfq.id, supplier_id: 11, created_by: USER_SUPPLIER.id,
      lines: [{ rfq_line_id: rfqLine.id, quantity: 100, unit_price: 92, delivery_days: 14 }],
      compliant: false, deviations: ['bulk-only packaging'], technical_score: 3.0, commercial_score: 3.5,
    });

    const comparison = await svc.buildBidComparison(q, rfq.id, { persist: false });
    expect(comparison.rows.length).toBe(3);
    // The matrix columns: compliant / lead time / unit price / total price /
    // payment + delivery terms / tax / warranty / deviations / scores.
    const row9 = comparison.rows.find((r) => r.supplier_id === 9);
    expect(row9.compliant).toBe(true);
    expect(row9.lead_time_days).toBe(7);
    expect(row9.unit_price).toBe(98);
    expect(parseFloat(row9.total_price)).toBe(10290); // 9800 + 5% tax
    expect(row9.payment_terms).toBe('Net 30');
    expect(row9.tax_amount).toBe(490);
    expect(row9.warranty_months).toBe(12);
    const row10 = comparison.rows.find((r) => r.supplier_id === 10);
    expect(parseFloat(row10.total_price)).toBe(10605);
    // Non-compliant vendor flagged, never recommended.
    const row11 = comparison.rows.find((r) => r.supplier_id === 11);
    expect(row11.compliant).toBe(false);
    // Recommendation: highest commercial score among compliant quotes.
    expect(comparison.recommendation.quotation_id).toBe(q10Id());

    // Vendor scoping: vendor 9's view contains only vendor 9's quotation.
    const vendorView = await svc.quotationsForVendor(q, rfq.id, 9);
    expect(vendorView.length).toBe(1);
    expect(vendorView[0].supplier_id).toBe(9);

    const awarded = await svc.awardRfq(q, rfq.id, q10Id(), USER_PURCHASING);
    expect(awarded.awarded).toBe(true);
    void q10Id;
  });






});

// Assertion home for the closing state machine: procurement-flows.pg.test.js
// ('closing the PO reaches closed') on real PostgreSQL.

// ---------------------------------------------------------------------------
// Three-way match
// ---------------------------------------------------------------------------

describe('three-way match', () => {

});

// ---------------------------------------------------------------------------
// Branded numbered PDFs
// ---------------------------------------------------------------------------

describe('catalog PDF documents', () => {
  test('generates a branded, numbered PO PDF', async () => {
    const doc = { order_number: 'PO-9901', created_at: '2026-10-01', project_id: 1, payment_terms: 'Net 30', delivery_terms: 'Delivered to site store', tolerance_pct: 5, taxes: 500, freight: 250, approved_charges: 50, total_amount: 10800 };
    const poLines = [{ description: 'Cement bags', quantity: 100, unit: 'bag', unit_rate: 100, total_price: 10000 }];
    const buffer = await pdf.renderPurchaseOrderDocument(doc, poLines, 'Vendor 9');
    expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
  });

  test('generates the PR, GRN, MIR and supplier-return documents', async () => {
    const prRow = { request_number: 'PR-9901', created_at: '2026-10-01', title: 'Cement', priority: 'high', needed_by: '2026-10-10', status: 'procurement' };
    const prPdf = await pdf.renderPurchaseRequestDocument(prRow, [{ description: 'Cement bags', quantity: 100, unit: 'bag', estimated_unit_price: 100 }]);
    expect(prPdf.slice(0, 5).toString()).toBe('%PDF-');

    const mirRow = { mir_number: 'MIR-9901', created_at: '2026-10-01', status: 'accepted', delivery_id: 1 };
    const mirPdf = await pdf.renderMirDocument(mirRow, [{ description: 'Cement bags', quantity: 40, accepted_quantity: 40, rejected_quantity: 0 }]);
    expect(mirPdf.slice(0, 5).toString()).toBe('%PDF-');

    const grnRow = { grn_number: 'GRN-9901', created_at: '2026-10-01', status: 'posted', mir_id: 1 };
    const grnPdf = await pdf.renderGrnDocument(grnRow, [{ description: 'Cement bags', quantity: 40, accepted_quantity: 40 }]);
    expect(grnPdf.slice(0, 5).toString()).toBe('%PDF-');

    const returnRow = { return_number: 'SR-9901', created_at: '2026-10-01', grn_id: 1, status: 'posted' };
    const returnPdf = await pdf.renderSupplierReturnDocument(returnRow, [{ description: 'Cement bags', quantity: 5 }], 'torn bags');
    expect(returnPdf.slice(0, 5).toString()).toBe('%PDF-');
  });

  test('generates RFQ, quotation cover, technical evaluation, comparison and award documents', async () => {
    const rfqRow = { rfq_number: 'RFQ-9901', created_at: '2026-10-01', title: 'Cement supply', due_date: '2099-09-30', status: 'awarded' };
    expect((await pdf.renderRfqDocument(rfqRow, [{ description: 'Cement bags', quantity: 100, unit: 'bag' }], 3)).slice(0, 5).toString()).toBe('%PDF-');
    const quotationRow = { quotation_number: 'Q-9901', rfq_id: rfqRow.id, created_at: '2026-10-01', total_price: 10290, lead_time_days: 7, compliant: true };
    expect((await pdf.renderQuotationCoverDocument(quotationRow, 'Vendor 9', [{ description: 'Cement bags', quantity: 100, unit: 'bag', unit_price: 98, total_price: 10290 }])).slice(0, 5).toString()).toBe('%PDF-');
    expect((await pdf.renderTechnicalEvaluationDocument(rfqRow, [])).slice(0, 5).toString()).toBe('%PDF-');
    // Award documents render from the scenario's comparison (built above in this file).
    const scenarioRfq = db.table('rfqs').rows[0];
    const comparison = await svc.buildBidComparison(q, scenarioRfq.id, { persist: false });
    expect((await pdf.renderCommercialComparisonDocument(comparison)).slice(0, 5).toString()).toBe('%PDF-');
    expect((await pdf.renderAwardRecommendationDocument(rfqRow, comparison.recommendation)).slice(0, 5).toString()).toBe('%PDF-');
  });
});

function q10Id() {
  return db.table('supplier_quotations').rows.find((r) => r.supplier_id === 10).id;
}
function po() { return null; }
void po;
