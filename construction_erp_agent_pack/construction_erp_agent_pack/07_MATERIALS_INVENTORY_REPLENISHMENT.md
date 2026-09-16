# 07 - Materials, Inventory and Auto-Replenishment

## Material master
Fields:
- code
- name Arabic/English
- category
- base unit
- purchase unit
- issue unit
- unit conversions
- preferred suppliers
- minimum stock
- maximum stock
- safety stock
- supplier lead time
- reorder policy
- order multiple/minimum order quantity
- shelf life if applicable
- batch/lot tracking flag
- inspection-required flag

## Material recipe
A recipe maps an activity/BOQ/work type to component materials.

Example per 1 m3 reinforced concrete:
- C35 concrete: 1.00 m3
- rebar: 125 kg
- binding wire: 1.5 kg
- formwork: 3.8 m2
- spacers: 10 pcs

All factors are editable per project/specification.

## Demand calculation
Gross Requirement = Planned Activity Quantity * Recipe Factor

Net Requirement = Gross Requirement * (1 + Wastage %) - Already Consumed

Open Procurement Requirement = max(Net Requirement - Available Stock - Confirmed Incoming + Reserved For Other Work, 0)

## Stock calculations
Physical Stock = Opening + Receipts + Returns + Transfers In - Issues - Transfers Out - Waste/Writeoff

Reserved Stock = sum(active reservations)

Available Stock = Physical Stock - Reserved Stock - Quarantined Stock

Projected Available by Date = Available Stock + Confirmed Receipts by Date - Scheduled/Reserved Demand by Date

## Reorder calculation
Lead-Time Demand = forecast daily usage * supplier lead-time days

Reorder Point = Lead-Time Demand + Safety Stock

Suggested Order Quantity should consider:
- target maximum stock
- open confirmed POs
- future scheduled demand
- MOQ/order multiple
- shelf life/storage capacity

## Replenishment modes
1. Alert only
2. Auto-create draft PR
3. Auto-create draft PO under framework agreement
4. Auto-issue PO only below configured authority and only for approved materials/suppliers

## No uncontrolled purchasing
Default mode should never directly issue financially binding POs without authority rules.

## Inventory flow
Requirement -> Reservation -> PR -> PO -> Delivery -> MIR -> Accepted/Quarantine/Rejected -> GRN -> Stock -> Issue to location/work package -> Consumption -> Return/Waste.

## Stock movement immutability
Never edit historical stock balance directly. Correct via adjustment/reversal transactions.

## Alerts
- projected shortage
- below min
- expiring material
- excess/slow moving
- rejected delivery
- delayed PO
- abnormal wastage

## Acceptance tests
- Floor demand creates correct material requirement.
- Existing stock and incoming PO reduce shortage correctly.
- Reorder creates one draft PR, not duplicates on repeated job runs.
- Rejected MIR does not increase usable inventory.
- Return reverses issued quantity correctly.
