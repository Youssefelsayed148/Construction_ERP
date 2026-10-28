# Migrations

Current source inventory (2026-10-14): highest version `0064_schedule_activity_bac.sql`; next migration must be `0065`. Fresh disposable PostgreSQL runner output: 126 applied / 0 already applied. `0030` stays unused. Earlier dated entries below are historical snapshots, not the current maximum.

Runner: `npm run migrate` (backend). It records every migration in `schema_migrations` (version, kind, checksum, applied_at) and holds a Postgres advisory lock so only one replica migrates at a time.

- **Legacy** (`setupDb.js`, `migrate-N.js`, frozen list in `run-all-migrations.js`): each script runs in one transaction, is skipped once recorded, and re-runs once if its file changes (they are idempotent). Do not add to this list.
- **Versioned** (`backend/src/migrations/NNNN_name.sql`): all new schema and data changes. Applied in file order, one transaction each, forward-only. Editing an applied file fails the run; add a new file instead.
- Failure rolls back that migration and stops the run. No `.catch(() => {})` in migrations (CI guard).
- After all migrations every owned sequence is moved past `MAX(id)`. A migration that copies rows with explicit ids should still call `setSequenceToMax` from `migration-support.js`.
- Database dumps in `db_dump/` are a first-boot seed only; the migrator is the authority.
- Real-PostgreSQL tests: `TEST_PG=1 npm run test:pg` (needs a disposable migrated database).

Numbering note: versioned migration `0030` is absent in the observed history. Treat `0030` as a known numbering gap: do not reuse it. Its historical intent is unverified. As of 2026-10-13, `0060_restrict_handover_document_links.sql` is the highest migration in source. Migrations through 0060 were applied to a fresh local Postgres 16 throwaway database for the closeout gates.

## Before upgrading a real database

1. Restore a copy of the real database somewhere disposable.
2. `psql -X -f scripts/preflight-upgrade.sql <dsn>`: read only; one row per migration effect with the number of existing rows it will write (`will_change`), leave unchanged, or leave violating a NOT VALID constraint (`will_stay_invalid`). `attention` rows are things to look at (users without a role row, template roles that already exist).
3. `npm run migrate` against the copy, then `npm run data-cleaning-report` (backend). It lists the rows that stop any NOT VALID constraint from being validated, for every CHECK and foreign key in the database, and never fixes them. Exit code 2 means offenders exist. After fixing rows by hand, `ALTER TABLE ... VALIDATE CONSTRAINT ...`.

As of 2026-10-14, migration `0061_subcontract_advance_caps.sql` is the highest source migration. It has been applied only to the disposable local Postgres 16 database used for closeout testing; it is not evidence that any shared or production database is migrated.

At the earlier 0062 implementation checkpoint, migration `0062_forecast_etc_basis.sql` was the highest source migration; the current maximum is `0064_schedule_activity_bac.sql`. Migrations 0061-0064 have now been applied only to disposable local PostgreSQL 16 test databases for closeout verification; no shared or production database was migrated.

## Status CHECK constraints (0075-0083, added 2026-10-28)

Migrations `0075_procurement_status_checks.sql` through `0083_misc_infra_status_checks.sql` add a
`NOT VALID` CHECK on the `status` column of 70 base tables (the procurement batch plus eight
subsystem batches). Every vocabulary was derived from all writers of that column (routes, services,
workflow-engine maps/templates, seeds, fixtures, and data migrations); workflow-mirrored step keys
and filter-only values are called out in per-table comments, and uncertain values are INCLUDED so
no legitimate write can be blocked. History/audit mirror columns
(`activity_log.old_status`/`new_status`, `observation_status_history.from_status`) are deliberately
unconstrained — their vocabulary is the union of every other status by design.

- Each migration is idempotent (pg_constraint lookup before ADD CONSTRAINT) and `NOT VALID`, so
  existing rows can never block applying it.
- Three route schemas were tightened in the same commits so the API cannot write values the CHECKs
  reject: `PUT /api/payroll/:id`, `PUT /api/assets/:id`, `PUT /api/maintenance/:id` status fields.
- After applying, an operator validates each constraint once the data is confirmed clean:
  `psql -X -f scripts/validate-status-constraints.sql <dsn>` — one `ALTER TABLE ... VALIDATE
  CONSTRAINT` line per table, grouped by batch, each idempotent. A failed validation rolls back only
  that statement and does not drop the constraint; fix or restore the offending rows and re-run.
- Bulk pre-check before validating:
  `SELECT conrelid::regclass, conname FROM pg_constraint WHERE conname LIKE '%_status_check' AND NOT convalidated;`
