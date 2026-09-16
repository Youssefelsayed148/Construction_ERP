# 03 - Core Data Model

## Identity / company
- Company
- Department
- User
- Employee
- JobPosition
- Role
- Permission
- RoleAssignment
- Delegation

## Organizations
- Organization
- OrganizationContact
- OrganizationDocument
- OrganizationQualification
- OrganizationBankAccount
- OrganizationPerformanceScore

## Projects
- Project
- ProjectParticipant
- ProjectParticipantUser
- ProjectTeamMember
- ProjectTemplate
- ProjectSetting
- ProjectCalendar

## Location
- ProjectLocation
  - id
  - project_id
  - parent_id
  - location_type
  - code
  - name
  - sort_order
  - metadata
- LocationType

Supported types should be configurable: site, building, block, tower, zone, floor, apartment, room, section, chainage, plot.

## WBS / work packages
- WBSNode
- WorkPackage
- WorkPackageLocation
- WorkPackageBOQItem
- WorkPackageScheduleActivity
- WorkPackageParticipant

## Cost/BOQ
- CostCode
- BOQSection
- BOQItem
- BOQLocationAllocation
- BudgetVersion
- BudgetLine
- ForecastVersion
- ForecastLine

## Materials/inventory
- Material
- MaterialUnitConversion
- MaterialRecipe
- MaterialRecipeLine
- MaterialRequirement
- MaterialReservation
- Warehouse
- InventoryBalance
- StockMovement
- StockLot
- MaterialIssue
- MaterialReturn
- MaterialTransfer
- InventoryAdjustment

## Procurement
- PurchaseRequisition
- PurchaseRequisitionLine
- RFQ
- RFQLine
- RFQVendor
- SupplierQuotation
- SupplierQuotationLine
- BidComparison
- PurchaseOrder
- PurchaseOrderLine
- Delivery
- DeliveryLine
- MIR
- GRN
- SupplierReturn

## Contracts/commercial
- Contract
- ContractLine
- ContractParty
- ContractGuarantee
- ContractInsurance
- Variation
- VariationLine
- PaymentApplication
- PaymentCertificate
- RetentionLedger
- AdvanceLedger
- Commitment

## Finance
- Invoice
- InvoiceLine
- Payment
- PaymentAllocation
- Expense
- TaxCode
- CurrencyRate

## Site
- DailyReport
- DailyReportActivity
- DailyReportManpower
- DailyReportEquipment
- DailyReportDelivery
- DailyReportPhoto
- SiteVisit
- Observation
- ObservationComment
- ObservationAttachment

## Quality/HSE
- ITP
- ITPPoint
- WIR
- MIRInspection
- Inspection
- ChecklistTemplate
- ChecklistInstance
- QualityTest
- NCR
- CorrectiveAction
- SafetyInspection
- PermitToWork
- ToolboxTalk
- Incident
- NearMiss

## Documents
- Document
- DocumentRevision
- DocumentDistribution
- Transmittal
- TransmittalItem
- Correspondence
- DrawingRegisterItem
- RFI
- RFIResponse
- Submittal
- SubmittalRevision
- SubmittalReview

## Schedule
- Schedule
- ScheduleBaseline
- ScheduleActivity
- ActivityDependency
- ActivityProgressUpdate
- Milestone

## Collaboration
- ActionItem
- ActionComment
- StickyNote
- Notification
- Reminder
- EscalationRule
- WorkflowTemplate
- WorkflowStepTemplate
- WorkflowInstance
- WorkflowStepInstance
- ApprovalDecision

## Handover
- PunchItem
- CommissioningRecord
- Asset
- AssetDocument
- HandoverPackage
- Warranty
- WarrantyClaim

## Audit/integration
- AuditEvent
- OutboxEvent
- WebhookSubscription
- WebhookDelivery
- APIClient
- APIToken
- AgentSession
- AgentActionRequest
- AgentApproval
