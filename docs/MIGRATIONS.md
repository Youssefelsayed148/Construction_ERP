# Migrations

Runner: `npm run migrate` (backend). It records every migration in `schema_migrations` (version, kind, checksum, applied_at) and holds a Postgres advisory lock so only one replica migrates at a time.

- **Legacy** (`setupDb.js`, `migrate-N.js`, frozen list in `run-all-migrations.js`): each script runs in one transaction, is skipped once recorded, and re-runs once if its file changes (they are idempotent). Do not add to this list.
- **Versioned** (`backend/src/migrations/NNNN_name.sql`): all new schema and data changes. Applied in file order, one transaction each, forward-only. Editing an applied file fails the run; add a new file instead.
- Failure rolls back that migration and stops the run. No `.catch(() => {})` in migrations (CI guard).
- After all migrations every owned sequence is moved past `MAX(id)`. A migration that copies rows with explicit ids should still call `setSequenceToMax` from `migration-support.js`.
- Database dumps in `db_dump/` are a first-boot seed only; the migrator is the authority.
- Real-PostgreSQL tests: `TEST_PG=1 npm run test:pg` (needs a disposable migrated database).
