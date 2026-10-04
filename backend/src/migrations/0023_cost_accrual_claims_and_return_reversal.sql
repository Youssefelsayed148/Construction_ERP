-- Closeout A2.1: supplier returns reverse their share of the GRN cost (decision 2), and a GRN and a
-- supplier invoice for the same goods accrue them once (decisions 5 and 6).
--
--   1. cost_accrual_claims: when a GRN line or a supplier invoice line for a PO line accrues cost it
--      "claims" its quantity here. The two sources pair off quantity for quantity, so the goods accrue
--      once whichever event comes first (services/costAccrual.js claimLine). UNIQUE per
--      (PO line, source type, source id) makes a replay a no-op.
--   2. The one-posting-per-document journal index is widened to the 'supplier_return_cost' kind (built
--      before the narrower index is dropped, so the guarantee never has a gap). The return's cost row
--      lives in project_costs under UNIQUE (source_type = 'supplier_return', source_id), already
--      guaranteed by 0018.
--
-- Existing rows: nothing is modified or deleted. Claims are backfilled for GRNs that already have a 'grn'
-- cost row (3.1 data), one claim per PO line, fully accrued. Invoice-side claims are not backfilled:
-- before this change an invoice never accrued stocked lines. No preflight stop is needed (purely additive).
-- On a restored copy, confirm the backfill matches the GRN cost rows:
--
--   SELECT count(DISTINCT source_id) AS claimed_grns FROM cost_accrual_claims WHERE source_type = 'grn';
--   SELECT count(*) AS grn_cost_rows FROM project_costs WHERE source_type = 'grn';
CREATE TABLE IF NOT EXISTS cost_accrual_claims (
  id SERIAL PRIMARY KEY,
  purchase_order_line_id INTEGER NOT NULL REFERENCES purchase_order_lines(id) ON DELETE RESTRICT,
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('grn', 'supplier_invoice')),
  source_id INTEGER NOT NULL,
  quantity NUMERIC(15,3) NOT NULL CHECK (quantity > 0),
  accrued_quantity NUMERIC(15,3) NOT NULL CHECK (accrued_quantity >= 0 AND accrued_quantity <= quantity),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_line_id, source_type, source_id)
);

INSERT INTO cost_accrual_claims (purchase_order_line_id, source_type, source_id, quantity, accrued_quantity)
SELECT gl.purchase_order_line_id, 'grn', gl.grn_id, SUM(gl.quantity), SUM(gl.quantity)
  FROM grn_lines gl
  JOIN project_costs pc ON pc.source_type = 'grn' AND pc.source_id = gl.grn_id
 WHERE gl.purchase_order_line_id IS NOT NULL AND gl.material_id IS NOT NULL AND gl.quantity > 0
 GROUP BY gl.purchase_order_line_id, gl.grn_id
ON CONFLICT (purchase_order_line_id, source_type, source_id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_one_posting_per_document_wide2
  ON journal_entries (reference_type, reference_id)
  WHERE reference_type IN ('client_invoice', 'client_invoice_void', 'client_payment', 'client_payment_void',
                           'grn_cost', 'supplier_invoice_cost', 'supplier_invoice_cost_void',
                           'supplier_payment', 'supplier_payment_void', 'supplier_return_cost');
DROP INDEX IF EXISTS uq_journal_entries_one_posting_per_document_wide;
