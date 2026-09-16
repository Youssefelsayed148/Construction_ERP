# 26 - Test and Acceptance Standard

## Required test layers
1. Unit tests - calculations and state rules
2. Integration tests - domain-service interactions
3. Permission tests - every internal/external role
4. API contract tests
5. Workflow tests
6. Financial reconciliation tests
7. Inventory reconciliation tests
8. E2E browser tests
9. Mobile viewport tests
10. Empty-state/error-state tests
11. MCP permission/action tests
12. Performance/load tests for large project registers

## Golden E2E scenario
Run one seeded project through:
Tender/Award -> Project Wizard -> Team/Participants -> WBS/Locations -> BOQ/Budget -> Quantity Allocation -> Material Demand -> Auto PR -> RFQ -> PO -> Delivery -> MIR -> GRN -> Stock -> Issue -> Work -> WIR -> Consultant Observation -> Rectification -> Approval -> Progress -> Payment Certificate -> Invoice -> Collection -> Variation -> Subcontract Certificate -> Handover -> Warranty.

## Mandatory reconciliation assertions
- sum location quantity allocations equals BOQ planned quantity or shows controlled exception
- inventory subledger equals balance
- GRN accepted quantity never exceeds allowed PO/delivery tolerance
- invoice allocations never exceed payment
- certificate cumulative values never double count
- project budget/commitment/actual/forecast calculations reconcile to source transactions

## Portal acceptance
For Client, Consultant, Subcontractor and Supplier portals test:
- no assigned project
- project with zero records
- one project
- multiple projects
- expired assignment
- forbidden financial field
- mobile viewport

## Failure policy
No release with critical/financial/security test failures.
