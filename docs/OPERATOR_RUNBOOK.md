# Operator runbook

Every command below is quoted from an actual script, config file, or doc in this repo (file:line given
inline); nothing here is invented. For the full Docker Compose pilot procedure (env generation, seed data,
smoke test, inspect/stop), the authority is `docs/STAGING.md` — this runbook pulls forward only what an
operator needs inline and links back to it for the rest.

## 1. Start / stop

### Local dev (no Docker)

From the repo root (`package.json` scripts):

```bash
npm run dev            # concurrently runs dev:backend + dev:frontend
npm run dev:backend    # cd backend && npm run dev   -> nodemon server.js
npm run dev:frontend   # cd frontend && npm start
npm run setup:db       # cd backend && node src/scripts/setupDb.js (first-time schema bootstrap)
```

(`package.json` lines 6-11; `backend/package.json` `"dev": "nodemon server.js"`.)

Backend listens on `PORT` (default 5000, `backend/src/config/index.js:4`); frontend dev server proxies to it.

### Docker Compose pilot stack (staging-shaped, port 8090)

Full procedure, including `.env.docker` generation, seeding and the smoke test, is in `docs/STAGING.md`.
The commands an operator needs to start/stop it:

```powershell
npm --prefix backend run staging:env        # generate .env.docker (only if it doesn't exist yet)
$env:COMPOSE_PROJECT_NAME = 'erp-closeout-pilot-20261013'
docker compose --project-name $env:COMPOSE_PROJECT_NAME --env-file .env.docker up --build -d
docker compose --project-name $env:COMPOSE_PROJECT_NAME --env-file .env.docker ps
```

Stop (keeps the named volumes, so data survives):

```powershell
docker compose --project-name $env:COMPOSE_PROJECT_NAME --env-file .env.docker stop
```

Restart with the same `up --build -d` command. Never run `down -v` for this pilot — it deletes the `db_data`
and `uploads_data` named volumes (`docker-compose.yml` `volumes:` block). See `docs/STAGING.md` "Generate
local configuration and start" and "Inspect and stop" for the `cmd.exe` forms, the health-check loop, and
the seed/smoke sequence (`seed:staging`, `seed:pilot-data`, `smoke:staging`).

The Compose stack is three services (`docker-compose.yml`): `db` (Postgres 16, published on
`127.0.0.1:${DB_PORT:-55440}`), `migrate` (runs `npm run migrate` once and exits), and `backend` + `frontend`
(frontend published on `127.0.0.1:8090`, proxying `/api` to the backend).

## 2. Environment variables (names only — no values)

Grouped by concern; derived from `backend/src/config/`, `.env.example`, `docker-compose.yml`, and every
`process.env.X` read under `backend/src/`. Variable **names** only, per this repo's secret-handling rule.

**Server / HTTP**
`PORT`, `FRONTEND_URL`, `NODE_ENV`, `APP_ENV`, `TRUST_PROXY`, `CORS_ALLOW_HTTP_LOCAL`, `CORS_EXTRA_ORIGINS`,
`JSON_BODY_LIMIT`, `FORM_BODY_LIMIT` (`backend/src/config/index.js`, `backend/server.js:1-40`).

**Database**
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_CONNECT_TIMEOUT_MS`, `PGOPTIONS`
(`backend/src/config/database.js:5-17`).

**Auth / JWT / sessions / webhooks**
`JWT_SECRET` (and optional per-token-type overrides `JWT_SECRET_SESSION`, `JWT_SECRET_PREVIEW`,
`JWT_SECRET_V1`, `JWT_SECRET_REFRESH` — `.env.example` lines 18-22), `SESSION_TTL_SECONDS`,
`V1_TOKEN_TTL_SECONDS`, `V1_REFRESH_TTL_SECONDS`, `AUTH_RATE_LIMIT_PER_15_MIN`, `V1_RATE_LIMIT_PER_MIN`,
`MCP_RATE_LIMIT_PER_MIN`, `MCP_MAX_BATCH`, `WEBHOOK_ENCRYPTION_KEY`, `WEBHOOK_ENCRYPTION_KEY_PREVIOUS`,
`WEBHOOK_ENCRYPTION_KEY_ALLOW_JWT_FALLBACK`, `WEBHOOK_ALLOW_HTTP_LOCAL` (`docker-compose.yml`,
`docs/STAGING.md` "Generate local configuration and start").

**PDF rendering (Chromium)**
`PDF_CHROMIUM_PATH`, `PDF_CHROMIUM_REQUIRED`, `COMPANY_NAME`, `COMPANY_TAGLINE` — see section 8 below.

**Notification adapters**
See `docs/STAGING.md`'s "Notification adapters" section for the adapter/provider env vars (owned by a
parallel part of this closeout batch). As of this writing that section was not yet present in
`docs/STAGING.md`; if it still is not when you read this, there is no SMTP/provider env var list to
reproduce here — check `docs/STAGING.md` directly. Independently of that section, `notificationService.js`
reads a `NOTIFICATION_LIVE_SEND_ENABLED` toggle (documented as a feature flag in section 9 of
`docs/STAGING.md`, the "Feature flags" section this closeout batch adds).

**File / upload storage**
No env vars. Uploaded files are written to the local filesystem under `backend/uploads/`
(`backend/src/routes/documents.js:12-16`, `backend/src/routes/media.js:9`, served at `/uploads` —
`backend/server.js:46`). In the Compose stack this path is the `uploads_data` named volume
(`docker-compose.yml` `backend.volumes`). There is no S3/CDN integration or configuration in the codebase.

**Migration / reconciliation scripts**
`MIGRATIONS_TABLE`, `MIGRATION_CHECKSUM`, `MIGRATION_VERSION`, `RECONCILIATION_BACKUP_CONFIRMED`,
`RECONCILIATION_STALE_RECEIPT_HOURS`, `CONFIRM_THROWAWAY_DB`.

**Seed / demo / staging scripts**
`COMPOSE_PROJECT_NAME`, `SEED_DEFAULT_OWNER`, `DEFAULT_OWNER_EMAIL`, `DEFAULT_OWNER_PASSWORD`,
`SMOKE_BASE_URL`.

**Outbox / background sweeps**
`OUTBOX_BATCH_SIZE`, `OUTBOX_INTERVAL_MS`, `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_BACKOFF_BASE_SECONDS`,
`OUTBOX_BACKOFF_MAX_SECONDS`, `OUTBOX_STALE_MINUTES`, `OUTBOX_DISPATCH_BUDGET_MS`,
`ESCALATION_SWEEP_MINUTES`, `DENIAL_AUDIT_WINDOW_MS`.

**Test / load / discovery scripts only (not needed to run the app)**
`TEST_PG`, `LOAD_PORT`, `LOAD_REPORT_DIR`, `LOAD_TAG`, `CANCEL_ACTOR_ID`, `R2_ONLY`, `R2_WRITE_PENDING`,
`R4_BASELINE_ID`, `R4_SWEEP_PROOF_DELAY_MS`, `R4_SWEEP_PROOF_NAME`, `R4_SWEEP_PROOF_RETENTION_DAYS`,
`R12_DISCOVERY_STAGE`, `BATCH5A_WRITE_REPORTS`, `PG_REVIEW_BIN`, `PROJECT_CREATION_WIZARD` (feature flag,
see `docs/STAGING.md`'s Feature flags section).

## 3. Migrations

Runner (`backend/package.json`): `npm run migrate` → `node src/scripts/run-all-migrations.js`. Records every
migration in `schema_migrations` (version, kind, checksum, applied_at) and holds a Postgres advisory lock
so only one replica migrates at a time (`docs/MIGRATIONS.md`). Versioned SQL files live at
`backend/src/migrations/NNNN_name.sql`, applied in file order, one transaction each, **forward-only** — no
down-scripts exist by design.

### What "rollback" means here

There is no `migrate down`. Per `docs/MIGRATIONS.md`, the rollback mechanism is **restore from a verified
backup**, and `docs/CLOSEOUT_RECONCILIATION.md`'s T4 section rehearsed exactly that end to end:

```bash
# (run as part of the pilot's Docker Compose stack; db is the postgres service)
docker compose exec -T db pg_dump -U "$DB_USER" -Fc -f /tmp/dump.pgdump "$DB_NAME"
# ... restore into a differently-named database for verification ...
createdb -U "$DB_USER" erp_restore_check
docker compose exec -T db pg_restore -U "$DB_USER" --exit-on-error -d erp_restore_check /tmp/dump.pgdump
```

(Exact invocation pattern from `backend/src/scripts/backup-restore-rehearsal.js:90,101`, which automates
this with `docker ... exec -T db pg_dump ...` / `pg_restore ...`.) T4's recorded run: `pg_dump -Fc
erp_closeout_test` (1,143,883 bytes) → `CREATE DATABASE erp_closeout_restore_test` → `pg_restore` → row
counts identical before/after (users 0/0, `schema_migrations` 135/135, public tables 259/259) —
`docs/CLOSEOUT_RECONCILIATION.md` lines 293-301.

The repo also ships this as a one-command rehearsal (`backend/package.json`):

```bash
npm --prefix backend run backup:rehearse
```

It is guarded by `APP_ENV=staging`, a staging/test DB-name segment, and a loopback DB host
(`docs/STAGING.md` "Backup and restore rehearsal"), and only runs against the local Compose pilot.

Before upgrading a real database, `docs/MIGRATIONS.md`'s own procedure is:

1. Restore a copy of the real database somewhere disposable.
2. `psql -X -f scripts/preflight-upgrade.sql <dsn>` — read-only dry run reporting `will_change` /
   `will_stay_invalid` / `attention` rows.
3. `npm run migrate` against the copy, then `npm --prefix backend run data-cleaning-report` (exit code 2
   means offenders exist).

## 4. Backup / restore

Mechanism: `pg_dump -Fc` / `pg_restore`, exactly as in section 3 above and as automated by
`npm --prefix backend run backup:rehearse`. Operational framing (schedule, retention, off-host copy
location): **not yet decided — operator to define.** `docs/STAGING.md`'s own rehearsal section only says
"retain or remove the printed temp backup bundle according to the local pilot's data-retention needs," which
is not a schedule. No cron/retention policy for backups exists anywhere in this repo.

## 5. Health checks

`GET /api/health` (`backend/server.js:53-60`) — returns `{ name, version, status: 'ready'|'degraded',
database: {...}, timestamp }`, HTTP 200 when the DB is healthy, 503 when not. This is what the Compose
`backend` service's own Docker healthcheck calls (`docker-compose.yml`: `node -e "fetch('http://127.0.0.1:5000/api/health')..."`).

`GET /api/v1/openapi.json`'s sibling, `GET /api/v1/health` (`backend/src/routes/v1.js:612-614`), is the
same database health check exposed on the versioned external API surface (no auth required).

No other `/healthz`, readiness, or uptime endpoint exists in the codebase.

## 6. Log locations

Logger: Winston (`backend/src/utils/logger.js`), JSON format with a Console transport only — stdout/stderr,
no file transport, no log volume. Every request is logged via `logger.info(`${req.method} ${req.url}`)`
(`backend/server.js:44-47`); server errors go through `sanitizeServerError` into `logger.error` (same file,
line 32). In the Docker Compose stack, logs are visible with:

```bash
docker compose --project-name <name> --env-file .env.docker logs --tail 100 backend
```

No log volume is mounted in `docker-compose.yml` — container logs are ephemeral (Docker's own log driver)
unless the operator configures one. There is no separate audit-log file; audit trail is the `audit_events`
database table, not a log file.

## 7. Rate limits

All rate limiting is a shared Postgres fixed-window limiter (`backend/src/middleware/postgresRateLimit.js`),
not an in-memory one — correct across multiple backend instances.

| Scope | Window | Default limit | Source |
|---|---|---|---|
| Login (`/api/auth/login`, `/api/v1/oauth/token`) | 15 min | `AUTH_RATE_LIMIT_PER_15_MIN` = 20 | `backend/server.js:35-40` |
| `/api/v1` public (pre-auth) | 60 s | `V1_RATE_LIMIT_PER_MIN` = 300 | `backend/src/middleware/v1.js:51-61` |
| `/api/v1` authenticated | 60 s | `V1_RATE_LIMIT_PER_MIN` = 300 (per subject) | `backend/src/middleware/v1.js` `createAuthenticatedRateLimit` |
| `/api/mcp` | 60 s | `MCP_RATE_LIMIT_PER_MIN` = 120 | `backend/src/routes/mcp.js:23-30` |

Exceeding a limit returns HTTP 429 with a `Retry-After` header; a rate-limit-store outage (DB unavailable)
returns 503, not a silent bypass (`postgresRateLimit.js:56-64`).

## 8. Chromium dependency (Arabic PDF export)

Arabic documents are rendered as HTML and printed by headless Chromium via `playwright-core`
(`backend/src/utils/htmlPdf.js:124-141`; English documents keep the existing PDFKit layout — see the file's
header comment and `docs/i18n/PDF_SPIKE.md`). `playwright-core` (`backend/package.json`: `"playwright-core":
"^1.63.0"`) does **not** bundle a browser; it needs a Chromium binary already on the host, pointed to by
`PDF_CHROMIUM_PATH`. If unset, `chromium.launch()` falls back to Playwright's own executable-path lookup,
which only succeeds if Playwright's browser download step was run separately.

The production Docker image installs a system Chromium and points at it explicitly
(`backend/Dockerfile`):

```dockerfile
RUN apk add --no-cache chromium
ENV PDF_CHROMIUM_PATH=/usr/bin/chromium
```

So in the Compose pilot and any image built from this Dockerfile, Chromium "just works." Outside Docker
(plain `npm run dev` on a host), an operator must either install a system Chromium/Chrome and set
`PDF_CHROMIUM_PATH` to it, or run Playwright's browser installer so the unset-path fallback resolves.
`PDF_CHROMIUM_REQUIRED=1` makes a missing/failed browser launch a hard test failure instead of a soft skip
(`backend/src/scripts/__tests__/f4-pdf-export.test.js:5,75` — test-only switch). In production code, a
failed launch returns a typed 503 `pdf_renderer_unavailable` error rather than producing a corrupted PDF
(`htmlPdf.js:152-159`).

## 9. Load / performance testing

A runnable load-profiling script exists: `backend/src/scripts/load-profiling.js`. It is not k6/autocannon/
artillery — it is a repo-specific Node script that boots its own app instance against a throwaway Postgres
container, runs latency/concurrency ladders (c1/c4/c8), and writes raw percentiles to a dated JSON file
(`docs/LOAD_BASELINES.md`). Per this closeout's rule, it was **not executed** during this documentation
slice. Its documented invocation (`docs/LOAD_BASELINES.md`):

```bash
cd backend
CONFIRM_THROWAWAY_DB=true LOAD_TAG=<label> LOAD_PORT=5130 node src/scripts/load-profiling.js
```

It refuses to run unless `CONFIRM_THROWAWAY_DB=true` and the `DB_*` env points at a throwaway container. See
`docs/LOAD_BASELINES.md` for the one existing recorded baseline (2026-10-04) and its caveats (single-user
workstation latency, not a capacity number).

## 10. Notification adapter configuration

See `docs/STAGING.md`'s "Notification adapters" section (owned by a parallel part of this closeout batch)
for the adapter/provider environment variables. Do not duplicate that list here.
