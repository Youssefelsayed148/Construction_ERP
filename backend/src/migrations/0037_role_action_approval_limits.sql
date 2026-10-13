-- Configurable monetary limits for agent-gated approvals. Limits are scoped to
-- the approver's actual role and exact tool/action. Missing rows deny approval.
CREATE TABLE IF NOT EXISTS role_action_approval_limits (
  id BIGSERIAL PRIMARY KEY,
  role_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  max_amount NUMERIC(18,2) NOT NULL CHECK (max_amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'EGP',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_key, action_key)
);

-- Provisional EGP defaults. Administrators can tune these after finance review.
-- External roles are intentionally absent and therefore fail closed.
INSERT INTO role_action_approval_limits (role_key, action_key, max_amount, currency)
SELECT role_key, action_key, max_amount, 'EGP'
FROM (VALUES
  ('owner', 1000000000::numeric),
  ('admin', 1000000000::numeric),
  ('finance_manager', 1000000::numeric),
  ('accountant_ap', 100000::numeric),
  ('accountant', 100000::numeric)
) AS roles(role_key, max_amount)
CROSS JOIN (VALUES
  ('issue_purchase_order'), ('issue_client_invoice'), ('record_payment'),
  ('approve_payment_certificate'), ('release_retention'), ('void_financial_record'),
  ('approve_supplier_invoice')
) AS actions(action_key)
ON CONFLICT (role_key, action_key) DO NOTHING;
