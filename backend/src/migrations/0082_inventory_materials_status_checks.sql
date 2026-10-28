--
-- G1.2 status-vocabulary closeout, batch 8/9: inventory and material planning.
--
-- Same method and shape as 0075 (procurement batch): every value below was derived from ALL
-- writers of that table's status column (routes, services, workflow engine maps/templates,
-- seeds, fixtures and migrations); workflow-mirrored step keys and filter-only values are
-- called out, and uncertain values are INCLUDED rather than risk blocking a legitimate write
-- (task rule). NOT VALID so existing rows can never block the migration; an operator validates
-- afterwards with backend/scripts/validate-status-constraints.sql (see docs/MIGRATIONS.md).
--
-- Deliberately NOT constrained here: history/audit mirror columns (activity_log.old_status /
-- activity_log.new_status, observation_status_history.from_status) - their vocabulary is the
-- union of every other status by design. agent_action_requests.execution_status and
-- agent_tool_calls.response_status are agent-subsystem telemetry left open this batch.
--
-- Every column in this batch is NULLable with a DEFAULT; no writer writes NULL; each CHECK
-- tolerates NULL explicitly (status IS NULL OR status IN (...)).

-- inventory_transfers: DEFAULT 'draft' (migrate-2.2.js:37); INSERT omits status routes/warehouses.js:247-248; completed UPDATE warehouses.js:279-280
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_transfers_status_check' AND conrelid = 'inventory_transfers'::regclass) THEN
    ALTER TABLE inventory_transfers ADD CONSTRAINT inventory_transfers_status_check
      CHECK (status IS NULL OR status IN ('draft', 'completed'))
      NOT VALID;
  END IF;
END $$;

-- stock_reservations: DEFAULT 'active' (inventory-migration.js:64); INSERT inventoryEngine.js:469-471; released via releaseReservationLocked inventoryEngine.js:484-493 (routes/warehouses.js:402-403)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_reservations_status_check' AND conrelid = 'stock_reservations'::regclass) THEN
    ALTER TABLE stock_reservations ADD CONSTRAINT stock_reservations_status_check
      CHECK (status IS NULL OR status IN ('active', 'released'))
      NOT VALID;
  END IF;
END $$;

-- material_requirements: DEFAULT 'planned' (material-planning-migration.js:114); INSERT materialDemand.js:200-207; identified/pending FILTER-ONLY (schedulingEngine.js:372) - included per the task rule; UPDATE path does not touch status (materialDemand.js:189-193)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_requirements_status_check' AND conrelid = 'material_requirements'::regclass) THEN
    ALTER TABLE material_requirements ADD CONSTRAINT material_requirements_status_check
      CHECK (status IS NULL OR status IN ('planned', 'identified', 'pending'))
      NOT VALID;
  END IF;
END $$;

-- material_inspection_requests: DEFAULT 'pending' (procurement-migration.js:171); INSERT procurementService.js:629-631; decideMir -> accepted/partially_accepted/rejected procurementService.js:675-688; approved FILTER-ONLY (sweep-invariants.js:26) - included
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_inspection_requests_status_check' AND conrelid = 'material_inspection_requests'::regclass) THEN
    ALTER TABLE material_inspection_requests ADD CONSTRAINT material_inspection_requests_status_check
      CHECK (status IS NULL OR status IN ('pending', 'accepted', 'partially_accepted', 'rejected', 'approved'))
      NOT VALID;
  END IF;
END $$;

-- replenishment_alerts: DEFAULT 'open' (replenishment-migration.js:80); INSERT replenishment.js:440; resolved UPDATE replenishment.js:482
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'replenishment_alerts_status_check' AND conrelid = 'replenishment_alerts'::regclass) THEN
    ALTER TABLE replenishment_alerts ADD CONSTRAINT replenishment_alerts_status_check
      CHECK (status IS NULL OR status IN ('open', 'resolved'))
      NOT VALID;
  END IF;
END $$;
