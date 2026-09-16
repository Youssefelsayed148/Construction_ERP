# 29 - Security, Observability, Backups and Reliability

## Security
- OIDC/OAuth compatible auth
- MFA support
- secure password/session policies
- CSRF protection where relevant
- secure cookies/tokens
- server-side authorization on every protected request
- object-level project/organization checks
- encrypted secrets
- signed/private file URLs
- malware/file-type scanning policy
- rate limiting
- brute-force protection
- audit logs

## Agent security
- never give MCP unrestricted database credentials
- scoped tokens
- policy evaluation per tool call
- high-risk approval records
- tool allowlist by role
- redact forbidden fields before model exposure

## Observability
- structured application logs
- correlation IDs
- error tracking
- job queue health
- DB performance
- API latency/error rates
- webhook delivery health
- notification delivery health
- inventory/reconciliation alarms
- agent tool-call audit

## Health checks
- app
- database
- object storage
- job queue
- mail provider
- integrations
- MCP endpoint

## Backups
- automated DB backups
- object/file backup policy
- retention schedule
- restore drills
- RPO/RTO documented

## Reliability
- idempotent scheduled jobs
- outbox/event pattern for important events
- retries with dead-letter handling
- no silent failed notifications or webhooks
