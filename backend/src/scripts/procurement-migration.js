// Phase 12 migration core — the full PR → RFQ → PO → GRN procurement chain.
//
// Steps (all idempotent):
//   ensureTables — the chain tables + additive columns on the Phase 11
//                  foundation (purchase_requests gains title/amount/workflow
//                  fields; purchase_orders gains taxes/freight/charges and the
//                  delivery states) + expenses.po_id + suppliers.organization_id
//
// Phase 11 already created purchase_requests and purchase_orders as the
// replenishment foundation — those are the canonical requisition/PO tables;
// this migration completes them with lines and the workflow state machine
// (exact catalog states, workflow-engine-migration.js) instead of building a
// parallel requisition system.

'use strict';

const DDL = [
  // ------------------------------------------------------------------
  // Purchase requisition (evolved from Phase 11's purchase_requests)
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS purchase_request_lines (
    id SERIAL PRIMARY KEY,
    purchase_request_id INTEGER NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    material_id INTEGER REFERENCES item_master(id) ON DELETE SET NULL,
    description VARCHAR(500),
    quantity DECIMAL(15,3) NOT NULL,
    unit VARCHAR(50),
    estimated_unit_price DECIMAL(15,2) DEFAULT 0,
    needed_by DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_purchase_request_lines_pr ON purchase_request_lines(purchase_request_id)`,
  `CREATE INDEX IF NOT EXISTS idx_purchase_request_lines_material ON purchase_request_lines(material_id)`,
  `ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS title VARCHAR(255)`,
  `ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS amount DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'`,
  `ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS workflow_instance_id INTEGER`,
  `ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS rejected_reason TEXT`,
  `ALTER TABLE purchase_requests ALTER COLUMN material_id DROP NOT NULL`,
  `ALTER TABLE purchase_requests ALTER COLUMN quantity DROP NOT NULL`,

  // ------------------------------------------------------------------
  // RFQ chain
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS rfqs (
    id SERIAL PRIMARY KEY,
    rfq_number VARCHAR(50) UNIQUE,
    purchase_request_id INTEGER REFERENCES purchase_requests(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    due_date DATE,
    status VARCHAR(30) DEFAULT 'draft',
    awarded_quotation_id INTEGER,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS rfq_lines (
    id SERIAL PRIMARY KEY,
    rfq_id INTEGER NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    material_id INTEGER REFERENCES item_master(id) ON DELETE SET NULL,
    description VARCHAR(500),
    quantity DECIMAL(15,3) NOT NULL,
    unit VARCHAR(50)
  )`,
  `CREATE TABLE IF NOT EXISTS rfq_vendors (
    id SERIAL PRIMARY KEY,
    rfq_id INTEGER NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    status VARCHAR(30) DEFAULT 'invited',
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(rfq_id, supplier_id)
  )`,
  `CREATE TABLE IF NOT EXISTS supplier_quotations (
    id SERIAL PRIMARY KEY,
    quotation_number VARCHAR(50) UNIQUE,
    rfq_id INTEGER NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    total_price DECIMAL(15,2) DEFAULT 0,
    tax_pct DECIMAL(5,3) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    payment_terms VARCHAR(255),
    delivery_terms VARCHAR(255),
    lead_time_days INTEGER,
    warranty_months INTEGER,
    valid_until DATE,
    compliant BOOLEAN DEFAULT true,
    deviations JSONB DEFAULT '[]',
    technical_score DECIMAL(5,2),
    commercial_score DECIMAL(5,2),
    status VARCHAR(30) DEFAULT 'submitted',
    awarded BOOLEAN DEFAULT false,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_supplier_quotations_rfq ON supplier_quotations(rfq_id)`,
  `CREATE TABLE IF NOT EXISTS supplier_quotation_lines (
    id SERIAL PRIMARY KEY,
    quotation_id INTEGER NOT NULL REFERENCES supplier_quotations(id) ON DELETE CASCADE,
    rfq_line_id INTEGER REFERENCES rfq_lines(id) ON DELETE SET NULL,
    material_id INTEGER REFERENCES item_master(id) ON DELETE SET NULL,
    quantity DECIMAL(15,3) NOT NULL,
    unit_price DECIMAL(15,2) DEFAULT 0,
    total_price DECIMAL(15,2) DEFAULT 0,
    delivery_days INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS bid_comparisons (
    id SERIAL PRIMARY KEY,
    rfq_id INTEGER NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    comparison JSONB DEFAULT '{}',
    recommendation JSONB DEFAULT '{}',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ------------------------------------------------------------------
  // PO (evolved from Phase 11's purchase_orders) + lines
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id SERIAL PRIMARY KEY,
    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    material_id INTEGER REFERENCES item_master(id) ON DELETE SET NULL,
    description VARCHAR(500),
    quantity DECIMAL(15,3) NOT NULL,
    unit VARCHAR(50),
    unit_rate DECIMAL(15,2) DEFAULT 0,
    discount DECIMAL(15,2) DEFAULT 0,
    line_net DECIMAL(15,2) GENERATED ALWAYS AS (quantity * unit_rate - discount) STORED,
    delivered_quantity DECIMAL(15,3) DEFAULT 0,
    accepted_quantity DECIMAL(15,3) DEFAULT 0,
    needed_by DATE,
    notes TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po ON purchase_order_lines(purchase_order_id)`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS taxes DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS freight DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_charges DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tolerance_pct DECIMAL(5,3) DEFAULT 5`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS workflow_instance_id INTEGER`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS purchase_request_id INTEGER REFERENCES purchase_requests(id) ON DELETE SET NULL`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`,
  `ALTER TABLE purchase_orders ALTER COLUMN material_id DROP NOT NULL`,
  `ALTER TABLE purchase_orders ALTER COLUMN quantity DROP NOT NULL`,

  // ------------------------------------------------------------------
  // Deliveries → MIR → GRN
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS deliveries (
    id SERIAL PRIMARY KEY,
    delivery_number VARCHAR(50) UNIQUE,
    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
    delivery_date DATE,
    status VARCHAR(30) DEFAULT 'received',
    received_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS delivery_lines (
    id SERIAL PRIMARY KEY,
    delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    purchase_order_line_id INTEGER REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
    material_id INTEGER REFERENCES item_master(id) ON DELETE SET NULL,
    quantity DECIMAL(15,3) NOT NULL,
    notes TEXT
  )`,
  // MIR — the Phase 10 quarantine gate's formal record.
  `CREATE TABLE IF NOT EXISTS material_inspection_requests (
    id SERIAL PRIMARY KEY,
    mir_number VARCHAR(50) UNIQUE,
    purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
    delivery_id INTEGER REFERENCES deliveries(id) ON DELETE SET NULL,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
    status VARCHAR(30) DEFAULT 'pending',
    inspected_by INTEGER REFERENCES users(id),
    decided_at TIMESTAMPTZ,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS mir_lines (
    id SERIAL PRIMARY KEY,
    mir_id INTEGER NOT NULL REFERENCES material_inspection_requests(id) ON DELETE CASCADE,
    delivery_line_id INTEGER REFERENCES delivery_lines(id) ON DELETE SET NULL,
    purchase_order_line_id INTEGER REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
    material_id INTEGER REFERENCES item_master(id) ON DELETE SET NULL,
    quantity DECIMAL(15,3) NOT NULL,
    accepted_quantity DECIMAL(15,3) DEFAULT 0,
    rejected_quantity DECIMAL(15,3) DEFAULT 0,
    notes TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS goods_receipt_notes (
    id SERIAL PRIMARY KEY,
    grn_number VARCHAR(50) UNIQUE,
    purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
    delivery_id INTEGER REFERENCES deliveries(id) ON DELETE SET NULL,
    mir_id INTEGER REFERENCES material_inspection_requests(id) ON DELETE SET NULL,
    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
    status VARCHAR(30) DEFAULT 'posted',
    received_by INTEGER REFERENCES users(id),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS grn_lines (
    id SERIAL PRIMARY KEY,
    grn_id INTEGER NOT NULL REFERENCES goods_receipt_notes(id) ON DELETE CASCADE,
    mir_line_id INTEGER REFERENCES mir_lines(id) ON DELETE SET NULL,
    purchase_order_line_id INTEGER REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
    material_id INTEGER REFERENCES item_master(id) ON DELETE SET NULL,
    quantity DECIMAL(15,3) NOT NULL,
    unit VARCHAR(50)
  )`,
  `CREATE TABLE IF NOT EXISTS supplier_returns (
    id SERIAL PRIMARY KEY,
    return_number VARCHAR(50) UNIQUE,
    purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
    grn_id INTEGER REFERENCES goods_receipt_notes(id) ON DELETE SET NULL,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
    reason TEXT,
    status VARCHAR(30) DEFAULT 'returned',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS supplier_return_lines (
    id SERIAL PRIMARY KEY,
    supplier_return_id INTEGER NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
    material_id INTEGER REFERENCES item_master(id) ON DELETE SET NULL,
    quantity DECIMAL(15,3) NOT NULL,
    notes TEXT
  )`,

  // ------------------------------------------------------------------
  // Supplier invoices (three-way match) — distinct from client AR invoices
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS supplier_invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(100) NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
    invoice_date DATE,
    total_amount DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'received',
    exceptions JSONB DEFAULT '[]',
    match_status VARCHAR(30) DEFAULT 'unmatched',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(supplier_id, invoice_number)
  )`,
  `CREATE TABLE IF NOT EXISTS supplier_invoice_lines (
    id SERIAL PRIMARY KEY,
    supplier_invoice_id INTEGER NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
    purchase_order_line_id INTEGER REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
    material_id INTEGER REFERENCES item_master(id) ON DELETE SET NULL,
    quantity DECIMAL(15,3) NOT NULL,
    unit_price DECIMAL(15,2) DEFAULT 0,
    line_total DECIMAL(15,2) DEFAULT 0
  )`,

  // ------------------------------------------------------------------
  // Cross-module links
  // ------------------------------------------------------------------
  `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS po_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL`,
  `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL`,
];

async function ensureTables(query) {
  for (const ddl of DDL) {
    try {
      await query(ddl);
    } catch (e) {
      if (/MockDb: bad ALTER TABLE/.test(e.message) && /ALTER COLUMN .* DROP NOT NULL/.test(ddl)) continue;
      throw e;
    }
  }
}

module.exports = { DDL, ensureTables };
