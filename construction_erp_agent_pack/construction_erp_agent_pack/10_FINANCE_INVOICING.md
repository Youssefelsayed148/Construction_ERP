# 10 - Finance, Invoicing and Payments

## Client invoice/payment certificate chain
Measured Work -> Consultant/Client Certification -> Payment Certificate -> Invoice -> Collection -> Allocation.

## Payment certificate calculation
Gross Current Work
+ Approved Variations This Period
= Gross Certified
- Retention
- Advance Recovery
- Other Contractual Deductions
+ Applicable Tax
= Net Certificate / Invoice Basis

Track previous cumulative values to prevent double certification.

## Client invoice statuses
Draft -> Approved -> Issued -> Partially Paid -> Paid
Additional: Overdue, Cancelled/Void, Credited.

## Receivable reminders
Rules configurable by company/project/client:
- 7 days before due
- due today
- 7/14/30 days overdue
- escalation to PM/Finance/CFO as defined

## AP flow
Supplier/Subcontract Invoice -> Match/Certificate -> Finance Review -> Approval -> Due -> Payment -> Allocation.

## Payment controls
- payment batch
- bank/cash account
- beneficiary
- supporting docs
- authority approval
- maker/checker where configured

## Company finance dashboard
- AR aging
- AP aging
- cash collected
- payments due
- project cash flow
- retention receivable/payable
- overdue client invoices
- supplier/subcontract liabilities
- project forecast margin

## Accounting integration boundary
If statutory accounting/general ledger exists externally, expose journal-ready integration records rather than duplicating all statutory features prematurely. Maintain project/subledger integrity internally.
