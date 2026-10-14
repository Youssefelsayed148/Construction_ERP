# R2 scorecard — 2026-10-15

## Current R2b evidence

R2b.2 completes task B's transactional changes where the handler boundary permits them. Four new registry fixtures pass success audits and forced-failure rollback. Current accumulated coverage is **276 of 601 endpoints**: 274 audit+rollback; 2 historical documented sweep exceptions assert audit only. Pending is 319, exemptions 6. All 319 remaining entries in pending.json are unverified because task C has not been reached before this context checkpoint; no remaining entry is waived.

| R2b measure | Before | After |
|---|---:|---:|
| Verified endpoints (including 2 documented sweep exceptions) | 272 | 276 |
| Pending fixtures | 323 | 319 |
| Exempt endpoints | 6 | 6 |
| Pre-due fake-clock regression | 1 failure / 31 passes | 32 passes |
| Atomicity regressions, valid fixtures on original services | 10 failures / 2 passes | 12 passes in focused 3-suite / 31-test run |

OAuth client/refresh last_used_at and attributed audit share a transaction; password issuance must audit before returning a token. MCP proposals, agent_tool_calls and activity_log share a transaction; rejected decisions include their logs in the claim transaction; approval completion and logs share a completion transaction. Preview already withheld tokens until audit success and now has success/failure coverage. Draft-only proposals also had a real NOT NULL violation (required approver NULL); fallback owner fixes it.

Limits: mapped MCP tools and approved actions execute the existing guarded handler chain, whose business transactions cannot accept an outer transaction client. A subsequent completion/telemetry failure cannot undo an already committed internal operation. The approved/executing claim retains its audit and prevents re-execution; tested with final-log failure injection. This is documented in STATE.md; no global atomicity claim or authorization bypass. B's fixtures exercise a draft proposal and a rejection, not every MCP tool variant or approval branch.

| Checkpoint gate | Requested R2b baseline | Current output |
|---|---|---|
| Backend mock | 60 / 1,056 | PASS 60 / 1,056 |
| Real PG | 73 / 1,201 | PASS 74 / 1,223 (+1 suite / +22 tests: date +2, atomicity +12, registry +8) |
| lint:guards | pass | PASS |
| Frontend test:ci | 32 / 131 | PASS 32 / 131 |
| i18n check/parity | 35 / 1,287 | PASS 35 / 1,287 |
| Build | pass | PASS |
| Fresh golden reconciliation | 16 checks | PASS 16 / 16 |

Owner decisions waiting: none for the four supplied decisions; all accepted. Their labour-payment refusal and QHSE duplicate removal implementations are still pending. R2 remains incomplete; no R3.

The first two full PG runs each failed only the payroll DELETE happy fixture with record_in_use. Source diagnosis: API-created periods include global active employees, so suite ordering created payroll_details children protected by migration 0010. The fixture now inserts its own empty draft period; referenced-row protection and runtime hard deletes are unchanged. Final full rerun PASS 74 suites / 1,223 tests, including all 276 registry fixtures. Final-completion audit-failure assertions also passed in that run. Stop at requested context checkpoint after B; this is an interim checkpoint, not completed R2 or a final task D exit after all families.

Owner permits existing migrations for fresh throwaway initialization, with no migration-file changes. R2b.1 fixes the pre-due fixture's clock source: CURRENT_DATE returned by the invoice INSERT supplies the sweep's explicit `now`. JS clocks +0/+23/+25 hours are exercised. Before: pre-due +25h fails (1 failed / 31 passed); after: 1 PG suite / 32 tests PASS. 126 existing migrations applied per run, exact containers removed. Coverage at the task A checkpoint was 272 / 601, pending 323, exempt 6; task B's current evidence is above. Historical initialization blocker below is superseded.

## R2b checkpoint — migration initialization clarification (superseded)

Pre-flight confirmed branch `closeout/batch-a-to-6`, HEAD `db86f49`, and only the two excluded untracked reports. R2b is blocked before its first failing-first PG run: the request forbids migrations, while the required tracked PG runner executes `npm.cmd run migrate` to initialize each fresh database. Question recorded in STATE.md: are existing migrations allowed solely for throwaway initialization, with no migration-file changes? No migrations or containers were run; no implementation changes retained; no new runtime verification claimed.

| Measure | Before R2b (prior-session evidence) | R2b checkpoint |
|---|---:|---:|
| Verified endpoints of 601 | 272 | 272 (not rerun) |
| Pending fixtures | 323 | 323 |
| Exempt endpoints | 6 | 6 |
| New fixture verifications | 0 | 0 |
| Requested exit gates executed | 0 | 0 |

The four OWNER DECISIONS in the resume request are accepted and supersede the historical waiting items below: audit definition, costed/posted labour-payment deletion refusal, removal of unreachable QHSE PUT duplicates, and preservation of listed hard deletes. Their required implementations remain pending. R3 not started.

Checkpoint commit was not created: explicit staging and commit commands failed creating `.git/index.lock` (Permission denied). Recorded without retry; four documentation files remain unstaged. Whitespace check passed; application tests and exit gates remain unrun.

## Historical R2 interim scorecard (before R2b; superseded above)

Scope: R2 (audit-trail completeness) only; no R3 work. Status: **R2.2 and R2.3 fixes done for every route the inventory classed unaudited; R2.4 gates run and green except one pre-existing time-of-day failure; runtime verification covers 272 of 601 endpoints. 323 endpoints are still source-audited only and are NOT counted as verified.**

## Per family (runtime evidence from the registry run against the pre-fix code at 35a6bb9)

"Before" = routes that returned success but wrote no `activity_log`/`audit_events` row, measured by running the committed fixtures against the R2.1 code in a throwaway worktree. "After" = same fixtures on the fixed code: audit row written and, with the audit insert forced to throw for that actor, no business table changed (xmin leak scan across all public tables).

| Family | Finding | Failing test (before) | Before | After | Commit |
|---|---|---|---|---|---|
| R2.2 enforcement | No guard; blind spots | n/a | lint rule absent | `mutation-without-audit` AST rule, 6 documented exemptions, registry PG test, throwaway-PG helper | 89ec15f |
| boq | 6 handlers + v1 aliases unaudited | no audit row x12, rollback x12 | 12 | 0 | f8d738b |
| payroll | PUT audited only when posting; DELETE unaudited | no audit row x2 (PUT status, DELETE) | 2 | 0 | 7ac7abe |
| subcontractors | 7 handlers + v1 aliases | no audit row x10 | 10 | 0 | 7070656 |
| procurement (RFQ, delivery, MIR, PO decision, invoices) | 11 handlers unaudited; PR decide audited only on budget override; invoice approve unaudited | no audit row x28 (incl. aliases) | 28 | 0 | aeb94f0 |
| materials, units, locations, maintenance, workorders | recipe-line delete, building/unit/WO/location/maintenance writes | no audit row x38 | 38 | 0 | cdedf5f |
| projects, site, quantities, schedule | phase PUT conditional; legacy project create + schedule-activity create burned numbers on rollback; **POST /projects/:id/instructions returned 500 on every call** | no audit row x48; rollback leak x5; fixture error x1 | 48 (+5, +1) | 0 | 4dbc352 |
| hr, hse | 14 handlers | no audit row x14 | 14 | 0 | 8e8d83f |
| qhse | 16 handlers + 2 shadowed duplicate PUTs | no audit row x14 | 14 | 0 | cf383ee |
| portal | 12 handlers; RFI acknowledge's inner audit was swallowed | no audit row x11, rollback leak x1 | 12 | 0 | 30970a6 |
| commercial (updates, workflow starts), actions, notifications, reports, consultant, doccontrol, handover, documents upload, webhook admin, approvals | remaining unaudited handlers; guard taught `auditedMutation`, `auditedChange`, `advanceApproval` | no audit row x16 + guard false positives | 16 | 0 | 0a30d7b + R2.4 commit |

Totals on the 272 routes with fixtures: **before 174 wrote no audit row (170 classed "not audited" + 4 classed "audited" that were conditional), 174 failed the rollback test (incl. 5 audited-but-non-atomic), 1 fixture error (a broken endpoint); after 0 / 0 / 0** (545 registry tests: 272 audit + 272 rollback + 1 coverage). None of the 31 delegate routes that have fixtures failed: the source-read "delegates" claim held for them.

## Gate table vs baselines

| Gate | Baseline | R2 result (command output, 2026-10-15) |
|---|---|---|
| Backend mock (`npx jest`) | 59 / 1,048 | PASS 60 suites / 1,056 tests (+guard suite) |
| Real PG (`r02-pg-gate.ps1 -All`, fresh PG16, 126 migrations) | 72 / 656 | 73 suites / 1,201 tests: 72 suites pass; **1 fails: `event-integrity` "pre-due seven-day tier" (`days_until_due` 5 vs 6)**. It fails identically on the pre-R2 commit 35a6bb9 (reproduced in a throwaway worktree): it compares a JS-local date with PG `CURRENT_DATE` and fails between 21:00 and 24:00 UTC. Not caused by R2 and not changed. |
| `npm run lint:guards` | ok | ok; `mutation-without-audit` baseline is **empty** (was 127 handlers in 27 files at R2.2) |
| Frontend `test:ci` | 32 / 131 | PASS 32 / 131 (no frontend change) |
| `i18n:check` / `i18n:parity` | ok / 35 ns, 1,287 keys | ok / 35 namespaces, 1,287 keys |
| Production build (`CI=true`) | pass | Compiled successfully |
| Golden reconciliation (fresh seeded throwaway DB, `RECONCILIATION_BACKUP_CONFIRMED=true`) | 16 checks, 0 discrepancies | 16 `[OK]` checks, 0 violations, seed exit 0, reconcile exit 0 |

## Class counts

| Class | Before (R2.1 source census) | After R2 |
|---|---:|---|
| Not audited / conditional omission | 185 | **0 by the static guard**; 171 of them runtime-verified (audit row + rollback); 14 (v1 aliases of verified handlers, agent decision, MCP, preview, OAuth token) not runtime-verified |
| Audited in transaction | 238 | 67 runtime-verified; 168 not yet exercised |
| Delegates to an auditing service | 165 | 31 runtime-verified (all wrote an audit row, all rolled back); 134 not yet exercised |
| Audited, not in transaction | 7 | 2 documented exception (replenishment sweep, leader-locked multi-transaction job; audit asserted, rollback skipped by design); 1 fixed (portal RFI acknowledge); **4 untouched**: agent request decision, MCP call, preview start, OAuth token |
| Legitimately exempt | 6 | 6 (documented in `mutation-audit-exemptions.json`) |
| Total | 601 | 272 verified / 323 pending fixtures / 6 exempt |

## Defects found and fixed by the registry (beyond the audit gap)

- `POST /api/projects/:projectId/instructions` returned 500 on every call (`auditedTransaction` called without `eventForResult`).
- Legacy `POST /api/projects` and `POST /api/schedule/activities` allocated their number outside the transaction (a rolled-back create burned a counter).
- `POST /api/portal/subcontractor/rfis/:id/acknowledge` swallowed its inner audit.

## NOT done / NOT verified

- 323 endpoints have no registry fixture (listed in `backend/src/scripts/audit-fixtures/pending.json`, a list that may only shrink; the coverage test fails for any new unregistered route). They are source-audited by the lint guard but not runtime-verified. Largest groups: inventory (v1 + warehouses + adjustments/issues/returns/conversions), finance-ledger and v1 finance aliases, project-setup, organizations, docs/documents/transmittals/correspondence, remaining commercial (contracts, forecasts, payment certificates, commitments), users/auth, agent, v1 webhooks/oauth/reports, hse permits, qhse WIRs.
- 4 audited-not-in-transaction endpoints (agent request decision, MCP call, user preview start, OAuth token) were not changed: they need a per-endpoint decision on whether the side effects can share a transaction.
- Plan: R2.4 says "only when ALL families are done". The gates above were run as an interim exit; the pending list must reach zero before R2 can be called complete.
- Duplicate shadowed handlers in `qhse.js` (PUT `/ncrs/:id`, PUT `/quality-tests/:id`): the second copy is unreachable; both copies now audit. Consolidation is a product decision.

## Owner decisions waiting

1. Audit definition: success counts if `activity_log` OR `audit_events` gains a row (the `auditedTransaction` convention writes `activity_log` only; `audit_events` carries snapshots). Requiring both everywhere would double-write. Overrule if you want both.
2. `DELETE /api/hr/labor-payments/:id` is a hard delete whose project cost (booked by `labor_payment.created`) is not reversed. R2 only adds a before-snapshot audit.
3. Hard deletes now audited with a before snapshot, none converted to soft delete (no migration in this batch): boq sections/items, payroll periods, employees, laborers, labor payments, locations, buildings/units, phases, milestones, team members, site visits, schedule activities/relationships, quality tests, recipe lines, saved views, scheduled reports, webhooks.
4. The replenishment sweep's separate completion audit is retained as a documented non-atomic exception.
5. The two shadowed QHSE PUT handlers (above).
6. Test hygiene changed with the audit trail: `audit_events` is append-only and references projects, so `record-scoping` and `role-matrix` now close (not delete) their test projects.

Production remains NO-GO.
