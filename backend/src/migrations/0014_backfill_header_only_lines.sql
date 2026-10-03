-- Phase 2.6c: lines are the only place a material, quantity and price live on purchase requests and orders.
--
-- Older documents (and replenishment before this change) kept ONE material in the header columns
-- (material_id, quantity, unit, unit_price) and had no line rows. Code now reads lines only, so each such header
-- gets exactly one line copied from it. Documents that already have lines are not touched, and running this
-- again adds nothing. Header columns are left in place and are no longer read or written (dropping them is a
-- later, separate decision after a restored copy of the real database has been checked).
--
-- Existing rows: none changed or deleted; one line row is ADDED per header-only purchase order or request that has
-- a material and a positive quantity (rows with neither cannot be a line). Preflight counts them.
INSERT INTO purchase_order_lines (purchase_order_id, material_id, quantity, unit, unit_rate, needed_by)
SELECT po.id, po.material_id, po.quantity, po.unit, COALESCE(po.unit_price, 0), po.needed_by
  FROM purchase_orders po
 WHERE po.material_id IS NOT NULL AND po.quantity > 0
   AND NOT EXISTS (SELECT 1 FROM purchase_order_lines l WHERE l.purchase_order_id = po.id);

INSERT INTO purchase_request_lines (purchase_request_id, material_id, quantity, unit, needed_by)
SELECT pr.id, pr.material_id, pr.quantity, pr.unit, pr.needed_by
  FROM purchase_requests pr
 WHERE pr.material_id IS NOT NULL AND pr.quantity > 0
   AND NOT EXISTS (SELECT 1 FROM purchase_request_lines l WHERE l.purchase_request_id = pr.id);

COMMENT ON COLUMN purchase_orders.material_id IS 'Deprecated (2.6c): lines are authoritative. No longer read or written.';
COMMENT ON COLUMN purchase_requests.material_id IS 'Deprecated (2.6c): lines are authoritative. No longer read or written.';
