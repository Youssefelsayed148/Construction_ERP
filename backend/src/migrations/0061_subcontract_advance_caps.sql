-- Preserve subcontracts and add an explicit advance percentage and amount cap.
ALTER TABLE sub_contracts
  ADD COLUMN IF NOT EXISTS advance_percent DECIMAL(5,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_amount DECIMAL(15,2) NOT NULL DEFAULT 0;
