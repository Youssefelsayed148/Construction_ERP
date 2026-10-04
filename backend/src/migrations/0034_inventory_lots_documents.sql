-- Phase 5.3 Materials and inventory (spec 07).
--
--   1. unit_conversions  - the conversion table (per material, or company-wide when material_id is NULL).
--      The per-item JSONB item_master.unit_conversions is backfilled into it and stays readable as a
--      compatibility copy; the table is the authority.
--   2. stock_lots        - lot / batch / expiry per (warehouse, material). stock_movements.lot_id ties ledger
--      rows to a lot (composite FK: a movement can only name a lot of its own warehouse and material).
--      stock_lot_balances is a view over the ledger (same signs as the engine's PHYSICAL_SIGNS and the
--      valuation trigger), so a lot balance is derived, never stored.
--   3. inventory_documents + inventory_document_lines - material issue, return and adjustment as first-class
--      documents. Each posted line references the stock_movements row it created (UNIQUE), and the movement
--      ledger stays the single source of truth for quantity and cost.
--   4. grants: inventory approve/void (adjustment posting, document void) and materials create/edit/approve
--      for the roles that own replenishment configuration. No wildcard.
--
-- Untouched: the per-(warehouse, material) advisory lock, the weighted-average valuation trigger, the
-- movement immutability trigger and every existing movement row (lot_id is NULL for all of them).
--
-- PREFLIGHT (stops with counts, changes nothing): every item_master.unit_conversions entry must carry a
-- from_unit, a to_unit and a positive factor (an empty {} counts as none), and one item must not declare the same pair twice with
-- different factors. Report query for a restored copy:
--   SELECT i.id, i.code, e FROM item_master i, jsonb_array_elements(i.unit_conversions) e
--    WHERE jsonb_typeof(i.unit_conversions) = 'array'
--      AND (NULLIF(btrim(e->>'from_unit'), '') IS NULL OR NULLIF(btrim(e->>'to_unit'), '') IS NULL
--           OR COALESCE((e->>'factor')::numeric, 0) <= 0 OR lower(e->>'from_unit') = lower(e->>'to_unit'));

DO $$
DECLARE
  bad BIGINT;
  clash BIGINT;
  notarray BIGINT;
BEGIN
  SELECT count(*) INTO notarray FROM item_master
   WHERE unit_conversions IS NOT NULL AND jsonb_typeof(unit_conversions) <> 'array'
     AND unit_conversions <> '{}'::jsonb;   -- an empty object is how some seeds spell "none"
  IF notarray > 0 THEN
    RAISE EXCEPTION '5.3 preflight UNSAFE: % item(s) have an item_master.unit_conversions that is not a JSON array - nothing changed', notarray;
  END IF;

  SELECT count(*) INTO bad
    FROM item_master i, jsonb_array_elements((CASE WHEN jsonb_typeof(i.unit_conversions) = 'array' THEN i.unit_conversions ELSE '[]'::jsonb END)) e
   WHERE NULLIF(btrim(e->>'from_unit'), '') IS NULL OR NULLIF(btrim(e->>'to_unit'), '') IS NULL
      OR (e->>'factor') IS NULL OR (e->>'factor') !~ '^[0-9]*\.?[0-9]+$' OR (e->>'factor')::numeric <= 0
      OR lower(e->>'from_unit') = lower(e->>'to_unit');
  IF bad > 0 THEN
    RAISE EXCEPTION '5.3 preflight UNSAFE: % unit conversion entr(ies) in item_master.unit_conversions are incomplete, non-positive or map a unit to itself - fix them (report query in this file''s header), nothing changed', bad;
  END IF;

  SELECT count(*) INTO clash FROM (
    SELECT i.id, e->>'from_unit' AS f, e->>'to_unit' AS t
      FROM item_master i, jsonb_array_elements((CASE WHEN jsonb_typeof(i.unit_conversions) = 'array' THEN i.unit_conversions ELSE '[]'::jsonb END)) e
     GROUP BY 1, 2, 3 HAVING count(DISTINCT (e->>'factor')::numeric) > 1) c;
  IF clash > 0 THEN
    RAISE EXCEPTION '5.3 preflight UNSAFE: % item/unit pair(s) declare the same conversion twice with different factors - nothing changed', clash;
  END IF;
END $$;

-- 1. Unit conversions --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unit_conversions (
  id SERIAL PRIMARY KEY,
  material_id INTEGER REFERENCES item_master(id) ON DELETE CASCADE,   -- NULL = company-wide
  from_unit VARCHAR(50) NOT NULL,
  to_unit VARCHAR(50) NOT NULL,
  factor NUMERIC(18,6) NOT NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unit_conversions_factor_positive CHECK (factor > 0),
  CONSTRAINT unit_conversions_distinct_units CHECK (lower(from_unit) <> lower(to_unit))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_unit_conversions_pair ON unit_conversions (COALESCE(material_id, 0), from_unit, to_unit);

INSERT INTO unit_conversions (material_id, from_unit, to_unit, factor, notes)
SELECT DISTINCT ON (i.id, e->>'from_unit', e->>'to_unit')
       i.id, btrim(e->>'from_unit'), btrim(e->>'to_unit'), (e->>'factor')::numeric, 'backfilled from item_master.unit_conversions'
  FROM item_master i, jsonb_array_elements((CASE WHEN jsonb_typeof(i.unit_conversions) = 'array' THEN i.unit_conversions ELSE '[]'::jsonb END)) e
ON CONFLICT DO NOTHING;

-- 2. Lots --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_lots (
  id SERIAL PRIMARY KEY,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  material_id INTEGER NOT NULL REFERENCES item_master(id) ON DELETE RESTRICT,
  lot_number VARCHAR(100) NOT NULL,
  batch_number VARCHAR(100),
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  manufactured_date DATE,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT stock_lots_status_check CHECK (status IN ('active', 'expired', 'blocked')),
  CONSTRAINT stock_lots_dates_check CHECK (expiry_date IS NULL OR manufactured_date IS NULL OR expiry_date >= manufactured_date),
  CONSTRAINT uq_stock_lots_number UNIQUE (warehouse_id, material_id, lot_number),
  CONSTRAINT uq_stock_lots_scope UNIQUE (id, warehouse_id, material_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_lots_material ON stock_lots (material_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_lots_expiry ON stock_lots (expiry_date) WHERE expiry_date IS NOT NULL;

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS lot_id INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_lot_scope_fk') THEN
    -- MATCH SIMPLE: a NULL lot_id is not checked; a lot must belong to the movement's own warehouse and material.
    ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_lot_scope_fk
      FOREIGN KEY (lot_id, warehouse_id, material_id) REFERENCES stock_lots (id, warehouse_id, material_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_stock_movements_lot ON stock_movements (lot_id) WHERE lot_id IS NOT NULL;

ALTER TABLE delivery_lines ADD COLUMN IF NOT EXISTS lot_id INTEGER REFERENCES stock_lots(id) ON DELETE RESTRICT;

-- Lot balance = the lot's ledger rows, with the engine's signs (PHYSICAL_SIGNS / QUARANTINE_SIGNS).
CREATE OR REPLACE VIEW stock_lot_balances AS
SELECT l.id AS lot_id, l.warehouse_id, l.material_id, l.lot_number, l.batch_number, l.supplier_id,
       l.manufactured_date, l.received_date, l.expiry_date, l.status,
       COALESCE(SUM(CASE m.movement_type
         WHEN 'opening' THEN m.quantity WHEN 'grn' THEN m.quantity WHEN 'quarantine' THEN m.quantity
         WHEN 'return' THEN m.quantity WHEN 'transfer_in' THEN m.quantity WHEN 'adjustment' THEN m.quantity
         WHEN 'reversal' THEN m.quantity
         WHEN 'issue' THEN -m.quantity WHEN 'transfer_out' THEN -m.quantity WHEN 'waste' THEN -m.quantity
         WHEN 'damage' THEN -m.quantity WHEN 'supplier_return' THEN -m.quantity WHEN 'quarantine_reject' THEN -m.quantity
         ELSE 0 END), 0)::numeric(15,3) AS physical,
       COALESCE(SUM(CASE m.movement_type
         WHEN 'quarantine' THEN m.quantity WHEN 'quarantine_restore' THEN m.quantity
         WHEN 'quarantine_release' THEN -m.quantity WHEN 'quarantine_reject' THEN -m.quantity
         ELSE 0 END), 0)::numeric(15,3) AS quarantined
  FROM stock_lots l
  LEFT JOIN stock_movements m ON m.lot_id = l.id
 GROUP BY l.id;

-- 3. First-class stock documents ---------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_documents (
  id SERIAL PRIMARY KEY,
  doc_type VARCHAR(20) NOT NULL,
  doc_number VARCHAR(50) NOT NULL UNIQUE,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  project_id INTEGER REFERENCES projects(id) ON DELETE RESTRICT,
  reason TEXT,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_by INTEGER REFERENCES users(id),
  posted_by INTEGER REFERENCES users(id),
  posted_at TIMESTAMPTZ,
  voided_by INTEGER REFERENCES users(id),
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT inventory_documents_type_check CHECK (doc_type IN ('issue', 'return', 'adjustment')),
  CONSTRAINT inventory_documents_status_check CHECK (status IN ('draft', 'posted', 'void')),
  CONSTRAINT inventory_documents_adjustment_reason CHECK (doc_type <> 'adjustment' OR NULLIF(btrim(COALESCE(reason, '')), '') IS NOT NULL),
  CONSTRAINT inventory_documents_void_reason CHECK (status <> 'void' OR NULLIF(btrim(COALESCE(void_reason, '')), '') IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_inventory_documents_warehouse ON inventory_documents (warehouse_id, doc_type, status);
CREATE INDEX IF NOT EXISTS idx_inventory_documents_project ON inventory_documents (project_id);

CREATE TABLE IF NOT EXISTS inventory_document_lines (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES inventory_documents(id) ON DELETE RESTRICT,
  material_id INTEGER NOT NULL REFERENCES item_master(id) ON DELETE RESTRICT,
  lot_id INTEGER REFERENCES stock_lots(id) ON DELETE RESTRICT,
  quantity NUMERIC(15,3) NOT NULL,                     -- positive for issue/return, signed for adjustment
  unit_cost NUMERIC(18,4),
  issue_line_id INTEGER REFERENCES inventory_document_lines(id) ON DELETE RESTRICT,   -- a return points at the issue line it undoes
  movement_id INTEGER UNIQUE REFERENCES stock_movements(id) ON DELETE RESTRICT,
  notes TEXT,
  CONSTRAINT inventory_document_lines_nonzero CHECK (quantity <> 0)
);
CREATE INDEX IF NOT EXISTS idx_inventory_document_lines_document ON inventory_document_lines (document_id);
CREATE INDEX IF NOT EXISTS idx_inventory_document_lines_issue ON inventory_document_lines (issue_line_id) WHERE issue_line_id IS NOT NULL;

-- 4. Grants ------------------------------------------------------------------------
CREATE TEMP TABLE _5_3_grants (role_key text, module text, action text) ON COMMIT DROP;
INSERT INTO _5_3_grants VALUES
  ('construction_manager', 'inventory', 'approve'), ('construction_manager', 'inventory', 'void'),
  ('procurement_manager',  'inventory', 'approve'), ('procurement_manager',  'inventory', 'void'),
  ('coo',                  'inventory', 'approve'), ('coo',                  'inventory', 'void'),
  ('owner_ceo',            'inventory', 'approve'), ('owner_ceo',            'inventory', 'void'),
  ('procurement_manager',  'materials', 'create'),  ('procurement_manager',  'materials', 'edit'),
  ('procurement_manager',  'materials', 'approve'),
  ('procurement_officer',  'materials', 'view'),
  ('storekeeper',          'materials', 'view'),
  ('owner_ceo',            'materials', 'create'),  ('owner_ceo',            'materials', 'edit'),
  ('owner_ceo',            'materials', 'approve'),
  ('coo',                  'materials', 'create'),  ('coo',                  'materials', 'edit'),
  ('coo',                  'materials', 'approve');

INSERT INTO permissions (module, action)
SELECT DISTINCT module, action FROM _5_3_grants ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM (SELECT DISTINCT role_key, module, action FROM _5_3_grants) g
  JOIN roles r ON r.key = g.role_key
  JOIN permissions p ON p.module = g.module AND p.action = g.action
ON CONFLICT DO NOTHING;
