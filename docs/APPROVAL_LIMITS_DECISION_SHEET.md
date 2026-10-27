# Approval limits - production decision sheet

**Status: OPEN - owner to fill. Nothing in this sheet is seeded or enforced yet.** Session F (closeout) deliberately did not choose production limits.

## How limits work today (`services/approvalLimits.js`, migration 0037, `GET/PUT /api/approval-limits`)

- A limit is one row per **role x monetary action**: `max_amount` and `currency`, with an `enabled` flag.
- **Fail closed**: a role with no enabled row for an action is refused `403 approval_limit_exceeded` when it decides a gated request for that action. There is no default.
- External roles are intentionally absent (they cannot decide gated money actions).
- Amounts are resolved from the stored record (PO total, invoice total, payment-certificate net, supplier-invoice total), or from the payload amount for `record_payment` / `release_retention`.

## The 7 monetary actions

| Action key | What it gates | Amount compared |
|---|---|---|
| `issue_purchase_order` | Issuing a purchase order | PO total |
| `issue_client_invoice` | Issuing a client invoice | Invoice total |
| `record_payment` | Recording a payment | Payment amount |
| `approve_payment_certificate` | Approving a payment certificate | Net certificate |
| `release_retention` | Releasing held retention | Release amount |
| `void_financial_record` | Voiding a financial record | Record total |
| `approve_supplier_invoice` | Approving a supplier invoice | Supplier-invoice total |

## Currency

All existing rows are **EGP**. Confirm the production currency: ______ (default EGP). If more than one currency is needed, say how limits compare across currencies (the service stores one currency per row and does not convert).

## Decision matrix (owner fills the blank columns)

Roles that can plausibly decide a money action: list the ones that should, leave the rest blank (blank = no row = refused). Add rows for any role not listed.

| Role | issue_purchase_order | issue_client_invoice | record_payment | approve_payment_certificate | release_retention | void_financial_record | approve_supplier_invoice |
|---|---|---|---|---|---|---|---|
| `owner` | | | | | | | |
| `admin` | | | | | | | |
| `owner_ceo` | | | | | | | |
| `coo` | | | | | | | |
| `finance_manager` | | | | | | | |
| `accountant_ar` | | | | | | | |
| `accountant_ap` | | | | | | | |
| `accountant` (legacy) | | | | | | | |
| `commercial_manager` | | | | | | | |
| `procurement_manager` | | | | | | | |
| `projects_director` | | | | | | | |
| _other: ________ | | | | | | | |

Cell value = **approved maximum amount** in the currency above. `0` or blank = not permitted.

## Reference only: the demo ladder (NOT a recommendation for production)

These are the rows present in the demo/test seed (migration 0037 provisional EGP defaults; `owner_ceo` and `coo` were mirrored from `owner`/`admin` by the demo seed only). `purchasing_mgr` has no row.

| Role | Every one of the 7 actions | Source |
|---|---:|---|
| `owner` | 1,000,000,000 | migration 0037 |
| `admin` | 1,000,000,000 | migration 0037 |
| `owner_ceo`, `coo` | 1,000,000,000 | demo seed only (`company-demo-approval-limits.js`) |
| `finance_manager` | 1,000,000 | migration 0037 |
| `accountant_ap` | 100,000 | migration 0037 |
| `accountant` | 100,000 | migration 0037 |

Observed in the demo (RUN F): a EGP 1.1M `issue_purchase_order` request by a `finance_manager` was refused at its 1M limit and an `owner` approved it; an under-limit request still queued for approval.

## Questions the sheet should also settle

1. Should the same amount apply to every action for a role, or differ per action (e.g. a lower `void_financial_record` limit)?
2. Does `owner_ceo` / `coo` get a hard ceiling, or is "unlimited" acceptable? (The demo uses 1,000,000,000 as a stand-in.)
3. Do delegations (Phase 1.4) raise a delegate's limit, or only transfer the delegator's pending approvals?
4. Who may change limits in production (today: owner/admin via `PUT /api/approval-limits`, audited)?

## Once filled

Return the sheet; the values are applied through `PUT /api/approval-limits` (audited, per row) on the production stack by the owner or an authorised administrator - not by migration.
