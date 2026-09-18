// Phase 11 migration core — replenishment / auto-purchasing foundation.
//
// Steps (all idempotent):
//   ensureTables     — purchase_requests (Phase 12 builds the full approval
//                      flow on these), purchase_orders (draft/issued),
//                      replenishment_alerts; additive warehouses.storage_capacity
//   seedDefaultPolicy— business_rules row 'replenishment_policy:default'
//                      (mode alert_only) — the fail-safe default; anything
//                      unconfigured NEVER escalates beyond an alert.
//
// Deliberately NOT added: a second reorder-level column. The engine reads
// warehouse_stock.reorder_level (migrate-2.2.js) — the same column the
// dashboard low-stock alert (dashboard.js) already uses — plus the Phase 9
// item_master planning fields (safety_stock, supplier_lead_time_days, moq,
// order_multiple, shelf_life_days) and the business_rules policy store.

'use strict';

const DDL = [
  // Draft PRs (Phase 12 owns the full request/approval lifecycle).
  `CREATE TABLE IF NOT EXISTS purchase_requests (
    id SERIAL PRIMARY KEY,
    request_number VARCHAR(50) UNIQUE,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    material_id INTEGER NOT NULL REFERENCES item_master(id) ON DELETE CASCADE,
    quantity DECIMAL(15,3) NOT NULL,
    unit VARCHAR(50),
    needed_by DATE,
    status VARCHAR(30) DEFAULT 'draft',
    source_type VARCHAR(50) DEFAULT 'replenishment',
    source_id INTEGER,
    source_key VARCHAR(120),
    policy_mode VARCHAR(30),
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_purchase_requests_material ON purchase_requests(material_id)`,
  `CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON purchase_requests(status)`,
  // One open draft PR per material per source key (idempotent sweep).
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_requests_open_key
     ON purchase_requests(source_key) WHERE status = 'draft' AND source_key IS NOT NULL`,
  // Draft/issued POs (Phase 12 owns GRN + full procurement flow).
  `CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    material_id INTEGER NOT NULL REFERENCES item_master(id) ON DELETE CASCADE,
    quantity DECIMAL(15,3) NOT NULL,
    unit VARCHAR(50),
    unit_price DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'draft',
    issuance_basis VARCHAR(30),
    authority_ceiling DECIMAL(15,2),
    purchase_request_id INTEGER REFERENCES purchase_requests(id) ON DELETE SET NULL,
    needed_by DATE,
    source_type VARCHAR(50) DEFAULT 'replenishment',
    source_id INTEGER,
    source_key VARCHAR(120),
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    issued_by INTEGER REFERENCES users(id),
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_purchase_orders_material ON purchase_orders(material_id)`,
  `CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)`,
  `CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id)`,
  // Alert log — one open alert per (material, type); the sweep resolves it
  // when the condition clears. Notifications fan out via the Phase 7 engine.
  `CREATE TABLE IF NOT EXISTS replenishment_alerts (
    id SERIAL PRIMARY KEY,
    material_id INTEGER REFERENCES item_master(id) ON DELETE CASCADE,
    purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    status VARCHAR(30) DEFAULT 'open',
    snapshot JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS idx_replenishment_alerts_material ON replenishment_alerts(material_id)`,
  `CREATE INDEX IF NOT EXISTS idx_replenishment_alerts_type ON replenishment_alerts(alert_type)`,
  // Storage capacity ceiling for suggested order quantities.
  `ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS storage_capacity DECIMAL(15,3)`,
];

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

// The fail-safe default policy: alert only, never silently auto-issue.
async function seedDefaultPolicy(query) {
  const existing = await query("SELECT id FROM business_rules WHERE rule_key = 'replenishment_policy:default'");
  if (existing.rows[0]) return false;
  await query(
    `INSERT INTO business_rules (rule_key, rule_value, description)
     VALUES ('replenishment_policy:default', $1, $2)`,
    [JSON.stringify({ mode: 'alert_only' }),
     'Default replenishment mode: alert only. Auto-purchasing requires an explicit per-material or per-category policy.']
  );
  return true;
}

module.exports = { DDL, ensureTables, seedDefaultPolicy };
