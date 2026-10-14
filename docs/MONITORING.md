# Monitoring and alerting

This repository exposes local health checks and aggregate operational metrics. No
external monitoring provider is configured; production delivery must use an
approved adapter and remain disabled until its credentials and alert destinations
are configured by an operator.

## Endpoints

- `GET /api/health` is an unauthenticated readiness check. It reports whether the
  API process can reach PostgreSQL. Use it for container readiness; it is not a
  business or queue-health signal.
- `GET /api/v1/health` is the versioned API readiness envelope.
- `GET /api/v1/ops/metrics` requires an authenticated owner/admin token. It reports
  aggregate outbox counts, oldest pending retry time, failed background sweep
  count, and notification delivery counts by status. It excludes event payloads,
  user/project identifiers, and provider error text. This is a platform-wide
  endpoint, so its access is restricted to owner/admin roles rather than project
  scope.

The metrics status is `degraded` when dead outbox events, failed background sweep
runs, failed notification deliveries, or undelivered notifications exist; otherwise
it is `healthy`. Treat a rising pending count or an old `oldest_pending_next_retry`
as an alert candidate even while status is healthy. The API currently exposes
current counts and does not retain metric history.

## Local operator checks

From `backend/`, with `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and
`DB_PASSWORD` set for a local or approved staging database:

```powershell
npm run outbox:stats
npm run reconcile
```

`outbox:stats` exits nonzero when dead events or failed sweeps exist. Reconciliation
is read-only and additionally requires `RECONCILIATION_BACKUP_CONFIRMED=true` after
the operator confirms a restorable backup. Use only a disposable/restored test copy
for closeout validation; do not point these commands at production during this
closeout.

## Initial response

1. Check `/api/health` to separate a database outage from queue degradation.
2. Read `/api/v1/ops/metrics` with an owner/admin token and note sampled time,
   pending age, dead events, failed sweeps, and notification delivery status counts.
3. Use `npm run outbox:stats` on the authorized local/staging target for event-level
   diagnostics. Keep provider integrations disabled unless an operator has approved
   their credentials and destinations.
4. Do not redrive or manually change queue rows until the cause is understood; use
   the existing idempotent redrive/retry paths and capture the resulting audit log.

This guide does not claim monitoring history, paging, backup restore, or production
alert delivery has been configured or rehearsed.
