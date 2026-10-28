# Training notes (per role)

A training index, not a manual: one "do this first" line and the lifecycle order per role, derived only
from the module/action grants actually seeded for that role. The canonical role list and grant blocks are
`backend/src/migrations/0031_organizations_rbac.sql`'s role-seeding section (24 internal + 9 external,
line-cited below); six "existing" canonical roles whose grants were seeded earlier are cited from
`backend/src/migrations/0006_role_templates_slice1.sql` and `backend/src/scripts/policy-migration.js`
instead, as 0031 says explicitly that it keeps their prior grants untouched. Module names match the
Express mount under `/api` (e.g. `boq` → `/api/boq`); routes are the matching frontend pages in
`frontend/src/App.js`/`ProjectShell.js`.

## Executive tier — owner_ceo, coo

Grants: every module in the catalog, plus `users.manage_permissions`, `approvals.approve/reject`,
`organizations.create/edit`, and all four `see_*` visibility flags (0031 lines 307-365).

- **First**: Settings → Users (`/admin/users`) to confirm the team roster, then Organizations
  (`/admin/organizations`) to confirm company/client/supplier masters exist.
- **Lifecycle**: create/approve projects (`/projects/new`) → review the Dashboard portfolio → act on
  Approvals (`/approvals`) and My Actions as they queue → review Reports/exports company-wide.

## Portfolio tier — projects_director, project_manager

`projects_director` grants: `projects.create/edit`, operational **view** across boq, quantities, schedule
(+ `edit`), site, docs, commercial, procurement, subcontractors, inventory, costing, reports, plus
`team.create/edit` and `see_client_value`/`see_subcontract_value` (0031 lines 368-385).
`project_manager` is a legacy canonical role still on a blanket `('*','*')` grant
(`backend/src/scripts/policy-migration.js` lines 75-89) — this is the open gap tracked in
`docs/LAUNCH_READINESS.md`'s open-Majors item 2; in practice it behaves like full access to every module.

- **First**: open the assigned project (`/projects/:id`) and confirm the team roster (Team tab) and
  schedule baseline.
- **Lifecycle**: Project setup/wizard → team assignment → schedule edit → monitor BOQ/commercial/
  procurement/site tabs read-only → review reports.

## Site & construction family — construction_manager, site_manager, site_engineer

All three share: `site.create/edit`, `quantities.create` (+ `edit` for `site_engineer`), `qhse.create/edit`,
`schedule.view` (+ `edit` for `construction_manager`/`site_manager`), `docs`/`documents.view`,
`materials`/`items.view`. `construction_manager` additionally gets `work-orders.edit`,
`procurement.create`, and the client/subcontract value flags (0031 lines 388-403). `site_manager` adds
`hse.create/edit` (0031 lines 406-416). `site_engineer` (existing role) adds `docs.create/submit`,
`documents.create`, and `hse.create` (`0006_role_templates_slice1.sql` lines 19-30).

- **First**: Site Management (`/projects/:id/site`) to log today's site report.
- **Lifecycle**: daily site report → quantities recorded against BOQ → QHSE inspection entries → (manager
  tiers) schedule adjustments and work-order edits → documents/submittals routed to the technical office.

## Planning & technical office — planning_engineer, technical_office_engineer, quantity_surveyor

`planning_engineer`: `schedule.create/edit`, view-only on projects/boq/locations/quantities/procurement/
materials/items (0031 lines 419-424).
`technical_office_engineer`: `boq.create/edit`, `docs.create/edit/submit`, `documents.create/edit`, plus
view on quantities/commercial/subcontractors (0031 lines 427-435).
`quantity_surveyor` (existing role, `0006_role_templates_slice1.sql` lines 38-49): `boq.create/edit`,
`quantities.create/edit`, `commercial.create/edit/submit`, view on subcontractors/invoices/payments/
costing/reports, plus `see_client_value`/`see_subcontract_value` (not `see_internal_cost` — 0031's own
comment calls this out as a deliberate decision, lines 18-19, 85-87).

- **First**: Schedule (`planning_engineer`) or BOQ (`technical_office_engineer`/`quantity_surveyor`) tab
  on the assigned project.
- **Lifecycle**: `planning_engineer` builds/maintains the schedule baseline; `technical_office_engineer`
  drafts BOQ take-offs and submits drawings/submittals for review; `quantity_surveyor` measures quantities
  against BOQ and drafts commercial variations for the commercial manager to approve.

## Commercial & contracts — commercial_manager, contracts_manager

`commercial_manager`: `commercial.create/edit/submit/approve`, `subcontractors.create/edit/approve`,
`invoices.create/edit`, view on procurement/clients/finance-ledger, plus all three non-supplier `see_*`
flags including `see_internal_cost` (0031 lines 438-454 — the plan's explicit decision that commercial
sees internal cost).
`contracts_manager`: `legal.create/edit`, `subcontractors.edit`, `commercial.create/edit`, view on
procurement/docs/documents/materials/clients/invoices (0031 lines 457-465).

- **First**: Commercial workspace on the assigned project to review open variations.
- **Lifecycle**: `commercial_manager` reviews/approves variations and subcontractor terms, issues client
  invoices; `contracts_manager` drafts/edits legal and subcontract documents feeding that approval.

## Procurement family — procurement_manager, procurement_officer, storekeeper

`procurement_manager`: `procurement.create/edit`, `suppliers.create/edit`, `items.create/edit`, view on
materials/inventory/warehouses/commercial/subcontractors/invoices, plus `see_supplier_value` (0031 lines
468-478).
`procurement_officer`: `procurement.create/edit/submit`, `suppliers.create/edit`, view on items/materials/
inventory/warehouses, plus `see_supplier_value` (0031 lines 481-488) — a narrower, submit-only version of
the manager role.
`storekeeper` (existing role, `0006_role_templates_slice1.sql` lines 32-37): `warehouses.create/edit`,
`inventory.create/edit`, view on items/materials — no price visibility (no `see_*` flag granted).

- **First**: `procurement_officer`/`manager` → Procurement comparison workspace (`/procurement/
  comparison`) to see open requisitions; `storekeeper` → Inventory (`/inventory`) to see open GRNs.
- **Lifecycle**: PR → RFQ/comparison → PO (procurement_officer drafts, procurement_manager edits/approves
  supplier terms) → GRN received into a warehouse → `storekeeper` posts issues/returns/adjustments
  (`/admin/inventory-documents`) → three-way match against the supplier invoice.

## Finance family — finance_manager, accountant_ar, accountant_ap

`finance_manager` is a legacy canonical role on a blanket `('*','*')` grant
(`backend/src/scripts/policy-migration.js` lines 64,84) — the same open gap as `project_manager`, tracked
in `docs/LAUNCH_READINESS.md`'s open-Majors item 2.
`accountant_ar`: `invoices.create/edit`, `payments.create`, view on finance/finance-ledger/costing/
commercial/reports, plus `see_client_value` (0031 lines 491-499).
`accountant_ap`: `payments.create`, `expenses.create/edit`, `procurement.create` (for supplier invoices),
`finance-ledger.record_payment`, plus `see_supplier_value` (0031 lines 502-510).

- **First**: `accountant_ar` → Invoices (`/invoices`) to review the AR aging; `accountant_ap` → Expenses
  (`/expenses`) to review AP aging.
- **Lifecycle**: `accountant_ar` issues client invoices and records receipts; `accountant_ap` books
  supplier expenses and records payments against approved POs/GRNs; `finance_manager` oversees both plus
  the finance ledger and reconciliation (full access, no module boundary).

## QA/QC and HSE — qa_qc_manager, hse_manager

`qa_qc_manager`: `qhse.create/edit/approve/reject`, `hse.create/edit`, `docs.submit`, view on projects/
site/quantities/work-orders/schedule (0031 lines 513-521).
`hse_manager`: `hse.create/edit`, `qhse.create`, view on projects/site/schedule (0031 lines 524-528).

- **First**: QHSE workspace (`/projects/:id/qhse`) for `qa_qc_manager`; HSE workspace
  (`/projects/:id/hse`) for `hse_manager`.
- **Lifecycle**: `qa_qc_manager` reviews WIR/NCR submissions through approve/reject; `hse_manager` logs
  incidents/permits and safety records for assigned projects.

## Document control — document_controller

Existing role (`0006_role_templates_slice1.sql` lines 51-55): `docs.create/edit/submit`,
`documents.create/edit`, view on projects/locations — no approve action.

- **First**: Documents tab (`/projects/:id/documents`) to see the pending-submission queue.
- **Lifecycle**: register incoming documents/RFIs/submittals/transmittals → submit into the applicable
  workflow template (RFI/submittal/WIR) → hands off to the role that approves (document_controller itself
  cannot approve).

## Equipment / plant — equipment_manager

Grants: `assets.create/edit`, `maintenance.create/edit`, view on inventory/warehouses/items/procurement/
materials/handover, plus `see_supplier_value` (0031 lines 531-539).

- **First**: Assets (`/assets`) to review the equipment register.
- **Lifecycle**: register/update assets → schedule and log maintenance → monitor procurement for spares
  (view-only).

## HR — hr_manager

Grants: `hr.create/edit`, `payroll.create/edit`, `users.create/edit`, `organizations.create/edit`, view on
delegations/projects (0031 lines 542-548).

- **First**: HR (`/hr`) to review the staff roster.
- **Lifecycle**: maintain HR records → run payroll (`/hr/payroll`) → manage user accounts and company/
  department master data (`/admin/organizations`).

## Business development — business_development

Grants: `clients.create/edit`, `sales.create/edit`, view on projects/procurement/commercial/legal/reports,
plus `see_client_value` (0031 lines 551-558).

- **First**: Clients (`/clients`) to review the pipeline.
- **Lifecycle**: register a prospective client → track the sales pipeline → hand off to projects_director/
  owner once a project is won.

## External — client family: client_executive, client_reviewer

Both: view on projects/docs/qhse/boq; `client_executive` also holds `see_client_value` (0031 lines
561-565). Reached via the client portal (`/client-portal`, portal family mapping in
`frontend/src/utils/portalFamily.js`).

- **First**: Client portal dashboard to see shared documents awaiting review.
- **Lifecycle**: review shared project progress/QHSE status and documents; `client_executive` additionally
  sees contract value figures. Neither role can edit — review/comment only, per the portal's read scope.

## External — PMC: pmc_manager

Grants: view on projects/boq/locations/quantities/site/schedule/docs/documents/qhse/reports, plus
`see_client_value` (0031 lines 566-569) — supervision reads only, no module write grant.

- **First**: Portal dashboard to see assigned projects' current status.
- **Lifecycle**: review progress, schedule and QHSE status read-only across supervised projects; no
  create/edit permission exists for this role.

## External — consultant family: consultant_coordinator, consultant_reviewer

`consultant_coordinator`: `consultant.create/edit/submit/approve/reject`, `documents.create`, view on
projects/boq/qhse/docs/work-orders/documents (0031 lines 570-576).
`consultant_reviewer`: `consultant.view/submit`, view on projects/documents only — narrower, review-only
(0031 lines 577-578).

- **First**: Consultant portal (`/consultant-portal`) to see the open-RFI/submittal queue.
- **Lifecycle**: `consultant_coordinator` receives RFIs/submittals, routes them, and can approve/reject;
  `consultant_reviewer` submits discipline-specific review comments only.

## External — subcontractor family: subcontractor_manager, subcontractor_site_engineer

`subcontractor_manager`: `portal.create/edit/submit`, `documents.create`, view on subcontractors/portal
(0031 lines 579-581).
`subcontractor_site_engineer`: `portal.create`, `documents.create`, view on portal only — field-level,
narrower than the manager (0031 lines 582-583).

- **First**: Subcontractor portal (`/subcontractor-portal`) to see open work packages.
- **Lifecycle**: submit progress/field records through the portal; `subcontractor_manager` additionally
  manages the subcontract relationship (edit, not just create).

## External — supplier: supplier_sales

Grants: `portal.create/edit/submit`, `documents.create`, view on items/warehouses/portal (0031 lines
584-586).

- **First**: Supplier portal (`/supplier-portal`) to see open RFQs/POs.
- **Lifecycle**: respond to RFQs, submit delivery/collection documents against POs/GRNs through the portal.

## External — testing lab: testing_lab

Grants: `qhse.create`, view on qhse/portal (0031 lines 587) — the narrowest external role, write access to
QHSE records only.

- **First**: Testing lab portal view to see pending test requests.
- **Lifecycle**: record laboratory test results against QHSE inspection/sample records; no other module
  access.
