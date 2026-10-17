# Batch 5A S-006 missing-header classification - 2026-10-17

Static classification of all 81 observed array-bearing GET responses with no X-Total-Count in the existing 448-GET inventory: **class (a) 38; class (b) 43**. This is not a fresh sweep or a declaration that capped financial registers are small lookups.

Class (a): a paginated/growing register with a missing header/count contract. Each row is a LOW candidate unless and until a tested fix is recorded. v1 top-level arrays are classified (a) because middleware/v1.js actually paginates them, even when the internal lookup returns a complete catalog. Class (b): bounded lookups/settings, or nested arrays/analytics in a single response where a single count header is not intended.

Evidence: middleware/v1.js normalizeResponses/applyListQuery; services/inventoryDocuments.js:125 (limit/offset); services/awardService.js:53 (cap 200); services/commercialRecords.js:84,128,171,210 (register caps); services/budgeting.js:59,145,181; services/financeDocuments.js:48,163 (cap 200); services/financeReleases.js:66 (cap 200); services/orgService.js:305 (delegation list); routes/organizations.js:108 (single-company settings). All class (a) rows remain candidates at this documentation checkpoint; no header fix is claimed yet.

| Route | Class | Reason / LOW candidate if (a) |
|---|---|---|
| /api/users/preview/roles | (b) intended | Complete bounded vocabulary, settings or lookup response intended to be consumed together; no document pagination contract. |
| /api/approvals/stale | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/dashboard/alerts | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/dashboard/role | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/items/categories | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/suppliers/specialties | (b) intended | Complete bounded vocabulary, settings or lookup response intended to be consumed together; no document pagination contract. |
| /api/expenses/categories | (b) intended | Complete bounded vocabulary, settings or lookup response intended to be consumed together; no document pagination contract. |
| /api/assets/categories | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/hr/laborers/skills | (b) intended | Complete bounded vocabulary, settings or lookup response intended to be consumed together; no document pagination contract. |
| /api/projects/templates | (b) intended | Complete bounded vocabulary, settings or lookup response intended to be consumed together; no document pagination contract. |
| /api/inventory/conversions | (b) intended | Complete bounded vocabulary, settings or lookup response intended to be consumed together; no document pagination contract. |
| /api/inventory/issues | (a) LOW | Growing document/configuration register; some services cap results or accept limit/offset without a matching total. Needs count/filter/page consistency, not rows.length on a truncated page. |
| /api/inventory/returns | (a) LOW | Growing document/configuration register; some services cap results or accept limit/offset without a matching total. Needs count/filter/page consistency, not rows.length on a truncated page. |
| /api/inventory/adjustments | (a) LOW | Growing document/configuration register; some services cap results or accept limit/offset without a matching total. Needs count/filter/page consistency, not rows.length on a truncated page. |
| /api/boq/summary/:projectId | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/costing/project/:projectId | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/costing/project/:projectId/summary | (b) intended | Complete bounded vocabulary, settings or lookup response intended to be consumed together; no document pagination contract. |
| /api/schedule/schedule/cpm | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/schedule/schedule/kpis | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/schedule/schedule/s-curve | (b) intended | Complete time-series analysis, not a document register; v1 top-level normalization is classified separately. |
| /api/reports/catalog | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/reports/project-report/:projectId | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/handover/package/:projectId | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/docs/categories | (b) intended | Complete bounded vocabulary, settings or lookup response intended to be consumed together; no document pagination contract. |
| /api/sales/summary | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/notifications/preferences | (b) intended | Complete bounded vocabulary, settings or lookup response intended to be consumed together; no document pagination contract. |
| /api/quantities/progress/project/:projectId | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/procurement/award-recommendations | (a) LOW | Growing document/configuration register; some services cap results or accept limit/offset without a matching total. Needs count/filter/page consistency, not rows.length on a truncated page. |
| /api/procurement/analytics/spend | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/procurement/analytics/vendor-performance | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/commercial/guarantees | (a) LOW | Growing document/configuration register; some services cap results or accept limit/offset without a matching total. Needs count/filter/page consistency, not rows.length on a truncated page. |
| /api/commercial/insurances | (a) LOW | Growing document/configuration register; some services cap results or accept limit/offset without a matching total. Needs count/filter/page consistency, not rows.length on a truncated page. |
| /api/commercial/currency-rates | (a) LOW | Growing document/configuration register; some services cap results or accept limit/offset without a matching total. Needs count/filter/page consistency, not rows.length on a truncated page. |
| /api/commercial/payment-applications | (a) LOW | Growing document/configuration register; some services cap results or accept limit/offset without a matching total. Needs count/filter/page consistency, not rows.length on a truncated page. |
| /api/commercial/project/:projectId/budget-versions | (a) LOW | Growing document/configuration register; some services cap results or accept limit/offset without a matching total. Needs count/filter/page consistency, not rows.length on a truncated page. |
| /api/commercial/project/:projectId/forecast-versions | (a) LOW | Growing document/configuration register; some services cap results or accept limit/offset without a matching total. Needs count/filter/page consistency, not rows.length on a truncated page. |
| /api/commercial/project/:projectId/commitments | (a) LOW | Growing document/configuration register; some services cap results or accept limit/offset without a matching total. Needs count/filter/page consistency, not rows.length on a truncated page. |
| /api/finance-ledger/retention/releases | (a) LOW | Growing document/configuration register; some services cap results or accept limit/offset without a matching total. Needs count/filter/page consistency, not rows.length on a truncated page. |
| /api/finance-ledger/company-dashboard | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/finance-ledger/credit-notes | (a) LOW | Growing document/configuration register; some services cap results or accept limit/offset without a matching total. Needs count/filter/page consistency, not rows.length on a truncated page. |
| /api/finance-ledger/payment-batches | (a) LOW | Growing document/configuration register; some services cap results or accept limit/offset without a matching total. Needs count/filter/page consistency, not rows.length on a truncated page. |
| /api/finance-ledger/account-mappings | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/consultant/dashboard | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/client-portal/portfolio | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/client-portal/dashboard | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/portal/subcontractor/dashboard | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/portal/supplier/dashboard | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/organizations/company | (b) intended | Complete bounded vocabulary, settings or lookup response intended to be consumed together; no document pagination contract. |
| /api/delegations | (a) LOW | Growing document/configuration register; some services cap results or accept limit/offset without a matching total. Needs count/filter/page consistency, not rows.length on a truncated page. |
| /api/v1/organizations | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/purchase-requisitions | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/purchase-orders | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/deliveries | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/grns | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/payment-certificates | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/observations | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/boq/:projectId/summary | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/v1/quantities/progress/project/:projectId | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/v1/materials/categories | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/v1/inventory/conversions | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/inventory/issues | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/inventory/returns | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/inventory/adjustments | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/rfqs/award-recommendations | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/purchase-orders/analytics/spend | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/v1/purchase-orders/analytics/vendor-performance | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/v1/approvals/stale | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/v1/guarantees/ | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/insurances/ | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/currency-rates/ | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/payment-applications/ | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/budgets/projects/:projectId | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/forecasts/projects/:projectId | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/commitments/projects/:projectId | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/credit-notes/ | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/payment-batches/ | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/schedule/cpm | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/v1/schedule/kpis | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
| /api/v1/schedule/s-curve | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/notifications/preferences | (a) LOW | v1 normalizer paginates top-level data and emits meta.total; missing matching header. Upstream service caps/offset totals still need route-specific verification. |
| /api/v1/reports/catalog | (b) intended | Nested arrays in a dashboard, summary, report, diagnostic or single-record aggregate; one collection total would be ambiguous. |
