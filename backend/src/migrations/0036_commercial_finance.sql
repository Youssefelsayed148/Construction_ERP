-- Phase 5.5 Commercial and finance (spec 09, 10).
--
-- Additive only. Every money column is NUMERIC(15,2) (FX rates NUMERIC(18,8)); postings go through the ledger
-- mapping table (gl_account_map keys) and are balanced by utils/journal.
--
--   contract parties, guarantees, insurances            who is on a contract and what backs it
--   payment applications                                the claim that precedes a certificate
--   invoice lines                                       the lines of a client invoice
--   currency rates                                      FX rates by date
--   budget versions / lines, forecast versions / lines  versioned budget (approval applies it) and forecasts
--   commitment adjustments                              the history of manual commitment changes
--   credit notes                                        client and supplier, issued through the ledger
--   payment batches (+ items)                           grouped supplier payments with maker/checker
--   variations: cause, responsibility, links, days impact and the submitted/recommended/approved split
--   workflow links for payment certificates and supplier invoices (the seeded workflows start)
--
-- NOT in this migration (waits for the owner's confirmation, see the PR): chart accounts and mapping keys for
-- retention, advance recovery and other deductions.
--
-- Variation backfill: existing rows keep their amount as the SUBMITTED amount; an incorporated variation's
-- amount is also its APPROVED amount, so every figure the commercial engine reads is unchanged.

-- 1. Contract parties, guarantees, insurances ------------------------------------------------------
CREATE TABLE IF NOT EXISTS contract_parties (
  id SERIAL PRIMARY KEY,
  client_contract_id INTEGER REFERENCES client_contracts(id) ON DELETE RESTRICT,
  sub_contract_id INTEGER REFERENCES sub_contracts(id) ON DELETE RESTRICT,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE RESTRICT,
  party_role VARCHAR(30) NOT NULL,
  name_ar VARCHAR(255),
  name_en VARCHAR(255),
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  share_pct NUMERIC(5,2),
  is_signatory BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT contract_parties_one_contract CHECK ((client_contract_id IS NOT NULL) <> (sub_contract_id IS NOT NULL)),
  CONSTRAINT contract_parties_role_check CHECK (party_role IN ('employer', 'contractor', 'engineer', 'subcontractor', 'guarantor', 'insurer', 'supplier', 'other')),
  CONSTRAINT contract_parties_identified CHECK (organization_id IS NOT NULL OR NULLIF(btrim(COALESCE(name_en, name_ar, '')), '') IS NOT NULL),
  CONSTRAINT contract_parties_share_check CHECK (share_pct IS NULL OR (share_pct >= 0 AND share_pct <= 100))
);
CREATE INDEX IF NOT EXISTS idx_contract_parties_client ON contract_parties (client_contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_parties_sub ON contract_parties (sub_contract_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_parties_org_role
  ON contract_parties (COALESCE(client_contract_id, 0), COALESCE(sub_contract_id, 0), organization_id, party_role) WHERE organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS guarantees (
  id SERIAL PRIMARY KEY,
  guarantee_number VARCHAR(50) NOT NULL UNIQUE,
  guarantee_type VARCHAR(30) NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE RESTRICT,
  client_contract_id INTEGER REFERENCES client_contracts(id) ON DELETE RESTRICT,
  sub_contract_id INTEGER REFERENCES sub_contracts(id) ON DELETE RESTRICT,
  issuer_organization_id INTEGER REFERENCES organizations(id) ON DELETE RESTRICT,
  reference VARCHAR(100),
  amount NUMERIC(15,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EGP',
  issued_on DATE,
  expires_on DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  released_on DATE,
  release_reason TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT guarantees_type_check CHECK (guarantee_type IN ('advance_payment', 'performance', 'retention', 'bid', 'maintenance')),
  CONSTRAINT guarantees_status_check CHECK (status IN ('active', 'released', 'expired', 'called')),
  CONSTRAINT guarantees_amount_positive CHECK (amount > 0),
  CONSTRAINT guarantees_dates_check CHECK (issued_on IS NULL OR expires_on >= issued_on),
  CONSTRAINT guarantees_one_contract CHECK (NOT (client_contract_id IS NOT NULL AND sub_contract_id IS NOT NULL)),
  CONSTRAINT guarantees_scoped CHECK (project_id IS NOT NULL OR client_contract_id IS NOT NULL OR sub_contract_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_guarantees_expiry ON guarantees (expires_on) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS insurances (
  id SERIAL PRIMARY KEY,
  insurance_number VARCHAR(50) NOT NULL UNIQUE,
  insurance_type VARCHAR(40) NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE RESTRICT,
  client_contract_id INTEGER REFERENCES client_contracts(id) ON DELETE RESTRICT,
  sub_contract_id INTEGER REFERENCES sub_contracts(id) ON DELETE RESTRICT,
  insurer_organization_id INTEGER REFERENCES organizations(id) ON DELETE RESTRICT,
  policy_number VARCHAR(100) NOT NULL,
  coverage_amount NUMERIC(15,2) NOT NULL,
  premium_amount NUMERIC(15,2),
  currency VARCHAR(3) NOT NULL DEFAULT 'EGP',
  start_date DATE,
  expiry_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT insurances_type_check CHECK (insurance_type IN ('contractors_all_risk', 'third_party_liability', 'workmen_compensation', 'professional_indemnity', 'plant_equipment', 'other')),
  CONSTRAINT insurances_status_check CHECK (status IN ('active', 'expired', 'cancelled')),
  CONSTRAINT insurances_coverage_positive CHECK (coverage_amount > 0),
  CONSTRAINT insurances_premium_nonneg CHECK (premium_amount IS NULL OR premium_amount >= 0),
  CONSTRAINT insurances_dates_check CHECK (start_date IS NULL OR expiry_date >= start_date),
  CONSTRAINT insurances_one_contract CHECK (NOT (client_contract_id IS NOT NULL AND sub_contract_id IS NOT NULL)),
  CONSTRAINT insurances_scoped CHECK (project_id IS NOT NULL OR client_contract_id IS NOT NULL OR sub_contract_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_insurances_expiry ON insurances (expiry_date) WHERE status = 'active';

-- 2. Payment applications --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_applications (
  id SERIAL PRIMARY KEY,
  application_number VARCHAR(50) NOT NULL UNIQUE,
  party_type VARCHAR(20) NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  client_contract_id INTEGER REFERENCES client_contracts(id) ON DELETE RESTRICT,
  sub_contract_id INTEGER REFERENCES sub_contracts(id) ON DELETE RESTRICT,
  period_from DATE,
  period_to DATE,
  claimed_work NUMERIC(15,2) NOT NULL DEFAULT 0,
  claimed_variations NUMERIC(15,2) NOT NULL DEFAULT 0,
  claimed_materials NUMERIC(15,2) NOT NULL DEFAULT 0,
  certified_work NUMERIC(15,2),
  certified_variations NUMERIC(15,2),
  certified_materials NUMERIC(15,2),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  submitted_by INTEGER REFERENCES users(id),
  submitted_at TIMESTAMPTZ,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  certificate_id INTEGER REFERENCES payment_certificates(id) ON DELETE RESTRICT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT payment_applications_party_check CHECK (party_type IN ('client', 'subcontractor')),
  CONSTRAINT payment_applications_status_check CHECK (status IN ('draft', 'submitted', 'certified', 'rejected', 'withdrawn')),
  CONSTRAINT payment_applications_contract_check CHECK (
    (party_type = 'client' AND sub_contract_id IS NULL) OR (party_type = 'subcontractor' AND sub_contract_id IS NOT NULL AND client_contract_id IS NULL)),
  CONSTRAINT payment_applications_amounts_check CHECK (claimed_work >= 0 AND claimed_variations >= 0 AND claimed_materials >= 0
    AND COALESCE(certified_work, 0) >= 0 AND COALESCE(certified_variations, 0) >= 0 AND COALESCE(certified_materials, 0) >= 0),
  CONSTRAINT payment_applications_period_check CHECK (period_from IS NULL OR period_to IS NULL OR period_to >= period_from)
);
CREATE INDEX IF NOT EXISTS idx_payment_applications_project ON payment_applications (project_id, status);

-- 3. Client invoice lines ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_lines (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  line_no INTEGER NOT NULL,
  line_type VARCHAR(20) NOT NULL DEFAULT 'work',
  description VARCHAR(500) NOT NULL,
  boq_item_id INTEGER REFERENCES boq_items(id) ON DELETE RESTRICT,
  cost_code_id INTEGER REFERENCES cost_codes(id) ON DELETE RESTRICT,
  quantity NUMERIC(15,3) NOT NULL DEFAULT 1,
  unit VARCHAR(50),
  unit_rate NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount NUMERIC(15,2) NOT NULL,
  CONSTRAINT invoice_lines_type_check CHECK (line_type IN ('work', 'variation', 'materials', 'retention', 'advance_recovery', 'deduction', 'other')),
  CONSTRAINT uq_invoice_lines_no UNIQUE (invoice_id, line_no)
);

-- 4. Currency rates ----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS currency_rates (
  id SERIAL PRIMARY KEY,
  from_currency VARCHAR(3) NOT NULL,
  to_currency VARCHAR(3) NOT NULL,
  rate NUMERIC(18,8) NOT NULL,
  effective_date DATE NOT NULL,
  source VARCHAR(100),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT currency_rates_rate_positive CHECK (rate > 0),
  CONSTRAINT currency_rates_distinct CHECK (from_currency <> to_currency),
  CONSTRAINT currency_rates_code_check CHECK (from_currency ~ '^[A-Z]{3}$' AND to_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT uq_currency_rates UNIQUE (from_currency, to_currency, effective_date)
);

-- 5. Budget and forecast versions ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget_versions (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  version_no INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  submitted_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT budget_versions_status_check CHECK (status IN ('draft', 'submitted', 'approved', 'superseded', 'rejected')),
  CONSTRAINT uq_budget_versions_no UNIQUE (project_id, version_no)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_versions_one_approved ON budget_versions (project_id) WHERE status = 'approved';

CREATE TABLE IF NOT EXISTS budget_lines (
  id SERIAL PRIMARY KEY,
  budget_version_id INTEGER NOT NULL REFERENCES budget_versions(id) ON DELETE RESTRICT,
  cost_code_id INTEGER REFERENCES cost_codes(id) ON DELETE RESTRICT,
  amount NUMERIC(15,2) NOT NULL,
  notes TEXT,
  CONSTRAINT budget_lines_amount_nonneg CHECK (amount >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_lines_code ON budget_lines (budget_version_id, COALESCE(cost_code_id, 0));

CREATE TABLE IF NOT EXISTS forecast_versions (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  version_no INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  as_of_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT forecast_versions_status_check CHECK (status IN ('draft', 'approved', 'superseded')),
  CONSTRAINT uq_forecast_versions_no UNIQUE (project_id, version_no)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_forecast_versions_one_approved ON forecast_versions (project_id) WHERE status = 'approved';

CREATE TABLE IF NOT EXISTS forecast_lines (
  id SERIAL PRIMARY KEY,
  forecast_version_id INTEGER NOT NULL REFERENCES forecast_versions(id) ON DELETE RESTRICT,
  cost_code_id INTEGER REFERENCES cost_codes(id) ON DELETE RESTRICT,
  forecast_amount NUMERIC(15,2) NOT NULL,
  actual_to_date NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes TEXT,
  CONSTRAINT forecast_lines_amount_nonneg CHECK (forecast_amount >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_forecast_lines_code ON forecast_lines (forecast_version_id, COALESCE(cost_code_id, 0));

-- 6. Commitment adjustments -------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commitment_adjustments (
  id SERIAL PRIMARY KEY,
  commitment_id INTEGER NOT NULL REFERENCES commitments(id) ON DELETE RESTRICT,
  previous_cancelled NUMERIC(15,2) NOT NULL,
  new_cancelled NUMERIC(15,2) NOT NULL,
  reason TEXT NOT NULL,
  adjusted_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT commitment_adjustments_reason CHECK (btrim(reason) <> '')
);

-- 7. Credit notes ----------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_notes (
  id SERIAL PRIMARY KEY,
  credit_note_number VARCHAR(50) NOT NULL UNIQUE,
  party_type VARCHAR(20) NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE RESTRICT,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE RESTRICT,
  supplier_invoice_id INTEGER REFERENCES supplier_invoices(id) ON DELETE RESTRICT,
  amount NUMERIC(15,2) NOT NULL,
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  issued_by INTEGER REFERENCES users(id),
  issued_at TIMESTAMPTZ,
  voided_by INTEGER REFERENCES users(id),
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT credit_notes_party_check CHECK (party_type IN ('client', 'supplier')),
  CONSTRAINT credit_notes_status_check CHECK (status IN ('draft', 'issued', 'void')),
  CONSTRAINT credit_notes_link_check CHECK (
    (party_type = 'client' AND invoice_id IS NOT NULL AND supplier_invoice_id IS NULL)
    OR (party_type = 'supplier' AND supplier_invoice_id IS NOT NULL AND invoice_id IS NULL)),
  CONSTRAINT credit_notes_amount_check CHECK (amount > 0 AND tax_amount >= 0 AND tax_amount <= amount),
  CONSTRAINT credit_notes_reason CHECK (btrim(reason) <> '')
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON credit_notes (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_notes_supplier_invoice ON credit_notes (supplier_invoice_id) WHERE supplier_invoice_id IS NOT NULL;

-- 8. Payment batches (maker / checker) -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_batches (
  id SERIAL PRIMARY KEY,
  batch_number VARCHAR(50) NOT NULL UNIQUE,
  bank_account_id INTEGER REFERENCES org_bank_accounts(id) ON DELETE RESTRICT,
  currency VARCHAR(3) NOT NULL DEFAULT 'EGP',
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  submitted_at TIMESTAMPTZ,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  released_by INTEGER REFERENCES users(id),
  released_at TIMESTAMPTZ,
  cancelled_by INTEGER REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT payment_batches_status_check CHECK (status IN ('draft', 'submitted', 'approved', 'released', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS payment_batch_items (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES payment_batches(id) ON DELETE RESTRICT,
  supplier_invoice_id INTEGER NOT NULL REFERENCES supplier_invoices(id) ON DELETE RESTRICT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  project_id INTEGER REFERENCES projects(id) ON DELETE RESTRICT,
  amount NUMERIC(15,2) NOT NULL,
  payment_id INTEGER REFERENCES payments(id) ON DELETE RESTRICT,
  CONSTRAINT payment_batch_items_amount_positive CHECK (amount > 0),
  CONSTRAINT uq_payment_batch_items UNIQUE (batch_id, supplier_invoice_id)
);

-- 9. Variations: cause, responsibility, links, time impact, and the three amounts ------------------------
ALTER TABLE variations ADD COLUMN IF NOT EXISTS cause VARCHAR(30);
ALTER TABLE variations ADD COLUMN IF NOT EXISTS responsibility VARCHAR(20);
ALTER TABLE variations ADD COLUMN IF NOT EXISTS linked_rfi_id INTEGER REFERENCES project_rfis(id) ON DELETE RESTRICT;
ALTER TABLE variations ADD COLUMN IF NOT EXISTS linked_instruction_id INTEGER REFERENCES engineer_instructions(id) ON DELETE RESTRICT;
ALTER TABLE variations ADD COLUMN IF NOT EXISTS time_impact_days INTEGER;
ALTER TABLE variations ADD COLUMN IF NOT EXISTS submitted_amount NUMERIC(15,2);
ALTER TABLE variations ADD COLUMN IF NOT EXISTS recommended_amount NUMERIC(15,2);
ALTER TABLE variations ADD COLUMN IF NOT EXISTS approved_amount NUMERIC(15,2);
UPDATE variations SET submitted_amount = amount WHERE submitted_amount IS NULL;
UPDATE variations SET approved_amount = amount WHERE approved_amount IS NULL AND status = 'incorporated';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'variations_cause_check') THEN
    ALTER TABLE variations ADD CONSTRAINT variations_cause_check CHECK (cause IS NULL OR cause IN
      ('client_instruction', 'design_change', 'site_condition', 'regulatory', 'omission', 'contractor_request', 'force_majeure', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'variations_responsibility_check') THEN
    ALTER TABLE variations ADD CONSTRAINT variations_responsibility_check CHECK (responsibility IS NULL OR responsibility IN ('client', 'contractor', 'third_party', 'shared'));
  END IF;
END $$;

-- 10. Workflow links for certificates and supplier invoices --------------------------------------------
ALTER TABLE payment_certificates ADD COLUMN IF NOT EXISTS workflow_instance_id INTEGER;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS workflow_instance_id INTEGER;
-- Issued credit notes reduce what is owed on an invoice (invoices.credited_amount already exists for client invoices).
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS credited_amount NUMERIC(15,2) NOT NULL DEFAULT 0;

-- Maker/checker: the person who prepares a payment batch, issues a credit note or submits a budget version is not the
-- one who approves it. ONE configuration line says whether that is enforced (it is, by default); a single-person
-- company can switch it off in business_rules ('finance:maker_checker', {"enforced": false}).
INSERT INTO business_rules (rule_key, rule_value, description)
VALUES ('finance:maker_checker', '{"enforced": true}'::jsonb, 'Maker/checker on payment batches, credit notes and budget versions')
ON CONFLICT (rule_key) DO NOTHING;

-- 11. Grants ---------------------------------------------------------------------------------------------------
CREATE TEMP TABLE _5_5_grants (role_key text, module text, action text) ON COMMIT DROP;
INSERT INTO _5_5_grants VALUES
  ('accountant_ap', 'finance-ledger', 'create'), ('accountant_ap', 'finance-ledger', 'edit'), ('accountant_ap', 'finance-ledger', 'submit'), ('accountant_ap', 'finance-ledger', 'view'),
  ('accountant_ar', 'finance-ledger', 'create'), ('accountant_ar', 'finance-ledger', 'edit'),
  ('coo', 'finance-ledger', 'create'), ('coo', 'finance-ledger', 'edit'), ('coo', 'finance-ledger', 'submit'), ('coo', 'finance-ledger', 'approve'), ('coo', 'finance-ledger', 'void'), ('coo', 'finance-ledger', 'view'),
  ('owner_ceo', 'finance-ledger', 'create'), ('owner_ceo', 'finance-ledger', 'edit'), ('owner_ceo', 'finance-ledger', 'submit'), ('owner_ceo', 'finance-ledger', 'approve'), ('owner_ceo', 'finance-ledger', 'void'), ('owner_ceo', 'finance-ledger', 'view'),
  ('commercial_manager', 'finance-ledger', 'view'), ('contracts_manager', 'commercial', 'submit'),
  ('commercial_manager', 'commercial', 'void'), ('coo', 'commercial', 'create'), ('coo', 'commercial', 'edit'), ('coo', 'commercial', 'approve'),
  ('owner_ceo', 'commercial', 'create'), ('owner_ceo', 'commercial', 'edit'), ('owner_ceo', 'commercial', 'approve');

INSERT INTO permissions (module, action) SELECT DISTINCT module, action FROM _5_5_grants ON CONFLICT (module, action) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM (SELECT DISTINCT role_key, module, action FROM _5_5_grants) g
  JOIN roles r ON r.key = g.role_key
  JOIN permissions p ON p.module = g.module AND p.action = g.action
ON CONFLICT DO NOTHING;
