# Local Docker staging pilot

This runbook operates only on the local Compose pilot. It uses the staging database name `construction_erp_staging`, publishes the UI on `127.0.0.1:8090`, and publishes PostgreSQL on `127.0.0.1:55440`. The database and uploads use separate named volumes. Do not use this procedure with a production database or external service.

## Prerequisites

- Windows PowerShell and Docker Desktop with the Linux container engine running.
- Node.js and npm installed; dependencies already installed in `backend/` and `frontend/`.
- Repository root: `D:\The Osiris Labs\Construction_ERP`.

## Generate local configuration and start

Run from the repository root. The env generator creates an ignored file and refuses to overwrite an existing file. Never display or commit `.env.docker`.

```powershell
Set-Location 'D:\The Osiris Labs\Construction_ERP'

# Run this only when .env.docker does not exist yet.
npm --prefix backend run staging:env

$env:COMPOSE_PROJECT_NAME = 'erp-closeout-pilot-20261013'
docker compose --project-name $env:COMPOSE_PROJECT_NAME --env-file .env.docker up --build -d
docker compose --project-name $env:COMPOSE_PROJECT_NAME --env-file .env.docker ps
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

Success ends with `STAGING_SMOKE_OK`. It verifies role login, assignment and cross-project denials, English/Arabic response headers, PR through payment, file access scoping, accounting balance, reconcile checks, and session revocation. It does not send external notifications or payments.

## Backup and restore rehearsal

Run from the repository root after the pilot is seeded. The script stores a database dump, uploads copy, and before/after JSON snapshot under the printed OS temp directory. It restores the DB into a differently named temporary database, runs the 103-entry migration dry-run plus read-only reconciliation and data-cleaning checks, then drops only the temporary restore database and container-side scratch dump.

```powershell
npm --prefix backend run backup:rehearse
```

The rehearsal is guarded by `APP_ENV=staging`, a staging/test DB-name segment, and loopback DB host. It sets `RECONCILIATION_BACKUP_CONFIRMED=true` for the restored-database reconcile process only after verifying the dump file. Retain or remove the printed temp backup bundle according to the local pilot's data-retention needs.

## Inspect and stop

These commands leave the named database and uploads volumes intact:

```powershell
docker compose --project-name $env:COMPOSE_PROJECT_NAME --env-file .env.docker ps
docker compose --project-name $env:COMPOSE_PROJECT_NAME --env-file .env.docker logs --tail 100 backend
docker compose --project-name $env:COMPOSE_PROJECT_NAME --env-file .env.docker stop
```

Start it again with the same `up --build -d` command. Do not use `down -v` for this pilot; that removes its persisted DB and uploads data. A newly named Compose project creates separate named volumes, but the fixed localhost ports mean only one copy can run at a time.

## Test accounts and secrets

- Generated test credentials: ignored root `.staging-users.json` (passwords are rotated on each staging seed run).
- Generated Compose settings: ignored root `.env.docker`.
- Account list: one user for each of the 33 canonical roles, plus staging edge and workflow compatibility accounts.
- Pilot project: `PILOT-PTP-001`.

Passwords and database/JWT credentials are intentionally not listed in this document or in command output.
