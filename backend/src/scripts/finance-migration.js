// Phase 14 migration core — AR/AP ledgers, client valuations, allocations,
// the AP review queue, receivable reminders, tax, and audit_events.
//
// Steps (all idempotent):
//   ensureTables — additive columns on invoices (client valuations with the
//                  certified/retention/advance/tax breakdown and the full
//                  lifecycle), payments (AR/AP direction), payment_allocations,
//                  ap_review_queue, receivable_reminders, tax_codes,
//                  audit_events. supplier_invoices already exists (Phase 12).
//
// The legacy invoice status 'sent' is kept working — new documents move to
// 'issued'; the lifecycle is: Draft → Approved → Issued → Partially Paid →
// Paid → Overdue → Cancelled/Void → Credited.

'use strict';

const DDL = [
  // Client valuations — the certificate breakdown + lifecycle on the existing
  // invoices table (nothing parallel).
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_contract_id INTEGER REFERENCES client_contracts(id) ON DELETE SET NULL`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_certificate_id INTEGER REFERENCES payment_certificates(id) ON DELETE SET NULL`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gross_current_work DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approved_variations_period DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS certified_gross DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS retention_amount DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS advance_recovery DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS other_deductions DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_pct DECIMAL(5,3) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS net_amount DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS previous_cumulative DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cumulative_certified DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS credited_amount DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cost_code_id INTEGER REFERENCES cost_codes(id) ON DELETE SET NULL`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS department VARCHAR(100)`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id)`,

  // Payments — AR/AP aware.
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS direction VARCHAR(10) DEFAULT 'ar'`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS cost_code_id INTEGER REFERENCES cost_codes(id) ON DELETE SET NULL`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS department VARCHAR(100)`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id)`,
  `ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL`,
  `ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS cost_code_id INTEGER REFERENCES cost_codes(id) ON DELETE SET NULL`,
  `ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS department VARCHAR(100)`,
  `ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id)`,

  // Allocations — one payment may settle several documents; never over a
  // document's outstanding balance, never over the payment amount.
  `CREATE TABLE IF NOT EXISTS payment_allocations (
    id SERIAL PRIMARY KEY,
    payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    target_type VARCHAR(30) NOT NULL DEFAULT 'client_invoice',
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
    supplier_invoice_id INTEGER REFERENCES supplier_invoices(id) ON DELETE CASCADE,
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    allocated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON payment_allocations(payment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON payment_allocations(invoice_id)`,

  // AP review queue — three-way-match exceptions (Phase 12) land here.
  `CREATE TABLE IF NOT EXISTS ap_review_queue (
    id SERIAL PRIMARY KEY,
    supplier_invoice_id INTEGER NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
    exception_type VARCHAR(50) NOT NULL,
    detail TEXT,
    status VARCHAR(30) DEFAULT 'open',
    resolved_by INTEGER REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(supplier_invoice_id, exception_type)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ap_review_queue_status ON ap_review_queue(status)`,

  // Receivable reminders (configurable per company/project/client via
  // business_rules 'receivable_reminder_config').
  `CREATE TABLE IF NOT EXISTS receivable_reminders (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    reminder_type VARCHAR(30) NOT NULL,
    status VARCHAR(30) DEFAULT 'sent',
    escalated_to VARCHAR(100),
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(invoice_id, reminder_type)
  )`,

  // Tax module — VAT codes used by valuations/certificates. Without this
  // DDL, ensureTaxCodes and GET /tax-codes crash on a real DB (the in-memory
  // test fixture masked it because MockDb auto-creates tables on first use).
  `CREATE TABLE IF NOT EXISTS tax_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    rate_pct DECIMAL(5,3) NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Immutable audit mirror — every financial create/status change writes one.
  //
  // Phase 4 (policy engine) already creates audit_events with the columns
  // entity / action / "before" / "after" / user_id / project_id — with
  // entity and action NOT NULL. Phase 14 writes the richer shape
  // (entity_type / event_type / actor_id / actor_name / before_state /
  // after_state). One physical table, union schema: the CREATE covers fresh
  // databases, the ALTERs converge an existing Phase 4 table, and the
  // engine (writeAuditEvent) dual-writes BOTH column families so either
  // reader (policy.js or the finance routes) sees every event.
  `CREATE TABLE IF NOT EXISTS audit_events (
    id SERIAL PRIMARY KEY,
    entity VARCHAR(100),
    entity_id INTEGER,
    action VARCHAR(100),
    "before" JSONB,
    "after" JSONB,
    user_id INTEGER REFERENCES users(id),
    project_id INTEGER REFERENCES projects(id),
    entity_type VARCHAR(100),
    event_type VARCHAR(50),
    actor_id INTEGER REFERENCES users(id),
    actor_name VARCHAR(255),
    before_state JSONB DEFAULT '{}',
    after_state JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS entity VARCHAR(100)`,
  `ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS action VARCHAR(100)`,
  `ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`,
  `ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id)`,
  `ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100)`,
  `ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS event_type VARCHAR(50)`,
  `ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS actor_id INTEGER REFERENCES users(id)`,
  `ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS actor_name VARCHAR(255)`,
  `ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS before_state JSONB DEFAULT '{}'`,
  `ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS after_state JSONB DEFAULT '{}'`,
  `CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity, entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_events_entity_type ON audit_events(entity_type, entity_id)`,
];

// Real-PostgreSQL-only: a Phase-4-era audit_events table carries NOT NULL on
// entity/action. Phase 14's writes fill both column families, so this is
// belt-and-braces for any writer that only fills one family. MockDb cannot
// parse ALTER COLUMN, so this runs from migrate-27 only.
const AUDIT_COMPAT_SQL = [
  `ALTER TABLE audit_events ALTER COLUMN entity DROP NOT NULL`,
  `ALTER TABLE audit_events ALTER COLUMN action DROP NOT NULL`,
];

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

// Run after ensureTables on a real database (migrate-27). Best-effort: the
// NOT NULL drops only matter for pre-Phase-14 tables that had them.
async function ensureAuditCompat(query) {
  for (const sql of AUDIT_COMPAT_SQL) {
    try {
      await query(sql);
    } catch (e) {
      console.warn(`[finance-migration] audit compat skipped: ${e.message}`);
    }
  }
}

module.exports = { DDL, AUDIT_COMPAT_SQL, ensureTables, ensureAuditCompat };
