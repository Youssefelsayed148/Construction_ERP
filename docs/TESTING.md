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

| # | Layer (spec 26) | Automated CI test | Runs in CI? |
| --- | --- | --- | --- |
| 1 | Auth / token typing | `token-typing.pg.test.js` (PG), `tokens.test.js`, `shell.spec.js` | mock + PG + frontend |
| 2 | Authorization (roles, policy, scoping) | `role-matrix.pg.test.js`, `record-scoping.pg`, `record-scope-rules.pg`, `fail-closed.pg`, `policy-matrix.pg` (B6), `nav-visibility.pg` (B7) | mock + PG |
| 3 | Migration integrity | `migration-runner.pg.test.js`, `migration-bootstrap.test.js`, fresh-migrate-twice in CI | mock + PG |
| 4 | Money and ledger correctness | `journal.pg`, `ledger-postings.pg`, `cost-accrual.pg`, `golden-chain.pg` | mock(ads) + PG |
| 5 | Inventory integrity | `inventory-integrity.pg`, `procurement-locking.pg`, `inventory-flows.pg` (B2), `concurrency.pg` (B3), `constraints-b4.pg` (B4) | PG |
| 6 | Workflow engine | `approvals-atomic.pg`, `approvals-cancel.pg`, `mcp-safety.pg`, `workflow-flows.pg` (B2) | mock + PG |
| 7 | Event/outbox integrity | `outbox.pg`, `event-integrity.pg`, `concurrency.pg` (dispatcher race) | PG |
| 8 | API contract (envelopes, error codes) | `external-api.test.js` + live `v1-contract.pg.test.js` (B5) | mock + PG |
| 9 | Input validation | `route-guards.test.js`, service validation asserts, `v1-contract.pg` 400-envelope check (B5) | mock + PG |
| 10 | Frontend localization | `frontend/src/i18n/*` unit tests, `i18n:check` guard, e2e `locale.spec.js`, `Shell.i18n.test.js` | all three |
| 11 | Portal isolation | `portal.test.js`, `portal-acceptance.pg.test.js` (B12), `policy-matrix.pg` external rows (B6) | mock + PG |
| 12 | Performance / load | `scripts/load-profiling.js` with recorded baselines (`docs/LOAD_BASELINES.md`, B11) — **NOT in CI** (plan rule: baselines only, run manual/throwaway) | n/a by plan |

Backend journeys (`journeys-backend.spec.js`, B10) are **gated** (`E2E_BACKEND=1`): they need a
seeded owner, so CI skips them; run them per the section below. Layers with only mock-backend
coverage are marked; every layer except 12 has at least one automated CI test (12 is recorded
manually by plan decision — no thresholds yet).

## Real-backend Playwright journeys (B10)

`frontend/e2e/journeys-backend.spec.js` — gated, not API-mocked, desktop + mobile viewports,
Arabic-first shell assertions (Phase 10 boundary respected). One seeded owner per throwaway
database: in `backend/`, `SEED_DEFAULT_OWNER=true DEFAULT_OWNER_EMAIL=<journey email>
DEFAULT_OWNER_PASSWORD=<12+ chars> node src/scripts/setupDb.js` (joi's default TLD rule rejects
invented TLDs like `.erp` — use a plausible domain), then run the app and
`E2E_BACKEND=1 npx playwright test e2e/journeys-backend.spec.js` from `frontend/`.

(Last updated in the Part B slice of the closeout; keep this table in sync when a layer lands.)

## Reconciliation scripts (B8, for the Phase 11 restore check)

`npm run reconcile` (in `backend/`) runs `src/scripts/reconcile-database.js`: read-only, one
violations count per check, exit 1 when any is non-zero. It covers the allocation/retention/transfer
invariants plus the closeout B8 additions: stock ledger vs `warehouse_stock` projection (exact sign
map), project cost rows vs their ledger postings, AP/AR postings vs live documents, approvals vs
workflow instances. Run it on a restored copy only (it guards itself behind
`RECONCILIATION_BACKUP_CONFIRMED=true`); a suite-run throwaway DB is expected to show residue from
suite teardown, so zero there is not required.
