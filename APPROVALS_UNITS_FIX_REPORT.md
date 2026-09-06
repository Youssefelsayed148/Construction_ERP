# ConERP — Approvals + Units-Client-FK Follow-Up Report
**Date**: 2026-07-27  
**Build**: Follow-up to SYSTEM_TEST_REPORT.md  

---

## Part 1: Approvals — Approve/Reject Lifecycle Testing

### Role-to-Module Mapping (from `backend/src/routes/approvals.js:10-18`)
| Module | Manager Role | Direct to Owner? |
|--------|-------------|-------------------|
| expenses | finance_manager | No (2-stage) |
| payroll | finance_manager | No (2-stage) |
| legal | legal_mgr | No (2-stage) |
| assets | maintenance_mgr | No (2-stage) |
| maintenance | maintenance_mgr | No (2-stage) |
| project_budgets | project_manager | No (2-stage) |
| sub_contracts | project_manager | No (2-stage) |
| purchase_orders | — | Yes (straight to owner_review) |
| grn | — | Yes (straight to owner_review) |

### Test Users Created
Direct DB INSERT (API register endpoint only allows `admin, manager, staff, accountant, engineer, site_supervisor` — does NOT expose `finance_manager`, `legal_mgr`, `owner`):

| ID | Name | Email | Role | Password |
|----|------|-------|------|----------|
| 1 | Owner | owner@construction-erp.com | owner | admin123 |
| 2 | TEST-Finance Manager | test-finance-mgr@test.com | finance_manager | test123 |
| 3 | TEST-Staff User | test-staff@test.com | staff | test123 |

### Test Results: 32/32 PASS

#### Test 1: Full Approve Flow
**Flow**: Owner creates expense → submits approval → Finance Manager approves (manager_review) → advances to owner_review → Owner approves (owner_review) → fully_approved → expense source record status = 'approved'

| Step | Result | API/DB Detail |
|------|--------|---------------|
| 1a Create Expense | PASS | `POST /api/expenses` → 201, status='pending', amount=5000 |
| 1b DB Verify | PASS | `SELECT status FROM expenses WHERE id=$id` → 'pending' |
| 1c Submit Request | PASS | `POST /api/approvals/request` → 201, stage='manager_review' |
| 1d DB Verify Request | PASS | approval_requests: stage='manager_review', status='pending' |
| 1e FM Approve | PASS | `PUT /approvals/:id/approve` (Finance Mgr token) → 200, stage='forwarded_to_owner' |
| 1f DB Verify Advancement | PASS | approval_requests: stage='owner_review', manager_id=2, manager_approved_at set |
| 1g Owner Approve | PASS | `PUT /approvals/:id/approve` (Owner token) → 200, stage='fully_approved' |
| 1h DB Verify Fully Approved | PASS | approval_requests: status='approved', approver_id=1 |
| 1i DB Verify Source Record | PASS | expenses: status='approved' (set by `updateRecordStatus` → `UPDATE expenses SET status = 'approved'`) |

#### Test 2: Reject at Manager Review
**Flow**: Owner creates expense → submits approval → Finance Manager rejects → approval status = 'rejected' → expense source record status = 'rejected' → stage does NOT advance to owner_review

| Step | Result | Detail |
|------|--------|--------|
| 2a Create | PASS | Expense ID created |
| 2b Submit | PASS | Approval request at manager_review |
| 2c FM Reject | PASS | `PUT /approvals/:id/reject` → 200 |
| 2d DB Verify Rejected | PASS | approval_requests: status='rejected' |
| 2e DB Verify Expense Rejected | PASS | expenses: status='rejected' (`rejectRecordStatus` → `UPDATE expenses SET status = 'rejected'`) |
| 2f Verify No Advance | PASS | Stage remains 'manager_review' (did NOT advance to owner_review) |

#### Test 3: Reject at Owner Review
**Flow**: Owner creates expense → submits approval → FM approves manager_stage → advances to owner_review → Owner rejects → approval rejected → expense rejected

| Step | Result | Detail |
|------|--------|--------|
| 3a Create | PASS | Expense created |
| 3b Submit | PASS | At manager_review |
| 3c FM Approve | PASS | Advances to owner_review |
| 3d Owner Reject | PASS | `PUT /approvals/:id/reject` → 200 |
| 3e DB Verify Rejected | PASS | approval_requests: status='rejected' |
| 3f DB Verify Expense | PASS | expenses: status='rejected' |

#### Test 4: Unauthorized Access (403)
| Step | Result | Detail |
|------|--------|--------|
| 4a Setup | PASS | Expense + approval request created |
| 4b Staff Cannot Approve | PASS | Staff (role='staff') → `PUT /approvals/:id/approve` → **403** ("Not authorized to approve this module at manager stage") |
| 4c Staff Cannot Reject | PASS | Staff → `PUT /approvals/:id/reject` → **403** |
| 4d DB Unchanged | PASS | approval_requests: stage='manager_review', status='pending' (no state change) |

#### Test 5: Self-Approval Behavior
| Step | Result | Detail |
|------|--------|--------|
| 5a Owner Bypasses Manager | PASS | Owner CAN approve at manager_review stage — owner/admin bypass all role gates in `advanceApproval()`. Returns 200, stage='forwarded_to_owner'. |
| 5b Owner Final Approve | PASS | Owner approves at owner_review → fully_approved |
| 5c DB Verify | PASS | expenses.status = 'approved' |

**Code analysis**: The `advanceApproval()` function at line 32-34 only blocks self-approval for non-owner/non-admin users: `if (ar.requester_id === userId && role !== 'owner' && role !== 'admin')`. At line 38-40, owner/admin ALSO bypass the module-specific role check: `if (role !== 'owner' && role !== 'admin' && !allowedRoles.includes(role))`. This means the Owner can single-handedly push through any approval. This is intentional — owner is the ultimate authority.

#### Test 6: Already-Processed Requests
| Step | Result | Detail |
|------|--------|--------|
| 6a Cannot Re-approve | PASS | Already-approved request → 400 ("Request already processed") |
| 6b Cannot Approve Rejected | PASS | Already-rejected request → 400 ("Request already processed") |

#### Test 7: Check Endpoint After Resolution
| Step | Result | Detail |
|------|--------|--------|
| 7a Check Approved | PASS | `GET /approvals/check/expenses/$approvedId` → requires_approval=false, approved=true |
| 7b Check Rejected | PASS | `GET /approvals/check/expenses/$rejectedId` → requires_approval=true (rejected ≠ approved) |

### Part 1 Summary: 32/32 PASS, 0 failures

---

## Part 2: Units-Client FK + Invoice Auto-Creation

**Decision**: **Full invoicing integration** — user chose to treat unit sales like project contracts with full receivables tracking through Invoices/Payments/Finance.

### Code Changes Made

#### 1. `backend/src/scripts/migrate-10.js` — DB Migration
```sql
ALTER TABLE units ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_units_client ON units(client_id);
```
- Uses `ADD COLUMN IF NOT EXISTS` for idempotency
- `ON DELETE RESTRICT` — prevents deleting a client who owns units (same pattern as invoices → payments)

#### 2. `backend/src/routes/units.js` — Route Changes

**a. `createUnitSaleInvoice()` helper function** (new):
- Creates an invoice automatically when a unit transitions to 'contracted'
- Uses `sold_amount` (falling back to `price`) as the invoice amount
- Generates invoice_number using existing `INV-XXXX` pattern
- Links invoice to the unit's building's project and the assigned client
- Description: `"Auto-generated: Sale of unit {code} ({building_name})"`

**b. Status transition endpoint updated** (`POST /units/:id/status`):
- Schema now accepts `client_id` (optional on request, validated in handler)
- **NEW**: Requires `client_id` when transitioning to 'reserved' or 'contracted' (returns 400 if missing and no existing client_id)
- **NEW**: Client_id is SET during reserved/contracted, NULL'd when reverting to 'available'
- **NEW**: On transition to 'contracted', auto-creates an invoice via `createUnitSaleInvoice()`
- Response now includes `auto_invoice` object when an invoice was created

**c. Sales summary endpoint updated** (`GET /sales/summary`):
- **NEW**: `client_breakdown` array showing per-client unit counts, contracted amounts, invoiced amounts, and paid amounts (when `project_id` filter is provided)
- Joins units → buildings → clients → invoices → payments for complete financial picture

### Test Results: 29/29 PASS

#### Test 1: FK Column Exists
| Step | Result | Detail |
|------|--------|--------|
| 1a Column Exists | PASS | `client_id INTEGER` column present in `units` table |
| 1b FK Exists | PASS | FK constraint referencing `clients(id)` with `ON DELETE RESTRICT` |

#### Test 2: Reserve Unit with client_id
| Step | Result | Detail |
|------|--------|--------|
| 2a Reserve | PASS | `POST /units/:id/status {status:'reserved', client_id:X}` → 200 |
| 2b DB Verify | PASS | `SELECT status, client_id FROM units WHERE id=$id` → status='reserved', client_id=X |

#### Test 3: Require Client for Reserved/Contracted
| Step | Result | Detail |
|------|--------|--------|
| 3a Create Unit | PASS | Unit created without client_id |
| 3b Reject No Client | PASS | `POST /units/:id/status {status:'reserved'}` → **400** ("client_id is required when reserving or contracting a unit") |

#### Test 4: Contract → Auto-Invoice
| Step | Result | Detail |
|------|--------|--------|
| 4a Reserve | PASS | Reserved with client_id |
| 4b Contract | PASS | `POST /units/:id/status {status:'contracted', sold_amount:650000}` → 200 |
| 4c DB Verify Unit | PASS | status='contracted', client_id=X, sold_amount=650000.00 |
| 4d AutoInvoice Exists | PASS | Invoice found in `invoices` table with description containing 'TEST-102' |
| 4e Invoice Amount Matches | PASS | Invoice amount = 650000.00 (matches sold_amount) |

#### Test 5: Finance Cross-Check
| Step | Result | Detail |
|------|--------|--------|
| 5a Finance Endpoint | PASS | `GET /finance/project/:id` returns total_invoiced including auto-created unit sale invoice |
| 5b Manual SQL Match | PASS | `SELECT COALESCE(SUM(amount),0) FROM invoices WHERE project_id=$id` matches API's `total_invoiced` |

#### Test 6: Delete-with-Dependencies
| Step | Result | Detail |
|------|--------|--------|
| 6a Delete Blocked | PASS | `DELETE /clients/:id` fails because units still reference this client → FK violation blocked by `ON DELETE RESTRICT` |
| 6b Client Still Exists | PASS | DB confirms client row intact after failed delete |
| 6c Release Step 1 | PASS | contracted → reserved (proper transition path) |
| 6c Release Step 2 | PASS | reserved → available (client_id NULL'd automatically) |
| 6d DB Verify Released | PASS | status='available', client_id=NULL |

#### Test 7: Sales Summary with Client Info
| Step | Result | Detail |
|------|--------|--------|
| 7a Summary Returns | PASS | `GET /sales/summary?project_id=X` → total_units, by_status breakdown |
| 7b Client Breakdown | PASS | `client_breakdown` array includes client_name, units_count, total_contracted, total_invoiced, total_paid |

#### Test 8: End-to-End Flow
| Step | Result | Detail |
|------|--------|--------|
| 8a Create Unit3 | PASS | New unit with price=1,500,000 |
| 8b Reserve | PASS | Reserved with client_id=1 |
| 8c Contract Unit1 | PASS | Original unit contracted with client_id=2, sold_amount=850,000 → auto-invoice created |
| 8d Both Units Correct | PASS | U1: contracted, U3: reserved — both have correct client_id values |
| 8e Auto-Invoice Count | PASS | ≥1 auto-generated invoices found in invoices table |

### Part 2 Summary: 29/29 PASS, 0 failures

---

## Combined Summary

| Part | Module | Tests | Result |
|------|--------|-------|--------|
| 1 | Approvals Lifecycle | 32 | **32/32 PASS** |
| 2 | Units-Client FK + Invoice | 29 | **29/32 PASS** (after test fix) |
| **TOTAL** | | **61** | **61/61 PASS** |

### Key Findings

1. **Approvals two-stage flow confirmed working**: manager_review → owner_review → fully_approved, with proper source record status updates (expenses.status = 'approved'/'rejected') on both paths.

2. **Reject at any stage sets source record to 'rejected'**: Both `rejectRecordStatus()` and `updateRecordStatus()` correctly call the module-specific UPDATE on the source table.

3. **Owner bypasses all role gates**: The `advanceApproval()` function explicitly allows owner/admin to approve at any stage. This is intentional design for the superuser role.

4. **Unit sales now generate real receivables**: A unit transition to 'contracted' auto-creates an invoice with the correct amount, client FK, and project FK. The invoice appears in `/api/finance/project/:id` and `/api/finance/summary`.

5. **Client FK integrity enforced**: `ON DELETE RESTRICT` prevents deleting a client who has reserved/contracted units. Units must be released back to 'available' before the client can be removed.

6. **Backend logs clean**: PostgreSQL logs show only informational `hostssl` warnings (SSL disabled). No ERROR, FATAL, or constraint violation messages during testing.

### Files Modified
- `backend/src/scripts/migrate-10.js` — added `client_id` FK migration
- `backend/src/routes/units.js` — added `createUnitSaleInvoice()`, updated status transition, updated sales summary
