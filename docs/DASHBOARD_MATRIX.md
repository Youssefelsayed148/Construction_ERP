# Dashboard Matrix — Phase 23

The per-role widget system (`GET /api/dashboard/role?project_id=`). Every
dashboard is permission-filtered server-side and renders correctly with zero
underlying records. Legacy dashboard.js endpoints keep their exact response
shapes (the legacy flag) until the frontend fully migrates.

## Resolution

- The resolver keys on the requesting user's role (the flat user role today;
  project roles alias into the same targets). Legacy strings map through
  aliases (manager → construction manager, staff/engineer → site engineer,
  accountant → finance manager, purchasing_mgr → procurement).
- Scoped portal roles (client/consultant/subcontractor/supplier) resolve
  their projects through Phase 3 `project_participants`; no assignment →
  empty-but-valid widgets.
- Unknown roles get the site-engineer-shaped payload (valid structure, empty
  data).

## The 16 dashboards and their widget minimums

| Role | Widgets |
|---|---|
| CEO/Owner | portfolio, procurement exposure, quality & safety risks, financial position — **extends** the existing `/overview` strip (the resolver returns the same summary-strip widgets; no parallel owner dashboard) |
| Projects Director | project health (total/at-risk), PM actions awaiting, schedule risk (delayed activities), commercial risk (open variations) |
| Construction Manager | works (planned/in-progress), inspections (open WIRs / pending MIRs), blockers (open RFIs), materials (low stock) |
| Project Manager | open actions, progress, WIR/MIR, NCRs, RFIs & submittals, consultant observations, cost & invoices |
| Site Engineer | today's work, latest drawings, materials, recent photos, daily-report status |
| Planning | baseline vs actual (total/completed/avg/baselines), delays, critical activities |
| QS/Commercial | BOQ & measurements, valuations, subcontracts, variations, budget & commitments |
| Procurement | requisitions, RFQs, issued POs, deliveries pending MIR |
| Storekeeper | stock, low stock, GRNs this week |
| QA/QC | WIR/MIR, tests (failed), NCRs (open), corrective actions (open) |
| HSE | permits (active/expiring today), inspections, incidents (open), near misses, overdue corrective actions |
| Document Controller | transmittals (incoming/outgoing open), revisions, superseded control, reviews due |
| Finance | receivables (invoiced/collected), payables (open PO commitments), overdue invoices |
| Client (portal) | my projects, milestones, handover readiness % |
| Consultant (portal) | my reviews (observations awaiting rectification, WIRs to decide, RFIs to answer) |
| Subcontractor (portal) | my work orders |

## Dashboard components

- **Sticky notes** (Phase 15) — personal + project-scope notes arrive inside
  the same payload; project-scope notes filter to the selected project.
- **Location dashboard** (Phase 8) — embeddable, permission-filtered widget
  (per-location planned/executed/certified + percent) in the same payload
  when a project is selected; portal roles only see projects they participate
  in.

## Zero-record contract

Every role dashboard renders on a brand-new system: empty widgets with valid
structure — never an error, never a crash. Tested explicitly for all 16.

## Seeded canonical role aliases

Canonical keys from `backend/src/scripts/seed-staging.js` are resolved by
`ROLE_ALIASES` to one of the widget families above. This is a display-family
mapping; endpoint permission and project scoping still come from the user's
authenticated grants and participant assignments.

| Canonical roles | Widget family |
|---|---|
| `owner_ceo` | CEO / Owner |
| `coo`, `business_development` | Projects Director |
| `projects_director` | Projects Director |
| `construction_manager`, `site_manager`, `equipment_manager` | Construction Manager |
| `project_manager` | Project Manager |
| `site_engineer`, `technical_office_engineer`, `hr_manager` | Site Engineer |
| `planning_engineer` | Planning |
| `quantity_surveyor`, `commercial_manager`, `contracts_manager` | QS / Commercial |
| `procurement_manager`, `procurement_officer`, `supplier_sales` | Procurement |
| `finance_manager`, `accountant_ar`, `accountant_ap` | Finance |
| `storekeeper` | Storekeeper |
| `qa_qc_manager`, `testing_lab` | QA/QC |
| `hse_manager` | HSE |
| `document_controller` | Document Controller |
| `client_executive`, `client_reviewer` | Client portal |
| `pmc_manager`, `consultant_coordinator`, `consultant_reviewer` | Consultant portal |
| `subcontractor_manager`, `subcontractor_site_engineer` | Subcontractor portal |
