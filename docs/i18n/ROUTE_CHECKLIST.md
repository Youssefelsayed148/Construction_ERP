# Route localization checklist

Status comes from `baseline/inventory.json` (heuristic). Update a row when its route is migrated. **inline** = inline `locale === 'ar'` branches (works once the toggle is reactive, L1); **EN-only** = hard-coded English.

| Route | Page | Status | Planned in |
|---|---|---|---|
| /login | Login | inline | L3 (auth) |
| (shell) | Layout, Sidebar | partly keys; EN-only portal / agent / comparison links, aria-labels, offline banner | L3 |
| /dashboard | Dashboard | inline | L5 |
| /consultant-portal, /client-portal, /subcontractor-portal, /supplier-portal | PortalDashboard | EN-only, 43 prompt/confirm/alert calls | L4C + Phase 6 |
| /inventory | Items | inline | L5 core |
| /procurement/comparison | ProcurementReview | EN-only | L4B |
| /suppliers, /clients | Suppliers, Clients | inline | L5 core |
| /legal, /approvals, /my-actions | Legal, Approvals, MyActions | inline | L5 core |
| /expenses, /invoices | Expenses, Invoices | inline | L5 core |
| /assets, /hr, /hr/payroll | Assets, HR, Payroll | inline | L5 core |
| /projects, /projects/new | Projects, ProjectWizard | inline | L5 core |
| /projects/:id | ProjectDetail | inline | L5 core |
| /projects/:id/boq | BOQ | inline | L5 core |
| /projects/:id/work-orders | WorkOrders | inline | L5 core |
| /projects/:id/site, /site-workspace | SiteManagement, SiteWorkspace | inline | L5 core |
| /projects/:id/operations | ProjectOperations | EN-only | L4A |
| /projects/:id/locations | LocationDashboard | inline | L5 core |
| /projects/:id/qhse | QHSE, QHSEExtended | inline | L5 |
| /projects/:id/hse | HSE | inline | L5 |
| /projects/:id/schedule | Schedule | partly | L5 |
| /projects/:id/reports | Reports | partly | L5 |
| /projects/:id/handover | Handover | partly | L5 |
| /projects/:id/documents | ProjectDocuments, DocControlExtended | inline | L5 |
| /projects/:id/units | UnitsSales | inline | L5 core |
| /agent-activity | AgentActivity | EN-only labels | L5 |
| /settings | placeholder | EN-only | L3 |
