-- Closeout phase 1 (found by the scripted HTTP scenario): nine actions the policy engine requires on specific routes were held
-- by NO canonical role, so only the legacy blanket roles (owner/admin/...) could perform them. After 0074 retired the last
-- canonical blanket grants, these became the only way a canonical user hits a 403 on a core step.
--
-- Each grant mirrors the closest sibling permission that already exists, so no role gains authority its siblings lack:
--   procurement.issue_financial_document -> the roles holding procurement.approve that run purchasing (procurement_manager,
--                                           owner_ceo, coo). procurement_officer drafts; project_manager approves but does not issue.
--   commercial.reject                    -> the roles holding commercial.approve (a reviewer who can approve can reject).
--   invoices.void, payments.void         -> the roles holding finance-ledger.void (finance_manager, coo, owner_ceo).
--   work-orders.approve                  -> the roles holding work-orders.edit (construction_manager, project_manager): verifying a
--                                           completion is the PM-side counterpart of the site engineer raising it.
--   qhse.submit                          -> the site-side roles that already create/edit QHSE records (site_engineer, site_manager,
--                                           construction_manager, project_manager, qa_qc_manager).
--   handover.approve                     -> project_manager (the only canonical role with handover access besides finance/equipment view).
-- Deliberately NOT granted (destructive, owner/admin only by design): items.delete, suppliers.delete (restore routes).
-- Idempotent: permissions and role grants use ON CONFLICT DO NOTHING; an unknown role key is skipped, not an error.

CREATE TEMP TABLE _0084_grants (role_key text, module text, action text) ON COMMIT DROP;

INSERT INTO _0084_grants VALUES
  ('procurement_manager', 'procurement', 'issue_financial_document'),
  ('owner_ceo',           'procurement', 'issue_financial_document'),
  ('coo',                 'procurement', 'issue_financial_document'),
  ('commercial_manager',  'commercial',  'reject'),
  ('coo',                 'commercial',  'reject'),
  ('owner_ceo',           'commercial',  'reject'),
  ('project_manager',     'commercial',  'reject'),
  ('finance_manager',     'invoices',    'void'),
  ('coo',                 'invoices',    'void'),
  ('owner_ceo',           'invoices',    'void'),
  ('finance_manager',     'payments',    'void'),
  ('coo',                 'payments',    'void'),
  ('owner_ceo',           'payments',    'void'),
  ('construction_manager','work-orders', 'approve'),
  ('project_manager',     'work-orders', 'approve'),
  ('site_engineer',       'qhse',        'submit'),
  ('site_manager',        'qhse',        'submit'),
  ('construction_manager','qhse',        'submit'),
  ('project_manager',     'qhse',        'submit'),
  ('qa_qc_manager',       'qhse',        'submit'),
  ('project_manager',     'handover',    'approve');

INSERT INTO permissions (module, action)
SELECT DISTINCT module, action FROM _0084_grants
ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM _0084_grants g
  JOIN roles r ON r.key = g.role_key
  JOIN permissions p ON p.module = g.module AND p.action = g.action
ON CONFLICT (role_id, permission_id) DO NOTHING;
