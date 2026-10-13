-- Preserve the GRN line and stock lot each supplier return removes. Existing rows stay valid;
-- future lot-tracked returns must select their source GRN line in the service layer.
ALTER TABLE supplier_return_lines
  ADD COLUMN IF NOT EXISTS grn_line_id INTEGER REFERENCES grn_lines(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS lot_id INTEGER REFERENCES stock_lots(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_supplier_return_lines_grn_line ON supplier_return_lines (grn_line_id);
CREATE INDEX IF NOT EXISTS idx_supplier_return_lines_lot ON supplier_return_lines (lot_id);
