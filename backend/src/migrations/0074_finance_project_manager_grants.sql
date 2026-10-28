-- Phase 5.1 closeout (Session G, G1.1) — retire the blanket ('*','*') grant on the two canonical
-- roles that still have one: finance_manager and project_manager. Every other canonical role from
-- migration 0031 already has explicit per-module/action grants; these two were left on the blanket
-- because they pre-existed 0031 as "already canonical" keys (see that migration's header comment:
-- "the 5 existing canonical keys ... also keep theirs"). docs/CLOSEOUT_RECONCILIATION.md (Phase 5.1)
-- and docs/LAUNCH_READINESS.md (open Major #2) record this as the last two un-granular canonical roles.
--
-- Owner/admin and the 10 other legacy blanket roles (accountant, engineer, legal_mgr,
-- maintenance_mgr, manager, purchasing_mgr, site_supervisor, staff) are untouched — they are not
-- canonical roles and are out of scope for this slice.
--
-- Method: (1) insert explicit grants for every module the role should keep reaching, modeled on the
-- closest sibling canonical roles already graduated in 0031 (finance_manager ~ accountant_ar +
-- accountant_ap combined, since it is their manager and oversees both AR and AP, plus the
-- approvals/payroll authority workflowEngine.js's MODULE_MANAGER_ROLES already assumes it has;
-- project_manager ~ projects_director + construction_manager combined, since it is the single
-- project-level owner of the whole lifecycle, plus the commercial/subcontractor write authority
-- workflowEngine.js already assumes for 'project_budgets'/'sub_contracts' manager-review and the
-- variation.approved notification route already assumes); (2) a DO-block safety assertion that
-- every module in the live catalog is either explicitly granted (at least 'view', so the role is
-- never silently locked out of a page it could reach today) or named in an EXCLUDED list with a
-- reason; only if that assertion passes does the blanket row get deleted. If it fails, the whole
-- migration aborts (RAISE EXCEPTION) and the blanket stays in place untouched.
--
-- The three existing '*'-scoped visibility-flag rows each role already holds
-- (see_client_value/see_internal_cost/see_subcontract_value) are separate rows from the blanket
-- ('*','*') row and are NOT touched by this migration.

DO $preflight$
DECLARE
  n_fm_blanket int;
  n_pm_blanket int;
BEGIN
  SELECT count(*) INTO n_fm_blanket FROM roles r JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id WHERE r.key = 'finance_manager' AND p.module = '*' AND p.action = '*';
  SELECT count(*) INTO n_pm_blanket FROM roles r JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id WHERE r.key = 'project_manager' AND p.module = '*' AND p.action = '*';
  IF n_fm_blanket = 0 AND n_pm_blanket = 0 THEN
    RAISE NOTICE '0074: neither role holds a (*,*) blanket row any more — migration already applied, nothing to do';
  END IF;
END
$preflight$;

CREATE TEMP TABLE _0074_grants (role_key text, module text, action text) ON COMMIT DROP;

-- ---- finance_manager ----
-- Modeled on accountant_ar + accountant_ap (the two roles it manages) plus the approvals/payroll
-- authority already assumed by services/workflowEngine.js's MODULE_MANAGER_ROLES (expenses, payroll)
-- and services/policy.js's ACTION_OVERRIDES (approvals PUT /:id/approve|reject).
INSERT INTO _0074_grants VALUES
  ('finance_manager','dashboard','view'),
  ('finance_manager','actions','view'), ('finance_manager','actions','create'),
  ('finance_manager','approvals','view'), ('finance_manager','approvals','approve'), ('finance_manager','approvals','reject'),
  ('finance_manager','clients','view'), ('finance_manager','clients','create'), ('finance_manager','clients','edit'),
  ('finance_manager','suppliers','view'), ('finance_manager','suppliers','create'), ('finance_manager','suppliers','edit'),
  ('finance_manager','invoices','view'), ('finance_manager','invoices','create'), ('finance_manager','invoices','edit'),
  ('finance_manager','payments','view'), ('finance_manager','payments','create'),
  ('finance_manager','finance','view'),
  ('finance_manager','finance-ledger','view'), ('finance_manager','finance-ledger','create'), ('finance_manager','finance-ledger','edit'),
  ('finance_manager','finance-ledger','submit'), ('finance_manager','finance-ledger','approve'),
  ('finance_manager','finance-ledger','record_payment'), ('finance_manager','finance-ledger','issue_financial_document'),
  ('finance_manager','finance-ledger','void'),
  ('finance_manager','expenses','view'), ('finance_manager','expenses','create'), ('finance_manager','expenses','edit'),
  ('finance_manager','payroll','view'), ('finance_manager','payroll','create'), ('finance_manager','payroll','edit'),
  ('finance_manager','hr','view'),
  ('finance_manager','commercial','view'),
  ('finance_manager','costing','view'),
  ('finance_manager','subcontractors','view'),
  ('finance_manager','procurement','view'), ('finance_manager','procurement','create'),
  ('finance_manager','inventory','view'),
  ('finance_manager','items','view'),
  ('finance_manager','materials','view'),
  ('finance_manager','warehouses','view'),
  ('finance_manager','reports','view'), ('finance_manager','reports','export'),
  ('finance_manager','notifications','view'), ('finance_manager','notifications','edit'),
  ('finance_manager','locations','view'),
  ('finance_manager','documents','view'),
  ('finance_manager','docs','view'),
  ('finance_manager','boq','view'),
  ('finance_manager','projects','view'),
  ('finance_manager','team','view'),
  ('finance_manager','organizations','view'),
  ('finance_manager','quantities','view'),
  ('finance_manager','site','view'),
  ('finance_manager','schedule','view'),
  ('finance_manager','qhse','view'),
  ('finance_manager','hse','view'),
  ('finance_manager','work-orders','view'),
  ('finance_manager','handover','view'),
  ('finance_manager','sales','view'),
  ('finance_manager','*','see_supplier_value');
-- EXCLUDED for finance_manager (no grant at all — out of scope for a finance role; listed here so the
-- safety assertion below treats them as a deliberate decision, not an oversight):
--   users         — user administration is owner/admin/hr_manager's job, not finance's.
--   delegations   — delegation-of-authority administration is owner/admin's job.
--   legal         — contracts_manager/legal_mgr's domain.
--   portal, client-portal, consultant — external-portal surfaces; finance_manager is an internal role.
--   assets, maintenance — equipment_manager's domain.

-- ---- project_manager ----
-- Modeled on projects_director + construction_manager combined (project_manager is the single
-- project-level owner across both the director's oversight scope and the construction manager's
-- hands-on site/commercial authority), plus the commercial/subcontractor approve authority already
-- assumed by workflowEngine.js's MODULE_MANAGER_ROLES ('project_budgets','sub_contracts') and the
-- variation.approved notification route (services/eventDispatcher.js NOTIFY_RULES).
INSERT INTO _0074_grants VALUES
  ('project_manager','dashboard','view'),
  ('project_manager','actions','view'), ('project_manager','actions','create'),
  ('project_manager','approvals','view'), ('project_manager','approvals','approve'), ('project_manager','approvals','reject'),
  ('project_manager','projects','view'), ('project_manager','projects','create'), ('project_manager','projects','edit'),
  ('project_manager','boq','view'),
  ('project_manager','locations','view'),
  ('project_manager','quantities','view'), ('project_manager','quantities','create'),
  ('project_manager','schedule','view'), ('project_manager','schedule','edit'),
  ('project_manager','site','view'), ('project_manager','site','create'), ('project_manager','site','edit'),
  ('project_manager','work-orders','view'), ('project_manager','work-orders','edit'),
  ('project_manager','qhse','view'), ('project_manager','qhse','create'), ('project_manager','qhse','edit'),
  ('project_manager','hse','view'), ('project_manager','hse','create'), ('project_manager','hse','edit'),
  ('project_manager','docs','view'), ('project_manager','docs','create'), ('project_manager','docs','edit'), ('project_manager','docs','submit'),
  ('project_manager','documents','view'), ('project_manager','documents','create'), ('project_manager','documents','edit'),
  ('project_manager','materials','view'),
  ('project_manager','items','view'),
  ('project_manager','warehouses','view'),
  ('project_manager','inventory','view'), ('project_manager','inventory','approve'), ('project_manager','inventory','void'),
  ('project_manager','procurement','view'), ('project_manager','procurement','create'), ('project_manager','procurement','approve'),
  ('project_manager','commercial','view'), ('project_manager','commercial','create'), ('project_manager','commercial','edit'),
  ('project_manager','commercial','submit'), ('project_manager','commercial','approve'),
  ('project_manager','subcontractors','view'), ('project_manager','subcontractors','create'), ('project_manager','subcontractors','edit'),
  ('project_manager','subcontractors','approve'),
  ('project_manager','costing','view'),
  ('project_manager','clients','view'),
  ('project_manager','invoices','view'),
  ('project_manager','handover','view'),
  ('project_manager','team','view'), ('project_manager','team','create'), ('project_manager','team','edit'),
  ('project_manager','reports','view'),
  ('project_manager','notifications','view'), ('project_manager','notifications','edit'),
  ('project_manager','suppliers','view'),
  ('project_manager','organizations','view'),
  ('project_manager','sales','view');
-- EXCLUDED for project_manager (no grant at all — deliberate; a project_manager runs the project's
-- operations, not the company's back office):
--   users, delegations — owner/admin's job.
--   hr, payroll        — hr_manager's job (labour COST still reaches project_manager's commercial
--                         view via labor_payments.total_amount feeding the commercial engine, per the
--                         locked decision — that is a read inside the commercial figures, not a grant
--                         on the hr/payroll modules themselves).
--   legal              — contracts_manager/legal_mgr's domain.
--   portal, client-portal, consultant — external-portal surfaces.
--   assets, maintenance — equipment_manager's domain.
--   finance, finance-ledger, expenses, payments — AR/AP posting is finance_manager/accountant_*'s
--                         job; project_manager sees money through commercial/costing (already
--                         granted 'view'), not by posting ledger entries directly.

INSERT INTO permissions (module, action)
SELECT DISTINCT module, action FROM _0074_grants
ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM (SELECT DISTINCT role_key, module, action FROM _0074_grants) g
  JOIN roles r ON r.key = g.role_key
  JOIN permissions p ON p.module = g.module AND p.action = g.action
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ===========================================================================
-- Safety assertion: every module in the live catalog must be either
-- explicitly covered (role holds a grant matching module+'view', directly
-- or via a '*' wildcard) or named in that role's EXCLUDED list above. If
-- any module is neither, something was missed — abort without touching the
-- blanket row.
-- ===========================================================================
DO $assert$
DECLARE
  missing RECORD;
  missing_count int := 0;
  missing_list text := '';
BEGIN
  FOR missing IN
    SELECT role_key, module FROM (
      SELECT 'finance_manager' AS role_key, m.module FROM (VALUES
        ('actions'),('approvals'),('boq'),('clients'),('commercial'),('costing'),('dashboard'),('docs'),
        ('documents'),('expenses'),('finance'),('finance-ledger'),('handover'),('hr'),('hse'),('inventory'),
        ('invoices'),('items'),('locations'),('materials'),('notifications'),('organizations'),('payments'),
        ('payroll'),('procurement'),('projects'),('qhse'),('quantities'),('reports'),('sales'),('schedule'),
        ('site'),('subcontractors'),('suppliers'),('team'),('warehouses'),('work-orders')
      ) AS m(module)
      UNION ALL
      SELECT 'project_manager' AS role_key, m.module FROM (VALUES
        ('actions'),('approvals'),('boq'),('clients'),('commercial'),('costing'),('dashboard'),('docs'),
        ('documents'),('handover'),('hse'),('inventory'),('invoices'),('items'),('locations'),('materials'),
        ('notifications'),('organizations'),('procurement'),('projects'),('qhse'),('quantities'),('reports'),
        ('sales'),('schedule'),('site'),('subcontractors'),('suppliers'),('team'),('warehouses'),('work-orders')
      ) AS m(module)
    ) required
    WHERE NOT EXISTS (
      SELECT 1 FROM roles r JOIN role_permissions rp ON rp.role_id = r.id
        JOIN permissions p ON p.id = rp.permission_id
      WHERE r.key = required.role_key
        AND (p.module = required.module OR p.module = '*')
        AND (p.action = 'view' OR p.action = '*')
    )
  LOOP
    missing_count := missing_count + 1;
    missing_list := missing_list || format('%s/%s ', missing.role_key, missing.module);
  END LOOP;

  IF missing_count > 0 THEN
    RAISE EXCEPTION '0074 assertion UNSAFE: % module(s) in the required-coverage list have no explicit view grant after the insert above (%) — the blanket (*,*) row is left in place for safety, nothing deleted. Fix the grant list and re-run.',
      missing_count, missing_list;
  END IF;

  -- Safe: every required module is explicitly covered. Retire the blanket.
  DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE key IN ('finance_manager','project_manager'))
    AND permission_id IN (SELECT id FROM permissions WHERE module = '*' AND action = '*');
END
$assert$;
