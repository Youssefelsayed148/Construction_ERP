# R4.4 pagination UI impact

API lists now default to 200 rows and cap each response at 1,000. Clients that need later rows must request `limit` and `offset`; `X-Total-Count` gives the filtered total. The API response body envelope remains unchanged.

This inventory records the frontend screens and collection areas identified during R4.4 (33 page files at that checkpoint). Route names are backend paths mounted under `/api` (some screens use a shared route helper). R5.3 completion status is below.

## Explicit finite-reference and file-response exemptions

These routes do not expose pageable business collections. The export and PDF routes generate one requested artifact and remain outside the list contract.

| Route | Exemption reason |
|---|---|
| `GET /api/docs/categories` | Small, admin-maintained document category catalogue used by selectors. |
| `GET /api/expenses/categories` | Fixed expense category codes used by forms. |
| `GET /api/notifications/preferences` | One user's finite event/channel preference set, keyed by registered application events. |
| `GET /api/projects/templates` | Versioned project starter template catalogue bounded by product configuration. |
| `GET /api/suppliers/specialties` | Fixed supplier specialty codes used by forms. |
| `GET /api/users/preview/roles` | Fixed system role catalogue used for preview only. |
| `GET /api/reports/export` | Generates one caller-selected report file; it is not a JSON collection response. |
| `GET /api/schedule/activities/export` | Generates a single schedule export artifact for the requested project/filter. |
| `GET /api/handover/*/pdf` | Generates an individual handover PDF document. |
| `GET /api/qhse/*/pdf` | Generates an individual QHSE PDF document. |
| `GET /api/hse/*/pdf` | Generates an individual HSE PDF document. |

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
- The regression test enumerates mounted Express routers and checks actual GET handler functions. Collection responses must use `queryPaginated`, `paginateRows`, or the route's paginated reader; finite-reference catalogues have an explicit reason. Nested child paths such as `/:id/revisions` are included. The test proves detection using a temporary Express route, then removes it.
- Lists identified in the route scan have been updated, including reports, project and user registers, HSE/QHSE, document control, schedule, BOQ, organization/team, and related operational collections.
- Database-backed lists apply SQL `LIMIT/OFFSET`; lists derived from already-loaded project calculations or service results are paged after their existing calculation and sorted by stable identifiers. No index was added in this slice; a new index requires an `EXPLAIN` plan demonstrating need and is not claimed verified here.
- R5.3 wires UI paging into every API-backed list identified above. Dashboard alert cards remain bounded summary previews linking to full registers; Login and Settings contain no list views. ProjectDetail phases, team, and milestones are returned together by its project-detail endpoint, while its employee/client/manager pickers are paged.

## R5.3 UI paging - complete - 2026-10-15

- Shared `LoadMore` is wired to project, asset, item, client, expense, invoice, legal, supplier, work-order, schedule activity, HSE, QHSE, QHSE certificate, document/RFI/submittal, handover, HR, agent activity, location, payroll, unit sales, approvals, my-actions notifications, reports, site reports, site notes, BOQ, procurement comparison, project operations, project setup lookups, QHSE extended, and document control extended lists. API-backed requests pass `limit=200` and `offset`, append results, and expose `X-Total-Count`. Portal dashboard arrays use a local show-more control for the complete bounded summary payload already returned by the API.
- The shared API response reader now preserves `X-Total-Count` as a non-enumerable metadata property across the migrated page helpers, without changing the JSON payload shape.
- Production-page scan: 34/37 page files contain a pager. The other three are Dashboard summary, Login, and Settings; none is a truncated API-backed register. The original impact inventory's grouped list screens are covered.
- Final frontend CI PASS 36 suites / 169 tests; API guard PASS 1/1; i18n check/parity PASS (36 namespaces / 1,432 English keys); optimized production build PASS. These checks do not prove visual layout, RTL appearance, or browser behavior.
- Implementation commit: `9c7dc27`; earlier R5.3 offset append slice: `e5d7f9e`.

## Batch 1 API contract remediation - 2026-10-16

- Shared API list defaults and maximums are 200 and 1,000; malformed limits use the default and malformed/negative offsets clamp to zero. SQL-backed lists return `X-Total-Count`; derived lists preserve their existing response data shape while applying offset in the shared row helper.
- Completed the 4b and 4c route list in `docs/R45_VERIFICATION.md`, including HR employee offset, procurement project workspace, notification inbox/deliveries, nested histories and materials. `/api/v1/webhooks` accepts `limit`/`offset` and maps legacy `page`/`per_page`; the admin parser handles the v1 structured error object.
- Procurement project workspace has six independently paged arrays; `X-Total-Count` represents the combined matching rows across those six arrays. Doc-control search pages its merged result after the existing permission filtering.
- Finite reference and export/PDF exemptions are listed above with a reason. No new exemption was added for a business collection.
- Batch 1 targeted checks and remaining gates are recorded in `docs/BATCH1_SCORECARD.md`; do not infer that a command passed unless its current command output is recorded there.
