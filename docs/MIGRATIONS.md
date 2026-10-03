# Migrations

Runner: `npm run migrate` (backend). It records every migration in `schema_migrations` (version, kind, checksum, applied_at) and holds a Postgres advisory lock so only one replica migrates at a time.

- **Legacy** (`setupDb.js`, `migrate-N.js`, frozen list in `run-all-migrations.js`): each script runs in one transaction, is skipped once recorded, and re-runs once if its file changes (they are idempotent). Do not add to this list.
- **Versioned** (`backend/src/migrations/NNNN_name.sql`): all new schema and data changes. Applied in file order, one transaction each, forward-only. Editing an applied file fails the run; add a new file instead.
- Failure rolls back that migration and stops the run. No `.catch(() => {})` in migrations (CI guard).
- After all migrations every owned sequence is moved past `MAX(id)`. A migration that copies rows with explicit ids should still call `setSequenceToMax` from `migration-support.js`.
- Database dumps in `db_dump/` are a first-boot seed only; the migrator is the authority.
- Real-PostgreSQL tests: `TEST_PG=1 npm run test:pg` (needs a disposable migrated database).

## Before upgrading a real database

1. Restore a copy of the real database somewhere disposable.
2. `psql -X -f scripts/preflight-upgrade.sql <dsn>`: read only; one row per migration effect with the number of existing rows it will write (`will_change`), leave unchanged, or leave violating a NOT VALID constraint (`will_stay_invalid`). `attention` rows are things to look at (users without a role row, template roles that already exist).
3. `npm run migrate` against the copy, then `npm run data-cleaning-report` (backend). It lists the rows that stop any NOT VALID constraint from being validated, for every CHECK and foreign key in the database, and never fixes them. Exit code 2 means offenders exist. After fixing rows by hand, `ALTER TABLE ... VALIDATE CONSTRAINT ...`.
