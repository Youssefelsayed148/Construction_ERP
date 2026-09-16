# 02 - Target Architecture

## Logical layers
1. Web/mobile clients
2. Portal-specific presentation shells
3. Authentication/session layer
4. API gateway/application API
5. Authorization policy layer
6. Business-service layer
7. Workflow/action/notification services
8. Domain repositories/data access
9. Transactional database
10. Object/file storage
11. Search/index service
12. Job queue/scheduler
13. Audit/event stream
14. Webhooks/integration layer
15. MCP adapter over business services

## Core tenancy/scoping model
Every domain record should carry enough scope to prevent accidental cross-project or cross-organization access:
- company_id
- project_id where project-scoped
- owning_organization_id where relevant
- created_by_user_id
- optional location_id
- optional work_package_id
- optional cost_code_id

## Participant model
ProjectParticipant links a project to an Organization and describes:
- participant_type
- contract/appointment reference
- active dates
- portal access enabled
- default communication role
- visibility policy

ProjectParticipantUser links specific users to that project participant.

## Service boundaries
Recommended domain services:
- IdentityService
- OrganizationService
- ProjectService
- ProjectTemplateService
- ParticipantService
- LocationService
- WBSService
- WorkPackageService
- QuantityService
- MaterialPlanningService
- InventoryService
- ProcurementService
- ContractService
- CommercialService
- FinanceService
- ScheduleService
- SiteService
- QualityService
- SafetyService
- DocumentControlService
- RFIService
- SubmittalService
- InspectionService
- ObservationService
- MeetingService
- HandoverService
- WorkflowService
- ActionService
- NotificationService
- ReportingService
- IntegrationService
- AgentPolicyService

## Event-driven internal integration
Business services should emit events after committed transactions, such as:
- observation.created
- rfi.submitted
- inventory.projected_below_reorder_point
- purchase_requisition.approved
- payment_certificate.approved
- invoice.overdue
- action.overdue

Events feed notifications, dashboards, reminders, reports, webhooks and agents.

## Transaction principle
Any operation affecting multiple financial or stock records must run transactionally. Examples:
- GRN + inventory stock movement
- material issue + reservation release
- approved payment certificate + invoice eligibility
- variation approval + contract value update + budget/revenue forecast

## Soft-delete principle
Controlled construction records should rarely be physically deleted. Prefer:
- status=void/cancelled
- superseded versions
- immutable audit history
- explicit reason
