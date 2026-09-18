// Phase 10 migration core — ledgered stock movements, reservations, and the
// derived warehouse_stock projection.
//
// Steps (all idempotent):
//   ensureTables              — stock_movements (append-only ledger),
//                               stock_reservations; additive columns:
//                               warehouses.warehouse_type
//                               (central/project/site/temp/holding) and the
//                               derived projection columns on warehouse_stock
//                               (reserved/quarantined/available)
//   backfillOpeningMovements  — every legacy directly-mutated warehouse_stock
//                               row becomes an 'opening' stock_movement so the
//                               projection is derivable from the ledger alone
//   rebuildProjection         — warehouse_stock recomputed FROM stock_movements
//                               via inventoryEngine (sum by warehouse+material)
//   createImmutabilityGuard   — real-Postgres trigger: UPDATE/DELETE on
//                               stock_movements raises; corrections are new
//                               reversal/adjustment movements. Runner-only
//                               (the mock executor cannot parse PL/pgSQL).
//
// Movement semantics (signed contributions to Physical Stock):
//   opening +1 | grn +1 | quarantine_release +1 | return +1 | transfer_in +1
//   adjustment ±1 (signed) | reversal ±1 (signed, negates the original)
//   issue −1 | transfer_out −1 | waste −1 | damage −1 | supplier_return −1
//   quarantine +0 physical, +1 quarantined | quarantine_reject −1 quarantined

'use strict';

const engine = require('../services/inventoryEngine');

const DDL = [
  // Append-only ledger — the single source of truth for stock. API layer must
  // never UPDATE/DELETE here; corrections are reversal/adjustment movements
  // referencing the original (see createImmutabilityGuard).
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    material_id INTEGER NOT NULL REFERENCES item_master(id),
    movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN
      ('opening','grn','quarantine','quarantine_release','quarantine_reject',
       'issue','return','transfer_out','transfer_in','adjustment','reversal',
       'waste','damage','supplier_return')),
    quantity DECIMAL(15,3) NOT NULL,
    reference_type VARCHAR(50),
    reference_id INTEGER,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse ON stock_movements(warehouse_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_material ON stock_movements(material_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id)`,
  `CREATE TABLE IF NOT EXISTS stock_reservations (
    id SERIAL PRIMARY KEY,
    material_id INTEGER NOT NULL REFERENCES item_master(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES project_locations(id) ON DELETE SET NULL,
    warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE CASCADE,
    quantity DECIMAL(15,3) NOT NULL CHECK (quantity > 0),
    status VARCHAR(30) DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    reference_type VARCHAR(50),
    reference_id INTEGER,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    released_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS idx_stock_reservations_material ON stock_reservations(material_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_reservations_project ON stock_reservations(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_reservations_status ON stock_reservations(status)`,
  // Phase 10 additive columns.
  `ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS warehouse_type VARCHAR(30) DEFAULT 'project'`,
  `ALTER TABLE warehouse_stock ADD COLUMN IF NOT EXISTS reserved_quantity DECIMAL(15,3) DEFAULT 0`,
  `ALTER TABLE warehouse_stock ADD COLUMN IF NOT EXISTS quarantined_quantity DECIMAL(15,3) DEFAULT 0`,
  `ALTER TABLE warehouse_stock ADD COLUMN IF NOT EXISTS available_quantity DECIMAL(15,3) DEFAULT 0`,
  `ALTER TABLE warehouse_stock ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`,
];

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

// Legacy transition: every pre-existing directly-mutated warehouse_stock row
// becomes an 'opening' movement (reference legacy_backfill) so the projection
// is derivable from the ledger alone. Idempotent.
async function backfillOpeningMovements(query) {
  const rows = (await query('SELECT id, warehouse_id, item_id, quantity FROM warehouse_stock')).rows;
  let inserted = 0;
  for (const row of rows) {
    if (engine.toNum(row.quantity) === 0) continue;
    const existing = (await query(
      `SELECT id FROM stock_movements
       WHERE warehouse_id = $1 AND material_id = $2 AND movement_type = 'opening'
         AND reference_type = 'legacy_backfill' AND reference_id = $3`,
      [row.warehouse_id, row.item_id, row.id]
    )).rows[0];
    if (existing) continue;
    await query(
      `INSERT INTO stock_movements (warehouse_id, material_id, movement_type, quantity, reference_type, reference_id)
       VALUES ($1, $2, 'opening', $3, 'legacy_backfill', $4)`,
      [row.warehouse_id, row.item_id, row.quantity, row.id]
    );
    inserted++;
  }
  return inserted;
}

async function rebuildProjection(query, opts = {}) {
  return engine.rebuildWarehouseStock(query, opts);
}

// Real-Postgres only: DB-level immutability for historical movement rows.
// The API layer already exposes no UPDATE/DELETE on stock_movements; this
// trigger closes the raw-SQL loophole too. Uses CREATE FUNCTION/trigger —
// not parsed by the mock executor, so only the migration runner calls it.
async function createImmutabilityGuard(query) {
  await query(`
    CREATE OR REPLACE FUNCTION stock_movements_immutable() RETURNS trigger AS $fn$
    BEGIN
      RAISE EXCEPTION 'stock_movements rows are immutable — post a reversal/adjustment movement referencing movement % instead', OLD.id;
    END;
    $fn$ LANGUAGE plpgsql
  `);
  await query('DROP TRIGGER IF EXISTS trg_stock_movements_immutable ON stock_movements');
  await query(`
    CREATE TRIGGER trg_stock_movements_immutable
    BEFORE UPDATE OR DELETE ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION stock_movements_immutable()
  `);
}

module.exports = {
  DDL,
  ensureTables,
  backfillOpeningMovements,
  rebuildProjection,
  createImmutabilityGuard,
};
