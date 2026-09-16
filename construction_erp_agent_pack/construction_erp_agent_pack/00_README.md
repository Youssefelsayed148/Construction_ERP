# Construction ERP Agent Implementation Pack

## Purpose
This pack is the execution contract for upgrading the current Construction ERP into a company-wide, project-scoped, multi-party construction operating system.

## Non-negotiable architecture
1. One company ERP and one source of truth.
2. Every project has its own team, participants, locations, WBS, cost structure, documents, workflows, approvals, dashboards and notifications.
3. Client, consultant, subcontractor and supplier portals are permission-scoped views over the same project data, not separate databases/apps.
4. Every operational record should be traceable to Project -> Location -> Work Package/WBS -> Responsible Party -> Quantity/Cost -> Workflow State.
5. API-first business services. MCP must call the same business-service layer as the UI/API; no duplicated business logic.
6. No module is complete without empty/loading/error/permission states, audit logs, reminders, tests and documentation.

## Execution order
The agent MUST execute phases in this order unless a dependency requires a smaller prerequisite change:

1. Current-system audit and schema map
2. Target data model and migrations
3. Organization/project participant model
4. RBAC/ABAC permission engine
5. Project creation wizard and templates
6. Universal workflow engine
7. Universal actions, reminders, notifications and escalation
8. Location/WBS/work-package engine
9. Quantity and progress engine
10. Material demand/recipe engine
11. Inventory and replenishment
12. Procurement
13. Contracts/commercial/cost control
14. Finance, invoices, collections and AP
15. Site operations
16. Consultant portal
17. Client portal
18. Subcontractor/supplier portals
19. QA/QC and HSE
20. Document control, RFI, submittals and correspondence
21. Planning/scheduling
22. Dashboards and reporting
23. Handover/warranty
24. API hardening, webhooks and OpenAPI
25. MCP and agentic tool layer
26. Security, observability, backup and disaster recovery
27. End-to-end seed project and production acceptance

## Definition of done for every module
A module is DONE only when all applicable items are complete:
- Data model and migrations
- Validation and business rules
- API/service layer
- Desktop UI
- Mobile/responsive UI where applicable
- Empty/loading/error/offline states
- Project and organization scoping
- Role/action permissions
- Workflow and approval hooks
- Action-item generation
- Reminders and escalation
- Notifications
- Attachments/photos/comments
- Document/PDF output where relevant
- Audit history
- Search/filter/sort/export
- Dashboard widgets
- Reports
- MCP read tools
- MCP write tools where safe
- Unit tests
- Integration tests
- Permission tests
- E2E tests
- User/developer documentation

## Zero-broken-view policy
All pages and portal routes must render with zero records. Never render raw null/undefined, blank pages or unhandled 500 errors. External dashboards must work before an external user is invited and before any project data exists.

## Safety for financial/contractual agent actions
Agents may prepare drafts automatically. Issuing POs, sending client invoices, approving variations, recording payments, approving certificates, deleting controlled records, changing financial authority rules or closing projects must require explicit configured authorization.
