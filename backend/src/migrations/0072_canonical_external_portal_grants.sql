-- F3 (owner decision 1): the canonical external roles of 0031 get the same portal data access as the legacy
-- alias family they mirror (client_executive/client_reviewer/pmc_manager -> client; consultant_coordinator/
-- consultant_reviewer -> consultant; subcontractor_manager/subcontractor_site_engineer -> subcontractor;
-- supplier_sales/testing_lab -> supplier). Only the (module, action) pairs the LEGACY alias holds and the
-- canonical role lacks are added, read from the effective grant tables, not guessed:
--   client alias      : client-portal.view/approve/reject, projects/docs/qhse/boq.view, *.see_client_value
--   consultant alias  : consultant.view/create/edit/submit/approve/reject, projects/boq/qhse/docs/work-orders/documents.view
--   subcontractor     : portal.view/create/edit/submit, subcontractors.view, *.see_subcontract_value
--   supplier          : portal.view/create/edit/submit, items.view, warehouses.view
-- Decisions inside the decision (documented in docs/CLOSEOUT_GAPS.md):
--   * client-portal.view for all three client-family roles; approve/reject (client decisions on variations
--     and document acknowledgements) only for client_executive - client_reviewer reviews and pmc_manager is
--     described by 0031 as read-only supervision.
--   * consultant_reviewer gets the alias's read pairs only (it is a view + submit role by design).
--   * subcontractor_manager gets the alias's see_subcontract_value lens; subcontractor_site_engineer gets
--     subcontractors.view only (its design is portal view/create + documents create).
--   * testing_lab already holds portal.view; the supplier alias's items/warehouses reads are NOT copied (a
--     laboratory does not browse stock), and supplier_sales already holds every supplier-alias pair.
-- Purely additive and idempotent: ON CONFLICT DO NOTHING, no grant removed, no role created.

INSERT INTO permissions (module, action, description)
VALUES ('client-portal', 'view', 'View the client portal'),
       ('client-portal', 'approve', 'Respond to client portal actions'),
       ('client-portal', 'reject', 'Reject client portal actions')
ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM (VALUES
    ('client_executive',            'client-portal', 'view'),
    ('client_reviewer',             'client-portal', 'view'),
    ('pmc_manager',                 'client-portal', 'view'),
    ('client_executive',            'client-portal', 'approve'),
    ('client_executive',            'client-portal', 'reject'),
    ('consultant_reviewer',         'qhse',          'view'),
    ('consultant_reviewer',         'boq',           'view'),
    ('consultant_reviewer',         'docs',          'view'),
    ('consultant_reviewer',         'work-orders',   'view'),
    ('subcontractor_manager',       '*',             'see_subcontract_value'),
    ('subcontractor_site_engineer', 'subcontractors','view')
  ) AS g(role_key, module, action)
  JOIN roles r ON r.key = g.role_key
  JOIN permissions p ON p.module = g.module AND p.action = g.action
ON CONFLICT (role_id, permission_id) DO NOTHING;
