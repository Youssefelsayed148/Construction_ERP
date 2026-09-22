# Report Catalog — Phase 24

The reporting engine (`/api/reports`). Every report respects the viewer's
permission flags (Phase 4) — a client-facing export never includes internal
cost columns even when the underlying query technically has access. The list
contract (filter/sort/page) is shared by every data path, and the export uses
the exact filtered result set the UI shows.

## The list/export contract

- Consistent query params on every data path: `?status=…&sort=…&order=asc|desc&page=…&page_size=…&search=…`
- Sort keys are whitelisted per call site; identifiers are validated against
  an injection guard.
- Exports: **CSV** (UTF-8 BOM, opens directly in Excel) and **branded PDF** —
  both over the same filtered result set the UI displays.

## Catalog reports

| Key | Module | Label | Internal columns |
|---|---|---|---|
| projects | projects | Projects register | budget, contract_value |
| quality_tests | qhse | Quality tests | — |
| ncrs | qhse | NCRs | cost_impact |
| wirs | qhse | Work inspection requests | — |
| punch_items | qhse | Punch list | — |
| corrective_actions | qhse | Corrective actions | — |
| incidents | hse | Incidents | — |
| near_misses | hse | Near misses | — |
| permits | hse | Permits to work | — |
| inductions | hse | Inductions | — |
| schedule_activities | schedule | Schedule activities | — |
| project_documents | docs | Document register | — |
| transmittals | docs | Transmittals | — |
| correspondence | docs | Correspondence | — |
| purchase_requests | procurement | Purchase requisitions | total_amount |
| purchase_orders | procurement | Purchase orders | total_amount |
| deliveries | procurement | Deliveries | — |
| sub_contracts | commercial | Subcontracts | contract_value |
| variations | commercial | Variations | amount |
| invoices | finance | Client invoices | amount, due_date |
| expenses | finance | Expenses | amount |
| employees | hr | Employees | — |

Internal-tagged columns are stripped from catalog, data and exports for any
viewer without internal financial authority (owner/admin/finance manager).

## Report packs

- **Commercial** — projects, subcontracts, variations, purchase orders
- **Procurement** — purchase requisitions, purchase orders, deliveries
- **Management** — projects, schedule activities, quality tests, incidents, invoices

## Saved views

Per user, per module: `GET/POST/DELETE /api/reports/saved-views` — stores the
filter/sort/page contract parameters; applying a view re-runs the report with
its parameters.

## Scheduled reports

`GET/POST/DELETE /api/reports/scheduled?project_id=` — weekly/monthly jobs
generating a report (PDF/CSV) and distributing to recipients through the
Phase 7 notification service. Every run is recorded in
`scheduled_report_runs` (status/recipient count/error), so the job is
observable before SMTP is configured.

## Automatic project report (~20 sections)

`GET /api/reports/project-report/:projectId` (+ `/pdf`). Every section pulls
live from its phase's data, not hand-assembled:

1. Executive Summary — 2. Progress — 3. Schedule — 4. Milestones —
5. Manpower (today) — 6. Equipment on site — 7. Approved quantities —
8. Procurement — 9. Material inspections — 10. Quality — 11. Safety —
12. RFIs — 13. Submittals — 14. Consultant observations — 15. Variations —
16. Financial status — 17. Photos — 18. Key risks — 19. Open actions.

Missing modules render empty sections (zero-record contract) — never an
error. Client-facing exports never include internal cost values.
