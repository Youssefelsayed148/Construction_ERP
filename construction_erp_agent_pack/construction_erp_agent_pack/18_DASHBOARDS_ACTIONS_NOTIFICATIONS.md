# 18 - Dashboards, Actions, Notes, Notifications and Reminders

## Universal ActionItem
Sources may include RFI, submittal, observation, meeting, NCR, inspection, procurement, invoice, material shortage, schedule delay and client decision.

Fields:
- project/source
- title/description
- location
- assigned user/organization
- priority
- due date
- status
- comments/files
- reminder policy
- escalation policy

## My Actions
All users get one prioritized queue:
- overdue
- due today
- due soon
- awaiting me
- delegated
- recently completed

## Notifications
Channels:
- in-app
- email
- push
- optional SMS/WhatsApp via configured providers

Notification event classes:
- assignment
- approval request/decision
- comment/mention
- due soon/overdue
- material shortage
- procurement status
- invoice/payment
- inspection
- document review
- expiring compliance doc

## Escalation
Example consultant observation:
Immediate -> PM
4h unacknowledged -> remind PM
24h -> Construction Manager
Due date missed -> Projects Director
All thresholds configurable.

## Sticky notes
Personal/shared/location/record linked. Can have due date and convert-to-action.

## Role dashboard minimums
### CEO/Owner
Portfolio, backlog, revenue/collections, AR/AP, EAC, forecast margin, delayed projects, procurement exposure, major quality/safety risks.

### Projects Director
Project health, progress, schedule, PM actions, commercial risk, resource/material constraints.

### Construction Manager
Today's works, lookahead, labour/equipment, inspections, comments, blockers, materials.

### Project Manager
Actions, progress, milestones, schedule, quantities, material readiness, procurement, consultant comments, RFIs, submittals, WIR/MIR, NCRs, variations, cost/invoices.

### Site Engineer
Today's work, location, latest drawings, inspections, materials, comments, photos, daily report.

### Planning
Baseline/actual, delays, critical/lookahead, curves/KPIs.

### Commercial/QS
BOQ/measurements, valuations, subcontracts, variations, commitments, budget/EAC/margin.

### Procurement
PR/RFQ/quotes/POs/deliveries/shortages/vendor performance.

### Storekeeper
Receiving, inspections, GRNs, stock, low stock, issues/transfers/returns/waste.

### QA/QC
WIR/MIR/tests/NCRs/corrective actions.

### HSE
Permits, inspections, incidents, near misses, overdue actions.

### Document Controller
incoming/outgoing, revisions, transmittals, reviews due, superseded control.

### Finance
AR/AP, invoices, collections, due payments, cashflow, retention, overdue.

### Client/Consultant/Subcontractor/Supplier
As specified in dedicated portal documents.
