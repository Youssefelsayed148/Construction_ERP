# Batch 5A complete list-route inspection table

Every mounted GET is included (including non-list, missing-record, denied, aggregate and file responses) so the collection inventory cannot silently omit a route. Fresh throwaway DB, owner seat, explicit fixture project, limit=1/offset=0; unknown record IDs use a missing sentinel. Effective module is shown; regular authenticated GETs use request-local projectReadScope before aggregation, and v1 resources use their policy expression. This table records actual response shape and X-Total-Count, not assumed completeness from samples. ABSENT on an observed array is an open pagination-contract gap outside the RFQ fix; ABSENT on non-lists does not imply a defect. Missing-record/denied rows require endpoint fixtures for list behavior. Exact offset/no-overlap/SQL total verification for RFQs is in batch5a-lists.pg.test.js; existing get-routes.pg.test.js covers the earlier families.

| GET route | Effective module | Pagination declaration | HTTP | Observed array fields | X-Total-Count |
|---|---|---|---|---|---|
| /uploads/:fileName | uploads | handler-specific | 404 | no array observed | ABSENT |
| /api/auth/me | auth | handler-specific | 200 | no array observed | ABSENT |
| /api/users | users | shared pagination | 200 | data[] | 135 |
| /api/users/preview/roles | users | handler-specific | 200 | data[] | ABSENT |
| /api/users/:id | users | handler-specific | 404 | no array observed | ABSENT |
| /api/approvals/pending | approvals | shared pagination | 200 | no array observed | 6 |
| /api/approvals/stale | approvals | handler-specific | 200 | data.rows[] | ABSENT |
| /api/approvals/my-requests | approvals | handler-specific | 200 | no array observed | ABSENT |
| /api/approvals/audit | approvals | shared pagination | 200 | no array observed | 3 |
| /api/approvals/check/:module/:requestId | approvals | handler-specific | 200 | no array observed | ABSENT |
| /api/approvals/:id/details | approvals | handler-specific | 404 | no array observed | ABSENT |
| /api/approval-limits | approval-limits | handler-specific | 400 | no array observed | ABSENT |
| /api/activity | activity | handler-specific | 200 | no array observed | ABSENT |
| /api/dashboard | dashboard | handler-specific | 200 | no array observed | ABSENT |
| /api/dashboard/portfolio | dashboard | shared pagination | 200 | data[] | 1 |
| /api/dashboard/project/:id | dashboard | handler-specific | 400 | no array observed | ABSENT |
| /api/dashboard/alerts | dashboard | handler-specific | 200 | data.low_stock[], data.overdue_milestones[], data.budget_overruns[], data.stale_site_reports[], data.overdue_rfis[] | ABSENT |
| /api/dashboard/overview | dashboard | handler-specific | 200 | no array observed | ABSENT |
| /api/dashboard/role | dashboard | handler-specific | 200 | data.widgets[], data.sticky_notes[] | ABSENT |
| /api/items/categories | items | handler-specific | 200 | data.categories[], data.units[] | ABSENT |
| /api/items | items | shared pagination | 200 | data[] | 279 |
| /api/items/:id | items | handler-specific | 404 | no array observed | ABSENT |
| /api/items/:id/suppliers | items | shared pagination | 200 | data[] | 0 |
| /api/suppliers | suppliers | shared pagination | 200 | data[] | 0 |
| /api/suppliers/specialties | suppliers | handler-specific | 200 | data[] | ABSENT |
| /api/suppliers/:id | suppliers | handler-specific | 404 | no array observed | ABSENT |
| /api/suppliers/:id/materials | suppliers | shared pagination | 200 | data[] | 0 |
| /api/clients | clients | shared pagination | 200 | data[] | 0 |
| /api/clients/:id | clients | handler-specific | 404 | no array observed | ABSENT |
| /api/legal | legal | shared pagination | 200 | data[] | 0 |
| /api/legal/:id | legal | handler-specific | 403 | no array observed | ABSENT |
| /api/expenses/categories | expenses | handler-specific | 200 | data[] | ABSENT |
| /api/expenses | expenses | shared pagination | 200 | data[] | 0 |
| /api/expenses/:id | expenses | handler-specific | 403 | no array observed | ABSENT |
| /api/invoices | invoices | shared pagination | 200 | data[] | 0 |
| /api/invoices/:id | invoices | handler-specific | 403 | no array observed | ABSENT |
| /api/payments | payments | shared pagination | 200 | data[] | 0 |
| /api/finance/project/:id | finance | handler-specific | 400 | no array observed | ABSENT |
| /api/finance/summary | finance | handler-specific | 200 | no array observed | ABSENT |
| /api/assets/categories | assets | handler-specific | 200 | data.types[], data.categories[] | ABSENT |
| /api/assets | assets | shared pagination | 200 | data[] | 0 |
| /api/assets/:id | assets | handler-specific | 403 | no array observed | ABSENT |
| /api/assets/:id/assignments | assets | shared pagination | 200 | data[] | 0 |
| /api/assets/:id/usage-logs | assets | shared pagination | 200 | data[] | 0 |
| /api/maintenance | maintenance | shared pagination | 200 | data[] | 0 |
| /api/maintenance/:id | maintenance | handler-specific | 403 | no array observed | ABSENT |
| /api/hr/employees | hr | shared pagination | 200 | data[] | 0 |
| /api/hr/employees/:id | hr | handler-specific | 404 | no array observed | ABSENT |
| /api/hr/attendance | hr | shared pagination | 200 | data[] | 0 |
| /api/hr/leaves | hr | shared pagination | 200 | data[] | 0 |
| /api/hr/laborers | hr | shared pagination | 200 | data[] | 0 |
| /api/hr/laborers/skills | hr | handler-specific | 200 | data[] | ABSENT |
| /api/hr/laborers/:id | hr | handler-specific | 404 | no array observed | ABSENT |
| /api/hr/labor-payments | hr | shared pagination | 200 | data[] | 0 |
| /api/payroll | payroll | shared pagination | 200 | data[] | 0 |
| /api/payroll/:id | payroll | handler-specific | 404 | no array observed | ABSENT |
| /api/projects/portfolio | projects | shared pagination | 200 | data[] | 1 |
| /api/projects | projects | shared pagination | 200 | data[] | 1 |
| /api/projects/templates | projects | handler-specific | 200 | data[] | ABSENT |
| /api/projects/templates/:key | projects | handler-specific | 404 | no array observed | ABSENT |
| /api/projects/:id | projects | handler-specific | 400 | no array observed | ABSENT |
| /api/warehouses | warehouses | shared pagination | 200 | data[] | 0 |
| /api/warehouses/:id/movements | warehouses | shared pagination | 403 | no array observed | ABSENT |
| /api/warehouses/transfers | warehouses | shared pagination | 200 | data[] | 7 |
| /api/warehouses/reservations | warehouses | shared pagination | 200 | data[] | 0 |
| /api/warehouses/:id | warehouses | handler-specific | 403 | no array observed | ABSENT |
| /api/inventory/lots/expiring | inventory | shared pagination | 200 | data[] | 6 |
| /api/inventory/lots | inventory | shared pagination | 200 | data[] | 13 |
| /api/inventory/lots/:id | inventory | handler-specific | 403 | no array observed | ABSENT |
| /api/inventory/conversions/convert | inventory | handler-specific | 400 | no array observed | ABSENT |
| /api/inventory/conversions | inventory | handler-specific | 200 | data[] | ABSENT |
| /api/inventory/issues | inventory | service list; inspect service | 200 | data[] | ABSENT |
| /api/inventory/issues/:id | inventory | handler-specific | 403 | no array observed | ABSENT |
| /api/inventory/returns | inventory | service list; inspect service | 200 | data[] | ABSENT |
| /api/inventory/returns/:id | inventory | handler-specific | 403 | no array observed | ABSENT |
| /api/inventory/adjustments | inventory | service list; inspect service | 200 | data[] | ABSENT |
| /api/inventory/adjustments/:id | inventory | handler-specific | 403 | no array observed | ABSENT |
| /api/boq/sections/:projectId | boq | shared pagination | 200 | data[] | 0 |
| /api/boq/items/:projectId | boq | shared pagination | 200 | data[] | 0 |
| /api/boq/summary/:projectId | boq | handler-specific | 200 | data.by_type[] | ABSENT |
| /api/work-orders/project/:projectId | work-orders | shared pagination | 200 | data[] | 0 |
| /api/work-orders/:id | work-orders | handler-specific | 403 | no array observed | ABSENT |
| /api/work-orders/:id/materials | work-orders | shared pagination | 403 | no array observed | ABSENT |
| /api/work-orders/:id/labor | work-orders | shared pagination | 403 | no array observed | ABSENT |
| /api/work-orders/:id/equipment | work-orders | shared pagination | 403 | no array observed | ABSENT |
| /api/work-orders/:id/completions | work-orders | shared pagination | 403 | no array observed | ABSENT |
| /api/subcontractors | subcontractors | shared pagination | 200 | data[] | 0 |
| /api/subcontractors/:id | subcontractors | handler-specific | 404 | no array observed | ABSENT |
| /api/subcontractors/contracts/:projectId | subcontractors | shared pagination | 200 | data[] | 0 |
| /api/subcontractors/verifications/:contractId | subcontractors | shared pagination | 403 | no array observed | ABSENT |
| /api/subcontractors/certificates/:contractId | subcontractors | shared pagination | 403 | no array observed | ABSENT |
| /api/costing/codes | costing | shared pagination | 200 | data[] | 14 |
| /api/costing/project/:projectId | costing | handler-specific | 200 | data.costs[], data.summary_by_type[] | ABSENT |
| /api/costing/project/:projectId/summary | costing | handler-specific | 200 | data[] | ABSENT |
| /api/costing/project/:projectId/profitability | costing | handler-specific | 200 | no array observed | ABSENT |
| /api/projects/:projectId/site-reports | site | shared pagination | 200 | data[] | 0 |
| /api/projects/:projectId/site-reports/:date | site | handler-specific | 404 | no array observed | ABSENT |
| /api/projects/:projectId/instructions | site | shared pagination | 200 | data[] | 0 |
| /api/projects/:projectId/site-visits | site | shared pagination | 200 | data[] | 0 |
| /api/projects/:projectId/workspace | site | handler-specific | 200 | no array observed | ABSENT |
| /api/projects/:projectId/photos | site | shared pagination | 200 | data[] | 0 |
| /api/projects/:projectId/sticky-notes | site | shared pagination | 200 | data[] | 0 |
| /api/projects/:id/settings | projects | handler-specific | 400 | no array observed | ABSENT |
| /api/projects/:id/calendars | projects | service list; inspect service | 400 | no array observed | ABSENT |
| /api/projects/:id/wbs | projects | service list; inspect service | 400 | no array observed | ABSENT |
| /api/projects/:id/work-packages | projects | service list; inspect service | 400 | no array observed | ABSENT |
| /api/qhse/quality-tests | qhse | shared pagination | 200 | data[] | 0 |
| /api/qhse/ncrs | qhse | shared pagination | 200 | data[] | 0 |
| /api/qhse/inspections | qhse | shared pagination | 200 | data[] | 0 |
| /api/qhse/incidents | qhse | shared pagination | 200 | data[] | 0 |
| /api/qhse/itps | qhse | shared pagination | 200 | data[] | 0 |
| /api/qhse/itps/:id | qhse | handler-specific | 403 | no array observed | ABSENT |
| /api/qhse/itps/:id/pdf | qhse | handler-specific | 403 | no array observed | ABSENT |
| /api/qhse/wirs | qhse | shared pagination | 200 | data[] | 0 |
| /api/qhse/wirs/:id | qhse | handler-specific | 403 | no array observed | ABSENT |
| /api/qhse/wirs/:id/pdf | qhse | handler-specific | 403 | no array observed | ABSENT |
| /api/qhse/checklists/templates | qhse | shared pagination | 200 | data[] | 0 |
| /api/qhse/checklists/instances | qhse | shared pagination | 200 | data[] | 0 |
| /api/qhse/checklists/instances/:id/pdf | qhse | handler-specific | 403 | no array observed | ABSENT |
| /api/qhse/actions | qhse | shared pagination | 200 | data[] | 0 |
| /api/qhse/actions/:id/pdf | qhse | handler-specific | 404 | no array observed | ABSENT |
| /api/qhse/mock-ups | qhse | shared pagination | 200 | data[] | 0 |
| /api/qhse/calibration-records | qhse | shared pagination | 200 | data[] | 0 |
| /api/qhse/punch-items | qhse | shared pagination | 200 | data[] | 0 |
| /api/qhse/punch-items/pdf | qhse | handler-specific | 200 | no array observed | ABSENT |
| /api/qhse/ncrs/:id/pdf | qhse | handler-specific | 403 | no array observed | ABSENT |
| /api/qhse/quality-tests/:id/pdf | qhse | handler-specific | 403 | no array observed | ABSENT |
| /api/qhse/certificates | qhse | shared pagination | 200 | data[] | 0 |
| /api/qhse/mirs | qhse | shared pagination | 200 | data[] | 0 |
| /api/hse/dashboard | hse | handler-specific | 200 | no array observed | ABSENT |
| /api/hse/incidents | hse | shared pagination | 200 | data[] | 0 |
| /api/hse/incidents/:id/pdf | hse | handler-specific | 403 | no array observed | ABSENT |
| /api/hse/inspections | hse | shared pagination | 200 | data[] | 0 |
| /api/hse/inspections/:id/pdf | hse | handler-specific | 403 | no array observed | ABSENT |
| /api/hse/permits | hse | shared pagination | 200 | data[] | 0 |
| /api/hse/permits/:id/pdf | hse | handler-specific | 403 | no array observed | ABSENT |
| /api/hse/jsas | hse | shared pagination | 200 | data[] | 0 |
| /api/hse/jsas/:id/pdf | hse | handler-specific | 403 | no array observed | ABSENT |
| /api/hse/risk-assessments | hse | shared pagination | 200 | data[] | 0 |
| /api/hse/risk-assessments/:id/pdf | hse | handler-specific | 403 | no array observed | ABSENT |
| /api/hse/inductions | hse | shared pagination | 200 | data[] | 0 |
| /api/hse/toolbox-talks | hse | shared pagination | 200 | data[] | 0 |
| /api/hse/near-misses | hse | shared pagination | 200 | data[] | 0 |
| /api/hse/near-misses/:id/pdf | hse | handler-specific | 403 | no array observed | ABSENT |
| /api/hse/ppe-records | hse | shared pagination | 200 | data[] | 0 |
| /api/hse/equipment-inspections | hse | shared pagination | 200 | data[] | 0 |
| /api/hse/emergency-drills | hse | shared pagination | 200 | data[] | 0 |
| /api/schedule/resource-load | schedule | shared pagination | 400 | no array observed | ABSENT |
| /api/schedule/calendars | schedule | shared pagination | 200 | data[] | 0 |
| /api/schedule/activities | schedule | shared pagination | 200 | data[] | 0 |
| /api/schedule/activities/export | schedule | handler-specific | 200 | no array observed | ABSENT |
| /api/schedule/activities/:id | schedule | handler-specific | 403 | no array observed | ABSENT |
| /api/schedule/activities/:id/progress-history | schedule | shared pagination | 403 | no array observed | ABSENT |
| /api/schedule/resources | schedule | shared pagination | 200 | data[] | 0 |
| /api/schedule/activities/:id/assignments | schedule | shared pagination | 403 | no array observed | ABSENT |
| /api/schedule/relationships | schedule | shared pagination | 200 | data[] | 0 |
| /api/schedule/schedule/cpm | schedule | handler-specific | 200 | data.activities[] | ABSENT |
| /api/schedule/schedule/lookahead | schedule | shared pagination | 200 | data[] | 0 |
| /api/schedule/schedule/delayed | schedule | shared pagination | 200 | data[] | 0 |
| /api/schedule/schedule/kpis | schedule | handler-specific | 200 | data.per_activity[] | ABSENT |
| /api/schedule/schedule/s-curve | schedule | handler-specific | 200 | data[] | ABSENT |
| /api/schedule/schedule/alerts | schedule | shared pagination | 200 | data[] | 0 |
| /api/schedule/schedule/milestones | schedule | shared pagination | 200 | data[] | 0 |
| /api/schedule/baselines | schedule | shared pagination | 200 | data[] | 0 |
| /api/reports/catalog | reports | handler-specific | 200 | data.reports[] | ABSENT |
| /api/reports/data/:reportKey | reports | shared pagination | 200 | data.columns[], data.rows[] | 1 |
| /api/reports/export/:reportKey | reports | service list; inspect service | 200 | no array observed | ABSENT |
| /api/reports/saved-views | reports | shared pagination | 200 | data[] | 0 |
| /api/reports/scheduled | reports | shared pagination | 200 | data[] | 0 |
| /api/reports/project-report/:projectId | reports | handler-specific | 200 | data.sections[] | ABSENT |
| /api/reports/project-report/:projectId/pdf | reports | handler-specific | 200 | no array observed | ABSENT |
| /api/handover/process/:projectId | handover | handler-specific | 200 | no array observed | ABSENT |
| /api/handover/package/:projectId | handover | handler-specific | 200 | data.items[] | ABSENT |
| /api/handover/assets | handover | shared pagination | 200 | data[] | 0 |
| /api/handover/assets/:id/documents | handover | shared pagination | 403 | no array observed | ABSENT |
| /api/handover/warranties | handover | shared pagination | 200 | data[] | 0 |
| /api/handover/claims | handover | shared pagination | 200 | data[] | 0 |
| /api/handover/claims/:id/sla | handover | handler-specific | 403 | no array observed | ABSENT |
| /api/handover/checklist/:projectId/pdf | handover | handler-specific | 200 | no array observed | ABSENT |
| /api/handover/assets/:projectId/pdf | handover | handler-specific | 200 | no array observed | ABSENT |
| /api/handover/warranty-register/:projectId/pdf | handover | handler-specific | 200 | no array observed | ABSENT |
| /api/handover/certificate/:projectId/pdf | handover | handler-specific | 200 | no array observed | ABSENT |
| /api/docs/categories | docs | handler-specific | 200 | data[] | ABSENT |
| /api/docs/documents | docs | shared pagination | 200 | data[] | 0 |
| /api/docs/documents/:id | docs | handler-specific | 403 | no array observed | ABSENT |
| /api/docs/rfis | docs | shared pagination | 200 | data[] | 0 |
| /api/docs/submittals | docs | shared pagination | 200 | data[] | 0 |
| /api/docs/registers | docs | shared pagination | 200 | data[] | 0 |
| /api/docs/documents/:id/revisions | docs | shared pagination | 403 | no array observed | ABSENT |
| /api/docs/transmittal-recipients | docs | shared pagination | 200 | data[] | 0 |
| /api/docs/transmittals | docs | shared pagination | 200 | data[] | 0 |
| /api/docs/transmittals/:id | docs | handler-specific | 403 | no array observed | ABSENT |
| /api/docs/transmittals/:id/pdf | docs | handler-specific | 403 | no array observed | ABSENT |
| /api/docs/correspondence | docs | shared pagination | 200 | data[] | 0 |
| /api/docs/correspondence/:id | docs | handler-specific | 403 | no array observed | ABSENT |
| /api/docs/correspondence/:id/pdf | docs | handler-specific | 403 | no array observed | ABSENT |
| /api/docs/numbering/:project_id | docs | handler-specific | 200 | no array observed | ABSENT |
| /api/docs/search | docs | shared pagination | 200 | data[] | 0 |
| /api/sales/buildings | sales | shared pagination | 200 | data[] | 0 |
| /api/sales/buildings/:buildingId/units | sales | shared pagination | 403 | no array observed | ABSENT |
| /api/sales/summary | sales | handler-specific | 200 | data.client_breakdown[] | ABSENT |
| /api/actions/:id/comments | actions | handler-specific | 403 | no array observed | ABSENT |
| /api/actions/my | actions | service list; inspect service | 200 | no array observed | ABSENT |
| /api/notifications | notifications | shared pagination | 200 | data[] | 0 |
| /api/notifications/deliveries | notifications | shared pagination | 200 | data[] | 0 |
| /api/notifications/preferences | notifications | handler-specific | 200 | data[] | ABSENT |
| /api/locations/project/:projectId | locations | shared pagination | 200 | data[] | 0 |
| /api/locations/:id | locations | handler-specific | 403 | no array observed | ABSENT |
| /api/quantities/allocations/:boqItemId | quantities | shared pagination | 403 | no array observed | ABSENT |
| /api/quantities/measurements | quantities | shared pagination | 200 | data[] | 0 |
| /api/quantities/progress/project/:projectId | quantities | handler-specific | 200 | data.items[] | ABSENT |
| /api/quantities/progress/location/:locationId | quantities | handler-specific | 403 | no array observed | ABSENT |
| /api/quantities/locations/:locationId/dashboard | quantities | handler-specific | 403 | no array observed | ABSENT |
| /api/materials/recipes | materials | shared pagination | 200 | data[] | 0 |
| /api/materials/recipes/:id | materials | handler-specific | 403 | no array observed | ABSENT |
| /api/materials/requirements | materials | shared pagination | 200 | data[] | 0 |
| /api/materials/replenishment/alerts | materials | shared pagination | 200 | data[] | 0 |
| /api/materials/replenishment/policies | materials | shared pagination | 200 | data[] | 24 |
| /api/materials/replenishment/open-requirements | materials | shared pagination | 200 | data[] | 0 |
| /api/procurement/project/:projectId | procurement | shared pagination | 200 | data.purchase_requests[], data.rfqs[], data.purchase_orders[], data.deliveries[], data.material_inspection_requests[], data.goods_receipt_notes[] | 3 |
| /api/procurement/rfq/:id/comparison | procurement | handler-specific | 403 | no array observed | ABSENT |
| /api/procurement/rfq/:id/quotations/vendor/:supplierId | procurement | shared pagination | 403 | no array observed | ABSENT |
| /api/procurement/rfq | procurement | shared pagination | 200 | data[] | 3 |
| /api/procurement/rfq/:id | procurement | handler-specific | 403 | no array observed | ABSENT |
| /api/procurement/award-recommendations | procurement | handler-specific | 200 | data[] | ABSENT |
| /api/procurement/award-recommendations/:id | procurement | handler-specific | 403 | no array observed | ABSENT |
| /api/procurement/invoices/:id/workflow | procurement | handler-specific | 403 | no array observed | ABSENT |
| /api/procurement/invoices | procurement | shared pagination | 200 | data[] | 0 |
| /api/procurement/pr/:id | procurement | handler-specific | 403 | no array observed | ABSENT |
| /api/procurement/po/:id | procurement | handler-specific | 403 | no array observed | ABSENT |
| /api/procurement/analytics/spend | procurement | handler-specific | 200 | data.rows[] | ABSENT |
| /api/procurement/analytics/vendor-performance | procurement | handler-specific | 200 | data.rows[] | ABSENT |
| /api/procurement/documents/pr/:id | procurement | handler-specific | 403 | no array observed | ABSENT |
| /api/procurement/documents/po/:id | procurement | handler-specific | 403 | no array observed | ABSENT |
| /api/procurement/documents/grn/:id | inventory | handler-specific | 403 | no array observed | ABSENT |
| /api/procurement/documents/:kind/:id | procurement | handler-specific | 404 | no array observed | ABSENT |
| /api/commercial/contracts/:projectId | commercial | shared pagination | 200 | data[] | 0 |
| /api/commercial/variations/:projectId | commercial | shared pagination | 200 | data[] | 0 |
| /api/commercial/project/:projectId/commercial | commercial | handler-specific | 200 | no array observed | ABSENT |
| /api/commercial/project/:projectId/legacy-snapshots | commercial | shared pagination | 200 | data[] | 0 |
| /api/commercial/contracts/:contractId/parties | commercial | service list; inspect service | 403 | no array observed | ABSENT |
| /api/commercial/subcontracts/:contractId/parties | commercial | service list; inspect service | 403 | no array observed | ABSENT |
| /api/commercial/guarantees | commercial | service list; inspect service | 200 | data[] | ABSENT |
| /api/commercial/guarantees/:id | commercial | handler-specific | 403 | no array observed | ABSENT |
| /api/commercial/insurances | commercial | service list; inspect service | 200 | data[] | ABSENT |
| /api/commercial/insurances/:id | commercial | handler-specific | 403 | no array observed | ABSENT |
| /api/commercial/currency-rates/convert | commercial | handler-specific | 400 | no array observed | ABSENT |
| /api/commercial/currency-rates | commercial | service list; inspect service | 200 | data[] | ABSENT |
| /api/commercial/payment-applications | commercial | service list; inspect service | 200 | data[] | ABSENT |
| /api/commercial/payment-applications/:id | commercial | handler-specific | 403 | no array observed | ABSENT |
| /api/commercial/payment-certificates | commercial | shared pagination | 200 | data[] | 0 |
| /api/commercial/project/:projectId/budget-versions | commercial | service list; inspect service | 200 | data[] | ABSENT |
| /api/commercial/budget-versions/:id | commercial | handler-specific | 403 | no array observed | ABSENT |
| /api/commercial/project/:projectId/forecast-versions | commercial | service list; inspect service | 200 | data[] | ABSENT |
| /api/commercial/forecast-versions/:id | commercial | handler-specific | 403 | no array observed | ABSENT |
| /api/commercial/project/:projectId/commitments | commercial | service list; inspect service | 200 | data[] | ABSENT |
| /api/commercial/commitments/:id | commercial | handler-specific | 403 | no array observed | ABSENT |
| /api/finance-ledger/retention/releases | finance-ledger | service list; inspect service | 200 | data[] | ABSENT |
| /api/finance-ledger/retention | finance-ledger | handler-specific | 200 | no array observed | ABSENT |
| /api/finance-ledger/ap-review | finance-ledger | shared pagination | 200 | data[] | 0 |
| /api/finance-ledger/cash-flow | finance-ledger | handler-specific | 200 | no array observed | ABSENT |
| /api/finance-ledger/company-dashboard | finance-ledger | handler-specific | 200 | data.project_margins[] | ABSENT |
| /api/finance-ledger/tax-codes | finance-ledger | shared pagination | 200 | data[] | 4 |
| /api/finance-ledger/audit/:entityType/:entityId | finance-ledger | shared pagination | 200 | data[] | 0 |
| /api/finance-ledger/credit-notes | finance-ledger | service list; inspect service | 200 | data[] | ABSENT |
| /api/finance-ledger/credit-notes/:id | finance-ledger | handler-specific | 403 | no array observed | ABSENT |
| /api/finance-ledger/payment-batches | finance-ledger | service list; inspect service | 200 | data[] | ABSENT |
| /api/finance-ledger/payment-batches/:id | finance-ledger | handler-specific | 404 | no array observed | ABSENT |
| /api/finance-ledger/account-mappings | finance-ledger | service list; inspect service | 200 | data.mappings[], data.accounts[] | ABSENT |
| /api/consultant/projects | consultant | shared pagination | 200 | data[] | 0 |
| /api/consultant/dashboard | consultant | handler-specific | 200 | data.projects[], data.project_ids[] | ABSENT |
| /api/consultant/reviews | consultant | shared pagination | 200 | data[] | 0 |
| /api/consultant/rfis/:id/responses | consultant | shared pagination | 403 | no array observed | ABSENT |
| /api/consultant/submittals/:id/revisions | consultant | shared pagination | 403 | no array observed | ABSENT |
| /api/client-portal/projects | client-portal | shared pagination | 200 | data[] | 0 |
| /api/client-portal/portfolio | client-portal | handler-specific | 200 | data.items[] | ABSENT |
| /api/client-portal/dashboard | client-portal | handler-specific | 200 | data.setup_actions[], data.setup_action_keys[], data.projects[] | ABSENT |
| /api/client-portal/action-center | client-portal | handler-specific | 200 | no array observed | ABSENT |
| /api/portal/subcontractor/dashboard | portal | handler-specific | 200 | data.packages[], data.project_ids[], data.setup_actions[], data.setup_action_keys[] | ABSENT |
| /api/portal/subcontractor/contracts/:id | portal | handler-specific | 404 | no array observed | ABSENT |
| /api/portal/subcontractor/submissions | portal | handler-specific | 400 | no array observed | ABSENT |
| /api/portal/supplier/dashboard | portal | handler-specific | 200 | data.setup_actions[], data.setup_action_keys[] | ABSENT |
| /api/portal/supplier/rfqs/:id | portal | handler-specific | 404 | no array observed | ABSENT |
| /api/portal/supplier/purchase-orders/:id | portal | handler-specific | 404 | no array observed | ABSENT |
| /api/organizations | organizations | service list; inspect service | 200 | data[] | 42 |
| /api/organizations/company | organizations | service list; inspect service | 200 | data[] | ABSENT |
| /api/organizations/departments | organizations | service list; inspect service | 200 | data[] | 4 |
| /api/organizations/job-positions | organizations | service list; inspect service | 200 | data[] | 3 |
| /api/organizations/qualifications | organizations | service list; inspect service | 200 | data[] | 0 |
| /api/organizations/bank-accounts | organizations | service list; inspect service | 200 | data[] | 5 |
| /api/organizations/performance-scores | organizations | service list; inspect service | 200 | data[] | 1 |
| /api/organizations/team | team | service list; inspect service | 200 | data[] | 1 |
| /api/organizations/:id | organizations | handler-specific | 404 | no array observed | ABSENT |
| /api/delegations | delegations | service list; inspect service | 200 | data[] | ABSENT |
| /api/team | team | shared pagination | 200 | data[] | 1 |
| /api/v1/health | v1 | v1 envelope | 200 | no array observed | ABSENT |
| /api/v1/openapi.json | v1 | v1 envelope | 200 | no array observed | ABSENT |
| /api/v1/ops/metrics | v1 | v1 envelope | 200 | no array observed | ABSENT |
| /api/v1/webhooks | v1 | shared pagination | 200 | data[] | 7 |
| /api/v1/webhooks/:id | v1 | v1 envelope | 404 | no array observed | ABSENT |
| /api/v1/webhooks/:id/deliveries | v1 | shared pagination | 200 | data[] | 0 |
| /api/v1/organizations | v1 | v1 envelope | 200 | data[] | 42 |
| /api/v1/organizations/:id | v1 | v1 envelope | 404 | no array observed | ABSENT |
| /api/v1/purchase-requisitions | v1 | v1 envelope | 200 | data[] | 91 |
| /api/v1/purchase-requisitions/:id | v1 | v1 envelope | 404 | no array observed | ABSENT |
| /api/v1/purchase-orders | v1 | v1 envelope | 200 | data[] | 68 |
| /api/v1/purchase-orders/:id | v1 | v1 envelope | 404 | no array observed | ABSENT |
| /api/v1/deliveries | v1 | v1 envelope | 200 | data[] | 27 |
| /api/v1/deliveries/:id | v1 | v1 envelope | 404 | no array observed | ABSENT |
| /api/v1/grns | v1 | v1 envelope | 200 | data[] | 6 |
| /api/v1/grns/:id | v1 | v1 envelope | 404 | no array observed | ABSENT |
| /api/v1/payment-certificates | v1 | v1 envelope | 200 | data[] | 20 |
| /api/v1/payment-certificates/:id | v1 | v1 envelope | 404 | no array observed | ABSENT |
| /api/v1/observations | v1 | v1 envelope | 200 | data[] | 10 |
| /api/v1/assistants/:assistant/summary | v1 | v1 envelope | 404 | no array observed | ABSENT |
| /api/v1/companies/ | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/companies/:id | v1 | v1 envelope | 404 | no array observed | ABSENT |
| /api/v1/users/ | v1 | v1 envelope | 200 | data[] | 135 |
| /api/v1/users/:id | v1 | v1 envelope | 404 | no array observed | ABSENT |
| /api/v1/projects/ | v1 | v1 envelope | 200 | data[] | 1 |
| /api/v1/projects/portfolio | v1 | v1 envelope | 200 | data[] | 1 |
| /api/v1/projects/:id | v1 | v1 envelope | 400 | no array observed | ABSENT |
| /api/v1/projects/:projectId/locations | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/projects/:id/settings | v1 | v1 envelope | 400 | no array observed | ABSENT |
| /api/v1/projects/:id/calendars | v1 | v1 envelope | 400 | no array observed | ABSENT |
| /api/v1/projects/:id/wbs | v1 | v1 envelope | 400 | no array observed | ABSENT |
| /api/v1/projects/:id/work-packages | v1 | v1 envelope | 400 | no array observed | ABSENT |
| /api/v1/work-packages/:projectId/work-packages | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/boq/:projectId/sections | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/boq/:projectId/items | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/boq/:projectId/summary | v1 | v1 envelope | 200 | data.by_type[] | ABSENT |
| /api/v1/quantities/measurements | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/quantities/allocations/:boqItemId | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/quantities/progress/project/:projectId | v1 | v1 envelope | 200 | data.items[] | ABSENT |
| /api/v1/quantities/progress/location/:locationId | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/quantities/locations/:locationId/dashboard | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/materials/ | v1 | v1 envelope | 200 | data[] | 279 |
| /api/v1/materials/categories | v1 | v1 envelope | 200 | data.categories[], data.units[] | ABSENT |
| /api/v1/materials/recipes | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/materials/requirements | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/materials/replenishment/alerts | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/materials/replenishment/policies | v1 | v1 envelope | 200 | data[] | 24 |
| /api/v1/materials/replenishment/open-requirements | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/materials/:id | v1 | v1 envelope | 404 | no array observed | ABSENT |
| /api/v1/materials/:id/suppliers | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/materials/recipes/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/inventory/lots | v1 | v1 envelope | 200 | data[] | 13 |
| /api/v1/inventory/lots/expiring | v1 | v1 envelope | 200 | data[] | 6 |
| /api/v1/inventory/conversions | v1 | v1 envelope | 200 | data[] | 8 |
| /api/v1/inventory/conversions/convert | v1 | v1 envelope | 400 | no array observed | ABSENT |
| /api/v1/inventory/issues | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/inventory/returns | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/inventory/adjustments | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/inventory/warehouses | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/inventory/transfers | v1 | v1 envelope | 200 | data[] | 7 |
| /api/v1/inventory/reservations | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/inventory/lots/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/inventory/issues/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/inventory/returns/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/inventory/adjustments/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/inventory/warehouses/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/inventory/warehouses/:id/movements | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/rfqs/award-recommendations | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/rfqs/ | v1 | v1 envelope | 200 | data[] | 3 |
| /api/v1/rfqs/award-recommendations/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/rfqs/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/rfqs/:id/comparison | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/rfqs/:id/quotations/vendor/:supplierId | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/purchase-orders/analytics/spend | v1 | v1 envelope | 200 | data.rows[] | ABSENT |
| /api/v1/purchase-orders/analytics/vendor-performance | v1 | v1 envelope | 200 | data.rows[] | ABSENT |
| /api/v1/supplier-invoices/:id/workflow | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/approvals/stale | v1 | v1 envelope | 200 | data.rows[] | ABSENT |
| /api/v1/contracts/:projectId | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/contracts/projects/:projectId | v1 | v1 envelope | 200 | no array observed | ABSENT |
| /api/v1/contracts/:contractId/parties | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/guarantees/ | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/guarantees/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/insurances/ | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/insurances/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/currency-rates/convert | v1 | v1 envelope | 400 | no array observed | ABSENT |
| /api/v1/currency-rates/ | v1 | v1 envelope | 200 | data[] | 4 |
| /api/v1/payment-applications/ | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/payment-applications/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/budgets/projects/:projectId | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/budgets/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/forecasts/projects/:projectId | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/forecasts/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/commitments/projects/:projectId | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/commitments/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/credit-notes/ | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/credit-notes/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/payment-batches/ | v1 | v1 envelope | 200 | data[] | 21 |
| /api/v1/payment-batches/:id | v1 | v1 envelope | 404 | no array observed | ABSENT |
| /api/v1/subcontracts/subcontractor/submissions | v1 | v1 envelope | 400 | no array observed | ABSENT |
| /api/v1/subcontracts/:projectId | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/subcontracts/:contractId/parties | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/subcontracts/:contractId/verifications | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/subcontracts/:contractId/certificates | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/variations/:projectId | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/payment-certificates/:contractId | v1 | v1 envelope | 404 | no array observed | ABSENT |
| /api/v1/invoices/ | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/invoices/retention | v1 | v1 envelope | 200 | no array observed | ABSENT |
| /api/v1/invoices/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/payments/ | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/daily-reports/:projectId | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/daily-reports/:projectId/:date | v1 | v1 envelope | 404 | no array observed | ABSENT |
| /api/v1/site-visits/:projectId | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/rfis/ | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/rfis/:id/responses | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/submittals/ | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/submittals/:id/revisions | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/inspections/ | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/inspections/safety | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/ncrs/ | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/ncrs/:id/pdf | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/documents/ | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/documents/search | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/documents/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/documents/:id/revisions | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/transmittals/ | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/transmittals/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/schedule/calendars | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/schedule/activities | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/schedule/relationships | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/schedule/cpm | v1 | v1 envelope | 200 | data.activities[] | ABSENT |
| /api/v1/schedule/lookahead | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/schedule/delayed | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/schedule/kpis | v1 | v1 envelope | 200 | data.per_activity[] | ABSENT |
| /api/v1/schedule/s-curve | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/schedule/alerts | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/schedule/milestones | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/schedule/baselines | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/schedule/activities/:id | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/actions/my | v1 | v1 envelope | 200 | no array observed | ABSENT |
| /api/v1/actions/:id/comments | v1 | v1 envelope | 403 | no array observed | ABSENT |
| /api/v1/notifications/ | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/notifications/preferences | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/reports/catalog | v1 | v1 envelope | 200 | data.reports[] | ABSENT |
| /api/v1/reports/saved-views | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/reports/scheduled | v1 | v1 envelope | 200 | data[] | 0 |
| /api/v1/reports/:reportKey/data | v1 | v1 envelope | 200 | data.columns[], data.rows[] | 1 |
| /api/v1/reports/:reportKey/export | v1 | v1 envelope | 200 | no array observed | ABSENT |
| /api/mcp | mcp | handler-specific | 405 | no array observed | ABSENT |
| /api/agent/tokens | agent | shared pagination | 200 | data[] | 0 |
| /api/agent/sessions | agent | shared pagination | 200 | data[] | 8 |
| /api/agent/activity | agent | shared pagination | 200 | data[] | 3 |
| /api/agent/requests | agent | shared pagination | 200 | data[] | 0 |
| /api/health | root | handler-specific | 200 | no array observed | ABSENT |
