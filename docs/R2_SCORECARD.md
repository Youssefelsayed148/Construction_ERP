# R2 scorecard — 2026-10-14

R2 in progress. No R3 work. All prior batch evidence is in its own scorecard; this document reports only R2.

| Ticket/family | Finding | Failing test | Before | After | Commit |
|---|---|---|---|---|---|
| R2.0 | UI/API project identity sanity | Static scan; no clear bug to reproduce | 69 production files / 360 call expressions | Zero duplicate query/body write candidates; indirect calls inspected | R2.0: record frontend project identity call scan |
| R2.1 | REV-003 inventory | Not done | Not yet enumerated | Not done | — |
| R2.2 | Audit enforcement | Not done | Existing missing-audit blind spot | Not done | — |
| R2.3 families | REV-003 transactional auditing | Not done | Not reproduced in R2 yet | Not done | — |
| R2.4 | Exit gates | Not run | Baselines below | Not done | — |

| Gate | Supplied baseline | R2 current command output |
|---|---|---|
| Backend mock | 59 suites / 1,048 tests | Pre-flight PASS 59 / 1,048 |
| Real PG | 72 / 656 | Not run; pre-flight intentionally migrations only |
| lint:guards | ok | Pre-flight PASS lint-guards: ok |
| Frontend | 32 / 131 | Not run |
| i18n parity | 35 namespaces / 1,287 keys | Not run |
| Production build | Pass | Not run |
| Golden reconciliation | 16 checks / zero discrepancies | Not run |

Pre-flight: branch closeout/batch-a-to-6, HEAD ea84663; only the two preserved audit/review reports untracked. Elevated local Docker created erp-r02-remediation-20261014 using postgres:16 --pull=never on 127.0.0.1:55462; random credentials in process env only. Fresh migrations 126 applied / 0 already applied; mock and guards match baseline; exact container removed. No installation, dependency, migration, frontend runtime change or secrets-file access. Routes-by-class census: pending R2.1. Owner decisions waiting: none yet. All unrun exit gates remain unverified.
