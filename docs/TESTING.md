# Testing guide

How to run the suites locally and in CI, and what the harness guarantees. The plan's Phase 4 exit
gate (the 12-layer table) is at the bottom; it grows as Part B lands.

## The three suites

| Suite | Command | Database | What it is for |
| --- | --- | --- | --- |
| Mock | `cd backend && npm test` | in-process mock executor | fast unit tests; no SQL semantics (lengths, CHECKs, concurrent transactions) |
| Real PG | `TEST_PG=1 npm run test:pg` (in `backend/`) | PostgreSQL 16, migrated once | everything the mock cannot see: locks, races, constraints, views, triggers, workflows, cost postings |
| Frontend | `npm run test:ci` / `npm run test:e2e` (in `frontend/`) | real backend for e2e | unit + Playwright journeys |

Guards are not tests but run in every CI job: `npm run lint:guards` (in `backend/`) must stay green
with an empty baseline.

## Environment (never point these at real data)

`TEST_PG=1` + `DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD`. The suites refuse to run against a
database whose name contains "prod" and fail fast if migrations are missing. `DB_CONNECT_TIMEOUT_MS`
(default 5000) is honoured by the pool and by the harness precheck. The backend reads `backend/.env`
when present; environment variables set on the command line win over it.

Local throwaway container:

```bash
docker run -d --name erp-<task>-pg -p <port>:5432 -e POSTGRES_DB=construction_erp \
  -e POSTGRES_USER=construction_erp_user -e POSTGRES_PASSWORD=test-database-password postgres:16
cd backend
DB_HOST=127.0.0.1 DB_PORT=<port> DB_NAME=construction_erp DB_USER=construction_erp_user \
  DB_PASSWORD=test-database-password JWT_SECRET=local-test-secret-that-is-longer-than-32-chars \
  npm run migrate
TEST_PG=1 <same env> npm run test:pg
```

`JWT_SECRET` is required by `src/services/tokens.js` in every suite that touches the app.

Remove the container afterwards. Never run the suites against a database that holds real data.

## Harness model (B1)

`jest.pg.config.js` runs `jest.pg.global-setup.js` before any suite:

- fails fast when `TEST_PG` is unset, the database is unreachable (within `DB_CONNECT_TIMEOUT_MS`),
  or migrations are missing (`npm run migrate` first);
- refuses a database named like production.

Isolation: the schema is migrated **once per run**; each suite creates its own uniquely tagged rows
(`tag = Date.now()`) and cleans up what it can (users are deactivated, never deleted, and rows are
garbage-collected only where safe). There is deliberately **no transaction-per-test**: the suites
test transactions, locks and constraints themselves, and a wrapping transaction would hide exactly
the behaviour under test. Suites run with `--runInBand` so tagged namespaces never overlap.

Consequence: a suite run leaves residual tagged rows behind in the throwaway database. That is
acceptable there and nowhere else. Probes that must not persist (a refusal check against a
constraint) run inside a transaction that always rolls back, so they never leave rows that a later
migration preflight would trip over.

## CI (`.github/workflows/ci.yml`)

Three jobs, all required green on every PR:

1. **backend-mock** — `lint:guards` + mock suite (`npm test -- --runInBand --detectOpenHandles`).
2. **backend-pg** — Postgres 16 service container; fresh migration, migration again (must be
   repeatable), then `npm run test:pg`.
3. **frontend** — `i18n:check`, unit tests, production build, Playwright at desktop and mobile
   viewports.

## Exit gate: spec 26's 12 layers

| # | Layer (spec 26) | Automated CI test |
| --- | --- | --- |
| 1 | Auth / token typing | `token-typing.pg.test.js`, `tokens.test.js` |
| 2 | Authorization (roles, policy, scoping) | `role-matrix.pg.test.js`, `record-scoping.pg.test.js`, `fail-closed.pg.test.js` |
| 3 | Migration integrity | `migration-runner.pg.test.js`, `migration-bootstrap.test.js`, fresh-migrate-twice in CI |
| 4 | Money and ledger correctness | `journal.pg.test.js`, `ledger-postings.pg.test.js`, `golden-chain.pg.test.js` |
| 5 | Inventory integrity | `inventory-integrity.pg.test.js`, `procurement-locking.pg.test.js`, `concurrency.pg.test.js` |
| 6 | Workflow engine | `approvals-atomic.pg.test.js`, `mcp-safety.pg.test.js` |
| 7 | Event/outbox integrity | `outbox.pg.test.js`, `event-integrity.pg.test.js` |
| 8 | API contract (envelopes, error codes) | `external-api.test.js` (mock); live contract test pending (B5) |
| 9 | Input validation | `route-guards.test.js`, service validation asserts |
| 10 | Frontend localization | `frontend/src/i18n/*` unit tests, `i18n:check` guard, e2e `locale.spec.js` |
| 11 | Portal isolation | `portal.test.js` (mock); real-PG portal isolation pending (B6/B12) |
| 12 | Performance / load | load baselines pending (B11, docs file to be linked here) |

(Last updated in the Part B slice of the closeout; keep this table in sync when a layer lands.)

## Reconciliation scripts (B8, for the Phase 11 restore check)

`npm run reconcile` (in `backend/`) runs `src/scripts/reconcile-database.js`: read-only, one
violations count per check, exit 1 when any is non-zero. It covers the allocation/retention/transfer
invariants plus the closeout B8 additions: stock ledger vs `warehouse_stock` projection (exact sign
map), project cost rows vs their ledger postings, AP/AR postings vs live documents, approvals vs
workflow instances. Run it on a restored copy only (it guards itself behind
`RECONCILIATION_BACKUP_CONFIRMED=true`); a suite-run throwaway DB is expected to show residue from
suite teardown, so zero there is not required.
