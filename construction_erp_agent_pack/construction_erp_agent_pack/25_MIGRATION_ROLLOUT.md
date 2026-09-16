# 25 - Migration and Rollout

## Migration strategy
Prefer additive migrations and staged feature flags.

## Stage 1 - Inventory existing schema
Map current Project, BOQ, team, work-order, site, QHSE, document, RFI, submittal, invoice/payment/expense and unit-sales records.

## Stage 2 - Introduce core keys
Add organization/project/location/work-package/cost-code relationships where required, initially nullable with backfill jobs.

## Stage 3 - Backfill
- existing clients -> Organization(type=Client)
- named consultant fields -> Organization/Participant where safely identifiable
- current project team -> ProjectTeamMember/RoleAssignment
- current phases -> WBS or compatibility mapping
- current project locations -> project root/default site
- existing documents -> DocumentRevision model if needed

## Stage 4 - Compatibility layer
Old UI continues using adapters while new domain services become authoritative.

## Stage 5 - Dual validation
Compare existing summary values to new calculated values; investigate differences before cutover.

## Stage 6 - Cutover
Enable new module per project/company feature flag.

## Rollback
Each migration requires rollback plan or forward-fix strategy. Never destructive-deploy without backup and restore verification.

## Deployment gates
- staging migration successful
- production backup verified
- automated tests pass
- permission regression tests pass
- smoke test seed project passes
- observability dashboards green
