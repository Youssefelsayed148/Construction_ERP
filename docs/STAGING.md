# Local Docker staging pilot

This runbook operates only on the local Compose pilot. It uses the staging database name `construction_erp_staging`, publishes the UI on `127.0.0.1:8090`, and publishes PostgreSQL on `127.0.0.1:55440`. The database and uploads use separate named volumes. Do not use this procedure with a production database or external service.

## Prerequisites

- Windows PowerShell and Docker Desktop with the Linux container engine running.
- Node.js and npm installed; dependencies already installed in `backend/` and `frontend/`.
- Repository root: `D:\The Osiris Labs\Construction_ERP`.

## Generate local configuration and start

Run from the repository root. The env generator creates an ignored file and refuses to overwrite an existing file. Never display or commit `.env.docker`.

New generated configurations include a dedicated random `WEBHOOK_ENCRYPTION_KEY`. Staging and production startup require it to be at least 32 characters. For key rotation, set `WEBHOOK_ENCRYPTION_KEY_PREVIOUS` to the former key for a temporary window; this includes the existing `JWT_SECRET` value for ciphertext created before the dedicated key existed. Webhook secrets decrypt with the current key first, then the previous key, and are re-encrypted under the current key on the next delivery read. Remove the previous key after webhook deliveries have migrated. Dev/test may explicitly opt into the documented JWT fallback with `WEBHOOK_ENCRYPTION_KEY_ALLOW_JWT_FALLBACK=true`; staging and production reject that fallback.

The Compose file passes both variables to `migrate` and `backend` through their shared environment block: `WEBHOOK_ENCRYPTION_KEY` uses required (`:?`) interpolation and `WEBHOOK_ENCRYPTION_KEY_PREVIOUS` uses optional (`:-`) interpolation. For an existing pilot configuration missing these entries, append a new random `WEBHOOK_ENCRYPTION_KEY` and set `WEBHOOK_ENCRYPTION_KEY_PREVIOUS` to the current `JWT_SECRET` value in the same `.env.docker` file before rebuilding. Preserve existing entries and never paste values into tickets or logs.

```powershell
Set-Location 'D:\The Osiris Labs\Construction_ERP'

# Run this only when .env.docker does not exist yet.
npm --prefix backend run staging:env

$env:COMPOSE_PROJECT_NAME = 'erp-closeout-pilot-20261013'
docker compose --project-name $env:COMPOSE_PROJECT_NAME --env-file .env.docker up --build -d
docker compose --project-name $env:COMPOSE_PROJECT_NAME --env-file .env.docker ps
```

`cmd.exe` forms for those commands:

```bat
cd /d "D:\The Osiris Labs\Construction_ERP"
rem Generate only when .env.docker does not exist.
npm --prefix backend run staging:env
set "COMPOSE_PROJECT_NAME=erp-closeout-pilot-20261013"
docker compose --project-name %COMPOSE_PROJECT_NAME% --env-file .env.docker up --build -d
docker compose --project-name %COMPOSE_PROJECT_NAME% --env-file .env.docker ps
```

Wait for the API and database readiness check:

```powershell
$health = $null
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8090/api/health' -TimeoutSec 3
        if ($health.status -eq 'ready' -and $health.database.status -eq 'healthy') { break }
    } catch { }
    Start-Sleep -Seconds 2
}
if ($null -eq $health -or $health.status -ne 'ready' -or $health.database.status -ne 'healthy') {
    throw 'The local pilot did not become healthy. Inspect docker compose ps and the service health status.'
}
$health | Select-Object status, @{Name='database';Expression={$_.database.status}}
```

`cmd.exe` health check (inspect the returned `status` and `database.status` fields):

```bat
curl.exe --fail --silent --show-error http://127.0.0.1:8090/api/health
```

Open the pilot UI at `http://127.0.0.1:8090`. The backend is available through the frontend proxy under `/api`.

## Seed the pilot and run the P2P smoke

The seed scripts refuse non-staging or non-local targets. `seed:staging` rotates its generated account passwords and invalidates existing sessions each time it runs; rerun the smoke afterward. The passwords are stored in the ignored root `.staging-users.json` file. Do not print or commit that file.

```powershell
npm --prefix backend run seed:staging
npm --prefix backend run seed:pilot-data
npm --prefix backend run smoke:staging
```

The smoke target can be set explicitly; it accepts localhost HTTP only:

```powershell
npm --prefix backend run smoke:staging -- --base-url=http://127.0.0.1:8090
```

Set the required backup confirmation only after confirming a restorable backup. PowerShell:
`$env:RECONCILIATION_BACKUP_CONFIRMED='true'; npm --prefix backend run smoke:staging -- --base-url=http://127.0.0.1:8090`.
`cmd.exe`:
`set "RECONCILIATION_BACKUP_CONFIRMED=true" && npm --prefix backend run smoke:staging -- --base-url=http://127.0.0.1:8090`.

Success ends with `STAGING_SMOKE_OK`. It verifies role login, assignment and cross-project denials, English/Arabic response headers, PR through payment, file access scoping, accounting balance, reconcile checks, and session revocation. It does not send external notifications or payments.

## Backup and restore rehearsal

Run from the repository root after the pilot is seeded. The script stores a database dump, uploads copy, and before/after JSON snapshot under the printed OS temp directory. It restores the DB into a differently named temporary database, runs the 130-entry migration dry-run plus read-only reconciliation and data-cleaning checks, then drops only the temporary restore database and container-side scratch dump. The 130-entry total is established by the latest `scripts/r02-pg-gate.ps1 -All` output and `backend/src/scripts/run-all-migrations.js`; see `docs/CLOSEOUT_LOG.md` for the recorded run.

```powershell
npm --prefix backend run backup:rehearse
```

`cmd.exe`: `npm --prefix backend run backup:rehearse`.

The rehearsal is guarded by `APP_ENV=staging`, a staging/test DB-name segment, and loopback DB host. It sets `RECONCILIATION_BACKUP_CONFIRMED=true` for the restored-database reconcile process only after verifying the dump file. Retain or remove the printed temp backup bundle according to the local pilot's data-retention needs.

## Inspect and stop

These commands leave the named database and uploads volumes intact:

```powershell
docker compose --project-name $env:COMPOSE_PROJECT_NAME --env-file .env.docker ps
docker compose --project-name $env:COMPOSE_PROJECT_NAME --env-file .env.docker logs --tail 100 backend
docker compose --project-name $env:COMPOSE_PROJECT_NAME --env-file .env.docker stop
```

`cmd.exe` (using the project name shown above):

```bat
docker compose --project-name erp-closeout-pilot-20261013 --env-file .env.docker ps
docker compose --project-name erp-closeout-pilot-20261013 --env-file .env.docker logs --tail 100 backend
docker compose --project-name erp-closeout-pilot-20261013 --env-file .env.docker stop
```

Start it again with the same `up --build -d` command. Do not use `down -v` for this pilot; that removes its persisted DB and uploads data. A newly named Compose project creates separate named volumes, but the fixed localhost ports mean only one copy can run at a time.

## Test accounts and secrets

- Generated test credentials: ignored root `.staging-users.json` (passwords are rotated on each staging seed run).
- Generated Compose settings: ignored root `.env.docker`.
- Account list: 38 keys are emitted by `backend/src/scripts/seed-staging.js`: `owner_ceo`, `coo`, `projects_director`, `construction_manager`, `project_manager`, `site_manager`, `site_engineer`, `planning_engineer`, `technical_office_engineer`, `quantity_surveyor`, `commercial_manager`, `contracts_manager`, `procurement_manager`, `procurement_officer`, `finance_manager`, `accountant_ar`, `accountant_ap`, `storekeeper`, `qa_qc_manager`, `hse_manager`, `document_controller`, `equipment_manager`, `hr_manager`, `business_development`, `client_executive`, `client_reviewer`, `pmc_manager`, `consultant_coordinator`, `consultant_reviewer`, `subcontractor_manager`, `subcontractor_site_engineer`, `supplier_sales`, `testing_lab`, `unassigned`, `expired_assignment`, `workflow_owner`, `workflow_checker`, `workflow_budget`.
- Pilot project: `PILOT-PTP-001`.

Passwords and database/JWT credentials are intentionally not listed in this document or in command output.

## Residential golden-demo fixture

Run `npm --prefix backend run seed:golden-demo` after migrations have been
applied. It loads the ignored root `.env.docker` in-process, using the same
staging configuration as `seed:staging`; it never prints credentials. It
requires `APP_ENV=staging`, a loopback host, valid port, and a database name
with a test/stage/staging segment. This lets the host-side command connect to
the pilot's loopback-published PostgreSQL port without copying credentials.
It creates or
updates only the reserved `OSIRIS-GOLD-*` supplier/BOQ/recipe records and the
`OSIRIS-RES-TOWERS-001` demo project data. Do not point it at production or a
database containing real project records.

The fixture is idempotent and provisions 96 units, a 120 m3 C35 BOQ line at EGP
4,200/m3, 96 location allocations, and 122.4000 m3 of recipe demand after 2% waste.
Its supplier price is fictional fixture data. These values validate the demo
chain only; the separate commercial assumptions in `GOLDEN_VALUES.md` remain
unapproved.

## Feature flags

This is documentation of the ad hoc environment-variable toggles that already exist in the codebase, not
a new flag system — the closeout's locked decision is not to build a feature-flag framework. Found by
grepping `backend/src` for `process.env.X` reads that branch behavior with an if/else, not just configure
a value.

| Name | What it toggles | Default |
|---|---|---|
| `APPROVALS_LEGACY_DUAL_WRITE` | Whether the workflow engine also mirrors an approval's new status onto the legacy status column. Read in `backend/src/services/workflowEngine.js:767`, `backend/src/scripts/cancel-stale-approvals.js:40`, and twice in `backend/src/routes/approvals.js:175,346`. | **On** (mirrors) — only `APPROVALS_LEGACY_DUAL_WRITE=false` turns it off. |
| `NOTIFICATION_LIVE_SEND_ENABLED` | Whether the SMTP email provider actually sends mail. Read in `backend/src/services/notificationService.js:53`: when the configured email provider is `smtp` and this is not `'true'`, the send is recorded as `undelivered`/`live_delivery_disabled` instead of attempting delivery. | **Off** — must be set to `'true'` to allow live sends. |
| `PROJECT_CREATION_WIZARD` | Whether `POST /api/projects` accepts the full 11-step wizard payload shape or only the legacy flat shape. Read in `backend/src/routes/projects.js:18-22` (accepts `'1'`, `'true'`, or `'on'`). | **Off** (legacy flat shape only). |

`docs/CLOSEOUT_RECONCILIATION.md`'s Phase 11 table (line 181) names the first two of these as the only
feature-flag-shaped mechanism found in code beyond ad hoc config; this session's grep did not surface any
additional if/else-gated behavior toggle beyond `PROJECT_CREATION_WIZARD` above. (`SEED_DEFAULT_OWNER`,
checked in `backend/src/scripts/setupDb.js:455`, is a seed-script guard rather than an application rollout
flag, so it is not listed as a feature flag here.)

## Notification adapters

`backend/src/services/notificationService.js` sends every channel through a
provider keyed by `NOTIFICATION_<CHANNEL>_PROVIDER` (default `off`). Email is
the only channel with a real adapter (SMTP, via `nodemailer`); push, sms, and
whatsapp stay explicit stubs that always report `undelivered` until a real
adapter and credentials are approved for them, same as email was before this
adapter existed.

Email only ever attempts a live SMTP send when **both**
`NOTIFICATION_EMAIL_PROVIDER=smtp` **and** `NOTIFICATION_LIVE_SEND_ENABLED=true`
are set — any other value (including the default `off`, or `smtp` alone) keeps
today's behavior: no network call, a truthful `undelivered` status, and no
secrets ever read into a log line. The SMTP env vars (names only — values are
never logged or printed by this app):

- `SMTP_HOST` — SMTP server hostname. Required for a live send; missing it
  (even with the two flags above set) fails closed with `smtp_not_configured`.
- `SMTP_PORT` — SMTP server port. Defaults to `587` if unset.
- `SMTP_SECURE` — `"true"` to connect over implicit TLS; otherwise STARTTLS/plain
  per the configured port.
- `SMTP_USER` — SMTP auth username. Omit for an unauthenticated relay.
- `SMTP_PASSWORD` — SMTP auth password, paired with `SMTP_USER`.
- `SMTP_FROM_ADDRESS` — the `From:` address on outgoing mail. Required for a
  live send, same fail-closed rule as `SMTP_HOST`.
- `SMTP_FROM_NAME` — optional display name paired with `SMTP_FROM_ADDRESS`.

This pilot/staging compose keeps `NOTIFICATION_LIVE_SEND_ENABLED: "false"`, so
no SMTP env vars above need to be set here at all, and no notification email
ever leaves this environment.

