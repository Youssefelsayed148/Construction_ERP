-- Phase 5.4 Procurement (spec 08).
--
--   1. rfq_award_recommendations - the award of an RFQ as a real entity with its own approval (workflow
--      template 'rfq_award', seeded by the workflow catalog): who recommends which compliant quotation, on
--      what basis, with a justification, whether it departs from the bid comparison, and the decision.
--      At most ONE live (draft, submitted or approved) recommendation per RFQ (partial unique index).
--   2. cancel columns on purchase_requests and purchase_orders: a cancellation is a status plus who, when
--      and why. Nothing is deleted.
--   3. grants: procurement approve/void/submit for the roles that run procurement (no wildcard).
--
-- Additive only. Existing awards (rfqs.awarded_quotation_id) are backfilled as APPROVED recommendations with
-- basis 'direct_award' so that every award in the database has a recommendation record; the preflight stops
-- if an awarded RFQ points at a quotation that is not on that RFQ (nothing is guessed).
--   SELECT r.id FROM rfqs r LEFT JOIN supplier_quotations q ON q.id = r.awarded_quotation_id AND q.rfq_id = r.id
--    WHERE r.awarded_quotation_id IS NOT NULL AND q.id IS NULL;

DO $$
DECLARE
  broken BIGINT;
BEGIN
  SELECT count(*) INTO broken
    FROM rfqs r LEFT JOIN supplier_quotations q ON q.id = r.awarded_quotation_id AND q.rfq_id = r.id
   WHERE r.awarded_quotation_id IS NOT NULL AND q.id IS NULL;
  IF broken > 0 THEN
    RAISE EXCEPTION '5.4 preflight UNSAFE: % awarded RFQ(s) point at a quotation that is not on that RFQ - nothing changed', broken;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS rfq_award_recommendations (
  id SERIAL PRIMARY KEY,
  recommendation_number VARCHAR(50) NOT NULL UNIQUE,
  rfq_id INTEGER NOT NULL REFERENCES rfqs(id) ON DELETE RESTRICT,
  quotation_id INTEGER NOT NULL REFERENCES supplier_quotations(id) ON DELETE RESTRICT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  total_price NUMERIC(15,2) NOT NULL,
  basis VARCHAR(30) NOT NULL,
  justification TEXT NOT NULL,
  deviates_from_comparison BOOLEAN NOT NULL DEFAULT false,
  comparison_snapshot JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  workflow_instance_id INTEGER,
  created_by INTEGER REFERENCES users(id),
  submitted_by INTEGER REFERENCES users(id),
  submitted_at TIMESTAMPTZ,
  decided_by INTEGER REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  decision_comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT rfq_award_basis_check CHECK (basis IN ('comparison', 'lowest_price', 'best_value', 'technical', 'single_source', 'direct_award', 'other')),
  CONSTRAINT rfq_award_status_check CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'withdrawn')),
  CONSTRAINT rfq_award_justification_check CHECK (btrim(justification) <> ''),
  CONSTRAINT rfq_award_total_nonneg CHECK (total_price >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rfq_award_live ON rfq_award_recommendations (rfq_id) WHERE status IN ('draft', 'submitted', 'approved');
CREATE INDEX IF NOT EXISTS idx_rfq_award_rfq ON rfq_award_recommendations (rfq_id);

-- Awards that already exist become approved recommendations of basis 'direct_award'.
INSERT INTO rfq_award_recommendations
  (recommendation_number, rfq_id, quotation_id, supplier_id, total_price, basis, justification, status, decided_at, comparison_snapshot)
SELECT 'AWR-LEGACY-' || r.id, r.id, q.id, q.supplier_id, COALESCE(q.total_price, 0), 'direct_award',
       'Awarded before award recommendations existed (backfilled by migration 0035)', 'approved', COALESCE(r.updated_at, NOW()), NULL
  FROM rfqs r JOIN supplier_quotations q ON q.id = r.awarded_quotation_id AND q.rfq_id = r.id
 WHERE r.awarded_quotation_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS cancelled_by INTEGER REFERENCES users(id);
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cancelled_by INTEGER REFERENCES users(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE TEMP TABLE _5_4_grants (role_key text, module text, action text) ON COMMIT DROP;
INSERT INTO _5_4_grants VALUES
  ('procurement_manager', 'procurement', 'approve'), ('procurement_manager', 'procurement', 'void'),
  ('procurement_manager', 'procurement', 'submit'),
  ('owner_ceo', 'procurement', 'approve'), ('owner_ceo', 'procurement', 'void'), ('owner_ceo', 'procurement', 'submit'),
  ('coo', 'procurement', 'approve'), ('coo', 'procurement', 'void'), ('coo', 'procurement', 'submit');

INSERT INTO permissions (module, action) SELECT DISTINCT module, action FROM _5_4_grants ON CONFLICT (module, action) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM (SELECT DISTINCT role_key, module, action FROM _5_4_grants) g
  JOIN roles r ON r.key = g.role_key
  JOIN permissions p ON p.module = g.module AND p.action = g.action
ON CONFLICT DO NOTHING;

-- The workflow template for award recommendations. The catalog in scripts/workflow-engine-migration.js carries
-- it for fresh installs; this statement makes an upgraded database get it too (the catalog script only re-runs
-- when ITS file changes, so a new catalog entry alone never reaches an existing database).
INSERT INTO workflow_templates (key, name, entity_type_scope, is_active)
VALUES ('rfq_award', 'RFQ Award Recommendation', '*', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO workflow_steps (template_id, step_key, name, sort_order, mode, resolver_type, resolver_value, is_terminal)
SELECT t.id, s.step_key, s.name, s.sort_order, 'sequential', s.resolver_type, s.resolver_value, s.is_terminal
  FROM workflow_templates t
  JOIN (VALUES
    ('draft', 'Draft', 1, 'requester', NULL, false),
    ('procurement_review', 'Procurement Review', 2, 'role', 'purchasing_mgr', false),
    ('authority_approval', 'Authority Approval', 3, 'role', 'owner', true)
  ) AS s(step_key, name, sort_order, resolver_type, resolver_value, is_terminal) ON true
 WHERE t.key = 'rfq_award'
ON CONFLICT (template_id, step_key) DO NOTHING;
