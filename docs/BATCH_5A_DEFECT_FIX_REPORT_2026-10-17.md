# Batch 5A defect fixes - stopped, 2026-10-17

Implementation stopped under the request's two-failed-attempt rule. No application defects have been fixed. Branch: closeout/batch-a-to-6; starting HEAD e2d4bf1091b22e6b79e007e91d7dfec21f4bc118 (already untracked the two review reports).

| Item | Finding / change / verification |
| --- | --- |
| S-001 | Source inspection confirms unfiltered payment totals in dashboard and finance. Client receipts use direction=ar, supplier_id is cleared by the API, and invoice/allocation links are optional. Shared AR-only SQL predicate planned, not implemented. New PG test failed setup twice: overlong invoice_number, then missing void actor/reason. Neither is behavioral failing-first evidence. |
| S-002 | Not changed or tested; full coarse-role/RBAC mismatch inventory NOT RUN. |
| S-004 | Not changed or tested; all-role/project matrix and deliveries resource test NOT RUN. |
| S-005 | Not reproduced on a new DB; source cause remains unknown; no payload claimed captured, no fix/error boundary. |
| S-006 | Not changed or tested; complete scoped list-route/header inventory NOT RUN. No sampled table is represented as exhaustive. |
| S-007 | No catalog/UI/guard changes; native Arabic review remains open. |
| Reconciliation | No change/test/rehearsal; MIR/returns/stale-receipt redesign remains open. |
| Hygiene | Both reports already untracked by e2d4bf1; local copies preserved. Ignore entries still missing. |

S-001 amount investigation is incomplete. The inspected frontend shared formatCurrency applies Intl.NumberFormat with two decimals directly to Number(amount), without scaling. Dashboard renders revenue via that helper; inspected finance/dashboard SQL sums amount directly. This does not establish why the historic pilot screenshot showed 9,130,000 versus clone 9130. No pilot or clone was queried, and no data correction was made.

The two focused commands used only new throwaway containers, each at 130 migrations, each reporting 1 failed suite / 2 failed tests, exit 1. Containers erp-r02-gate-20261017024316 and erp-r02-gate-20261017024349 were removed. Exact stop blocker: `new row for relation "payments" violates check constraint "payments_void_has_reason"`. Resume by moving actor creation before the voided fixture row and supplying voided_by plus a nonblank void_reason (migration 0009), then capture the intended red assertion before implementing the finance fix.

Changed files at stop: STATE.md; docs/CLOSEOUT_PROGRESS.md; docs/CLOSEOUT_LOG.md; this report; untracked WIP backend/src/scripts/__tests__/client-collections.pg.test.js. WIP syntax check passed. No application, migration, dependency or env files changed. The two excluded review reports remain unstaged.

Baseline `powershell -NoProfile -File backend/scripts/r02-pg-gate.ps1 -All` -> 130 migrations; **84 suites: 83 passed / 1 failed; 1,934 tests: 1,933 passed / 1 failed**, exit 1. Failed suite: v1-contract.pg.test.js (33.577 s). Default gate output does not include assertion details, so the cause is NOT established. New disposable container erp-r02-gate-20261017024243 removed. The full run enumerated the original 84 suites, excluding the new WIP test. No diagnostic rerun after the stop. Resume also requires a focused v1-contract run preserving assertion details on another throwaway DB.

Backend mock suite, frontend test:ci, i18n:check, lint:guards, build and Docker test-stage build NOT RUN after the stop. `git diff --check` passed, and all five task working files have LF endings (zero CR bytes). Only the four documentation files are included in the stop checkpoint commit; the WIP test remains untracked. No prior gate result is presented as current verification.

Pilot rebuild commands for cmd.exe, supplied only; NOT EXECUTED. These preserve database/upload volumes. Run only when the owner chooses to rebuild; this stopped batch contains no application fixes. The chained command stops if build or migrate fails.

```bat
cd /d "D:\The Osiris Labs\Construction_ERP"
docker compose --project-name erp-closeout-pilot-20261013 --env-file .env.docker build migrate backend frontend && docker compose --project-name erp-closeout-pilot-20261013 --env-file .env.docker run --rm --no-deps migrate && docker compose --project-name erp-closeout-pilot-20261013 --env-file .env.docker up -d --no-deps --force-recreate --wait --wait-timeout 90 backend frontend
```

- Final staging verification: `git diff --cached --check` -> exit 0; exact four documentation paths staged; `git ls-files --eol` -> all four i/lf w/lf. WIP test and both excluded reports unstaged.
