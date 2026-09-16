# 23 - Calculation Catalog

## Quantity
Line BOQ Value = Planned Quantity * Unit Rate
Remaining Quantity = max(Planned - Executed, 0)
Physical Progress % = Executed / Planned * 100
Approved Progress % = Consultant Approved / Planned * 100

## Materials
Gross Material Requirement = Activity Quantity * Recipe Factor
Net Material Requirement = Gross * (1 + Wastage %) - Consumed
Available Stock = Physical Stock - Reserved - Quarantine
Projected Available(date) = Available + Confirmed Incoming(date) - Scheduled Demand(date)
Reorder Point = Lead-Time Demand + Safety Stock
Shortage = max(Net Requirement - Available - Confirmed Incoming, 0)

## Inventory
Physical Stock = Opening + Receipts + Returns + Transfers In - Issues - Transfers Out - Waste/Writeoff

## Procurement
PO Line Net = Qty * Unit Rate - Discount
PO Total = Sum(Line Net) + Taxes + Freight + Approved Charges

## Labour
Labour Cost = Regular Hours * Rate + Overtime Hours * Overtime Rate

## Equipment
Equipment Cost = Usage Hours * Rate + Fuel + Mobilization + Allocated Maintenance (policy dependent)

## Budget/cost
Current Budget = Original Budget + Approved Budget Changes
Committed Cost = Approved Open Commitments + Consumed Commitment Value as defined by policy
EAC = Actual Cost + Accrued Cost + ETC
Forecast Profit = Forecast Revenue - EAC
Forecast Margin % = Forecast Profit / Forecast Revenue * 100

## Revenue
Revised Contract Value = Original Contract + Approved Client Variations
Accounts Receivable = Issued Invoices - Allocated Collections - Credits

## Certification
Net Certificate = Gross Certified + Approved Variation This Period - Retention - Advance Recovery - Deductions + Tax

## Schedule
Schedule Variance % = Actual Progress % - Planned Progress %
SPI = EV / PV where enabled
CPI = EV / AC where enabled

## Data-quality rule
Every calculated KPI must document:
- source transactions
- aggregation level
- timezone/date cutoff
- rounding method
- currency-conversion policy
- whether draft/unapproved records are included
