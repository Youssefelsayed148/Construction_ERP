-- Phase 5.1 Organization and RBAC closeout slice (spec 03, 04). One additive migration.
--
-- What lands here:
--   1. The missing spec-03/04 organizations tables: company_profiles, departments, job_positions,
--      delegations, org_qualifications, org_bank_accounts, org_performance_scores (+ the expires_at
--      column team assignment needs on user_project_roles). Pure CREATE TABLE IF NOT EXISTS; no existing
--      column of any existing table is touched.
--   2. The FULL plan role set: 24 internal + 9 external canonical roles, seeded as NEW rows next to the
--      legacy ones. Legacy roles (owner, admin, manager, staff, accountant, engineer, site_supervisor,
--      purchasing_mgr, finance_manager, legal_mgr, maintenance_mgr) keep every grant they have today
--      (the 5 existing canonical keys — project_manager, site_engineer, quantity_surveyor, storekeeper,
--      document_controller, finance_manager, viewer — also keep theirs). No ('*','*') wildcard is granted
--      to any NEW canonical internal role; they get real per-module grants from the plan (below).
--   3. user legacy role aliases (compatibility table only): no user is moved here (0032 will), no legacy
--      grant removed.
--
-- Decisions the plan pins (kept as assertions in org-rbac-5-1.pg.test.js):
--   * Quantity Surveyor holds see_internal_cost only once ('quantity_surveyor','*','see_internal_cost')
--     is inserted — it is NOT granted today (decision 8 of the plan).
--   * Commercial Manager and Finance see internal cost (see_internal_cost IS granted).
--
-- Per-module grant maps shipped below (module names = the Express mounts, i.e. the modules
-- policy.moduleFromRequest derives; delivery/MIR/GRN are module "inventory" and site pages are
-- module "site" via policy.MODULE_OVERRIDES — documented in role-matrix.pg.test.js):
--
--   role                    view                                                        create / edit / other
--   ----------------------- ------------------------------------------------------------ -----------------------------
--   owner_ceo               all modules of the catalog                                   create/edit on the business +
--                           (+ notifications/actions) core                               masters, approvals approve/reject,
--                                                                                        finance-ledger money actions,
--                                                                                        reports export, users manage_permissions
--   coo                     same as owner_ceo (blanket admin's replacement surface)       same as owner_ceo
--   projects_director       operational reads (projects, boq, quantities, schedule,       projects create/edit, schedule edit,
--                           site, docs, commercial, procurement, subcontractors ...)      team create/edit
--   construction_manager    site operations + qhse/hse + quantities + materials           site create/edit, qhse create/edit,
--                                                                                        schedule edit, work-orders edit,
--                                                                                        quantities create
--   site_manager            same family as site_engineer, wider                           site/qhse create+edit, quantities
--                                                                                        create, schedule edit
--   planning_engineer       projects, schedule, boq, quantities, procurement, materials    schedule create/edit
--   technical_office_engineer projects, boq, docs, documents, quantities, commercial       boq create/edit, docs create/submit,
--                                                                                        documents create/edit
--   commercial_manager      commercial, costing, invoices, payments, subcontractors,       commercial create/edit/submit/approve,
--                           clients, procurement, finance-ledger (view), boq ...          invoices create/edit,
--                                                                                        subcontractors edit/approve
--   contracts_manager       commercial, procurement, subcontractors, legal, docs,          legal create/edit, subcontractors edit
--                           invoices, clients
--   procurement_manager     procurement, inventory, suppliers, items, materials,           procurement create/edit, suppliers
--                           commercial, subcontractors, invoices                          create/edit, items create/edit
--   procurement_officer     procurement, inventory, suppliers, items, materials            procurement create, suppliers
--                                                                                        create/edit, items view only
--   accountant_ar           clients, invoices, payments, finance, finance-ledger (view),   invoices create/edit, payments create
--                           costing view, reports
--   accountant_ap           suppliers, procurement, items, payments, finance,              payments create, expenses create/edit,
--                           finance-ledger (view), expenses, inventory (view), reports     procurement create (supplier invoices)
--   qa_qc_manager           qhse, hse, projects, site, docs, documents, quantities         qhse create/edit/approve/reject,
--                           (view), reports                                               docs submit
--   hse_manager             hse, qhse, projects, site, schedule, reports                   hse create/edit, qhse create
--   equipment_manager       assets, maintenance, inventory, warehouses, items,             assets create/edit, maintenance
--                           procurement (view), reports                                    create/edit
--   hr_manager              hr, payroll, users, organizations, projects (view),            hr create/edit, payroll create/edit,
--                           delegations (view)                                             users create/edit,
--                                                                                        organizations create/edit
--   business_development    clients, projects, sales, procurement (view),                  clients create/edit, sales create/edit
--                           commercial (view), reports
--
--   External (project-bound mirrors of their legacy aliases; portal caging in middleware/auth.js is
--   unchanged, so the four alias keys behave exactly as before):
--     client_executive / client_reviewer  — projects, docs, qhse, boq view (+ see_client_value lens)
--     pmc_manager                         — supervision reads (projects, boq, locations, quantities, site,
--                                           schedule, docs, documents, qhse, reports)
--     consultant_coordinator              — the consultant alias's exact module/write set
--     consultant_reviewer                 — consultant view + submit, documents view
--     subcontractor_manager               — the subcontractor alias's exact set
--     subcontractor_site_engineer         — portal view/create, documents create
--     supplier_sales                      — the supplier alias's exact set
--     testing_lab                         — qhse view/create, portal view
--
-- Visibility flags (the 'see_*' permissions are granted on '*'):
--   see_internal_cost          → commercial_manager (finance/CFO keeps it through the blanket roles)
--   see_client_value           → projects_director, construction_manager, commercial_manager,
--                                accountant_ar, business_development, client_*, pmc_manager
--   see_subcontract_value      → projects_director, commercial_manager
--   see_supplier_value         → procurement_manager, procurement_officer, accountant_ap, equipment_manager
--   quantity_surveyor: deliberately NOT granted any of the four (slice-1 grants already give it
--   see_client_value + see_subcontract_value; adding ('quantity_surveyor','*','see_internal_cost') is the
--   documented flip switch the plan requires).

-- ===========================================================================
-- PREFLIGHT: stop with counts and change NOTHING if the schema is not safe.
-- ===========================================================================
DO $preflight$
DECLARE
  n_roles_tables     int;
  n_perm_tables      int;
  n_upr_tables       int;
  n_colliding_keys   int;
  n_missing_unique   int;
BEGIN
  SELECT count(*) INTO n_roles_tables FROM information_schema.tables
   WHERE table_schema = current_schema() AND table_name = 'roles';
  SELECT count(*) INTO n_perm_tables FROM information_schema.tables
   WHERE table_schema = current_schema() AND table_name = 'permissions';
  SELECT count(*) INTO n_upr_tables FROM information_schema.tables
   WHERE table_schema = current_schema() AND table_name = 'user_project_roles';
  IF n_roles_tables = 0 OR n_perm_tables = 0 OR n_upr_tables = 0 THEN
    RAISE EXCEPTION '5.1 preflight UNSAFE: roles tables missing (roles=%, permissions=%, user_project_roles=%) — nothing changed',
      n_roles_tables, n_perm_tables, n_upr_tables;
  END IF;

  -- The canonical keys of this slice are new ROWS; if a foreign (not is_system) role already holds one,
  -- the install would collide with user data — stop and report, no changes.
  SELECT count(*) INTO n_colliding_keys
    FROM (VALUES
      ('owner_ceo'),('coo'),('projects_director'),('construction_manager'),('site_manager'),
      ('planning_engineer'),('technical_office_engineer'),('commercial_manager'),('contracts_manager'),
      ('procurement_manager'),('procurement_officer'),('accountant_ar'),('accountant_ap'),
      ('qa_qc_manager'),('hse_manager'),('equipment_manager'),('hr_manager'),('business_development'),
      ('client_executive'),('client_reviewer'),('pmc_manager'),('consultant_coordinator'),
      ('consultant_reviewer'),('subcontractor_manager'),('subcontractor_site_engineer'),
      ('supplier_sales'),('testing_lab')
    ) AS t(key)
    JOIN roles r ON r.key = t.key
   WHERE r.is_system IS NOT TRUE;
  IF n_colliding_keys > 0 THEN
    RAISE EXCEPTION '5.1 preflight UNSAFE: % non-system role(s) already occupy canonical keys above — resolve with the tenant first, nothing changed', n_colliding_keys;
  END IF;

  SELECT count(*) INTO n_missing_unique FROM pg_indexes
   WHERE schemaname = current_schema() AND tablename = 'roles' AND indexname LIKE '%roles_key%';
  IF n_missing_unique = 0 THEN
    RAISE EXCEPTION '5.1 preflight UNSAFE: roles.key has no UNIQUE index — the alias table cannot be built; nothing changed';
  END IF;
  -- Safe: additive only from here.
END
$preflight$;

-- ===========================================================================
-- 1. The spec-03/04 organizations tables (all new; nothing dropped or altered
--    on existing tables except the additive expires_at team column).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS company_profiles (
  id SERIAL PRIMARY KEY,
  legal_name_ar VARCHAR(255) NOT NULL,
  legal_name_en VARCHAR(255),
  cr_no VARCHAR(100),
  tax_id VARCHAR(100),
  address_ar TEXT,
  address_en TEXT,
  fee_schedule JSONB,            -- { fee_code: amount } catalog of company fee settings (spec 03)
  icon_url TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  parent_department_id INTEGER REFERENCES departments(id) ON DELETE RESTRICT,
  head_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_positions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  grade VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delegations (
  id SERIAL PRIMARY KEY,
  delegate_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  delegate_from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  module_scope VARCHAR(100) NOT NULL DEFAULT '*',           -- '*' = all delegated modules; 'approvals' = approvals only
  max_amount NUMERIC(15,2) CHECK (max_amount IS NULL OR max_amount >= 0),  -- NULL = unlimited
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (valid_from <= valid_to),
  CHECK (delegate_user_id <> delegate_from_user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (delegate_user_id, delegate_from_user_id, module_scope)
);

CREATE TABLE IF NOT EXISTS org_qualifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  issuer VARCHAR(255),
  issued_on DATE,
  expires_on DATE,
  CHECK (issued_on IS NULL OR expires_on IS NULL OR expires_on >= issued_on),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_qualifications_user ON org_qualifications (user_id, LOWER(name_ar), LOWER(COALESCE(issuer, 'none')));

CREATE TABLE IF NOT EXISTS org_bank_accounts (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  bank_name VARCHAR(255) NOT NULL,
  iban VARCHAR(60),
  account_no VARCHAR(60),
  currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (COALESCE(iban, account_no) IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_bank_accounts_pair ON org_bank_accounts
  (organization_id, LOWER(bank_name), LOWER(COALESCE(iban, COALESCE(account_no, 'none'))));
-- Exactly one primary bank account per organization.
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_bank_accounts_primary ON org_bank_accounts (organization_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS org_performance_scores (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  period VARCHAR(20) NOT NULL,
  score NUMERIC(6,2) NOT NULL CHECK (score >= 0),
  notes TEXT,
  scored_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, period)
);

-- Team assignment (plan "[ ] Team assignment inherits access: ... expiry ..."): additive column on the
-- existing assignment table; NULL keeps today's behaviour (no expiry).
ALTER TABLE user_project_roles ADD COLUMN IF NOT EXISTS expires_at DATE;

-- ===========================================================================
-- 2. The plan's full role set (24 internal + 9 external). Legacy roles are
--    NOT renamed, deleted or stripped; existing canonical keys keep their rows.
-- ===========================================================================
INSERT INTO roles (key, name, is_system, description) VALUES
  -- internal (24, spec 04)
  ('owner_ceo',                 'Owner/CEO',                              true, 'Company authority: every module, approvals and delegated authority management'),
  ('coo',                       'COO',                                    true, 'Chief operating officer: every module, approvals, operations authority'),
  ('projects_director',         'Projects Director',                      true, 'Portfolio oversight: projects, commercial and procurement reads, team assignment'),
  ('construction_manager',      'Construction Manager',                   true, 'Site operations, quality and safety record-keeping for assigned projects'),
  ('project_manager',           'Project Manager',                        true, 'Project authority (existing role kept; canonical plan role)'),
  ('site_manager',              'Site Manager',                           true, 'Site supervision: reports, instructions, weekly quality and safety'),
  ('site_engineer',             'Site Engineer',                          true, 'Records site work, quantities and quality for assigned projects (existing)'),
  ('planning_engineer',         'Planning Engineer',                      true, 'Schedule build and maintenance, planning data (no site writes)'),
  ('technical_office_engineer', 'Technical Office Engineer',              true, 'BOQ take-offs, drawing/document management and submittal drafting'),
  ('quantity_surveyor',         'Quantity Surveyor',                      true, 'BOQ, quantities, variation drafts and commercial reads (existing)'),
  ('commercial_manager',        'Commercial Manager',                     true, 'Commercial and costing figure work; sees internal cost (plan decision)'),
  ('contracts_manager',         'Contracts Manager',                      true, 'Contracts and legal documents, subcontract edits'),
  ('procurement_manager',       'Procurement Manager',                    true, 'PR→RFQ→PO chain, suppliers and items master'),
  ('procurement_officer',       'Procurement Officer',                    true, 'Requisitions and supplier registration under the procurement manager'),
  ('finance_manager',           'Finance Manager/CFO',                    true, 'Finance authority (existing legacy role, blanket grants untouched)'),
  ('accountant_ar',             'Accountant AR (Receivables)',             true, 'Client invoices and receipts; sees client value'),
  ('accountant_ap',             'Accountant AP (Payables)',                true, 'Supplier payments and expense booking; sees supplier value'),
  ('storekeeper',               'Storekeeper',                            true, 'Receives, issues and transfers stock; no prices (existing)'),
  ('qa_qc_manager',             'QA/QC Manager/Engineer',                 true, 'Quality inspections, WIR/NCR review and sign-off'),
  ('hse_manager',               'HSE Manager/Officer',                    true, 'Safety records, incidents, permits for assigned projects'),
  ('document_controller',       'Document Controller',                    true, 'Registers and submits documents, RFIs, submittals (existing)'),
  ('equipment_manager',         'Equipment/Plant Manager',                true, 'Equipment, plant and maintenance records'),
  ('hr_manager',                'HR Manager',                             true, 'HR, payroll and organisation structure incl. departments'),
  ('business_development',      'Business Development/Tendering',         true, 'Clients, tenders and business development pipeline'),
  -- external (9)
  ('client_executive',          'Client Executive',                       true, 'Client point of contact (alias of the legacy client role)'),
  ('client_reviewer',           'Client Reviewer',                        true, 'Client reviewer over shared project documents'),
  ('pmc_manager',               'PMC/Construction Manager',               true, 'External project-management consultant supervision (read-only)'),
  ('consultant_coordinator',    'Consultant Coordinator',                 true, 'Consultant coordination of RFIs and submittals (alias of consultant)'),
  ('consultant_reviewer',       'Consultant Discipline Reviewer',         true, 'Discipline reviews of shared documents'),
  ('subcontractor_manager',     'Subcontractor Manager',                  true, 'Subcontractor company manager (alias of subcontractor)'),
  ('subcontractor_site_engineer','Subcontractor Site Engineer',           true, 'Subcontractor field engineer submissions'),
  ('supplier_sales',            'Supplier Sales/Operations',              true, 'Supplier portal operations (alias of supplier)'),
  ('testing_lab',               'Testing Lab',                            true, 'Testing lab: records laboratory test results')
ON CONFLICT (key) DO NOTHING;

-- ===========================================================================
-- 3. Permissions + grants for the NEW canonical roles. The permission row set
--    is exactly the granted pairs (a permission row always points at a grant —
--    same rule migration 0006 used; the wildcard ('*','*') rows stay untouched).
-- ===========================================================================

-- internal canonical keys that DO NOT carry a blanket grant and need the util reads
CREATE TEMP TABLE _5_1_internal (role_key text) ON COMMIT DROP;
INSERT INTO _5_1_internal VALUES
  ('owner_ceo'), ('coo'), ('projects_director'), ('construction_manager'), ('site_manager'),
  ('planning_engineer'), ('technical_office_engineer'), ('commercial_manager'), ('contracts_manager'),
  ('procurement_manager'), ('procurement_officer'), ('accountant_ar'), ('accountant_ap'),
  ('qa_qc_manager'), ('hse_manager'), ('equipment_manager'), ('hr_manager'), ('business_development');

CREATE TEMP TABLE _5_1_grants (role_key text, module text, action text) ON COMMIT DROP;

-- shared util reads for the new internal roles: own action items + notification prefs
INSERT INTO _5_1_grants (role_key, module, action)
SELECT role_key, m.module, m.action FROM _5_1_internal
CROSS JOIN (VALUES ('notifications', 'view'), ('notifications', 'edit'), ('actions', 'view'), ('actions', 'create')) m(module, action);

-- ---- owner_ceo (blanket owner's per-module mirror; never a ('*','*')) ----
INSERT INTO _5_1_grants VALUES
  ('owner_ceo','projects','view'), ('owner_ceo','projects','create'), ('owner_ceo','projects','edit'),
  ('owner_ceo','boq','view'), ('owner_ceo','locations','view'), ('owner_ceo','quantities','view'),
  ('owner_ceo','schedule','view'), ('owner_ceo','site','view'), ('owner_ceo','work-orders','view'),
  ('owner_ceo','qhse','view'), ('owner_ceo','hse','view'), ('owner_ceo','docs','view'),
  ('owner_ceo','documents','view'), ('owner_ceo','materials','view'), ('owner_ceo','items','view'),
  ('owner_ceo','suppliers','view'), ('owner_ceo','suppliers','create'), ('owner_ceo','suppliers','edit'),
  ('owner_ceo','clients','view'), ('owner_ceo','clients','create'), ('owner_ceo','clients','edit'),
  ('owner_ceo','expenses','view'),
  ('owner_ceo','invoices','view'), ('owner_ceo','payments','view'),
  ('owner_ceo','finance','view'), ('owner_ceo','finance-ledger','issue_financial_document'),
  ('owner_ceo','finance-ledger','record_payment'),
  ('owner_ceo','assets','view'), ('owner_ceo','maintenance','view'), ('owner_ceo','legal','view'),
  ('owner_ceo','hr','view'), ('owner_ceo','payroll','view'),
  ('owner_ceo','warehouses','view'), ('owner_ceo','inventory','view'),
  ('owner_ceo','subcontractors','view'), ('owner_ceo','subcontractors','edit'), ('owner_ceo','subcontractors','approve'),
  ('owner_ceo','costing','view'), ('owner_ceo','commercial','view'),
  ('owner_ceo','procurement','view'), ('owner_ceo','procurement','create'), ('owner_ceo','procurement','edit'),
  ('owner_ceo','reports','view'), ('owner_ceo','reports','export'),
  ('owner_ceo','dashboard','view'), ('owner_ceo','sales','view'),
  ('owner_ceo','users','view'), ('owner_ceo','users','create'), ('owner_ceo','users','edit'),
  ('owner_ceo','users','manage_permissions'),
  ('owner_ceo','approvals','view'), ('owner_ceo','approvals','approve'), ('owner_ceo','approvals','reject'),
  ('owner_ceo','organizations','view'), ('owner_ceo','organizations','create'), ('owner_ceo','organizations','edit'),
  ('owner_ceo','delegations','view'), ('owner_ceo','delegations','create'), ('owner_ceo','delegations','delete'),
  ('owner_ceo','team','view'), ('owner_ceo','team','create'),
  ('owner_ceo','*','see_internal_cost'), ('owner_ceo','*','see_client_value'),
  ('owner_ceo','*','see_subcontract_value'), ('owner_ceo','*','see_supplier_value');

-- ---- coo (blanket admin's per-module mirror; near-parity with owner_ceo) ----
INSERT INTO _5_1_grants VALUES
  ('coo','projects','view'), ('coo','projects','create'), ('coo','projects','edit'),
  ('coo','boq','view'), ('coo','locations','view'), ('coo','quantities','view'),
  ('coo','schedule','view'), ('coo','site','view'), ('coo','work-orders','view'),
  ('coo','qhse','view'), ('coo','hse','view'), ('coo','docs','view'),
  ('coo','documents','view'), ('coo','materials','view'), ('coo','items','view'),
  ('coo','suppliers','view'), ('coo','suppliers','create'), ('coo','suppliers','edit'),
  ('coo','clients','view'), ('coo','clients','create'), ('coo','clients','edit'),
  ('coo','expenses','view'),
  ('coo','invoices','view'), ('coo','payments','view'),
  ('coo','finance','view'), ('coo','finance-ledger','issue_financial_document'),
  ('coo','finance-ledger','record_payment'),
  ('coo','assets','view'), ('coo','maintenance','view'), ('coo','legal','view'),
  ('coo','hr','view'), ('coo','payroll','view'),
  ('coo','warehouses','view'), ('coo','inventory','view'),
  ('coo','subcontractors','view'), ('coo','subcontractors','edit'), ('coo','subcontractors','approve'),
  ('coo','costing','view'), ('coo','commercial','view'),
  ('coo','procurement','view'), ('coo','procurement','create'), ('coo','procurement','edit'),
  ('coo','reports','view'), ('coo','reports','export'),
  ('coo','dashboard','view'), ('coo','sales','view'),
  ('coo','users','view'), ('coo','users','create'), ('coo','users','edit'),
  ('coo','users','manage_permissions'),
  ('coo','approvals','view'), ('coo','approvals','approve'), ('coo','approvals','reject'),
  ('coo','organizations','view'), ('coo','organizations','create'), ('coo','organizations','edit'),
  ('coo','delegations','view'), ('coo','delegations','create'), ('coo','delegations','delete'),
  ('coo','team','view'), ('coo','team','create'),
  ('coo','*','see_internal_cost'), ('coo','*','see_client_value'),
  ('coo','*','see_subcontract_value'), ('coo','*','see_supplier_value');

-- ---- projects_director ----
INSERT INTO _5_1_grants VALUES
  ('projects_director','projects','view'), ('projects_director','projects','create'), ('projects_director','projects','edit'),
  ('projects_director','boq','view'), ('projects_director','locations','view'),
  ('projects_director','quantities','view'), ('projects_director','schedule','view'),
  ('projects_director','schedule','edit'),
  ('projects_director','site','view'), ('projects_director','work-orders','view'),
  ('projects_director','qhse','view'), ('projects_director','hse','view'),
  ('projects_director','docs','view'), ('projects_director','documents','view'),
  ('projects_director','materials','view'), ('projects_director','items','view'),
  ('projects_director','procurement','view'), ('projects_director','commercial','view'),
  ('projects_director','subcontractors','view'), ('projects_director','costing','view'),
  ('projects_director','reports','view'), ('projects_director','dashboard','view'),
  ('projects_director','clients','view'), ('projects_director','invoices','view'),
  ('projects_director','inventory','view'),
  ('projects_director','approvals','view'),
  ('projects_director','team','view'), ('projects_director','team','create'), ('projects_director','team','edit'),
  ('projects_director','organizations','view'),
  ('projects_director','*','see_client_value'), ('projects_director','*','see_subcontract_value');

-- ---- construction_manager ----
INSERT INTO _5_1_grants VALUES
  ('construction_manager','projects','view'), ('construction_manager','boq','view'),
  ('construction_manager','locations','view'),
  ('construction_manager','quantities','view'), ('construction_manager','quantities','create'),
  ('construction_manager','schedule','view'), ('construction_manager','schedule','edit'),
  ('construction_manager','site','view'), ('construction_manager','site','create'), ('construction_manager','site','edit'),
  ('construction_manager','work-orders','view'), ('construction_manager','work-orders','edit'),
  ('construction_manager','qhse','view'), ('construction_manager','qhse','create'), ('construction_manager','qhse','edit'),
  ('construction_manager','hse','view'), ('construction_manager','hse','create'),
  ('construction_manager','docs','view'), ('construction_manager','documents','view'),
  ('construction_manager','materials','view'), ('construction_manager','items','view'),
  ('construction_manager','warehouses','view'), ('construction_manager','inventory','view'),
  ('construction_manager','subcontractors','view'),
  ('construction_manager','procurement','view'), ('construction_manager','procurement','create'),
  ('construction_manager','reports','view'), ('construction_manager','dashboard','view'),
  ('construction_manager','*','see_client_value'), ('construction_manager','*','see_subcontract_value');

-- ---- site_manager ----
INSERT INTO _5_1_grants VALUES
  ('site_manager','projects','view'), ('site_manager','boq','view'), ('site_manager','locations','view'),
  ('site_manager','quantities','view'), ('site_manager','quantities','create'),
  ('site_manager','schedule','view'), ('site_manager','schedule','edit'),
  ('site_manager','site','view'), ('site_manager','site','create'), ('site_manager','site','edit'),
  ('site_manager','work-orders','view'),
  ('site_manager','qhse','view'), ('site_manager','qhse','create'), ('site_manager','qhse','edit'),
  ('site_manager','hse','view'), ('site_manager','hse','create'), ('site_manager','hse','edit'),
  ('site_manager','docs','view'), ('site_manager','documents','view'),
  ('site_manager','materials','view'), ('site_manager','items','view'),
  ('site_manager','warehouses','view'), ('site_manager','reports','view'), ('site_manager','dashboard','view');

-- ---- planning_engineer ----
INSERT INTO _5_1_grants VALUES
  ('planning_engineer','projects','view'), ('planning_engineer','boq','view'),
  ('planning_engineer','locations','view'), ('planning_engineer','quantities','view'),
  ('planning_engineer','schedule','view'), ('planning_engineer','schedule','create'), ('planning_engineer','schedule','edit'),
  ('planning_engineer','procurement','view'), ('planning_engineer','materials','view'),
  ('planning_engineer','items','view'), ('planning_engineer','reports','view'), ('planning_engineer','dashboard','view');

-- ---- technical_office_engineer ----
INSERT INTO _5_1_grants VALUES
  ('technical_office_engineer','projects','view'), ('technical_office_engineer','boq','view'),
  ('technical_office_engineer','boq','create'), ('technical_office_engineer','boq','edit'),
  ('technical_office_engineer','locations','view'), ('technical_office_engineer','quantities','view'),
  ('technical_office_engineer','docs','view'), ('technical_office_engineer','docs','create'),
  ('technical_office_engineer','docs','edit'), ('technical_office_engineer','docs','submit'),
  ('technical_office_engineer','documents','view'), ('technical_office_engineer','documents','create'),
  ('technical_office_engineer','documents','edit'),
  ('technical_office_engineer','commercial','view'), ('technical_office_engineer','subcontractors','view');

-- ---- commercial_manager (plan decision: sees internal cost) ----
INSERT INTO _5_1_grants VALUES
  ('commercial_manager','projects','view'), ('commercial_manager','boq','view'),
  ('commercial_manager','locations','view'), ('commercial_manager','quantities','view'),
  ('commercial_manager','costing','view'),
  ('commercial_manager','commercial','view'), ('commercial_manager','commercial','create'),
  ('commercial_manager','commercial','edit'), ('commercial_manager','commercial','submit'),
  ('commercial_manager','commercial','approve'),
  ('commercial_manager','subcontractors','view'), ('commercial_manager','subcontractors','edit'),
  ('commercial_manager','subcontractors','approve'), ('commercial_manager','subcontractors','create'),
  ('commercial_manager','invoices','view'), ('commercial_manager','invoices','create'), ('commercial_manager','invoices','edit'),
  ('commercial_manager','payments','view'),
  ('commercial_manager','procurement','view'),
  ('commercial_manager','clients','view'), ('commercial_manager','finance-ledger','view'),
  ('commercial_manager','reports','view'), ('commercial_manager','reports','export'),
  ('commercial_manager','dashboard','view'), ('commercial_manager','sales','view'),
  ('commercial_manager','*','see_internal_cost'), ('commercial_manager','*','see_client_value'),
  ('commercial_manager','*','see_subcontract_value');

-- ---- contracts_manager ----
INSERT INTO _5_1_grants VALUES
  ('contracts_manager','projects','view'), ('contracts_manager','commercial','view'),
  ('contracts_manager','commercial','create'), ('contracts_manager','commercial','edit'),
  ('contracts_manager','subcontractors','view'), ('contracts_manager','subcontractors','edit'),
  ('contracts_manager','legal','view'), ('contracts_manager','legal','create'), ('contracts_manager','legal','edit'),
  ('contracts_manager','procurement','view'), ('contracts_manager','docs','view'),
  ('contracts_manager','documents','view'), ('contracts_manager','materials','view'),
  ('contracts_manager','clients','view'), ('contracts_manager','invoices','view'),
  ('contracts_manager','reports','view'), ('contracts_manager','dashboard','view');

-- ---- procurement_manager ----
INSERT INTO _5_1_grants VALUES
  ('procurement_manager','projects','view'),
  ('procurement_manager','procurement','view'), ('procurement_manager','procurement','create'), ('procurement_manager','procurement','edit'),
  ('procurement_manager','suppliers','view'), ('procurement_manager','suppliers','create'), ('procurement_manager','suppliers','edit'),
  ('procurement_manager','items','view'), ('procurement_manager','items','create'), ('procurement_manager','items','edit'),
  ('procurement_manager','materials','view'), ('procurement_manager','inventory','view'),
  ('procurement_manager','warehouses','view'),
  ('procurement_manager','commercial','view'), ('procurement_manager','subcontractors','view'),
  ('procurement_manager','invoices','view'), ('procurement_manager','documents','view'),
  ('procurement_manager','reports','view'), ('procurement_manager','dashboard','view'),
  ('procurement_manager','*','see_supplier_value');

-- ---- procurement_officer ----
INSERT INTO _5_1_grants VALUES
  ('procurement_officer','procurement','view'), ('procurement_officer','procurement','create'),
  ('procurement_officer','suppliers','view'), ('procurement_officer','suppliers','create'), ('procurement_officer','suppliers','edit'),
  ('procurement_officer','items','view'), ('procurement_officer','materials','view'),
  ('procurement_officer','inventory','view'), ('procurement_officer','warehouses','view'),
  ('procurement_officer','documents','view'), ('procurement_officer','procurement','edit'),
  ('procurement_officer','procurement','submit'),
  ('procurement_officer','*','see_supplier_value');

-- ---- accountant_ar ----
INSERT INTO _5_1_grants VALUES
  ('accountant_ar','clients','view'), ('accountant_ar','clients','edit'),
  ('accountant_ar','invoices','view'), ('accountant_ar','invoices','create'), ('accountant_ar','invoices','edit'),
  ('accountant_ar','payments','view'), ('accountant_ar','payments','create'),
  ('accountant_ar','finance','view'), ('accountant_ar','finance-ledger','view'),
  ('accountant_ar','costing','view'), ('accountant_ar','commercial','view'),
  ('accountant_ar','approvals','view'),
  ('accountant_ar','reports','view'), ('accountant_ar','reports','export'), ('accountant_ar','dashboard','view'),
  ('accountant_ar','*','see_client_value');

-- ---- accountant_ap ----
INSERT INTO _5_1_grants VALUES
  ('accountant_ap','suppliers','view'), ('accountant_ap','procurement','view'), ('accountant_ap','procurement','create'),
  ('accountant_ap','items','view'), ('accountant_ap','materials','view'), ('accountant_ap','inventory','view'),
  ('accountant_ap','payments','view'), ('accountant_ap','payments','create'),
  ('accountant_ap','finance','view'), ('accountant_ap','finance-ledger','record_payment'),
  ('accountant_ap','expenses','view'), ('accountant_ap','expenses','create'), ('accountant_ap','expenses','edit'),
  ('accountant_ap','approvals','view'),
  ('accountant_ap','reports','view'), ('accountant_ap','reports','export'), ('accountant_ap','dashboard','view'),
  ('accountant_ap','*','see_supplier_value');

-- ---- qa_qc_manager ----
INSERT INTO _5_1_grants VALUES
  ('qa_qc_manager','projects','view'), ('qa_qc_manager','site','view'),
  ('qa_qc_manager','qhse','view'), ('qa_qc_manager','qhse','create'), ('qa_qc_manager','qhse','edit'),
  ('qa_qc_manager','qhse','approve'), ('qa_qc_manager','qhse','reject'),
  ('qa_qc_manager','hse','view'), ('qa_qc_manager','hse','create'), ('qa_qc_manager','hse','edit'),
  ('qa_qc_manager','docs','view'), ('qa_qc_manager','docs','submit'),
  ('qa_qc_manager','documents','view'), ('qa_qc_manager','quantities','view'),
  ('qa_qc_manager','work-orders','view'), ('qa_qc_manager','schedule','view'),
  ('qa_qc_manager','reports','view'), ('qa_qc_manager','dashboard','view');

-- ---- hse_manager ----
INSERT INTO _5_1_grants VALUES
  ('hse_manager','projects','view'), ('hse_manager','site','view'), ('hse_manager','schedule','view'),
  ('hse_manager','hse','view'), ('hse_manager','hse','create'), ('hse_manager','hse','edit'),
  ('hse_manager','qhse','view'), ('hse_manager','qhse','create'),
  ('hse_manager','reports','view'), ('hse_manager','dashboard','view');

-- ---- equipment_manager ----
INSERT INTO _5_1_grants VALUES
  ('equipment_manager','projects','view'),
  ('equipment_manager','assets','view'), ('equipment_manager','assets','create'), ('equipment_manager','assets','edit'),
  ('equipment_manager','maintenance','view'), ('equipment_manager','maintenance','create'), ('equipment_manager','maintenance','edit'),
  ('equipment_manager','inventory','view'), ('equipment_manager','warehouses','view'),
  ('equipment_manager','items','view'), ('equipment_manager','procurement','view'),
  ('equipment_manager','materials','view'), ('equipment_manager','handover','view'),
  ('equipment_manager','reports','view'), ('equipment_manager','dashboard','view'),
  ('equipment_manager','*','see_supplier_value');

-- ---- hr_manager ----
INSERT INTO _5_1_grants VALUES
  ('hr_manager','hr','view'), ('hr_manager','hr','create'), ('hr_manager','hr','edit'),
  ('hr_manager','payroll','view'), ('hr_manager','payroll','create'), ('hr_manager','payroll','edit'),
  ('hr_manager','users','view'), ('hr_manager','users','create'), ('hr_manager','users','edit'),
  ('hr_manager','organizations','view'), ('hr_manager','organizations','create'), ('hr_manager','organizations','edit'),
  ('hr_manager','delegations','view'),
  ('hr_manager','projects','view'), ('hr_manager','dashboard','view'), ('hr_manager','reports','view');

-- ---- business_development ----
INSERT INTO _5_1_grants VALUES
  ('business_development','clients','view'), ('business_development','clients','create'), ('business_development','clients','edit'),
  ('business_development','projects','view'), ('business_development','sales','view'),
  ('business_development','sales','create'), ('business_development','sales','edit'),
  ('business_development','procurement','view'), ('business_development','commercial','view'),
  ('business_development','legal','view'), ('business_development','reports','view'),
  ('business_development','dashboard','view'),
  ('business_development','*','see_client_value');

-- ---- external canonical roles: narrow project-bound mirrors of their alias families ----
INSERT INTO _5_1_grants VALUES
  ('client_executive','projects','view'), ('client_executive','docs','view'), ('client_executive','qhse','view'),
  ('client_executive','boq','view'), ('client_executive','*','see_client_value'),
  ('client_reviewer','projects','view'), ('client_reviewer','docs','view'), ('client_reviewer','qhse','view'),
  ('client_reviewer','boq','view'),
  ('pmc_manager','projects','view'), ('pmc_manager','boq','view'), ('pmc_manager','locations','view'),
  ('pmc_manager','quantities','view'), ('pmc_manager','site','view'), ('pmc_manager','schedule','view'),
  ('pmc_manager','docs','view'), ('pmc_manager','documents','view'), ('pmc_manager','qhse','view'),
  ('pmc_manager','reports','view'), ('pmc_manager','*','see_client_value'),
  ('consultant_coordinator','consultant','view'), ('consultant_coordinator','projects','view'),
  ('consultant_coordinator','boq','view'), ('consultant_coordinator','qhse','view'),
  ('consultant_coordinator','docs','view'), ('consultant_coordinator','work-orders','view'),
  ('consultant_coordinator','documents','view'),
  ('consultant_coordinator','consultant','create'), ('consultant_coordinator','consultant','edit'),
  ('consultant_coordinator','consultant','submit'), ('consultant_coordinator','consultant','approve'),
  ('consultant_coordinator','consultant','reject'), ('consultant_coordinator','documents','create'),
  ('consultant_reviewer','consultant','view'), ('consultant_reviewer','consultant','submit'),
  ('consultant_reviewer','projects','view'), ('consultant_reviewer','documents','view'),
  ('subcontractor_manager','portal','view'), ('subcontractor_manager','subcontractors','view'),
  ('subcontractor_manager','portal','create'), ('subcontractor_manager','portal','edit'),
  ('subcontractor_manager','portal','submit'), ('subcontractor_manager','documents','create'),
  ('subcontractor_site_engineer','portal','view'), ('subcontractor_site_engineer','portal','create'),
  ('subcontractor_site_engineer','documents','create'),
  ('supplier_sales','portal','view'), ('supplier_sales','items','view'), ('supplier_sales','warehouses','view'),
  ('supplier_sales','portal','create'), ('supplier_sales','portal','edit'), ('supplier_sales','portal','submit'),
  ('supplier_sales','documents','create'),
  ('testing_lab','qhse','view'), ('testing_lab','qhse','create'), ('testing_lab','portal','view');

INSERT INTO permissions (module, action)
SELECT DISTINCT module, action FROM _5_1_grants
ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM (SELECT DISTINCT role_key, module, action FROM _5_1_grants) g
  JOIN roles r ON r.key = g.role_key
  JOIN permissions p ON p.module = g.module AND p.action = g.action
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ===========================================================================
-- 4. Legacy role → canonical role compatibility aliases (documentation and
--    the map 0032 will use to move users). No user is moved here, no legacy
--    grant is touched. rows are idempotent on the legacy key.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS user_legacy_role_aliases (
  legacy_role_key    VARCHAR(100) PRIMARY KEY,
  canonical_role_key VARCHAR(100) NOT NULL REFERENCES roles(key) ON UPDATE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO user_legacy_role_aliases (legacy_role_key, canonical_role_key, notes) VALUES
  ('owner',           'owner_ceo',          'provisional: identity behaviour preserved until 0032 moves users'),
  ('admin',           'coo',                'provisional'),
  ('manager',         'construction_manager','provisional: generic blanket role, adjust with the tenant'),
  ('staff',           'site_engineer',      'provisional: generic blanket role'),
  ('accountant',      'accountant_ap',      'provisional: legacy accountant was pay-head heavy'),
  ('engineer',        'site_engineer',      'provisional'),
  ('site_supervisor', 'site_manager',       'provisional'),
  ('purchasing_mgr',  'procurement_manager','provisional'),
  ('finance_manager', 'finance_manager',    'identity: the canonical key already exists'),
  ('legal_mgr',       'contracts_manager',  'provisional'),
  ('maintenance_mgr', 'equipment_manager',  'provisional')
ON CONFLICT (legacy_role_key) DO NOTHING;
