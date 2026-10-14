# Retiring the legacy approval system

Status: prepared, not retired. Phase 8 implementation work is in progress (see ERP_CLOSEOUT_PLAN.md). The default
`APPROVALS_LEGACY_DUAL_WRITE` behavior remains enabled. The real-PG suite `approvals-atomic.pg.test.js` exercises both
the default parity path and workflow-authoritative reads with the mirror disabled.

## Today
- `approval_requests` is the legacy table and API metadata surface (`/api/approvals/*`, the Approvals screen).
- `workflow_instances` (template `legacy_module_approval`) is the engine's twin. Creating a request inserts both in one
  transaction, linked by `workflow_instances.legacy_approval_id` (unique, migration 0017). Decisions lock the legacy
  row for request identity and advance the engine. With the mirror enabled, decisions also update legacy status; with
  `APPROVALS_LEGACY_DUAL_WRITE=false`, API reads project current status and stage from the workflow.
- Dashboard counts, approval list/detail/audit/check endpoints, stale reports, and the stale-cancel script use the
  workflow's live status when it is linked. The environment flag is reversible and remains enabled by default.
- `recordLegacyDecision` (`services/workflowEngine.js`) remains the decision adapter while the API keeps its legacy IDs.

## Steps to retire (Phase 8)
1. Run `npm run approvals-parity` and preflight counts on a restored copy of real data. Resolve every reported row
   (stale active instances next to a decided twin are listed in `scripts/preflight-upgrade.sql`, group 0017).
2. Hold a release with `APPROVALS_LEGACY_DUAL_WRITE=false`; monitor parity and read behavior for two full weeks and
   retain command output and operator signoff. Disposable test data does not satisfy this hold.
3. Before disabling the mirror for routine use, approve and implement a schema migration for re-submission uniqueness.
   Migration 0013's `uq_approval_requests_one_pending` still reserves an old row whose status remains `pending` after a
   workflow completes. Until that index is replaced, same-record re-submission returns typed 409
   `approval_resubmission_requires_legacy_mirror`; an unlinked pending row also blocks re-submission. No history is
   rewritten to work around this. Repository instructions currently require additive-only migrations, which does not
   authorize dropping/replacing that index, so this is an explicit cutover blocker.
4. After the hold and schema decision, point the Approvals screen and `/api/approvals/*` fully at workflow instances and
   action items while retaining the response shape; verify direct readers, dashboard, stale tools, and parity checks.
5. Resolve/migrate in-flight requests (they should already have instances once preflight is clean), then stop dual-writing
   `approval_requests`; retain the table as history. Do not delete rows (approval history is audit data).
6. Remove `verify-approval-parity.js`, the `approvals-parity` script, `recordLegacyDecision`, and legacy maps only after
   the two-week hold is clean and release signoff is recorded.

## Cleanup safety
`scripts/cleanup-orphan-approvals.js --apply` hard-deletes workflow instances and their approval rows. It is a manual
backstop, not part of any flow. The cancel endpoint and stale-cancel script cancel with a reason and retain rows.
