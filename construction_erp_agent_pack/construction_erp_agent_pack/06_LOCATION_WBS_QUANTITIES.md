# 06 - Location, WBS, Work Packages and Quantities

## Location tree
Every project gets a hierarchical location tree. Location types are configurable and project-template aware.

## Work Package
A Work Package binds:
- project
- WBS node
- one/many locations
- BOQ items
- schedule activities
- responsible internal team
- responsible subcontractor
- drawings
- materials
- inspections
- budget/cost codes

## BOQ location allocation
Each BOQ item can allocate planned quantity across locations.

Fields:
- boq_item_id
- location_id
- planned_quantity
- approved_design_quantity
- executed_quantity (derived)
- consultant_approved_quantity (derived)
- certified_quantity (derived/commercial policy)

## Quantity formulas
Remaining physical quantity = max(Planned Quantity - Executed Quantity, 0)

Physical progress % = Executed Quantity / Planned Quantity * 100

Consultant-approved progress % = Approved Quantity / Planned Quantity * 100

Certified progress % = Certified Quantity / Planned Quantity * 100

Weighted project progress = sum(Weight_i * ApprovedProgress_i) / sum(Weight_i)

Weight policy should be configurable:
- BOQ value
- planned quantity value
- manual weight
- schedule activity weight

## Quantity transaction source
Executed quantity must come from approved progress records/measurements, not direct editing of summary fields.

## Measurement records
Each quantity update records:
- project/location
- BOQ item
- work package
- date
- quantity
- unit
- source work order/daily report
- measured by
- reviewed by
- approval state
- photos/documents

## Floor dashboard
For any floor/location show:
- planned/executed/approved/remaining quantities
- active activities
- material requirement/readiness
- drawings/RFIs/submittals
- WIR/MIR/NCR
- consultant observations
- labour/equipment
- photos
- cost/budget if authorized

## Acceptance
A query at floor, building and project level must reconcile to the same base measurement transactions.
