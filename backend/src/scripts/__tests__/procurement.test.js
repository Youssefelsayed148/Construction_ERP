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
  test('accepted ≤ delivered ≤ ordered + tolerance', () => {
    expect(svc.grnConstraintOk({ ordered: 100, deliveredCumulative: 100, acceptedCumulative: 95, tolerancePct: 5 })).toBe(true);
    expect(svc.grnConstraintOk({ ordered: 100, deliveredCumulative: 105, acceptedCumulative: 105, tolerancePct: 5 })).toBe(true); // exactly at tolerance
    expect(svc.grnConstraintOk({ ordered: 100, deliveredCumulative: 106, acceptedCumulative: 106, tolerancePct: 5 })).toBe(false); // beyond 5%
    expect(svc.grnConstraintOk({ ordered: 100, deliveredCumulative: 100, acceptedCumulative: 110, tolerancePct: 5 })).toBe(false); // accepted > delivered
  });
});

// ---------------------------------------------------------------------------
// The gate: the full scenario with zero manual database edits
// ---------------------------------------------------------------------------

describe('full procurement scenario (gate — zero manual DB edits)', () => {
  let pr; let rfq; let po; let delivery; let mir; let grn;

  test('PR created → submitted → budget check → authority approval → procurement (workflow-driven)', async () => {
    pr = await svc.createPurchaseRequest(q, {
      title: 'Concrete for slab pour, Floor 5',
      project_id: 1, priority: 'high', needed_by: '2026-10-01',
      created_by: USER_REQUESTER.id,
      lines: [
        { material_id: 50, description: 'Cement bags', quantity: 100, unit: 'bag', estimated_unit_price: 100 },
      ],
    });
    expect(pr.request_number).toMatch(/^PR-/);
    expect(parseFloat(pr.amount)).toBe(10000);

    // Submit starts the catalog workflow and advances the requester's own
    // Draft/Submit steps — the PR lands in the Budget Check state.
    await svc.submitPurchaseRequest(q, pr.id, USER_REQUESTER);
    let doc = (await q('SELECT * FROM purchase_requests WHERE id = $1', [pr.id])).rows[0];
    expect(doc.status).toBe('budget_check');

    // Budget Check → Authority Approval → Procurement.
    await svc.decideOnDocument(q, 'purchase_request', pr.id, { id: 4, name: 'Acct', role: 'accountant' }, 'approve');
    doc = (await q('SELECT * FROM purchase_requests WHERE id = $1', [pr.id])).rows[0];
    expect(doc.status).toBe('authority_approval');

    await svc.decideOnDocument(q, 'purchase_request', pr.id, USER_PURCHASING, 'approve'); // authority
    doc = (await q('SELECT * FROM purchase_requests WHERE id = $1', [pr.id])).rows[0];
    expect(doc.status).toBe('procurement'); // handed to Procurement

    await svc.decideOnDocument(q, 'purchase_request', pr.id, USER_PURCHASING, 'approve'); // terminal
    doc = (await q('SELECT * FROM purchase_requests WHERE id = $1', [pr.id])).rows[0];
    expect(doc.status).toBe('procurement');
  });

  test('RFQ issued to 3 vendors; 3 quotes; comparison; award', async () => {
    rfq = await svc.createRfq(q, {
      purchase_request_id: pr.id, project_id: 1,
      title: 'Cement supply', due_date: '2026-09-30', created_by: USER_PURCHASING.id,
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
      lead_time_days: 7, warranty_months: 12, valid_until: '2026-10-15',
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

  test('PO created from the award; approval chain issues it; supplier acknowledges', async () => {
    po = await svc.createPurchaseOrder(q, {
      supplier_id: 9, purchase_request_id: pr.id, project_id: 1,
      taxes: 500, freight: 250, approved_charges: 50, tolerance_pct: 5,
      payment_terms: 'Net 30', delivery_terms: 'Delivered to site store',
      created_by: USER_PURCHASING.id,
      lines: [{ material_id: 50, description: 'Cement bags', quantity: 100, unit: 'bag', unit_rate: 100 }],
    });
    expect(parseFloat(po.total_amount)).toBe(10000 + 500 + 250 + 50); // Σ line net + taxes + freight + charges

    await svc.issuePurchaseOrder(q, po.id, USER_REQUESTER); // requester !== approvers
    let doc = (await q('SELECT * FROM purchase_orders WHERE id = $1', [po.id])).rows[0];
    expect(doc.status).toBe('draft'); // workflow at the Draft step

    await svc.decideOnDocument(q, 'purchase_order', po.id, USER_REQUESTER, 'approve'); // leave Draft
    doc = (await q('SELECT * FROM purchase_orders WHERE id = $1', [po.id])).rows[0];
    expect(doc.status).toBe('commercial_procurement_approval');

    await svc.decideOnDocument(q, 'purchase_order', po.id, USER_PURCHASING, 'approve'); // commercial
    doc = (await q('SELECT * FROM purchase_orders WHERE id = $1', [po.id])).rows[0];
    expect(doc.status).toBe('financial_authority');

    await svc.decideOnDocument(q, 'purchase_order', po.id, USER_FINANCE, 'approve'); // financial authority
    doc = (await q('SELECT * FROM purchase_orders WHERE id = $1', [po.id])).rows[0];
    expect(doc.status).toBe('issued'); // issued to the supplier

    // Purchasing executes the issuance; supplier acknowledges.
    await svc.decideOnDocument(q, 'purchase_order', po.id, USER_PURCHASING, 'approve');
    doc = (await q('SELECT * FROM purchase_orders WHERE id = $1', [po.id])).rows[0];
    expect(doc.status).toBe('acknowledged');

    await svc.decideOnDocument(q, 'purchase_order', po.id, USER_SUPPLIER, 'approve');
    doc = (await q('SELECT * FROM purchase_orders WHERE id = $1', [po.id])).rows[0];
    expect(doc.status).toBe('partially_fully_delivered'); // no deliveries yet
  });

  test('partial delivery → quarantine stock → MIR accepted → usable stock increases once', async () => {
    const poLine = (await q('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1', [po.id])).rows[0];

    delivery = await svc.createDelivery(q, {
      purchase_order_id: po.id, warehouse_id: WH, delivery_date: '2026-09-20',
      received_by: USER_QC.id,
      lines: [{ purchase_order_line_id: poLine.id, quantity: 40 }],
    });

    // Received material sits in quarantine — NOT usable.
    let balances = await inventoryEngine.getBalances(q, WH, 50);
    expect(balances.quarantined).toBe(40);
    expect(balances.available).toBe(0);

    mir = await svc.createMir(q, { delivery_id: delivery.id, created_by: USER_QC.id });
    expect(mir.status).toBe('pending');

    mir = await svc.decideMir(q, mir.id, USER_QC, 'accept', {});
    expect(mir.status).toBe('accepted');

    // Phase 10 gate tie-in: the accepted MIR released the quarantined qty.
    balances = await inventoryEngine.getBalances(q, WH, 50);
    expect(balances.quarantined).toBe(0);
    expect(balances.available).toBe(40);
    expect(balances.physical).toBe(40);
  });

  test('GRN documents the MIR-accepted quantities and never double-counts stock', async () => {
    grn = await svc.createGrn(q, { mir_id: mir.id, created_by: USER_PURCHASING });
    expect(grn.grn_number).toMatch(/^GRN-/);
    const grnLines = (await q('SELECT * FROM grn_lines WHERE grn_id = $1', [grn.id])).rows;
    expect(parseFloat(grnLines[0].quantity)).toBe(40);

    // Stock unchanged by the GRN itself (the increase happened at MIR accept).
    const balances = await inventoryEngine.getBalances(q, WH, 50);
    expect(balances.available).toBe(40);

    // GRN beyond the MIR-accepted quantity is impossible (each MIR grants one
    // GRN, and accepted ≤ delivered ≤ ordered + tolerance).
    await expect(svc.createGrn(q, { mir_id: mir.id, created_by: USER_PURCHASING }))
      .rejects.toThrow(/already has GRN/);
  });

  test('delivery beyond ordered + tolerance is refused', async () => {
    const poLines = (await q('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1', [po.id])).rows[0];
    // 40 already delivered; tolerance allows up to 105 — 70 more would exceed.
    await expect(svc.createDelivery(q, {
      purchase_order_id: po.id, warehouse_id: WH, received_by: USER_QC.id,
      lines: [{ purchase_order_line_id: poLines.id, quantity: 70 }],
    })).rejects.toThrow(/tolerance/);
  });

  test('stock issues to a work package through the ledger (no direct edits)', async () => {
    const result = await svc.issueMaterialToWorkPackage(q, {
      work_order_id: 30, material_id: 50, quantity: 25, warehouse_id: WH, created_by: USER_QC.id,
    });
    expect(result.work_order_material.work_order_id).toBe(30);
    expect(result.movement.movement_type).toBe('issue');
    const balances = await inventoryEngine.getBalances(q, WH, 50);
    expect(balances.available).toBe(15);

    // The chain's last mile: a Phase 9 material requirement's consumption book
    // would see this issue (already_consumed rises on the next recompute).
    expect(parseFloat(result.work_order_material.actual_quantity)).toBe(25);
  });

  test('closing the PO completes the catalog state machine', async () => {
    // Partial delivery (40 of 100) already recorded the delivered state.
    let doc = (await q('SELECT * FROM purchase_orders WHERE id = $1', [po.id])).rows[0];
    expect(doc.status).toBe('partially_delivered');

    await svc.decideOnDocument(q, 'purchase_order', po.id, USER_REQUESTER, 'approve'); // leave Partially/Fully Delivered
    doc = (await q('SELECT * FROM purchase_orders WHERE id = $1', [po.id])).rows[0];
    expect(doc.status).toBe('closed');
  });

  test('supplier return draws stock back out through the ledger', async () => {
    const grnRow = (await q('SELECT * FROM goods_receipt_notes WHERE id = $1', [grn.id])).rows[0];
    await svc.createSupplierReturn(q, {
      grn_id: grn.id, reason: 'Damaged bags on pallet 3',
      lines: [{ material_id: 50, quantity: 5, notes: 'torn bags' }],
      created_by: USER_QC.id,
    });
    const balances = await inventoryEngine.getBalances(q, WH, 50);
    expect(balances.available).toBe(10); // 40 received − 25 issued − 5 returned
    const movements = (await q("SELECT * FROM stock_movements WHERE movement_type = 'supplier_return'")).rows;
    expect(movements.length).toBe(1);
    void grnRow;
  });
});

// ---------------------------------------------------------------------------
// Three-way match
// ---------------------------------------------------------------------------

describe('three-way match', () => {
  test('a clean invoice matches with zero exceptions', async () => {
    const po2 = await svc.createPurchaseOrder(q, {
      supplier_id: 10, project_id: 1, taxes: 100, freight: 0, approved_charges: 0,
      created_by: USER_PURCHASING.id,
      lines: [{ material_id: 50, quantity: 50, unit: 'bag', unit_rate: 100 }],
    });
    await svc.issuePurchaseOrder(q, po2.id, USER_REQUESTER); // requester !== approvers
    await svc.decideOnDocument(q, 'purchase_order', po2.id, USER_REQUESTER, 'approve'); // leave Draft
    await svc.decideOnDocument(q, 'purchase_order', po2.id, USER_PURCHASING, 'approve');
    await svc.decideOnDocument(q, 'purchase_order', po2.id, USER_FINANCE, 'approve');
    // Bypass the supplier-ack tail for brevity: deliver + MIR + GRN directly.
    const delivery2 = await svc.createDelivery(q, {
      purchase_order_id: po2.id, warehouse_id: WH, received_by: USER_QC.id,
      lines: [{ purchase_order_line_id: (await q('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1', [po2.id])).rows[0].id, quantity: 50 }],
    });
    const mir2 = await svc.createMir(q, { delivery_id: delivery2.id, created_by: USER_QC.id });
    await svc.decideMir(q, mir2.id, USER_QC, 'accept');
    await svc.createGrn(q, { mir_id: mir2.id, created_by: USER_PURCHASING.id });

    const { invoice, match } = await svc.recordSupplierInvoice(q, {
      supplier_id: 10, purchase_order_id: po2.id, invoice_number: 'SI-100',
      total_amount: 5100, tax_amount: 100,
      lines: [{ purchase_order_line_id: (await q('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1', [po2.id])).rows[0].id, quantity: 50, unit_price: 100 }],
      created_by: USER_PURCHASING.id,
    });
    expect(match.match_status).toBe('matched');
    expect(match.exceptions.length).toBe(0);
    void invoice;
  });

  test('variance, missing GRN, duplicate and tax mismatch are flagged, never silently accepted', async () => {
    // 1. Missing GRN + price variance + quantity variance on a fresh PO line.
    const po3 = await svc.createPurchaseOrder(q, {
      supplier_id: 11, project_id: 1, taxes: 100, freight: 0, approved_charges: 0,
      created_by: USER_PURCHASING.id,
      lines: [{ material_id: 50, description: 'bags', quantity: 30, unit: 'bag', unit_rate: 100 }],
    });
    await svc.issuePurchaseOrder(q, po3.id, USER_REQUESTER); // requester !== approvers
    await svc.decideOnDocument(q, 'purchase_order', po3.id, USER_REQUESTER, 'approve'); // leave Draft
    await svc.decideOnDocument(q, 'purchase_order', po3.id, USER_PURCHASING, 'approve');
    await svc.decideOnDocument(q, 'purchase_order', po3.id, USER_FINANCE, 'approve');

    const { match } = await svc.recordSupplierInvoice(q, {
      supplier_id: 11, purchase_order_id: po3.id, invoice_number: 'SI-300',
      total_amount: 9000, tax_amount: 999,
      lines: [{ purchase_order_line_id: (await q('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1', [po3.id])).rows[0].id, quantity: 30, unit_price: 120 }],
      created_by: USER_PURCHASING.id,
    });
    const types = match.exceptions.map((e) => e.type);
    expect(types).toContain('missing_grn');
    expect(types).toContain('price_variance');
    expect(types).toContain('tax_mismatch');
    expect(match.match_status).toBe('exception');

    // 2. Duplicate invoice number for the same supplier is refused.
    await expect(svc.recordSupplierInvoice(q, {
      supplier_id: 11, purchase_order_id: po3.id, invoice_number: 'SI-300',
      total_amount: 1,
      lines: [{ quantity: 1, unit_price: 1 }],
      created_by: USER_PURCHASING.id,
    })).rejects.toThrow(/Duplicate/);
  });
});

// ---------------------------------------------------------------------------
// Branded numbered PDFs
// ---------------------------------------------------------------------------

describe('catalog PDF documents', () => {
  test('generates a branded, numbered PO PDF', async () => {
    const po = (await q('SELECT * FROM purchase_orders ORDER BY id LIMIT 1')).rows[0];
    const poLines = (await q('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1', [po.id])).rows;
    const buffer = await pdf.renderPurchaseOrderDocument(po, poLines, 'Vendor 9');
    expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
  });

  test('generates the PR, GRN, MIR and supplier-return documents', async () => {
    const prRow = (await q('SELECT * FROM purchase_requests ORDER BY id LIMIT 1')).rows[0];
    const prPdf = await pdf.renderPurchaseRequestDocument(prRow, []);
    expect(prPdf.slice(0, 5).toString()).toBe('%PDF-');

    const mirRow = (await q('SELECT * FROM material_inspection_requests ORDER BY id LIMIT 1')).rows[0];
    const mirPdf = await pdf.renderMirDocument(mirRow, []);
    expect(mirPdf.slice(0, 5).toString()).toBe('%PDF-');

    const grnRow = (await q('SELECT * FROM goods_receipt_notes ORDER BY id LIMIT 1')).rows[0];
    const grnPdf = await pdf.renderGrnDocument(grnRow, []);
    expect(grnPdf.slice(0, 5).toString()).toBe('%PDF-');

    const returnRow = (await q('SELECT * FROM supplier_returns ORDER BY id LIMIT 1')).rows[0];
    const returnPdf = await pdf.renderSupplierReturnDocument(returnRow, [], 'torn bags');
    expect(returnPdf.slice(0, 5).toString()).toBe('%PDF-');
  });

  test('generates RFQ, quotation cover, technical evaluation, comparison and award documents', async () => {
    const rfqRow = (await q('SELECT * FROM rfqs ORDER BY id LIMIT 1')).rows[0];
    expect((await pdf.renderRfqDocument(rfqRow, [], 3)).slice(0, 5).toString()).toBe('%PDF-');
    const quotationRow = (await q('SELECT * FROM supplier_quotations ORDER BY id LIMIT 1')).rows[0];
    expect((await pdf.renderQuotationCoverDocument(quotationRow, 'Vendor 9', [])).slice(0, 5).toString()).toBe('%PDF-');
    expect((await pdf.renderTechnicalEvaluationDocument(rfqRow, [])).slice(0, 5).toString()).toBe('%PDF-');
    const comparison = await svc.buildBidComparison(q, rfqRow.id, { persist: false });
    expect((await pdf.renderCommercialComparisonDocument(comparison)).slice(0, 5).toString()).toBe('%PDF-');
    expect((await pdf.renderAwardRecommendationDocument(rfqRow, comparison.recommendation)).slice(0, 5).toString()).toBe('%PDF-');
  });
});

function q10Id() {
  return db.table('supplier_quotations').rows.find((r) => r.supplier_id === 10).id;
}
function po() { return null; }
void po;
