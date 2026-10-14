# R2 scorecard â€” 2026-10-14

R2 context checkpoint after R2.1. No R3 work. Stop required by the batch request's context discipline; resume with R2.2 enforcement before fixes. Prior batch evidence is in its own scorecard; this document reports only R2. Post-commit state/log/scorecard updates remain in the working tree for continuation.

| Ticket/family | Finding | Failing test | Before | After | Commit |
|---|---|---|---|---|---|
| R2.0 | UI/API project identity sanity | Static scan; no clear bug to reproduce | 69 production files / 360 call expressions | Zero duplicate query/body write candidates; indirect calls inspected | 855b648 |
| R2.1 | REV-003 inventory | Inventory completeness check | Review heuristic; first document check rejected 3 regex alternation pipes | 601 live endpoints / 601 document rows / zero missing sources; Markdown corrected and check PASS | 35a6bb9 (inventory only) |
| R2.2 | Audit enforcement | Not done | Existing missing-audit blind spot | Not done | â€” |
| R2.3 families | REV-003 transactional auditing | Not done | Not reproduced in R2 yet | Not done | â€” |
| R2.4 | Exit gates | Not run | Baselines below | Not done | â€” |

| Gate | Supplied baseline | R2 current command output |
|---|---|---|
| Backend mock | 59 suites / 1,048 tests | Pre-flight PASS 59 / 1,048 |
| Real PG | 72 / 656 | Not run; pre-flight intentionally migrations only |
| lint:guards | ok | Pre-flight PASS lint-guards: ok |
| Frontend | 32 / 131 | Not run |
| i18n parity | 35 namespaces / 1,287 keys | Not run |
| Production build | Pass | Not run |
| Golden reconciliation | 16 checks / zero discrepancies | Not run |

| Routes by class | Before R2 fixes (source census) | After R2 fixes |
|---|---:|---|
| Audited in transaction | 238 | Not run |
| Delegates to auditing service | 165 | Not run |
| Incomplete/non-atomic audit | 7 | Not run |
| Not audited / conditional omission | 185 | Not run |
| Legitimately exempt | 6 | Unchanged |
| Total endpoints, including v1 aliases | 601 | Not run |

R2.3 families NOT DONE: boq, payroll, subcontractors, procurement award, materials, units, projects, workorders, maintenance, site, quantities, schedule, locations, hr, hse, qhse, doccontrol, handover, documents upload, portal, reports. Additional action/commercial/procurement/notification/webhook/MCP gaps in the live inventory must also be covered; the review's suggested list does not exempt them. No happy-path audit or rollback-injection assertion has run in R2. R2.2 guard/registry not started. All R2.4 gates remain unrun.

Pre-flight: branch closeout/batch-a-to-6, starting HEAD ea84663; only the two preserved audit/review reports untracked. Elevated local Docker created erp-r02-remediation-20261014 using postgres:16 --pull=never on 127.0.0.1:55462; random credentials in process env only. Fresh migrations 126 applied / 0 already applied; mock and guards match baseline; exact container removed. No installation, dependency, migration, frontend/runtime change or secrets-file access. Source classifications are not successful-call/rollback evidence. Owner decisions waiting: none currently blocks enforcement; preserve physical-delete behavior and record exact table retention questions during family work. Production remains NO-GO.
