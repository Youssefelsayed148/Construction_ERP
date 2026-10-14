-- Explicit activity-level budget at completion for financial earned value.
-- Historical baselines remain quantity-weighted until a new baseline captures BAC.
ALTER TABLE schedule_activities
  ADD COLUMN IF NOT EXISTS budgeted_cost NUMERIC(15,2)
  CHECK (budgeted_cost IS NULL OR budgeted_cost >= 0);
