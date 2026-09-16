# 04 - Organizations, Roles and Permissions

## Authorization formula
Access = Company scope + Project membership + Organization relation + Role + Module policy + Record policy + Action policy.

## Standard internal roles
- Owner/CEO
- COO
- Projects Director
- Construction Manager
- Project Manager
- Site Manager
- Site Engineer
- Planning Engineer
- Technical Office Engineer
- Quantity Surveyor
- Commercial Manager
- Contracts Manager
- Procurement Manager
- Procurement Officer
- Finance Manager/CFO
- Accountant AR
- Accountant AP
- Storekeeper
- QA/QC Manager/Engineer
- HSE Manager/Officer
- Document Controller
- Equipment/Plant Manager
- HR
- Business Development/Tendering

## External roles
- Client Executive
- Client Reviewer
- PMC/Construction Manager
- Consultant Coordinator
- Consultant Discipline Reviewer
- Subcontractor Manager
- Subcontractor Site Engineer
- Supplier Sales/Operations
- Testing Lab

## Action permissions
At minimum:
- view
- create
- edit
- submit
- assign
- review
- approve
- reject
- return
- close
- reopen
- cancel/void
- export
- download
- upload
- see_internal_cost
- see_client_value
- see_subcontract_value
- see_supplier_value
- issue_financial_document
- record_payment
- manage_permissions

## Project-team inheritance
Assigning a person to a project team must automatically:
1. grant project membership;
2. apply role permission template;
3. subscribe them to relevant notifications;
4. populate their dashboard;
5. include them in workflow role resolution;
6. remove/expire access when assignment ends.

## Delegation
Support temporary delegation with:
- from user
- to user
- start/end
- delegated roles/actions
- audit trail

## External portal isolation tests
Mandatory automated tests:
- Consultant cannot retrieve internal budget endpoints.
- Client cannot retrieve supplier/subcontractor rates unless explicitly permitted.
- Subcontractor cannot see another subcontractor's commercial records.
- Supplier cannot see other supplier quotations before/after tender depending policy.
- External user cannot enumerate projects they are not assigned to.
- MCP tools return the same authorization result as UI/API.
