# 01 - Current State Audit

## Confirmed from the current Projects Module Guide
The current project module already provides:
- Project creation/editing with client, PM, contract value, budget, dates and status.
- Project phases, project team and milestones.
- BOQ sections and BOQ items with quantity x rate totals.
- Work orders linked to phases/BOQ sections.
- Work-order materials, labour planning, equipment and progress records.
- Daily site reports, engineer instructions and site visits.
- Quality tests, NCRs, safety inspections and incidents.
- Document library with versions, RFIs and submittals.
- Buildings/units/property sales flow.
- Project invoices/payments/expenses referenced in the end-to-end scenario.

## Current strengths to preserve
1. Existing project container concept.
2. Existing project-specific navigation.
3. BOQ hierarchy and progress records.
4. Document revisions.
5. Workflow-like state transitions on EI/RFI/NCR/submittals.
6. Existing end-to-end demo scenario philosophy.

## Critical gaps
### Architecture
- External parties are not first-class project organizations with proper portal identities and scoped permissions.
- Project team roles are not yet the central authorization/notification driver.
- No universal workflow engine.
- No universal action center.
- No location hierarchy deep enough for floor/zone/room quantity control.

### Commercial
- Project 'profit' currently behaves like collections minus expenses; this is cash contribution, not full construction project profitability.
- Missing commitments, revised budget, accrued cost, ETC/EAC, retention, advance recovery and forecast margin.
- Missing client/subcontract contracts and commercial certification workflows.
- Missing structured variation/change control.

### Procurement/inventory
- Site-received materials in daily reporting are free text instead of inventory transactions.
- Missing PR -> RFQ -> quote comparison -> PO -> delivery -> MIR -> GRN -> stock -> issue -> invoice chain.
- Missing demand forecasting and auto-replenishment.

### Project controls
- Phases/milestones exist, but no full WBS/activity/dependency/baseline/lookahead engine.
- No consistent work-package object connecting schedule, cost, quantity, subcontractor, drawings and inspections.

### External collaboration
- Consultant visit fields exist, but comments do not yet form a complete observation/rectification/verification workflow.
- No dedicated client, consultant, subcontractor or supplier portals.

### Closeout
- Missing testing/commissioning, punch/snags, O&M, as-builts, asset register, DLP and warranty service.

## Phase-1 code audit checklist
The development agent must inspect and document:
- Framework versions and package manifests
- Frontend route map
- Backend route/controller/service map
- Database tables, columns, indexes and constraints
- Authentication flow
- Role/permission checks
- File storage mechanism
- Notification/email mechanism
- Scheduled jobs/queues
- Existing API endpoints
- Existing audit logs
- Existing project scoping patterns
- Existing finance tables
- Existing inventory tables
- Existing document version model
- Existing state machines
- Test coverage
- Deployment topology
- Backup/restore process

## Phase-1 output documents
- CURRENT_SYSTEM_ARCHITECTURE.md
- CURRENT_DATABASE_SCHEMA.md
- CURRENT_ROUTE_MAP.md
- CURRENT_API_MATRIX.md
- CURRENT_MODULE_MATRIX.md
- CURRENT_PERMISSION_MATRIX.md
- CURRENT_BACKGROUND_JOBS.md
- CURRENT_FILE_STORAGE.md
- GAP_ANALYSIS.md
- MIGRATION_RISK_REGISTER.md

## Gate
Do not delete or replace existing tables until mapping their production data and dependencies. Prefer additive migrations, compatibility adapters and staged cutovers.
