# Phases 9-18 acceptance review: NO-GO for the next phase

Reviewed 2026-09-19 against `ERP_EXPANSION_PLAN.html` and `ERP_BUILD_PROMPTS.html`. This is the current result after corrective work in the working tree, not a review of the original commits alone. Phase numbers follow the build prompts. The configured ERP database was not migrated or changed by the review.

## Verified corrections

- Phase 9: material consumption is deducted once across locations, and recipe quantities convert into the item unit (including kg-to-ton rebar).
- Phase 10: transfer/issue transaction adapters are callable; MIR rejection does not release quarantine; reversal preserves physical stock; expired reservations are excluded from the projection.
- Phase 11: both scheduler entry points receive their query dependency; replenishment accounts for PO lines and partial deliveries without counting a header and its lines twice; MOQ/multiple rounding respects shelf and storage caps; generated drafts include procurement lines.
- Phase 12: MIR decisions handle each material line and rejected quantity; the main HTTP multi-write procurement routes use transactions; quotations must come from an invited supplier and cover the RFQ's own lines. All procurement template PDF renderers now have authenticated internal download routes.
- Phase 13: client revenue excludes subcontract variations; commitment syncing updates amended/cancelled sources; variation and finance adapters use transactions.
- Phase 14: valuation creation works on the migrated schema, three 100-value periods certify 300 cumulatively, allocations reject repeated targets over outstanding, legacy invoice-linked payments now allocate transactionally, and an idempotent historical allocation backfill is available in `migrate-27-finance.js`.
- Phase 15: daily-report sources filter by project, and the site photo action uploads a real image before recording metadata.
- Phases 16-18: portal grants and role-specific frontend routes exist; external roles are limited to their own portal path plus scoped upload; consultant record mutations check assignment and authority; consultant organization identity is resolved server-side; ordered RFI/submittal stages, requester acknowledgement, closure, and revision resubmission are enforced; client documents/variations and subcontractor/supplier dashboards use tighter visibility and assignment filters; client preview has a signed project scope and can display setup actions when no client is assigned.

## Verification performed

- Backend Jest: 24 suites, 697 tests passed.
- Frontend production build: passed. Two existing unused-variable warnings remain in `Clients.js` and `Expenses.js`.
- Disposable PostgreSQL: ran the harness both on a schema-only copy and on a full temporary copy of the configured database. The nine applicable phase migrations passed twice in each copy (18 passes per run). The latest full-copy run recorded 40 checks, zero failures, including ordered RFI/submittal revisions and the new upload-registry migration; it backfilled two pre-existing invoice-linked payments plus one synthetic payment, was idempotent on its second pass, and found no payment/invoice over-allocation. Both disposable databases were removed. This does not prove a live upgrade or a full HTTP workflow.
- `git diff --check`: clean. No browser E2E, mobile viewport, or concurrent-request load test has been run.

| Phase | Current review result |
|---|---|
| 9 Material planning | Calculation and unit regressions fixed; targeted unit and PostgreSQL checks pass. |
| 10 Inventory | Ledger, MIR, transfer, reversal, and reservation defects fixed; targeted checks pass. |
| 11 Replenishment | Scheduler, PO-line integration, and hard-cap defects fixed; targeted checks pass. |
| 12 Procurement | Service chain and PDF generation tests pass; real HTTP/PostgreSQL and browser gate remains. |
| 13 Commercial | Forecast and commitment regressions fixed; targeted checks pass. |
| 14 Finance | Valuation and allocation regressions fixed; full-copy backfill reconciles; staging gate remains. |
| 15 Site | Project filtering and real photo upload fixed; browser journey remains. |
| 16 Consultant | Assignment/organization checks, portal page, and ordered RFI/submittal stages added; full browser review/rectification journey remains. |
| 17 Client | Safe dashboard, portfolio, preview and setup states added; browser/tenant-file gate remains. |
| 18 Subcontractor/supplier | Scope/dashboard regressions fixed and portal actions wired and upload delivery scoped; formal register integration and browser gate remain. |

## Outstanding acceptance blockers

1. **Phase 12 procurement gate:** the service-level PR -> RFQ -> three quotes -> award -> PO -> partial delivery -> MIR -> GRN -> stock issue test passes, and an internal comparison screen plus catalog PDF routes are wired. No equivalent real HTTP/PostgreSQL scenario or browser check has been run.
2. **Phase 16 portal workflow UI:** the RFI/submittal service now enforces stage order and revision resubmission, but the consultant and subcontractor pages now offer actions for review, acknowledgement, and resubmission, but use prompt-based controls and do not offer complete stage-specific forms. The full workflow has not been exercised through a browser with the distinct PM, consultant, and subcontractor accounts.
3. **Phase 17/18 portal usability:** multi-project client portfolios appear first, and the subcontractor/supplier pages now expose the requested submission buttons. Several actions still use browser prompts rather than complete forms. Generic subcontractor WIR/MIR, manpower, equipment, NCR, observation, and variation submissions are review-queue records rather than entries in their formal registers. The required full-data, no-assignment, multi-project, expired-assignment, forbidden-field, and mobile browser journeys have not been exercised end to end.
4. **Staging reconciliation:** the configured ERP database lacks several phase 9-18 tables and has not had these migrations applied. A temporary full-data copy migrated successfully and reconciled the invoice-linked payment allocations, but there is no designated staging upgrade or signed-off before/after reconciliation for stock, AR/AP, commitments, and documents.
5. **Concurrency/ownership edge cases:** row locks protect allocation endpoints, but simultaneous procurement numbers, certificate numbers, and cross-service changes have not been load-tested. A subcontractor quantity claim is checked against the package project, but the schema does not yet bind every BOQ item to an awarded package. The public `/uploads` mount has been replaced by authenticated, resource-scoped delivery, and direct document/photo links now fetch with credentials. This path has unit coverage but still needs distinct-account HTTP/browser verification.

**Decision:** Do not claim phases 9-18 fully accepted or give a blanket greenlight to start dependent phases. The corrected code is substantially safer and passes the targeted real-schema review, but the explicit phase gates above remain open. Apply migrations to a designated staging copy, reconcile historical data, finish the listed workflows/screens, and run the full browser and procurement scenarios before changing this decision.

Run the disposable review harness from `backend` with `node src/scripts/review-phases-09-18.cjs` (schema only) or append `--with-data` for a temporary full-data copy. It requires PostgreSQL utilities and create/drop-database rights; `PG_REVIEW_BIN` overrides the utility directory. It never migrates the configured ERP database.
