# 20 - API Specification

## Principles
- versioned REST API: /api/v1
- same business rules as UI
- OAuth/OIDC for user authorization
- scoped service credentials for integrations
- idempotency keys on create/financial endpoints
- pagination/filter/sort
- request correlation IDs
- structured error model
- rate limiting
- audit logs
- OpenAPI published from source

## Resource families
- /companies
- /users
- /organizations
- /projects
- /projects/{id}/team
- /projects/{id}/participants
- /projects/{id}/locations
- /projects/{id}/wbs
- /work-packages
- /boq
- /quantities
- /materials
- /inventory
- /purchase-requisitions
- /rfqs
- /purchase-orders
- /deliveries
- /grns
- /contracts
- /subcontracts
- /variations
- /payment-certificates
- /invoices
- /payments
- /daily-reports
- /site-visits
- /observations
- /rfis
- /submittals
- /inspections
- /ncrs
- /documents
- /transmittals
- /schedule
- /actions
- /notifications
- /reports

## Error shape
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "You do not have access to this project cost data.",
    "correlation_id": "...",
    "details": []
  }
}

## Webhooks
Recommended events:
- project.created
- project.team_member.assigned
- rfi.created/submitted/answered/overdue
- submittal.submitted/reviewed/overdue
- observation.created/assigned/verification_requested/closed
- inventory.low/projected_shortage
- purchase_requisition.created/approved
- purchase_order.issued
- delivery.received
- mir.accepted/rejected
- invoice.issued/overdue/paid
- payment.received
- variation.approved
- action.overdue

## API acceptance
- permission parity with UI
- no cross-project data leakage
- idempotent retries
- documented examples
- test environment/sandbox where feasible
