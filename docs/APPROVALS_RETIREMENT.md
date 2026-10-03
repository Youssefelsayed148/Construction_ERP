# Retiring the legacy approval system

Status: planned. Executed in Phase 8 (see ERP_CLOSEOUT_PLAN.md). Until then the two systems run side by side and
`npm run approvals-parity` (backend) is the check that they agree. The real-PG suite `approvals-atomic.pg.test.js`
asserts parity for every request it creates.

## Today
- `approval_requests` is the legacy table and the API surface (`/api/approvals/*`, the Approvals screen).
- `workflow_instances` (template `legacy_module_approval`) is the engine's twin. Creating a request inserts both in one
  transaction, linked by `workflow_instances.legacy_approval_id` (unique, migration 0017). Deciding a request locks the
  legacy row, advances the engine and dual-writes the legacy row.
- `recordLegacyDecision` (`services/workflowEngine.js`) is the only decision path for legacy requests.

## Steps to retire (Phase 8)
1. Run `npm run approvals-parity` and the preflight counts on a restored copy of the real database. Resolve every row it
   reports (stale active instances next to a decided twin are listed in `scripts/preflight-upgrade.sql`, group 0017).
2. Point the Approvals screen and `/api/approvals/pending|my-requests` at `workflow_instances` and its action items;
   keep the response shape until the screen is switched.
3. Migrate in-flight (pending) requests: they already have an instance; nothing to copy once step 1 is clean.
4. Stop dual-writing `approval_requests` (remove the UPDATE block in `recordLegacyDecision`); keep the table read-only as
   history. Do not delete rows (approval history is audit data).
5. Delete `verify-approval-parity.js`, the `approvals-parity` script, `recordLegacyDecision` and the legacy maps in
   `routes/approvals.js` once parity has been green for a full release cycle.

## Not touched here
`scripts/cleanup-orphan-approvals.js --apply` hard-deletes workflow instances and their approval rows. It is a manual
backstop, not part of any flow; it should be replaced by a cancel-with-reason action before retirement.
