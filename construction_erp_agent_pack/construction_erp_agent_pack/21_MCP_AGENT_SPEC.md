# 21 - MCP and Agentic Operation

## Architecture
MCP is an adapter over authenticated business services. It must not query the database directly or bypass authorization/workflow logic.

Client -> MCP Server -> AgentPolicy/Authorization -> Business Services -> Database/Storage.

## Tool categories
### Read
- list_projects
- get_project
- get_project_team
- get_project_progress
- list_locations
- get_location_status
- get_boq
- get_quantity_status
- get_material_requirements
- get_inventory_status
- get_material_shortages
- list_rfis/get_rfi
- list_submittals/get_submittal
- list_inspections
- list_observations
- list_ncrs
- get_project_cost_summary
- list_invoices
- list_payments
- search_documents
- get_my_actions

### Safe transactional writes
- create_rfi
- add_rfi_comment/draft_response
- create_site_observation
- add_observation_comment
- attach_observation_photo
- create_purchase_requisition_draft
- create_inspection_request
- update_daily_report_draft
- assign_action
- complete_action_with_evidence
- create_invoice_draft
- create_variation_draft

### High-risk gated actions
Require configured user approval / workflow authority:
- issue_purchase_order
- approve_variation
- issue_client_invoice
- record_payment
- approve_payment_certificate
- release_retention
- delete/void controlled financial record
- change permission/authority rules
- close project

## Agent policy context
Every tool invocation must resolve:
- authenticated user
- organization
- project memberships
- role/permissions
- delegated authority
- monetary authority limit
- target record status

## Agent confirmation record
For high-risk action store:
- proposed action
- generated payload
- reason/context
- requesting agent/session
- requesting user
- required approver
- approval decision
- final executed transaction ID

## Recommended specialized agents
### PM Assistant
Summarizes actions, delays, comments, inspection status, procurement blockers and risks; drafts assignments/RFIs/reports.

### Procurement Assistant
Forecasts shortages, drafts PRs/RFQs, compares compliant quotes, flags delayed deliveries.

### Commercial Assistant
Summarizes budget/commitments/EAC/variations/certificates and drafts commercial documents without autonomously approving money.

### Consultant Assistant
Surfaces reviews due, organizes inspections and drafts responses; official approval remains role/policy controlled.

### Document Assistant
Searches current revisions, flags superseded references, compiles transmittals and document registers.

### Executive Assistant
Portfolio health, margin, cash, delays, key risks and decisions.

## Agent observability
Log every tool call, authorization decision, record changed and resulting event. Provide an admin 'Agent Activity' screen.
