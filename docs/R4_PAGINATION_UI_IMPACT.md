# R4.4 pagination UI impact

API lists now default to 200 rows and cap each response at 1,000. Clients that need later rows must request `limit` and `offset`; `X-Total-Count` gives the filtered total. The API response body envelope remains unchanged.

This inventory records every frontend page file with API reads that can include collection data (33 page files found under `frontend/src/pages`). Paging controls are not yet wired into these screens; until R5.3, they can display only the first page. Route names are the backend paths as mounted under `/api` (some screens use a shared route helper).

| Frontend screen | List areas / API paths | Impact |
|---|---|---|
| Projects | `/projects`, `/projects/portfolio` | Project register and portfolio can exceed one page. |
| Dashboard | `/dashboard/portfolio`, project summary lists | Portfolio cards and project lists may be incomplete. |
| ProjectDetail, ProjectOperations, ProjectWizard | project activities, packages, resources, setup references | Large project plans and setup lists may be incomplete. |
| Schedule | `/schedule/activities`, resources, relationships, baselines, milestones | Activities and schedule registers may be incomplete. |
| HSE | incidents, inspections, permits, JSAs, risk assessments, inductions, toolbox talks, near misses, PPE, equipment inspections, drills | HSE registers may be incomplete. |
| QHSE, QHSEExtended, QHSECertificatesTab | quality tests, NCRs, inspections, ITPs, WIRs, checklists, actions, mock-ups, calibration, punch items, certificates, MIRs | Quality registers may be incomplete. |
| DocControlExtended, ProjectDocuments | RFIs, submittals, registers, transmittals, correspondence | Document registers may be incomplete. |
| Handover | assets, warranties, claims | Handover registers may be incomplete. |
| Approvals, MyActions | pending approvals and assigned actions | Work queues may be incomplete. |
| Assets, Items, WorkOrders | assets, materials, lots, conversions, work orders, movements | Inventory and maintenance lists may be incomplete. |
| ProcurementReview, Suppliers | RFQs, award recommendations, supplier lists and quotations | Procurement lists may be incomplete. |
| Invoices, Expenses, Payroll, UnitsSales | invoices, expenses, payment batches, buildings, units | Finance and unit registers may be incomplete. |
| HR | employees, laborers, skills, payroll-related records | HR lists may be incomplete. |
| Clients, PortalDashboard | client projects, subcontractor submissions, portal actions | Portal lists may be incomplete. |
| Reports | report data, saved views, scheduled reports | Report rows and saved-report lists may be incomplete. |
| AgentActivity | activity and tool-run history | Activity history may be incomplete. |
| LocationDashboard, SiteWorkspace, SiteManagement | site reports, visits, photos, sticky notes, instructions, location progress | Site records may be incomplete. |
| BOQ | BOQ items and quantities | Large BOQs may be incomplete. |
| Legal | legal register | Legal records may be incomplete. |

## R4.4 implementation status

- Shared SQL and derived-row helpers enforce `limit` (default 200, maximum 1,000), `offset`, deterministic ordering with an identifier tiebreak, and `X-Total-Count`. Existing response envelopes remain unchanged.
- The route-enumerating regression test found and covers at least 73 collection handlers. It passes only when each enumerated handler uses the helper, has an existing SQL limit, or has a finite-reference reason in the allowlist.
- Lists identified in the route scan have been updated, including reports, project and user registers, HSE/QHSE, document control, schedule, BOQ, organization/team, and related operational collections.
- Database-backed lists apply SQL `LIMIT/OFFSET`; lists derived from already-loaded project calculations or service results are paged after their existing calculation and sorted by stable identifiers. No index was added in this slice; a new index requires an `EXPLAIN` plan demonstrating need and is not claimed verified here.
- UI paging controls remain for R5.3; the screens above can currently show only the first page.

## R5.3 UI paging progress - 2026-10-15

- Shared `LoadMore` is wired to project, asset, item, client, expense, invoice, legal, supplier, work-order, schedule activity, HSE, QHSE, QHSE certificate, document/RFI/submittal, handover, HR, agent activity, location, payroll, unit sales, approvals, my-actions notifications, reports, site reports, site notes, and BOQ lists. These requests pass `limit=200` and the current `offset`, append results, and use `X-Total-Count`.
- The shared API response reader now preserves `X-Total-Count` as a non-enumerable metadata property across the migrated page helpers, without changing the JSON payload shape.
- R5.3 remains NOT DONE. The remaining flagged page-level flows requiring review and paging are Dashboard, ProjectDetail, ProjectOperations, ProjectWizard, QHSEExtended, DocControlExtended, ProcurementReview, and PortalDashboard. Some are nested or aggregate views and need per-endpoint treatment; do not treat the API metadata migration as UI completion.
- Frontend CI currently passes 36 suites / 169 tests; `lint:api` 1/1; i18n check/parity 36 namespaces / 1,432 English keys; optimized build compiles. These checks do not prove visual layout, RTL appearance, or browser behavior.
