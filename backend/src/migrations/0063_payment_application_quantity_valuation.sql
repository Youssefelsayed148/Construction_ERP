-- Snapshot quantity claims and their contract rates on payment applications.
-- A quantity measurement can be split across applications, but submitted
-- quantities are reserved and certified quantities are permanently consumed.
ALTER TABLE payment_applications
  ADD COLUMN IF NOT EXISTS valuation_basis VARCHAR(20) NOT NULL DEFAULT 'manual';

ALTER TABLE payment_applications
  ADD CONSTRAINT payment_applications_valuation_basis_check
  CHECK (valuation_basis IN ('manual', 'certified_quantity'));

CREATE TABLE IF NOT EXISTS payment_application_quantity_lines (
  id SERIAL PRIMARY KEY,
  payment_application_id INTEGER NOT NULL REFERENCES payment_applications(id) ON DELETE RESTRICT,
  quantity_measurement_id INTEGER NOT NULL REFERENCES quantity_measurements(id) ON DELETE RESTRICT,
  boq_item_id INTEGER NOT NULL REFERENCES boq_items(id) ON DELETE RESTRICT,
  claimed_quantity NUMERIC(15,3) NOT NULL CHECK (claimed_quantity > 0),
  certified_quantity NUMERIC(15,3) CHECK (certified_quantity IS NULL OR certified_quantity >= 0),
  unit_rate NUMERIC(15,2) NOT NULL CHECK (unit_rate >= 0),
  claimed_amount NUMERIC(15,2) NOT NULL CHECK (claimed_amount >= 0),
  certified_amount NUMERIC(15,2) CHECK (certified_amount IS NULL OR certified_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_application_id, quantity_measurement_id),
  CHECK (certified_quantity IS NULL OR certified_quantity <= claimed_quantity),
  CHECK (certified_amount IS NULL OR certified_amount <= claimed_amount)
);

CREATE INDEX IF NOT EXISTS idx_payment_app_quantity_lines_measurement
  ON payment_application_quantity_lines(quantity_measurement_id);

CREATE INDEX IF NOT EXISTS idx_payment_app_quantity_lines_application
  ON payment_application_quantity_lines(payment_application_id);
