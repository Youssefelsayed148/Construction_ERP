-- Phase 5.1, first slice: real per-module grants for four roles plus a least-privilege default.
-- No wildcards, no delete, no see_internal_cost. Legacy roles (engineer, staff, ...) are untouched and no
-- user is moved; admins reassign users with PUT /api/users/:id.
--
-- Module names follow the policy: `site` (site router, mounted under /api/projects) and `inventory`
-- (deliveries, MIR, GRN) are derived per route by policy.MODULE_OVERRIDES; approve/issue/verify routes need
-- the matching action (policy.ACTION_OVERRIDES), which none of these roles hold except where listed.
INSERT INTO roles (key, name, is_system, description) VALUES
  ('site_engineer',       'Site Engineer',       true, 'Records site work, quantities and quality for assigned projects'),
  ('storekeeper',         'Storekeeper',         true, 'Receives, issues and transfers stock; no prices'),
  ('quantity_surveyor',   'Quantity Surveyor',   true, 'BOQ, quantities, variations drafts and commercial reads; cannot certify, approve or issue'),
  ('document_controller', 'Document Controller', true, 'Registers and submits documents, RFIs, submittals and transmittals; cannot approve'),
  ('viewer',              'Viewer',              true, 'Least-privilege default: sees assigned projects, nothing else')
ON CONFLICT (key) DO NOTHING;

CREATE TEMP TABLE _slice1_grants (role_key text, module text, action text) ON COMMIT DROP;
INSERT INTO _slice1_grants (role_key, module, action) VALUES
  -- Site Engineer
  ('site_engineer','projects','view'), ('site_engineer','boq','view'), ('site_engineer','locations','view'),
  ('site_engineer','quantities','view'), ('site_engineer','quantities','create'), ('site_engineer','quantities','edit'),
  ('site_engineer','schedule','view'), ('site_engineer','schedule','edit'),
  ('site_engineer','site','view'), ('site_engineer','site','create'), ('site_engineer','site','edit'),
  ('site_engineer','work-orders','view'),
  ('site_engineer','qhse','view'), ('site_engineer','qhse','create'), ('site_engineer','qhse','edit'),
  ('site_engineer','hse','view'), ('site_engineer','hse','create'),
  ('site_engineer','docs','view'), ('site_engineer','docs','create'), ('site_engineer','docs','submit'),
  ('site_engineer','documents','view'), ('site_engineer','documents','create'),
  ('site_engineer','materials','view'), ('site_engineer','items','view'), ('site_engineer','warehouses','view'),
  ('site_engineer','actions','view'), ('site_engineer','actions','create'), ('site_engineer','actions','edit'),
  ('site_engineer','notifications','view'), ('site_engineer','notifications','edit'),
  -- Storekeeper
  ('storekeeper','projects','view'), ('storekeeper','locations','view'),
  ('storekeeper','items','view'), ('storekeeper','materials','view'),
  ('storekeeper','warehouses','view'), ('storekeeper','warehouses','create'), ('storekeeper','warehouses','edit'),
  ('storekeeper','inventory','view'), ('storekeeper','inventory','create'), ('storekeeper','inventory','edit'),
  ('storekeeper','actions','view'),
  ('storekeeper','notifications','view'), ('storekeeper','notifications','edit'),
  -- Quantity Surveyor. To let a QS see internal cost later, add ('quantity_surveyor','*','see_internal_cost').
  ('quantity_surveyor','projects','view'), ('quantity_surveyor','locations','view'),
  ('quantity_surveyor','boq','view'), ('quantity_surveyor','boq','create'), ('quantity_surveyor','boq','edit'),
  ('quantity_surveyor','quantities','view'), ('quantity_surveyor','quantities','create'), ('quantity_surveyor','quantities','edit'),
  ('quantity_surveyor','commercial','view'), ('quantity_surveyor','commercial','create'), ('quantity_surveyor','commercial','edit'), ('quantity_surveyor','commercial','submit'),
  ('quantity_surveyor','subcontractors','view'), ('quantity_surveyor','invoices','view'), ('quantity_surveyor','payments','view'),
  ('quantity_surveyor','costing','view'), ('quantity_surveyor','reports','view'), ('quantity_surveyor','reports','export'),
  ('quantity_surveyor','schedule','view'), ('quantity_surveyor','docs','view'),
  ('quantity_surveyor','materials','view'), ('quantity_surveyor','items','view'),
  ('quantity_surveyor','actions','view'), ('quantity_surveyor','actions','create'),
  ('quantity_surveyor','notifications','view'), ('quantity_surveyor','notifications','edit'),
  ('quantity_surveyor','*','see_client_value'), ('quantity_surveyor','*','see_subcontract_value'),
  -- Document Controller (submits; no approve)
  ('document_controller','projects','view'), ('document_controller','locations','view'),
  ('document_controller','docs','view'), ('document_controller','docs','create'), ('document_controller','docs','edit'), ('document_controller','docs','submit'),
  ('document_controller','documents','view'), ('document_controller','documents','create'), ('document_controller','documents','edit'),
  ('document_controller','actions','view'),
  ('document_controller','notifications','view'), ('document_controller','notifications','edit'),
  -- Viewer
  ('viewer','projects','view'), ('viewer','notifications','view');

INSERT INTO permissions (module, action)
SELECT DISTINCT module, action FROM _slice1_grants
ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM _slice1_grants g
  JOIN roles r ON r.key = g.role_key
  JOIN permissions p ON p.module = g.module AND p.action = g.action
ON CONFLICT DO NOTHING;
