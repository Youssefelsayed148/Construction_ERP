# 27 - Agent Execution Backlog

The coding agent must work in gated milestones. Each milestone ends with code, migrations, tests and documentation committed together.

## M0 - Reconnaissance
- generate current architecture/schema/route/API/permission maps
- identify framework and deployment topology
- list technical debt/blockers
DONE when audit docs match codebase and tests can run locally/staging.

## M1 - Organization and participant foundation
- Organization model
- participant types
- project participant users
- migrate existing clients
- basic admin CRUD
DONE when projects can attach multiple organizations without breaking current client behavior.

## M2 - Authorization foundation
- project/organization-scoped policy service
- role templates and action permissions
- permission tests
DONE when external roles are provably isolated.

## M3 - Project provisioning
- project templates
- location/WBS roots
- team/participant setup
- workflow/notification defaults
DONE when one wizard creates a functional empty project workspace.

## M4 - Workflow/action/notification platform
- workflow templates/instances
- action center
- reminder scheduler
- notification service
DONE when RFI and observation use the shared engine.

## M5 - Locations/work packages/quantity
- location tree
- work packages
- BOQ allocations
- measurement transactions/rollups
DONE when floor -> building -> project quantities reconcile.

## M6 - Material planning/inventory
- material recipes
- demand forecasts
- reservations
- stock movements
- shortage/reorder jobs
DONE when future floor activity creates shortage and auto-draft PR.

## M7 - Procurement
- PR/RFQ/quotes/comparison/PO/delivery/MIR/GRN
DONE when full purchase flow reconciles stock and commitment.

## M8 - Commercial/finance
- contracts/subcontracts/variations/certificates
- budget/commitment/actual/EAC
- invoices/payments/AP matching
DONE when project commercial dashboard reconciles to transactions.

## M9 - Site/consultant
- site visit/observation/photos
- consultant portal/inbox
DONE when consultant can raise photo observation and PM receives/rectifies/returns for verification.

## M10 - Client/subcontractor/supplier portals
DONE when each external actor can complete its role using only its portal.

## M11 - QA/QC/HSE/document control
- WIR/MIR/ITP/NCR/PTW etc.
- document register/revisions/transmittals/correspondence
DONE when latest-revision and inspection workflows are auditable.

## M12 - Planning/reporting/handover
DONE when lookahead, project report and handover package are functional.

## M13 - API/webhooks
DONE when OpenAPI and webhook integration tests pass.

## M14 - MCP/agents
DONE when permission-scoped read tools and safe draft-write tools operate against staging and high-risk actions are gated.

## M15 - Production hardening
- monitoring
- backups
- DR
- load/security tests
- seed E2E project
DONE when release checklist passes.
