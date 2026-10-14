-- New forecast versions provide estimate-to-complete inputs. Preserve the prior
-- interpretation for every existing version so approvals are not silently revalued.
ALTER TABLE forecast_versions
  ADD COLUMN IF NOT EXISTS forecast_basis VARCHAR(16) NOT NULL DEFAULT 'eac';

ALTER TABLE forecast_versions
  DROP CONSTRAINT IF EXISTS forecast_versions_basis_check;

ALTER TABLE forecast_versions
  ADD CONSTRAINT forecast_versions_basis_check
  CHECK (forecast_basis IN ('eac', 'etc'));
