# 08 - Procurement

## End-to-end flow
Material/Service Requirement -> PR -> Approval -> RFQ -> Vendor Quotes -> Technical Evaluation -> Commercial Comparison -> Award Recommendation -> PO -> Delivery -> Inspection -> GRN -> Invoice Match -> Payment.

## Purchase Requisition
Required fields:
- requester
- project
- location/work package
- cost code
- required-by date
- lines: material/service, quantity, specification
- reason/source demand
- preferred supplier optional
- attachments

Documents:
- PR PDF

## RFQ
- source PR(s)
- selected eligible vendors
- issue date
- closing date
- commercial terms
- specifications/drawings
- clarification thread

Documents:
- RFQ package
- supplier quotation
- clarification log

## Quote comparison
Compare:
- compliant/non-compliant
- lead time
- unit price
- total price
- payment terms
- delivery terms
- tax
- warranty
- deviations
- technical score
- commercial score

No vendor should see competitor quotes.

## PO
Fields:
- supplier
- project
- source PR/RFQ
- contract/framework reference
- lines
- taxes/discount/freight
- delivery schedule
- payment terms
- approval state

Calculation:
Line Net = Qty * Unit Rate - Line Discount
PO Subtotal = sum(Line Net)
PO Total = Subtotal + taxes + freight + other approved charges

## Delivery/MIR/GRN
Delivery may be partial. GRN only for accepted quantities.

GRN quantity constraints:
Accepted cumulative <= Delivered cumulative <= Ordered quantity + approved tolerance.

## Three-way match
Supplier Invoice line should reconcile PO ordered/price, GRN accepted quantity and invoice quantity/price.

Exception states:
- price variance
- quantity variance
- missing GRN
- duplicate invoice
- tax mismatch

## Dashboard
- PR awaiting approval
- RFQs closing soon
- unawarded requirements
- PO pending approval
- delayed deliveries
- material shortages
- vendor performance
- spend by project/category/vendor

## Documents
PR, RFQ, quotation, bid comparison, award recommendation, PO, delivery note, MIR, GRN, supplier return, invoice-match exception report.
