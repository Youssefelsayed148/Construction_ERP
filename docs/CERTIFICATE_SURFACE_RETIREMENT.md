# Payment certificate surface retirement

Status: open; no certificate data or schema was changed by this investigation.

## Current surfaces

- `migrate-4.js` creates the legacy `sub_payment_certificates` table with the original `work_value`, `retention_deduction`, `previous_paid`, `penalties`, `materials_deducted`, and `net_payable` columns.
- `commercial-migration.js` creates the shared `payment_certificates` table with party type, project/contract links, gross/retention/advance/tax/cumulative values, and a different amount model.
- `createTransitionView()` creates `v_sub_payment_certificates` from the shared table and aliases some fields. It does not replace or expose the legacy table.
- `routes/subcontractors.js` still lists, creates, and updates records in `sub_payment_certificates`.
- `services/costEventListener.js` reads that legacy table when posting subcontractor payment costs; `services/policy.js` derives project scope from it.
- Current canonical clients include `portalEngine.js`, `commercialRecords.js`, consultant flows, and the commercial API.

## Disposable database evidence

The read-only inspection of Docker Desktop PostgreSQL 16 database `construction_erp_test` on loopback port 55441 found 62 rows in `payment_certificates`, 28 rows in `sub_payment_certificates`, and 17 rows in `v_sub_payment_certificates`. No certificate-number collision was found between the two base tables. These are retained test fixtures, not restored production data, and are not an acceptance result.

## Why the table cannot be removed in this slice

The two tables encode different financial fields and callers still depend on legacy row IDs for route access, scope checks, and cost-event source IDs. In particular, mapping `materials_deducted` to canonical `advance_recovery`, or `penalties` to `other_deductions`, would assume equivalent accounting meaning without evidence. The existing view is not a compatibility view over legacy rows. Renaming or dropping the old table would also violate the repository's additive-only migration rule.

## Safe next action

Before a cutover, design an additive migration (next migration number 0065) that explicitly maps each legacy certificate to a canonical row while retaining its legacy identifier and original financial snapshot. Validate number/contract matching against a restored real-data copy, define idempotency and collision handling, and update the legacy route, project-scope policy, and cost listener to resolve the mapping transactionally. Keep legacy reads available until parity is signed off. Do not equate financial fields by column name alone, rewrite or delete historical rows, or drop the old table under the current migration rule.

The Phase 8 duplicate-surface checkbox stays open until this compatibility design is reviewed, implemented additively, and verified against restored real data. This document is investigation evidence, not a cutover approval.
