# R2.1 mutation audit inventory â€” 2026-10-14

Generated from the live server Express stack after R2.0, before any R2 auditing fix. 601 distinct non-GET/non-HEAD endpoints, including versioned aliases; all 601 handlers located in source. HEAD is Express's read equivalent and is excluded; no explicitly registered mutation is omitted. v1 FAMILY_MAP remounts are resolved back to the actual internal route chain, including root/trailing-slash aliases. Nested routers and factory-produced handlers are enumerated at runtime rather than guessed from route declarations.

Classification is source inspection, not happy-path/rollback verification. R2.2 and family PG tests must establish those runtime claims. Local/imported service function bodies were parsed with the already-installed frontend Babel parser, then audit and SQL call graphs traced; indirect require calls and injected workflow logActivity were checked. Shared wrapper/client binding proofs below were inspected separately. No transaction/helper was added by this inventory. Counts include aliases; unique business handlers and raw review heuristic counts are different denominators.

| Before class | Endpoint count | After R2 fixes |
|---|---:|---|
| audited-in-transaction | 238 | 67 runtime-verified by the R2.2 registry; 168 not yet exercised (source-audited) |
| delegates to an auditing service | 165 | 31 runtime-verified (audit row + rollback); 134 not yet exercised |
| audited-not-in-transaction (includes partial/optional coverage) | 7 | 1 fixed; 2 documented exception (replenishment sweep); 4 untouched (agent decision, MCP, preview, OAuth token) |
| not audited (includes conditional omissions) | 185 | 0 by the static guard; 171 runtime-verified, 14 aliases/other not exercised |
| legitimately exempt | 6 | Unchanged |
| Total | 601 | 272 runtime-verified, 323 pending fixtures, 6 exempt (see docs/R2_SCORECARD.md) |

Evidence conventions: route file/line identifies the handler; audit locations identify the reachable write helper. â€œneeds transactionâ€ includes existing transactional mutations and unresolved mutation/delegate work, not merely handlers lacking a transaction. â€œhard deleteâ€ means any reachable physical SQL DELETE, including replacement child rows; it does not claim the primary entity is deleted. No hard delete is silently converted or exempted from audit.

Verified conventions and delegation:

- utils/auditedTransaction.js: work(q) and awaited logActivity(event, {query:q}) use one database transaction/client; an activity failure escapes and causes rollback. eventForResult can return null for a true no-op; mutating events must not do so. Its existing activity event schema has no before/after fields; family fixes must also use policy.recordAuditEvent or financeEngine.writeAuditEvent with the same q for snapshots rather than inventing schema or a migration.
- utils/activity.js: logActivity uses opts.query; otherwise it uses the pool. It propagates errors. Domain fireEvent writes event_log/outbox, which is not an activity_log/audit_events audit and is not accepted as a substitute here.
- services/policy.js recordAuditEvent: opts.query is honored and before/after JSON uses existing audit_events columns. services/financeEngine.js writeAuditEvent(q, event): explicit q; dual-populates old/new audit column families and serialized before/after snapshots.
- routes/invoices.js create: transaction client q is passed to createInvoiceRecord, fireEvent and logActivity; invoice and audit commit together. Existing finance-ledger auditedFin -> auditedTransaction and commercial atomicAudited -> transaction(q) -> audit(...,{query:q}) preserve the same client.
- routes/procurement.js auditedProc -> auditedTransaction supplies q to procurement service calls; inventory document factories delegate to auditing services with that q. An unaudited procurement service call is not presumed safe just because its name starts with create/decide.
- routes/approvals.js advanceApproval injects client and logActivity into workflowEngine.recordLegacyDecision. Both decision paths await logFn with client-bound query. Agent request decision is NOT treated as fully atomic: its claim is audited, but later execution-status writes occur separately.
- Consultant RFI response has a swallowed inner service audit; the consultant route's outer auditedTransaction activity still guarantees a transaction-bound event. Portal acknowledgement calls that inner service without the outer activity, so its optional audit is classified as incomplete. OAuth issuance and MCP activity also swallow audit failure; no unconditional atomic audit claim is made.
- Payroll PUT only logs when posted_to_finance is true; ordinary status changes remain â€œnot auditedâ€. Material replenishment sweep's separate completion audit is an existing intentional multi-step exception to the old guard; the inventory still records non-atomic behavior, not an exemption from the new completeness requirement.

Exemptions (all appear as individual rows below): POST delegation lookup only reads policy evidence; POST assistant draft returns local deterministic draft objects without persisting or invoking an adapter; four internal/v1 legacy RFI/submittal response routes return 410 before mutation and point to replacement staged commands. Login/logout-all are already audited, so no unnecessary exemption was introduced. OAuth token route mixes grants and best-effort issuance audit and is not globally exempted as â€œrefreshâ€. Health is GET and outside this non-GET inventory.

The review's 91 route-block heuristic is superseded. Additional missing/conditional audit paths are visible in action services, commercial updates, procurement service calls, portal commands, notifications, webhook deletion/redrive, and payroll status changes. These remain R2 work even when absent from the suggested family totals. Before source census is not a claim of 185 empirically reproduced successful unaudited calls.

Owner decisions: preserve existing hard-delete behavior while adding a before snapshot. Where the target table lacks is_active/deleted_at, a future retention/soft-delete policy is an owner decision; this batch creates no column and performs no migration. Exact table-by-table questions will be recorded when each family is inspected. No owner decision blocks generating this inventory.

Reproduction command: node $env:TEMP/erp-r02-audit-inventory.cjs with APP_ENV=test, NODE_ENV=test and NODE_OPTIONS=--require=<temporary no-dotenv preload>. It loads the app without listening or starting schedulers, traces only routes/services/utils JS source, writes a credential-free temporary route/source JSON, and closes the unused PG pool. Output: routes=601, source handlers unlocated=0; class counts as above. No external request or DB mutation was made. This inventory-only commit precedes enforcement and all auditing fixes.

| Route | File:line | Method | Class | Needs transaction? | Hard delete? | Audit/exemption evidence |
|---|---|---|---|---|---|---|
| /api/actions/:id/acknowledge | backend/src/routes/actions.js:84 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/actions/:id/comments | backend/src/routes/actions.js:28 | POST | audited-in-transaction | yes | no | backend/src/routes/actions.js:28 auditedTransaction |
| /api/actions/:id/complete | backend/src/routes/actions.js:95 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/actions/:id/delegate | backend/src/routes/actions.js:106 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/actions | backend/src/routes/actions.js:59 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/agent/requests/:id/decision | backend/src/routes/agents.js:145 | POST | audited-not-in-transaction | yes | no | backend/src/services/mcpService.js:374 logActivity; backend/src/utils/activity.js:3 direct audit INSERT; Decision claim is audited in transaction; later execution-status UPDATE is outside that transaction/audit |
| /api/agent/sessions/:id/status | backend/src/routes/agents.js:93 | POST | audited-in-transaction | yes | no | backend/src/routes/agents.js:93 auditedTransaction |
| /api/agent/tokens/:id/revoke | backend/src/routes/agents.js:65 | POST | audited-in-transaction | yes | no | backend/src/routes/agents.js:65 auditedTransaction |
| /api/agent/tokens | backend/src/routes/agents.js:37 | POST | audited-in-transaction | yes | no | backend/src/routes/agents.js:37 auditedTransaction |
| /api/approval-limits | backend/src/routes/approvalLimits.js:30 | PUT | audited-in-transaction | yes | no | backend/src/routes/approvalLimits.js:30 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/approvals/:id/approve | backend/src/routes/approvals.js:313 | PUT | delegates to an auditing service | yes | no | approvals.advanceApproval -> workflowEngine.recordLegacyDecision: injected logActivity, same client.query |
| /api/approvals/:id/cancel | backend/src/routes/approvals.js:331 | PUT | audited-in-transaction | yes | no | backend/src/routes/approvals.js:331 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/approvals/:id/reject | backend/src/routes/approvals.js:418 | PUT | delegates to an auditing service | yes | no | approvals.advanceApproval -> workflowEngine.recordLegacyDecision: injected logActivity, same client.query |
| /api/approvals/request | backend/src/routes/approvals.js:154 | POST | audited-in-transaction | yes | no | backend/src/routes/approvals.js:154 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/assets/:id/assignments | backend/src/routes/assets.js:121 | POST | audited-in-transaction | yes | no | backend/src/routes/assets.js:121 auditedTransaction |
| /api/assets/:id/usage-logs | backend/src/routes/assets.js:147 | POST | audited-in-transaction | yes | no | backend/src/routes/assets.js:147 auditedTransaction |
| /api/assets/:id | backend/src/routes/assets.js:105 | DELETE | audited-in-transaction | yes | yes | backend/src/routes/assets.js:105 auditedTransaction |
| /api/assets/:id | backend/src/routes/assets.js:76 | PUT | audited-in-transaction | yes | no | backend/src/routes/assets.js:76 auditedTransaction |
| /api/assets | backend/src/routes/assets.js:48 | POST | audited-in-transaction | yes | no | backend/src/routes/assets.js:48 auditedTransaction |
| /api/auth/change-password | backend/src/routes/auth.js:161 | POST | audited-in-transaction | yes | no | backend/src/routes/auth.js:161 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/auth/login | backend/src/routes/auth.js:76 | POST | audited-in-transaction | yes | yes | backend/src/routes/auth.js:76 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/auth/logout-all | backend/src/routes/auth.js:197 | POST | audited-in-transaction | yes | no | backend/src/routes/auth.js:197 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/auth/register | backend/src/routes/auth.js:16 | POST | audited-in-transaction | yes | no | backend/src/routes/auth.js:16 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/boq/items/:id | backend/src/routes/boq.js:150 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/boq/items/:id | backend/src/routes/boq.js:129 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/boq/items | backend/src/routes/boq.js:101 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/boq/sections/:id | backend/src/routes/boq.js:59 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/boq/sections/:id | backend/src/routes/boq.js:42 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/boq/sections | backend/src/routes/boq.js:21 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/client-portal/documents/:id/acknowledgement | backend/src/routes/client.js:87 | POST | audited-in-transaction | yes | no | backend/src/routes/client.js:87 auditedTransaction |
| /api/client-portal/preview | backend/src/routes/client.js:104 | POST | audited-in-transaction | yes | no | backend/src/routes/client.js:104 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/client.js:104 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/client-portal/variations/:id/response | backend/src/routes/client.js:70 | POST | audited-in-transaction | yes | no | backend/src/routes/client.js:70 auditedTransaction |
| /api/clients/:id | backend/src/routes/clients.js:85 | DELETE | audited-in-transaction | yes | yes | backend/src/routes/clients.js:85 auditedTransaction |
| /api/clients/:id | backend/src/routes/clients.js:58 | PUT | audited-in-transaction | yes | no | backend/src/routes/clients.js:58 auditedTransaction |
| /api/clients | backend/src/routes/clients.js:30 | POST | audited-in-transaction | yes | no | backend/src/routes/clients.js:30 auditedTransaction |
| /api/commercial/budget-versions/:id/decide | backend/src/routes/commercial.js:502 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/budget-versions/:id/submit | backend/src/routes/commercial.js:495 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/budget-versions/:id | backend/src/routes/commercial.js:488 | PUT | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/commercial/budget-versions | backend/src/routes/commercial.js:475 | POST | delegates to an auditing service | yes | yes | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/commitments/:id/adjust | backend/src/routes/commercial.js:544 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/contracts/:contractId/parties | backend/src/routes/commercial.js:247 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/contracts | backend/src/routes/commercial.js:30 | POST | audited-in-transaction | yes | no | backend/src/routes/commercial.js:30 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/currency-rates | backend/src/routes/commercial.js:362 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/forecast-versions/:id/approve | backend/src/routes/commercial.js:529 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/forecast-versions | backend/src/routes/commercial.js:516 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/guarantees/:id/close | backend/src/routes/commercial.js:298 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/guarantees/:id | backend/src/routes/commercial.js:288 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/commercial/guarantees | backend/src/routes/commercial.js:275 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/insurances/:id/cancel | backend/src/routes/commercial.js:341 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/insurances/:id | backend/src/routes/commercial.js:331 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/commercial/insurances | backend/src/routes/commercial.js:318 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/parties/:id | backend/src/routes/commercial.js:257 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/commercial/payment-applications/:id/certify | backend/src/routes/commercial.js:409 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/payment-applications/:id/reject | backend/src/routes/commercial.js:426 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/commercial/payment-applications/:id/submit | backend/src/routes/commercial.js:402 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/payment-applications/:id/withdraw | backend/src/routes/commercial.js:433 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/commercial/payment-applications | backend/src/routes/commercial.js:379 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/payment-certificates/:id/decide | backend/src/routes/commercial.js:451 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT; backend/src/services/financeEngine.js:197 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT |
| /api/commercial/payment-certificates/:id/start | backend/src/routes/commercial.js:444 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/payment-certificates/:id/void | backend/src/routes/commercial.js:460 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/subcontracts/:contractId/parties | backend/src/routes/commercial.js:247 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/variations/:id/decide | backend/src/routes/commercial.js:152 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/commercial/variations/:id/start | backend/src/routes/commercial.js:143 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/commercial/variations/:id | backend/src/routes/commercial.js:221 | PUT | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/commercial/variations | backend/src/routes/commercial.js:104 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/consultant/instructions/:id/recommendation | backend/src/routes/consultant.js:92 | POST | audited-in-transaction | yes | no | backend/src/routes/consultant.js:92 auditedTransaction |
| /api/consultant/observations/:id/advance | backend/src/routes/consultant.js:154 | POST | audited-in-transaction | yes | no | backend/src/routes/consultant.js:154 auditedTransaction |
| /api/consultant/observations/:id/comments | backend/src/routes/consultant.js:139 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/consultant/observations | backend/src/routes/consultant.js:110 | POST | audited-in-transaction | yes | no | backend/src/routes/consultant.js:110 auditedTransaction |
| /api/consultant/payment-certificates/:id/recommendation | backend/src/routes/consultant.js:77 | POST | audited-in-transaction | yes | no | backend/src/routes/consultant.js:77 auditedTransaction; backend/src/services/financeEngine.js:197 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT |
| /api/consultant/rfis/:id/close | backend/src/routes/consultant.js:221 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/consultant/rfis/:id/response | backend/src/routes/consultant.js:203 | POST | audited-in-transaction | yes | no | backend/src/routes/consultant.js:203 auditedTransaction; backend/src/services/consultantEngine.js:392 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT |
| /api/consultant/submittals/:id/response | backend/src/routes/consultant.js:232 | POST | audited-in-transaction | yes | no | backend/src/routes/consultant.js:232 auditedTransaction |
| /api/consultant/variations/:id/recommendation | backend/src/routes/consultant.js:62 | POST | audited-in-transaction | yes | no | backend/src/routes/consultant.js:62 auditedTransaction |
| /api/consultant/wirs/:id/result | backend/src/routes/consultant.js:47 | POST | audited-in-transaction | yes | no | backend/src/routes/consultant.js:47 auditedTransaction |
| /api/delegations/:id/deactivate | backend/src/routes/delegations.js:72 | POST | audited-in-transaction | yes | no | backend/src/routes/delegations.js:72 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT |
| /api/delegations/lookup | backend/src/routes/delegations.js:89 | POST | legitimately exempt | no | no | Evidence-only policy lookup: SELECTs, no business state change |
| /api/delegations | backend/src/routes/delegations.js:35 | POST | audited-in-transaction | yes | no | backend/src/routes/delegations.js:35 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT |
| /api/docs/categories | backend/src/routes/doccontrol.js:34 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/docs/correspondence/:id/amend | backend/src/routes/doccontrol.js:800 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:800 auditedTransaction |
| /api/docs/correspondence/:id/status | backend/src/routes/doccontrol.js:786 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:786 auditedTransaction |
| /api/docs/correspondence | backend/src/routes/doccontrol.js:749 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:749 auditedTransaction |
| /api/docs/documents/:id/:action(approve&#124;reject) | backend/src/routes/doccontrol.js:262 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:262 auditedTransaction |
| /api/docs/documents/:id/register | backend/src/routes/doccontrol.js:478 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:478 auditedTransaction |
| /api/docs/documents/:id/submit | backend/src/routes/doccontrol.js:246 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:246 auditedTransaction |
| /api/docs/documents/:id/supersede | backend/src/routes/doccontrol.js:491 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:491 auditedTransaction |
| /api/docs/documents/:id/versions | backend/src/routes/doccontrol.js:161 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:161 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/docs/documents/:id | backend/src/routes/doccontrol.js:274 | DELETE | audited-in-transaction | yes | yes | backend/src/routes/doccontrol.js:274 auditedTransaction |
| /api/docs/documents/:id | backend/src/routes/doccontrol.js:204 | PUT | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:204 auditedTransaction |
| /api/docs/documents | backend/src/routes/doccontrol.js:89 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:89 auditedTransaction |
| /api/docs/numbering/:project_id | backend/src/routes/doccontrol.js:851 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/docs/rfis/:id/close | backend/src/routes/doccontrol.js:352 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/docs/rfis/:id/respond | backend/src/routes/doccontrol.js:348 | POST | legitimately exempt | no | no | Retired command returns 410 before any mutation; use staged-response routes |
| /api/docs/rfis | backend/src/routes/doccontrol.js:306 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:306 auditedTransaction |
| /api/docs/submittals/:id/respond | backend/src/routes/doccontrol.js:409 | POST | legitimately exempt | no | no | Retired command returns 410 before any mutation; use staged-response routes |
| /api/docs/submittals | backend/src/routes/doccontrol.js:383 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:383 auditedTransaction |
| /api/docs/transmittals/:id/items | backend/src/routes/doccontrol.js:640 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:640 auditedTransaction |
| /api/docs/transmittals/:id/status | backend/src/routes/doccontrol.js:673 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:673 auditedTransaction |
| /api/docs/transmittals | backend/src/routes/doccontrol.js:567 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:567 auditedTransaction |
| /api/documents/upload | backend/src/routes/documents.js:34 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/expenses/:id | backend/src/routes/expenses.js:118 | DELETE | audited-in-transaction | yes | yes | backend/src/routes/expenses.js:118 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/expenses/:id | backend/src/routes/expenses.js:83 | PUT | audited-in-transaction | yes | no | backend/src/routes/expenses.js:83 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/expenses | backend/src/routes/expenses.js:53 | POST | audited-in-transaction | yes | no | backend/src/routes/expenses.js:53 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/finance-ledger/account-mappings/:key/confirm | backend/src/routes/glAccountMappings.js:36 | POST | audited-in-transaction | yes | no | backend/src/routes/glAccountMappings.js:36 auditedTransaction |
| /api/finance-ledger/account-mappings/:key | backend/src/routes/glAccountMappings.js:22 | PUT | audited-in-transaction | yes | no | backend/src/routes/glAccountMappings.js:22 auditedTransaction |
| /api/finance-ledger/ap-review/:id/resolve | backend/src/routes/financeLedger.js:184 | POST | audited-in-transaction | yes | no | backend/src/routes/financeLedger.js:184 auditedTransaction |
| /api/finance-ledger/credit-notes/:id/issue | backend/src/routes/financeLedger.js:288 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:288 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/finance-ledger/credit-notes/:id/void | backend/src/routes/financeLedger.js:295 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:295 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/finance-ledger/credit-notes | backend/src/routes/financeLedger.js:273 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:273 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/finance-ledger/invoices/:id/transition | backend/src/routes/financeLedger.js:46 | POST | delegates to an auditing service | yes | no | backend/src/services/financeEngine.js:245 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT |
| /api/finance-ledger/payment-batches/:id/approve | backend/src/routes/financeLedger.js:331 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:331 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/finance-ledger/payment-batches/:id/cancel | backend/src/routes/financeLedger.js:345 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:345 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/finance-ledger/payment-batches/:id/release | backend/src/routes/financeLedger.js:338 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:338 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction; backend/src/services/financeEngine.js:327 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT |
| /api/finance-ledger/payment-batches/:id/submit | backend/src/routes/financeLedger.js:324 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:324 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/finance-ledger/payment-batches | backend/src/routes/financeLedger.js:308 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:308 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/finance-ledger/payments/:id/allocate | backend/src/routes/financeLedger.js:69 | POST | delegates to an auditing service | yes | no | backend/src/services/financeEngine.js:327 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT |
| /api/finance-ledger/retention/releases/:id/void | backend/src/routes/financeLedger.js:149 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:149 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/finance-ledger/retention/releases | backend/src/routes/financeLedger.js:133 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:133 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/finance-ledger/retention | backend/src/routes/financeLedger.js:103 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:103 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/finance-ledger/valuations | backend/src/routes/financeLedger.js:19 | POST | delegates to an auditing service | yes | no | backend/src/services/financeEngine.js:197 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT |
| /api/handover/assets/:id/documents | backend/src/routes/handover.js:243 | POST | audited-in-transaction | yes | no | backend/src/routes/handover.js:243 auditedTransaction |
| /api/handover/assets | backend/src/routes/handover.js:200 | POST | audited-in-transaction | yes | no | backend/src/routes/handover.js:200 auditedTransaction |
| /api/handover/claims/:id/status | backend/src/routes/handover.js:383 | POST | audited-in-transaction | yes | no | backend/src/routes/handover.js:383 auditedTransaction |
| /api/handover/claims | backend/src/routes/handover.js:364 | POST | audited-in-transaction | yes | no | backend/src/routes/handover.js:364 auditedTransaction |
| /api/handover/package/:projectId/items | backend/src/routes/handover.js:104 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/handover/package/items/:id/verify | backend/src/routes/handover.js:160 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/handover/package/items/:id | backend/src/routes/handover.js:122 | PUT | audited-in-transaction | yes | no | backend/src/routes/handover.js:122 auditedTransaction |
| /api/handover/process/:id/transition | backend/src/routes/handover.js:75 | POST | audited-in-transaction | yes | no | backend/src/routes/handover.js:75 auditedTransaction |
| /api/handover/process/:projectId/start | backend/src/routes/handover.js:64 | POST | audited-in-transaction | yes | no | backend/src/routes/handover.js:64 auditedTransaction |
| /api/handover/warranties/:id/status | backend/src/routes/handover.js:318 | PUT | audited-in-transaction | yes | no | backend/src/routes/handover.js:318 auditedTransaction |
| /api/handover/warranties | backend/src/routes/handover.js:283 | POST | audited-in-transaction | yes | no | backend/src/routes/handover.js:283 auditedTransaction |
| /api/hr/attendance | backend/src/routes/hr.js:112 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/hr/employees/:id | backend/src/routes/hr.js:90 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/hr/employees/:id | backend/src/routes/hr.js:61 | PUT | audited-in-transaction | yes | no | backend/src/routes/hr.js:61 auditedTransaction |
| /api/hr/employees | backend/src/routes/hr.js:34 | POST | audited-in-transaction | yes | no | backend/src/routes/hr.js:34 auditedTransaction |
| /api/hr/labor-payments/:id | backend/src/routes/hr.js:311 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/hr/labor-payments | backend/src/routes/hr.js:273 | POST | audited-in-transaction | yes | no | backend/src/routes/hr.js:273 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/hr/laborers/:id | backend/src/routes/hr.js:252 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/hr/laborers/:id | backend/src/routes/hr.js:228 | PUT | audited-in-transaction | yes | no | backend/src/routes/hr.js:228 auditedTransaction |
| /api/hr/laborers | backend/src/routes/hr.js:204 | POST | audited-in-transaction | yes | no | backend/src/routes/hr.js:204 auditedTransaction |
| /api/hr/leaves/:id | backend/src/routes/hr.js:164 | PUT | audited-in-transaction | yes | no | backend/src/routes/hr.js:164 auditedTransaction |
| /api/hr/leaves | backend/src/routes/hr.js:146 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/hse/emergency-drills | backend/src/routes/hse.js:718 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/hse/equipment-inspections | backend/src/routes/hse.js:683 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/hse/incidents/:id/status | backend/src/routes/hse.js:120 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/hse/incidents/:id | backend/src/routes/hse.js:100 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/hse/incidents | backend/src/routes/hse.js:84 | POST | audited-in-transaction | yes | no | backend/src/routes/hse.js:84 auditedTransaction |
| /api/hse/inductions | backend/src/routes/hse.js:501 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/hse/inspections/:id | backend/src/routes/hse.js:197 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/hse/inspections | backend/src/routes/hse.js:174 | POST | audited-in-transaction | yes | no | backend/src/routes/hse.js:174 auditedTransaction |
| /api/hse/jsas/:id/status | backend/src/routes/hse.js:379 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/hse/jsas | backend/src/routes/hse.js:358 | POST | audited-in-transaction | yes | no | backend/src/routes/hse.js:358 auditedTransaction |
| /api/hse/near-misses/:id/status | backend/src/routes/hse.js:609 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/hse/near-misses | backend/src/routes/hse.js:581 | POST | audited-in-transaction | yes | no | backend/src/routes/hse.js:581 auditedTransaction |
| /api/hse/permits/:id/decision | backend/src/routes/hse.js:294 | POST | audited-in-transaction | yes | no | backend/src/routes/hse.js:294 auditedTransaction |
| /api/hse/permits/:id/status | backend/src/routes/hse.js:307 | POST | audited-in-transaction | yes | no | backend/src/routes/hse.js:307 auditedTransaction |
| /api/hse/permits/:id/submit | backend/src/routes/hse.js:285 | POST | audited-in-transaction | yes | no | backend/src/routes/hse.js:285 auditedTransaction |
| /api/hse/permits | backend/src/routes/hse.js:264 | POST | audited-in-transaction | yes | no | backend/src/routes/hse.js:264 auditedTransaction |
| /api/hse/ppe-records | backend/src/routes/hse.js:647 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/hse/risk-assessments/:id/status | backend/src/routes/hse.js:454 | POST | audited-in-transaction | yes | no | backend/src/routes/hse.js:454 auditedTransaction |
| /api/hse/risk-assessments | backend/src/routes/hse.js:425 | POST | audited-in-transaction | yes | no | backend/src/routes/hse.js:425 auditedTransaction |
| /api/hse/toolbox-talks | backend/src/routes/hse.js:536 | POST | audited-in-transaction | yes | no | backend/src/routes/hse.js:536 auditedTransaction |
| /api/inventory/adjustments/:id/post | backend/src/routes/inventory.js:231 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/adjustments/:id/void | backend/src/routes/inventory.js:239 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/adjustments/:id | backend/src/routes/inventory.js:217 | PUT | delegates to an auditing service | yes | yes | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/adjustments | backend/src/routes/inventory.js:202 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/conversions/:id | backend/src/routes/inventory.js:173 | DELETE | delegates to an auditing service | yes | yes | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/conversions/:id | backend/src/routes/inventory.js:163 | PUT | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/conversions | backend/src/routes/inventory.js:153 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/issues/:id/post | backend/src/routes/inventory.js:231 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/issues/:id/void | backend/src/routes/inventory.js:239 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/issues/:id | backend/src/routes/inventory.js:217 | PUT | delegates to an auditing service | yes | yes | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/issues | backend/src/routes/inventory.js:202 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/lots/:id/status | backend/src/routes/inventory.js:122 | PUT | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/lots | backend/src/routes/inventory.js:106 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/returns/:id/post | backend/src/routes/inventory.js:231 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/returns/:id/void | backend/src/routes/inventory.js:239 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/returns/:id | backend/src/routes/inventory.js:217 | PUT | delegates to an auditing service | yes | yes | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/inventory/returns | backend/src/routes/inventory.js:202 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/invoices/:id | backend/src/routes/invoices.js:168 | DELETE | audited-in-transaction | yes | no | backend/src/routes/invoices.js:168 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT; backend/src/routes/invoices.js:168 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/invoices/:id | backend/src/routes/invoices.js:129 | PUT | audited-in-transaction | yes | no | backend/src/routes/invoices.js:129 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/invoices | backend/src/routes/invoices.js:92 | POST | audited-in-transaction | yes | no | backend/src/services/financeEngine.js:197 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT; backend/src/routes/invoices.js:92 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/items/:id/restore | backend/src/routes/items.js:216 | POST | audited-in-transaction | yes | no | backend/src/routes/items.js:216 auditedTransaction |
| /api/items/:id | backend/src/routes/items.js:201 | DELETE | audited-in-transaction | yes | no | backend/src/routes/items.js:201 auditedTransaction |
| /api/items/:id | backend/src/routes/items.js:154 | PUT | audited-in-transaction | yes | no | backend/src/routes/items.js:154 auditedTransaction |
| /api/items | backend/src/routes/items.js:119 | POST | audited-in-transaction | yes | no | backend/src/routes/items.js:119 auditedTransaction |
| /api/legal/:id | backend/src/routes/legal.js:75 | DELETE | audited-in-transaction | yes | yes | backend/src/routes/legal.js:75 auditedTransaction |
| /api/legal/:id | backend/src/routes/legal.js:50 | PUT | audited-in-transaction | yes | no | backend/src/routes/legal.js:50 auditedTransaction |
| /api/legal | backend/src/routes/legal.js:30 | POST | audited-in-transaction | yes | no | backend/src/routes/legal.js:30 auditedTransaction |
| /api/locations/:id | backend/src/routes/locations.js:137 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/locations/:id | backend/src/routes/locations.js:109 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/locations | backend/src/routes/locations.js:61 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/maintenance/:id | backend/src/routes/maintenance.js:90 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/maintenance/:id | backend/src/routes/maintenance.js:59 | PUT | audited-in-transaction | yes | no | backend/src/routes/maintenance.js:59 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/maintenance | backend/src/routes/maintenance.js:31 | POST | audited-in-transaction | yes | no | backend/src/routes/maintenance.js:31 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/materials/recipes/:id/lines/:lineId | backend/src/routes/materials.js:209 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/materials/recipes/:id/lines | backend/src/routes/materials.js:175 | POST | audited-in-transaction | yes | no | backend/src/routes/materials.js:175 auditedTransaction |
| /api/materials/recipes/:id | backend/src/routes/materials.js:132 | PUT | audited-in-transaction | yes | no | backend/src/routes/materials.js:132 auditedTransaction |
| /api/materials/recipes | backend/src/routes/materials.js:73 | POST | audited-in-transaction | yes | no | backend/src/routes/materials.js:73 auditedTransaction |
| /api/materials/replenishment/policies | backend/src/routes/materials.js:328 | DELETE | audited-in-transaction | yes | yes | backend/src/routes/materials.js:328 auditedTransaction |
| /api/materials/replenishment/policies | backend/src/routes/materials.js:304 | PUT | audited-in-transaction | yes | no | backend/src/routes/materials.js:304 auditedTransaction |
| /api/materials/replenishment/sweep | backend/src/routes/materials.js:343 | POST | audited-not-in-transaction | yes | no | backend/src/routes/materials.js:343 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/mcp | backend/src/routes/mcp.js:71 | POST | audited-not-in-transaction | yes | no | backend/src/services/mcpService.js:210 logActivity; backend/src/utils/activity.js:3 direct audit INSERT; Audit failure is swallowed: not guaranteed atomic |
| /api/notifications/:id/read | backend/src/routes/notifications.js:27 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/notifications/deliveries/:id/retry | backend/src/routes/notifications.js:45 | POST | audited-in-transaction | yes | no | backend/src/routes/notifications.js:45 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/notifications/preferences | backend/src/routes/notifications.js:76 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/organizations/:id/deactivate | backend/src/routes/organizations.js:97 | POST | delegates to an auditing service | yes | no | backend/src/routes/organizations.js:32 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:32 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/organizations/:id | backend/src/routes/organizations.js:76 | PUT | delegates to an auditing service | yes | no | backend/src/routes/organizations.js:32 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:32 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/organizations/bank-accounts/:id/make-primary | backend/src/routes/organizations.js:272 | POST | delegates to an auditing service | yes | no | backend/src/routes/organizations.js:32 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:32 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/organizations/bank-accounts/:id | backend/src/routes/organizations.js:258 | PUT | delegates to an auditing service | yes | no | backend/src/routes/organizations.js:32 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:32 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/organizations/bank-accounts | backend/src/routes/organizations.js:242 | POST | delegates to an auditing service | yes | no | backend/src/routes/organizations.js:32 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:32 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/organizations/company | backend/src/routes/organizations.js:113 | POST | delegates to an auditing service | yes | no | backend/src/routes/organizations.js:32 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:32 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/organizations/departments/:id | backend/src/routes/organizations.js:153 | PUT | delegates to an auditing service | yes | no | backend/src/routes/organizations.js:32 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:32 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/organizations/departments | backend/src/routes/organizations.js:139 | POST | delegates to an auditing service | yes | no | backend/src/routes/organizations.js:32 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:32 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/organizations/job-positions/:id | backend/src/routes/organizations.js:190 | PUT | delegates to an auditing service | yes | no | backend/src/routes/organizations.js:32 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:32 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/organizations/job-positions | backend/src/routes/organizations.js:176 | POST | delegates to an auditing service | yes | no | backend/src/routes/organizations.js:32 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:32 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/organizations/performance-scores | backend/src/routes/organizations.js:290 | POST | delegates to an auditing service | yes | no | backend/src/routes/organizations.js:32 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:32 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/organizations/qualifications/:id | backend/src/routes/organizations.js:226 | DELETE | delegates to an auditing service | yes | yes | backend/src/routes/organizations.js:32 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:32 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/organizations/qualifications | backend/src/routes/organizations.js:212 | POST | delegates to an auditing service | yes | no | backend/src/routes/organizations.js:32 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:32 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/organizations/team/:userProjectRoleId | backend/src/routes/organizations.js:357 | DELETE | audited-in-transaction | yes | yes | backend/src/routes/organizations.js:357 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:357 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/organizations/team | backend/src/routes/organizations.js:326 | POST | audited-in-transaction | yes | no | backend/src/routes/organizations.js:326 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:326 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/organizations | backend/src/routes/organizations.js:53 | POST | delegates to an auditing service | yes | no | backend/src/routes/organizations.js:32 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/organizations.js:32 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/payments/:id | backend/src/routes/payments.js:131 | DELETE | audited-in-transaction | yes | no | backend/src/routes/payments.js:131 finance.writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT; backend/src/routes/payments.js:131 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/payments | backend/src/routes/payments.js:64 | POST | audited-in-transaction | yes | no | backend/src/services/financeEngine.js:327 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT; backend/src/routes/payments.js:64 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/payroll/:id | backend/src/routes/payroll.js:115 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/payroll/:id | backend/src/routes/payroll.js:83 | PUT | not audited | yes | no | backend/src/routes/payroll.js:83 logActivity; backend/src/utils/activity.js:3 direct audit INSERT; Conditional audit only for posted_to_finance; status-only update unaudited |
| /api/payroll | backend/src/routes/payroll.js:38 | POST | audited-in-transaction | yes | no | backend/src/routes/payroll.js:38 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/portal/subcontractor/contracts/:id/acknowledge | backend/src/routes/portal.js:61 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/portal/subcontractor/instructions/:id/acknowledge | backend/src/routes/portal.js:70 | POST | audited-in-transaction | yes | no | backend/src/routes/portal.js:70 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/portal/subcontractor/payment-applications | backend/src/routes/portal.js:121 | POST | audited-in-transaction | yes | no | backend/src/routes/portal.js:121 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/portal/subcontractor/quantities | backend/src/routes/portal.js:92 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/portal/subcontractor/rfis/:id/acknowledge | backend/src/routes/portal.js:198 | POST | audited-not-in-transaction | yes | no | backend/src/services/consultantEngine.js:392 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT; Audit failure is swallowed: not guaranteed atomic |
| /api/portal/subcontractor/rfis | backend/src/routes/portal.js:149 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/portal/subcontractor/submissions/:kind | backend/src/routes/portal.js:245 | POST | audited-in-transaction | yes | no | backend/src/routes/portal.js:245 auditedTransaction |
| /api/portal/subcontractor/submittals/:id/resubmit | backend/src/routes/portal.js:218 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/portal/subcontractor/submittals | backend/src/routes/portal.js:174 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/portal/supplier/deliveries/:id/certificates | backend/src/routes/portal.js:377 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/portal/supplier/invoices | backend/src/routes/portal.js:396 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/portal/supplier/purchase-orders/:id/acknowledge | backend/src/routes/portal.js:352 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/portal/supplier/purchase-orders/:id/propose-delivery | backend/src/routes/portal.js:361 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/portal/supplier/rfqs/:id/clarifications | backend/src/routes/portal.js:336 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/portal/supplier/rfqs/:id/quotations | backend/src/routes/portal.js:310 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/procurement/award-recommendations/:id/decide | backend/src/routes/procurement.js:286 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:286 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/procurement/award-recommendations/:id/submit | backend/src/routes/procurement.js:278 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:278 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/procurement/award-recommendations/:id/withdraw | backend/src/routes/procurement.js:296 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:296 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/procurement/deliveries/:id/mir | backend/src/routes/procurement.js:533 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/procurement/deliveries | backend/src/routes/procurement.js:507 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/procurement/grn/:id/returns | backend/src/routes/procurement.js:580 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:580 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/procurement/invoices/:id/approve | backend/src/routes/procurement.js:641 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/procurement/invoices/:id/workflow/decide | backend/src/routes/procurement.js:343 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:343 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/procurement/invoices/:id/workflow/start | backend/src/routes/procurement.js:336 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:336 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/procurement/invoices | backend/src/routes/procurement.js:605 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/procurement/mir/:id/decide | backend/src/routes/procurement.js:540 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/procurement/mir/:id/grn | backend/src/routes/procurement.js:564 | POST | audited-in-transaction | yes | no | backend/src/routes/procurement.js:564 auditedTransaction |
| /api/procurement/po/:id/cancel | backend/src/routes/procurement.js:411 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:411 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/procurement/po/:id/decide | backend/src/routes/procurement.js:483 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/procurement/po/:id/issue | backend/src/routes/procurement.js:475 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:475 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/procurement/po/:id | backend/src/routes/procurement.js:401 | PUT | delegates to an auditing service | yes | yes | backend/src/routes/procurement.js:401 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/procurement/po | backend/src/routes/procurement.js:439 | POST | audited-in-transaction | yes | no | backend/src/routes/procurement.js:439 auditedTransaction |
| /api/procurement/pr/:id/cancel | backend/src/routes/procurement.js:375 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:375 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/procurement/pr/:id/decide | backend/src/routes/procurement.js:90 | POST | audited-in-transaction | yes | no | backend/src/routes/procurement.js:90 auditedTransaction |
| /api/procurement/pr/:id/submit | backend/src/routes/procurement.js:83 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/procurement/pr/:id | backend/src/routes/procurement.js:364 | PUT | delegates to an auditing service | yes | yes | backend/src/routes/procurement.js:364 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/procurement/pr | backend/src/routes/procurement.js:58 | POST | audited-in-transaction | yes | no | backend/src/routes/procurement.js:58 auditedTransaction |
| /api/procurement/rfq/:id/award-recommendations | backend/src/routes/procurement.js:266 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:266 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/procurement/rfq/:id/award | backend/src/routes/procurement.js:211 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/procurement/rfq/:id/quotations | backend/src/routes/procurement.js:148 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/procurement/rfq/:id/vendors | backend/src/routes/procurement.js:138 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/procurement/rfq | backend/src/routes/procurement.js:116 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/projects/:id/calendars/:calendarId | backend/src/routes/project-setup.js:88 | DELETE | delegates to an auditing service | yes | yes | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects/:id/calendars/:calendarId | backend/src/routes/project-setup.js:78 | PUT | delegates to an auditing service | yes | no | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects/:id/calendars | backend/src/routes/project-setup.js:68 | POST | delegates to an auditing service | yes | no | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects/:id/milestones | backend/src/routes/projects.js:360 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/projects/:id/phases | backend/src/routes/projects.js:281 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/projects/:id/settings | backend/src/routes/project-setup.js:46 | PUT | delegates to an auditing service | yes | no | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects/:id/team | backend/src/routes/projects.js:337 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/projects/:id/wbs/:nodeId | backend/src/routes/project-setup.js:128 | DELETE | delegates to an auditing service | yes | yes | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects/:id/wbs/:nodeId | backend/src/routes/project-setup.js:118 | PUT | delegates to an auditing service | yes | no | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects/:id/wbs | backend/src/routes/project-setup.js:106 | POST | delegates to an auditing service | yes | no | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects/:id/work-packages/:workPackageId | backend/src/routes/project-setup.js:170 | DELETE | delegates to an auditing service | yes | yes | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects/:id/work-packages/:workPackageId | backend/src/routes/project-setup.js:160 | PUT | delegates to an auditing service | yes | no | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects/:id/work-packages | backend/src/routes/project-setup.js:150 | POST | delegates to an auditing service | yes | no | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects/:id | backend/src/routes/projects.js:242 | PUT | audited-in-transaction | yes | no | backend/src/routes/projects.js:242 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects/:projectId/instructions/:id/:action(acknowledge&#124;implement&#124;close) | backend/src/routes/site.js:274 | POST | audited-in-transaction | yes | no | backend/src/routes/site.js:274 auditedTransaction; backend/src/routes/site.js:274 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects/:projectId/instructions/:id | backend/src/routes/site.js:249 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/projects/:projectId/instructions | backend/src/routes/site.js:193 | POST | audited-in-transaction | yes | no | backend/src/routes/site.js:193 auditedTransaction; backend/src/routes/site.js:193 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects/:projectId/milestones/:milestoneId | backend/src/routes/projects.js:399 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/projects/:projectId/milestones/:milestoneId | backend/src/routes/projects.js:378 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/projects/:projectId/phases/:phaseId | backend/src/routes/projects.js:330 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/projects/:projectId/phases/:phaseId | backend/src/routes/projects.js:300 | PUT | audited-in-transaction | yes | no | backend/src/routes/projects.js:300 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects/:projectId/photos | backend/src/routes/site.js:455 | POST | audited-in-transaction | yes | no | backend/src/routes/site.js:455 auditedTransaction |
| /api/projects/:projectId/site-reports/:id | backend/src/routes/site.js:120 | PUT | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/projects/:projectId/site-reports/assemble | backend/src/routes/site.js:433 | POST | audited-in-transaction | yes | no | backend/src/routes/site.js:433 auditedTransaction |
| /api/projects/:projectId/site-reports | backend/src/routes/site.js:74 | POST | audited-in-transaction | yes | no | backend/src/routes/site.js:74 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects/:projectId/site-visits/:id | backend/src/routes/site.js:409 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/projects/:projectId/site-visits/:id | backend/src/routes/site.js:386 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/projects/:projectId/site-visits | backend/src/routes/site.js:355 | POST | audited-in-transaction | yes | no | backend/src/routes/site.js:355 auditedTransaction |
| /api/projects/:projectId/sticky-notes/:id/convert-to-action | backend/src/routes/site.js:524 | POST | audited-in-transaction | yes | no | backend/src/routes/site.js:524 auditedTransaction |
| /api/projects/:projectId/sticky-notes | backend/src/routes/site.js:502 | POST | audited-in-transaction | yes | no | backend/src/routes/site.js:502 auditedTransaction |
| /api/projects/:projectId/team/:teamId | backend/src/routes/projects.js:353 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/projects/wizard | backend/src/routes/projects.js:96 | POST | delegates to an auditing service | yes | no | backend/src/routes/projects.js:133 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/projects | backend/src/routes/projects.js:124 | POST | delegates to an auditing service | yes | no | backend/src/routes/projects.js:133 logActivity; backend/src/utils/activity.js:3 direct audit INSERT; backend/src/routes/projects.js:208 logActivity |
| /api/qhse/actions/:id/status | backend/src/routes/qhse.js:824 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/qhse/actions | backend/src/routes/qhse.js:792 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:792 auditedTransaction |
| /api/qhse/calibration-records | backend/src/routes/qhse.js:956 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:956 auditedTransaction |
| /api/qhse/certificates/:id | backend/src/routes/qhse.js:1286 | PUT | audited-in-transaction | yes | no | backend/src/routes/qhse.js:1286 auditedTransaction |
| /api/qhse/certificates | backend/src/routes/qhse.js:1259 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:1259 auditedTransaction |
| /api/qhse/checklists/instances/:id | backend/src/routes/qhse.js:736 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/qhse/checklists/instances | backend/src/routes/qhse.js:691 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/qhse/checklists/templates | backend/src/routes/qhse.js:671 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:671 auditedTransaction |
| /api/qhse/incidents/:id | backend/src/routes/qhse.js:313 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/qhse/incidents | backend/src/routes/qhse.js:288 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:288 auditedTransaction |
| /api/qhse/inspections/:id | backend/src/routes/qhse.js:246 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/qhse/inspections | backend/src/routes/qhse.js:224 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:224 auditedTransaction |
| /api/qhse/itps/:id/points | backend/src/routes/qhse.js:445 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/qhse/itps/:id | backend/src/routes/qhse.js:472 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/qhse/itps | backend/src/routes/qhse.js:393 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:393 auditedTransaction |
| /api/qhse/mirs/:id/workflow/decision | backend/src/routes/qhse.js:1391 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/qhse/mirs/:id/workflow | backend/src/routes/qhse.js:1370 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/qhse/mirs/:id | backend/src/routes/qhse.js:1344 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/qhse/mock-ups/:id/status | backend/src/routes/qhse.js:913 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/qhse/mock-ups | backend/src/routes/qhse.js:885 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:885 auditedTransaction |
| /api/qhse/ncrs/:id/status | backend/src/routes/qhse.js:146 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:146 auditedTransaction |
| /api/qhse/ncrs/:id/verify | backend/src/routes/qhse.js:1103 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:1103 auditedTransaction |
| /api/qhse/ncrs/:id | backend/src/routes/qhse.js:1063 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/qhse/ncrs | backend/src/routes/qhse.js:118 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:118 auditedTransaction |
| /api/qhse/punch-items/:id/status | backend/src/routes/qhse.js:1030 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:1030 auditedTransaction |
| /api/qhse/punch-items | backend/src/routes/qhse.js:1008 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:1008 auditedTransaction |
| /api/qhse/quality-tests/:id | backend/src/routes/qhse.js:84 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/qhse/quality-tests/:id | backend/src/routes/qhse.js:1141 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/qhse/quality-tests | backend/src/routes/qhse.js:34 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:34 auditedTransaction |
| /api/qhse/wirs/:id/decision | backend/src/routes/qhse.js:604 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:604 auditedTransaction |
| /api/qhse/wirs/:id/result | backend/src/routes/qhse.js:621 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:621 auditedTransaction |
| /api/qhse/wirs/:id/submit | backend/src/routes/qhse.js:592 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:592 auditedTransaction |
| /api/qhse/wirs | backend/src/routes/qhse.js:562 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:562 auditedTransaction |
| /api/quantities/allocations/:id | backend/src/routes/quantities.js:108 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/quantities/allocations | backend/src/routes/quantities.js:67 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/quantities/measurements/:id/review | backend/src/routes/quantities.js:216 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/quantities/measurements | backend/src/routes/quantities.js:172 | POST | audited-in-transaction | yes | no | backend/src/routes/quantities.js:172 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/reports/saved-views/:id | backend/src/routes/reports.js:199 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/reports/saved-views | backend/src/routes/reports.js:177 | POST | audited-in-transaction | yes | no | backend/src/routes/reports.js:177 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/reports/scheduled/:id | backend/src/routes/reports.js:252 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/reports/scheduled | backend/src/routes/reports.js:225 | POST | audited-in-transaction | yes | no | backend/src/routes/reports.js:225 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/sales/buildings/:buildingId/bulk-units | backend/src/routes/units.js:253 | POST | audited-in-transaction | yes | no | backend/src/routes/units.js:253 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/sales/buildings/:buildingId/units | backend/src/routes/units.js:218 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/sales/buildings/:id | backend/src/routes/units.js:191 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/sales/buildings/:id | backend/src/routes/units.js:135 | PUT | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/sales/buildings | backend/src/routes/units.js:80 | POST | audited-in-transaction | yes | no | backend/src/routes/units.js:80 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/sales/units/:id/status | backend/src/routes/units.js:335 | POST | audited-in-transaction | yes | no | backend/src/routes/units.js:335 logActivity; backend/src/utils/activity.js:3 direct audit INSERT; backend/src/services/financeEngine.js:197 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT; backend/src/routes/units.js:26 logActivity |
| /api/sales/units/:id | backend/src/routes/units.js:402 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/sales/units/:id | backend/src/routes/units.js:301 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/schedule/activities/:id/assignments | backend/src/routes/schedule.js:425 | POST | audited-in-transaction | yes | no | backend/src/routes/schedule.js:425 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/schedule/activities/:id/budgeted-cost | backend/src/routes/schedule.js:261 | PUT | audited-in-transaction | yes | no | backend/src/routes/schedule.js:261 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/schedule/activities/:id/progress | backend/src/routes/schedule.js:342 | POST | audited-in-transaction | yes | no | backend/src/routes/schedule.js:342 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/schedule/activities/:id | backend/src/routes/schedule.js:332 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/schedule/activities/:id | backend/src/routes/schedule.js:281 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/schedule/activities/import | backend/src/routes/schedule.js:801 | POST | audited-in-transaction | yes | yes | backend/src/routes/schedule.js:801 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/schedule/activities | backend/src/routes/schedule.js:202 | POST | audited-in-transaction | yes | no | backend/src/routes/schedule.js:202 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/schedule/assignments/:id/status | backend/src/routes/schedule.js:485 | PUT | audited-in-transaction | yes | no | backend/src/routes/schedule.js:485 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/schedule/baselines | backend/src/routes/schedule.js:763 | POST | audited-in-transaction | yes | no | backend/src/routes/schedule.js:763 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/schedule/calendars | backend/src/routes/schedule.js:96 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/schedule/relationships/:id | backend/src/routes/schedule.js:555 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/schedule/relationships | backend/src/routes/schedule.js:532 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/schedule/schedule/milestones/:id/link | backend/src/routes/schedule.js:730 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/subcontractors/:id | backend/src/routes/subcontractors.js:57 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/subcontractors/certificates/:id | backend/src/routes/subcontractors.js:213 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/subcontractors/certificates | backend/src/routes/subcontractors.js:188 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/subcontractors/contracts | backend/src/routes/subcontractors.js:92 | POST | audited-in-transaction | yes | no | backend/src/routes/subcontractors.js:92 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/subcontractors/verifications/:id | backend/src/routes/subcontractors.js:163 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/subcontractors/verifications | backend/src/routes/subcontractors.js:144 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/subcontractors | backend/src/routes/subcontractors.js:31 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/suppliers/:id/materials/:material_id | backend/src/routes/suppliers.js:210 | DELETE | audited-in-transaction | yes | yes | backend/src/routes/suppliers.js:210 auditedTransaction |
| /api/suppliers/:id/materials | backend/src/routes/suppliers.js:178 | POST | audited-in-transaction | yes | no | backend/src/routes/suppliers.js:178 auditedTransaction |
| /api/suppliers/:id/restore | backend/src/routes/suppliers.js:149 | POST | audited-in-transaction | yes | no | backend/src/routes/suppliers.js:149 auditedTransaction |
| /api/suppliers/:id | backend/src/routes/suppliers.js:135 | DELETE | audited-in-transaction | yes | no | backend/src/routes/suppliers.js:135 auditedTransaction |
| /api/suppliers/:id | backend/src/routes/suppliers.js:102 | PUT | audited-in-transaction | yes | no | backend/src/routes/suppliers.js:102 auditedTransaction |
| /api/suppliers | backend/src/routes/suppliers.js:64 | POST | audited-in-transaction | yes | no | backend/src/routes/suppliers.js:64 auditedTransaction |
| /api/team/:userProjectRoleId | backend/src/routes/team-assignments.js:68 | DELETE | audited-in-transaction | yes | yes | backend/src/routes/team-assignments.js:68 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT |
| /api/team | backend/src/routes/team-assignments.js:42 | POST | audited-in-transaction | yes | no | backend/src/routes/team-assignments.js:42 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT |
| /api/users/:id | backend/src/routes/users.js:154 | DELETE | audited-in-transaction | yes | no | backend/src/routes/users.js:154 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/users/:id | backend/src/routes/users.js:76 | PUT | audited-in-transaction | yes | yes | backend/src/routes/users.js:76 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/users.js:76 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/users/preview/:role | backend/src/routes/users.js:182 | POST | audited-not-in-transaction | yes | no | backend/src/routes/users.js:182 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT |
| /api/v1/actions/:id/acknowledge | backend/src/routes/actions.js:84 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/actions/:id/comments | backend/src/routes/actions.js:28 | POST | audited-in-transaction | yes | no | backend/src/routes/actions.js:28 auditedTransaction |
| /api/v1/actions/:id/complete | backend/src/routes/actions.js:95 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/actions/:id/delegate | backend/src/routes/actions.js:106 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/actions | backend/src/routes/actions.js:59 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/approvals/:id/cancel | backend/src/routes/approvals.js:331 | PUT | audited-in-transaction | yes | no | backend/src/routes/approvals.js:331 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/assistants/:assistant/draft | backend/src/routes/v1.js:813 | POST | legitimately exempt | no | no | Local deterministic draft object only: no persisted document or adapter call |
| /api/v1/boq/sections/:id | backend/src/routes/boq.js:59 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/v1/boq/sections/:id | backend/src/routes/boq.js:42 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/boq/sections | backend/src/routes/boq.js:21 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/budgets/:id/decide | backend/src/routes/commercial.js:502 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/budgets/:id/submit | backend/src/routes/commercial.js:495 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/budgets/:id | backend/src/routes/commercial.js:488 | PUT | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/v1/budgets | backend/src/routes/commercial.js:475 | POST | delegates to an auditing service | yes | yes | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/commitments/:id/adjust | backend/src/routes/commercial.js:544 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/companies/:id | backend/src/routes/clients.js:85 | DELETE | audited-in-transaction | yes | yes | backend/src/routes/clients.js:85 auditedTransaction |
| /api/v1/companies/:id | backend/src/routes/clients.js:58 | PUT | audited-in-transaction | yes | no | backend/src/routes/clients.js:58 auditedTransaction |
| /api/v1/companies | backend/src/routes/clients.js:30 | POST | audited-in-transaction | yes | no | backend/src/routes/clients.js:30 auditedTransaction |
| /api/v1/contracts/:contractId/parties | backend/src/routes/commercial.js:247 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/contracts/parties/:id | backend/src/routes/commercial.js:257 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/contracts | backend/src/routes/commercial.js:30 | POST | audited-in-transaction | yes | no | backend/src/routes/commercial.js:30 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/credit-notes/:id/issue | backend/src/routes/financeLedger.js:288 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:288 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/v1/credit-notes/:id/void | backend/src/routes/financeLedger.js:295 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:295 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/v1/credit-notes | backend/src/routes/financeLedger.js:273 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:273 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/v1/currency-rates | backend/src/routes/commercial.js:362 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/daily-reports/:projectId/:id | backend/src/routes/site.js:120 | PUT | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/v1/daily-reports/:projectId/assemble | backend/src/routes/site.js:433 | POST | audited-in-transaction | yes | no | backend/src/routes/site.js:433 auditedTransaction |
| /api/v1/daily-reports/:projectId | backend/src/routes/site.js:74 | POST | audited-in-transaction | yes | no | backend/src/routes/site.js:74 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/deliveries/:id/mir | backend/src/routes/procurement.js:533 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/deliveries/mir/:id/decide | backend/src/routes/procurement.js:540 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/deliveries | backend/src/routes/procurement.js:507 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/documents/:id/:action(approve&#124;reject) | backend/src/routes/doccontrol.js:262 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:262 auditedTransaction |
| /api/v1/documents/:id/acknowledgement | backend/src/routes/client.js:87 | POST | audited-in-transaction | yes | no | backend/src/routes/client.js:87 auditedTransaction |
| /api/v1/documents/:id/submit | backend/src/routes/doccontrol.js:246 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:246 auditedTransaction |
| /api/v1/documents/:id/versions | backend/src/routes/doccontrol.js:161 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:161 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/documents/:id | backend/src/routes/doccontrol.js:274 | DELETE | audited-in-transaction | yes | yes | backend/src/routes/doccontrol.js:274 auditedTransaction |
| /api/v1/documents/:id | backend/src/routes/doccontrol.js:204 | PUT | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:204 auditedTransaction |
| /api/v1/documents | backend/src/routes/doccontrol.js:89 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:89 auditedTransaction |
| /api/v1/forecasts/:id/approve | backend/src/routes/commercial.js:529 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/forecasts | backend/src/routes/commercial.js:516 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/grns/:id/returns | backend/src/routes/procurement.js:580 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:580 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/v1/grns/from-mir/:id | backend/src/routes/procurement.js:564 | POST | audited-in-transaction | yes | no | backend/src/routes/procurement.js:564 auditedTransaction |
| /api/v1/guarantees/:id/close | backend/src/routes/commercial.js:298 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/guarantees/:id | backend/src/routes/commercial.js:288 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/guarantees | backend/src/routes/commercial.js:275 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inspections/:id | backend/src/routes/qhse.js:246 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/inspections/safety | backend/src/routes/hse.js:174 | POST | audited-in-transaction | yes | no | backend/src/routes/hse.js:174 auditedTransaction |
| /api/v1/inspections | backend/src/routes/qhse.js:224 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:224 auditedTransaction |
| /api/v1/insurances/:id/cancel | backend/src/routes/commercial.js:341 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/insurances/:id | backend/src/routes/commercial.js:331 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/insurances | backend/src/routes/commercial.js:318 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/adjustments/:id/post | backend/src/routes/inventory.js:231 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/adjustments/:id/void | backend/src/routes/inventory.js:239 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/adjustments/:id | backend/src/routes/inventory.js:217 | PUT | delegates to an auditing service | yes | yes | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/adjustments | backend/src/routes/inventory.js:202 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/conversions/:id | backend/src/routes/inventory.js:173 | DELETE | delegates to an auditing service | yes | yes | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/conversions/:id | backend/src/routes/inventory.js:163 | PUT | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/conversions | backend/src/routes/inventory.js:153 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/issues/:id/post | backend/src/routes/inventory.js:231 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/issues/:id/void | backend/src/routes/inventory.js:239 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/issues/:id | backend/src/routes/inventory.js:217 | PUT | delegates to an auditing service | yes | yes | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/issues | backend/src/routes/inventory.js:202 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/lots/:id/status | backend/src/routes/inventory.js:122 | PUT | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/lots | backend/src/routes/inventory.js:106 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/movements/:id/reverse | backend/src/routes/warehouses.js:149 | POST | audited-in-transaction | yes | no | backend/src/routes/warehouses.js:149 auditedTransaction |
| /api/v1/inventory/reservations/:id/release | backend/src/routes/warehouses.js:398 | POST | audited-in-transaction | yes | no | backend/src/routes/warehouses.js:398 auditedTransaction |
| /api/v1/inventory/reservations | backend/src/routes/warehouses.js:361 | POST | audited-in-transaction | yes | no | backend/src/routes/warehouses.js:361 auditedTransaction |
| /api/v1/inventory/returns/:id/post | backend/src/routes/inventory.js:231 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/returns/:id/void | backend/src/routes/inventory.js:239 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/returns/:id | backend/src/routes/inventory.js:217 | PUT | delegates to an auditing service | yes | yes | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/returns | backend/src/routes/inventory.js:202 | POST | delegates to an auditing service | yes | no | backend/src/routes/inventory.js:66 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/transfers/:id/complete | backend/src/routes/warehouses.js:264 | PUT | audited-in-transaction | yes | no | backend/src/routes/warehouses.js:264 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/transfers | backend/src/routes/warehouses.js:232 | POST | audited-in-transaction | yes | no | backend/src/routes/warehouses.js:232 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/inventory/warehouses/:id/movements | backend/src/routes/warehouses.js:89 | POST | audited-in-transaction | yes | no | backend/src/routes/warehouses.js:89 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/invoices/:id/transition | backend/src/routes/financeLedger.js:46 | POST | delegates to an auditing service | yes | no | backend/src/services/financeEngine.js:245 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT |
| /api/v1/invoices/:id | backend/src/routes/invoices.js:129 | PUT | audited-in-transaction | yes | no | backend/src/routes/invoices.js:129 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/invoices/payments/:id/allocate | backend/src/routes/financeLedger.js:69 | POST | delegates to an auditing service | yes | no | backend/src/services/financeEngine.js:327 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT |
| /api/v1/invoices/retention | backend/src/routes/financeLedger.js:103 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:103 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/v1/invoices | backend/src/routes/invoices.js:92 | POST | audited-in-transaction | yes | no | backend/src/services/financeEngine.js:197 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT; backend/src/routes/invoices.js:92 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/materials/:id | backend/src/routes/items.js:154 | PUT | audited-in-transaction | yes | no | backend/src/routes/items.js:154 auditedTransaction |
| /api/v1/materials/recipes/:id | backend/src/routes/materials.js:132 | PUT | audited-in-transaction | yes | no | backend/src/routes/materials.js:132 auditedTransaction |
| /api/v1/materials/recipes | backend/src/routes/materials.js:73 | POST | audited-in-transaction | yes | no | backend/src/routes/materials.js:73 auditedTransaction |
| /api/v1/materials/replenishment/policies | backend/src/routes/materials.js:328 | DELETE | audited-in-transaction | yes | yes | backend/src/routes/materials.js:328 auditedTransaction |
| /api/v1/materials/replenishment/policies | backend/src/routes/materials.js:304 | PUT | audited-in-transaction | yes | no | backend/src/routes/materials.js:304 auditedTransaction |
| /api/v1/materials/replenishment/sweep | backend/src/routes/materials.js:343 | POST | audited-not-in-transaction | yes | no | backend/src/routes/materials.js:343 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/materials | backend/src/routes/items.js:119 | POST | audited-in-transaction | yes | no | backend/src/routes/items.js:119 auditedTransaction |
| /api/v1/ncrs/:id/status | backend/src/routes/qhse.js:146 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:146 auditedTransaction |
| /api/v1/ncrs/:id/verify | backend/src/routes/qhse.js:1103 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:1103 auditedTransaction |
| /api/v1/ncrs/:id | backend/src/routes/qhse.js:182 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/ncrs | backend/src/routes/qhse.js:118 | POST | audited-in-transaction | yes | no | backend/src/routes/qhse.js:118 auditedTransaction |
| /api/v1/notifications/:id/read | backend/src/routes/notifications.js:27 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/notifications/preferences | backend/src/routes/notifications.js:76 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/oauth/token | backend/src/routes/v1.js:601 | POST | audited-not-in-transaction | yes | no | backend/src/services/oauthService.js:243 direct audit INSERT; Audit failure is swallowed: not guaranteed atomic |
| /api/v1/observations/:id/advance | backend/src/routes/consultant.js:154 | POST | audited-in-transaction | yes | no | backend/src/routes/consultant.js:154 auditedTransaction |
| /api/v1/observations/:id/comments | backend/src/routes/consultant.js:139 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/observations | backend/src/routes/consultant.js:110 | POST | audited-in-transaction | yes | no | backend/src/routes/consultant.js:110 auditedTransaction |
| /api/v1/payment-applications/:id/certify | backend/src/routes/commercial.js:409 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/payment-applications/:id/reject | backend/src/routes/commercial.js:426 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/payment-applications/:id/submit | backend/src/routes/commercial.js:402 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/payment-applications/:id/withdraw | backend/src/routes/commercial.js:433 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/payment-applications | backend/src/routes/commercial.js:379 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/payment-batches/:id/approve | backend/src/routes/financeLedger.js:331 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:331 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/v1/payment-batches/:id/cancel | backend/src/routes/financeLedger.js:345 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:345 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/v1/payment-batches/:id/release | backend/src/routes/financeLedger.js:338 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:338 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction; backend/src/services/financeEngine.js:327 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT |
| /api/v1/payment-batches/:id/submit | backend/src/routes/financeLedger.js:324 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:324 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/v1/payment-batches | backend/src/routes/financeLedger.js:308 | POST | delegates to an auditing service | yes | no | backend/src/routes/financeLedger.js:308 auditedFin; backend/src/routes/financeLedger.js:258 auditedTransaction |
| /api/v1/payment-certificates/:id/decide | backend/src/routes/commercial.js:451 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT; backend/src/services/financeEngine.js:197 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT |
| /api/v1/payment-certificates/:id/start | backend/src/routes/commercial.js:444 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/payment-certificates/valuations | backend/src/routes/financeLedger.js:19 | POST | delegates to an auditing service | yes | no | backend/src/services/financeEngine.js:197 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT |
| /api/v1/payments/:id/allocate | backend/src/routes/financeLedger.js:69 | POST | delegates to an auditing service | yes | no | backend/src/services/financeEngine.js:327 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT |
| /api/v1/payments | backend/src/routes/payments.js:64 | POST | audited-in-transaction | yes | no | backend/src/services/financeEngine.js:327 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT; backend/src/routes/payments.js:64 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/projects/:id/calendars/:calendarId | backend/src/routes/project-setup.js:88 | DELETE | delegates to an auditing service | yes | yes | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/projects/:id/calendars/:calendarId | backend/src/routes/project-setup.js:78 | PUT | delegates to an auditing service | yes | no | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/projects/:id/calendars | backend/src/routes/project-setup.js:68 | POST | delegates to an auditing service | yes | no | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/projects/:id/milestones | backend/src/routes/projects.js:360 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/projects/:id/participants | backend/src/routes/projects.js:337 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/projects/:id/phases | backend/src/routes/projects.js:281 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/projects/:id/settings | backend/src/routes/project-setup.js:46 | PUT | delegates to an auditing service | yes | no | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/projects/:id/wbs/:nodeId | backend/src/routes/project-setup.js:128 | DELETE | delegates to an auditing service | yes | yes | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/projects/:id/wbs/:nodeId | backend/src/routes/project-setup.js:118 | PUT | delegates to an auditing service | yes | no | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/projects/:id/wbs | backend/src/routes/project-setup.js:106 | POST | delegates to an auditing service | yes | no | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/projects/:id/work-packages/:workPackageId | backend/src/routes/project-setup.js:170 | DELETE | delegates to an auditing service | yes | yes | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/projects/:id/work-packages/:workPackageId | backend/src/routes/project-setup.js:160 | PUT | delegates to an auditing service | yes | no | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/projects/:id/work-packages | backend/src/routes/project-setup.js:150 | POST | delegates to an auditing service | yes | no | backend/src/routes/project-setup.js:35 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/projects/:id | backend/src/routes/projects.js:242 | PUT | audited-in-transaction | yes | no | backend/src/routes/projects.js:242 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/projects/:projectId/locations | backend/src/routes/locations.js:61 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/projects/:projectId/milestones/:milestoneId | backend/src/routes/projects.js:399 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/v1/projects/:projectId/milestones/:milestoneId | backend/src/routes/projects.js:378 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/projects/:projectId/participants/:teamId | backend/src/routes/projects.js:353 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/v1/projects/:projectId/phases/:phaseId | backend/src/routes/projects.js:330 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/v1/projects/:projectId/phases/:phaseId | backend/src/routes/projects.js:300 | PUT | audited-in-transaction | yes | no | backend/src/routes/projects.js:300 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/projects | backend/src/routes/projects.js:124 | POST | delegates to an auditing service | yes | no | backend/src/routes/projects.js:133 logActivity; backend/src/utils/activity.js:3 direct audit INSERT; backend/src/routes/projects.js:208 logActivity |
| /api/v1/purchase-orders/:id/cancel | backend/src/routes/procurement.js:411 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:411 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/v1/purchase-orders/:id/decide | backend/src/routes/procurement.js:483 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/purchase-orders/:id/issue | backend/src/routes/procurement.js:475 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:475 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/v1/purchase-orders/:id | backend/src/routes/procurement.js:401 | PUT | delegates to an auditing service | yes | yes | backend/src/routes/procurement.js:401 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/v1/purchase-orders | backend/src/routes/procurement.js:439 | POST | audited-in-transaction | yes | no | backend/src/routes/procurement.js:439 auditedTransaction |
| /api/v1/purchase-requisitions/:id/cancel | backend/src/routes/procurement.js:375 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:375 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/v1/purchase-requisitions/:id/decide | backend/src/routes/procurement.js:90 | POST | audited-in-transaction | yes | no | backend/src/routes/procurement.js:90 auditedTransaction |
| /api/v1/purchase-requisitions/:id/submit | backend/src/routes/procurement.js:83 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/purchase-requisitions/:id | backend/src/routes/procurement.js:364 | PUT | delegates to an auditing service | yes | yes | backend/src/routes/procurement.js:364 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/v1/purchase-requisitions | backend/src/routes/procurement.js:58 | POST | audited-in-transaction | yes | no | backend/src/routes/procurement.js:58 auditedTransaction |
| /api/v1/quantities/allocations/:id | backend/src/routes/quantities.js:108 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/quantities/allocations | backend/src/routes/quantities.js:67 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/quantities/measurements/:id/review | backend/src/routes/quantities.js:216 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/quantities/measurements | backend/src/routes/quantities.js:172 | POST | audited-in-transaction | yes | no | backend/src/routes/quantities.js:172 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/reports/saved-views/:id | backend/src/routes/reports.js:199 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/v1/reports/saved-views | backend/src/routes/reports.js:177 | POST | audited-in-transaction | yes | no | backend/src/routes/reports.js:177 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/reports/scheduled/:id | backend/src/routes/reports.js:252 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/v1/reports/scheduled | backend/src/routes/reports.js:225 | POST | audited-in-transaction | yes | no | backend/src/routes/reports.js:225 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/rfis/:id/close | backend/src/routes/doccontrol.js:352 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/rfis/:id/respond | backend/src/routes/doccontrol.js:348 | POST | legitimately exempt | no | no | Retired command returns 410 before any mutation; use staged-response routes |
| /api/v1/rfis/:id/responses | backend/src/routes/consultant.js:203 | POST | audited-in-transaction | yes | no | backend/src/routes/consultant.js:203 auditedTransaction; backend/src/services/consultantEngine.js:392 writeAuditEvent; backend/src/services/financeEngine.js:57 direct audit INSERT |
| /api/v1/rfis | backend/src/routes/doccontrol.js:306 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:306 auditedTransaction |
| /api/v1/rfqs/:id/award-recommendations | backend/src/routes/procurement.js:266 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:266 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/v1/rfqs/:id/award | backend/src/routes/procurement.js:211 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/rfqs/:id/quotations | backend/src/routes/procurement.js:148 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/rfqs/:id/vendors | backend/src/routes/procurement.js:138 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/rfqs/award-recommendations/:id/decide | backend/src/routes/procurement.js:286 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:286 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/v1/rfqs/award-recommendations/:id/submit | backend/src/routes/procurement.js:278 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:278 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/v1/rfqs/award-recommendations/:id/withdraw | backend/src/routes/procurement.js:296 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:296 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/v1/rfqs | backend/src/routes/procurement.js:116 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/schedule/activities/:id/progress | backend/src/routes/schedule.js:342 | POST | audited-in-transaction | yes | no | backend/src/routes/schedule.js:342 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/schedule/activities/:id | backend/src/routes/schedule.js:332 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/v1/schedule/activities/:id | backend/src/routes/schedule.js:281 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/schedule/activities | backend/src/routes/schedule.js:202 | POST | audited-in-transaction | yes | no | backend/src/routes/schedule.js:202 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/schedule/baselines | backend/src/routes/schedule.js:763 | POST | audited-in-transaction | yes | no | backend/src/routes/schedule.js:763 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/schedule/calendars | backend/src/routes/schedule.js:96 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/schedule/relationships/:id | backend/src/routes/schedule.js:555 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/v1/schedule/relationships | backend/src/routes/schedule.js:532 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/site-visits/:projectId/:id | backend/src/routes/site.js:409 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/v1/site-visits/:projectId/:id | backend/src/routes/site.js:386 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/site-visits/:projectId | backend/src/routes/site.js:355 | POST | audited-in-transaction | yes | no | backend/src/routes/site.js:355 auditedTransaction |
| /api/v1/subcontracts/:contractId/parties | backend/src/routes/commercial.js:247 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/subcontracts/certificates/:id | backend/src/routes/subcontractors.js:213 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/subcontracts/certificates | backend/src/routes/subcontractors.js:188 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/subcontracts/subcontractor/submissions/:kind | backend/src/routes/portal.js:245 | POST | audited-in-transaction | yes | no | backend/src/routes/portal.js:245 auditedTransaction |
| /api/v1/subcontracts/verifications/:id | backend/src/routes/subcontractors.js:163 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/subcontracts/verifications | backend/src/routes/subcontractors.js:144 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/subcontracts | backend/src/routes/subcontractors.js:92 | POST | audited-in-transaction | yes | no | backend/src/routes/subcontractors.js:92 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/submittals/:id/respond | backend/src/routes/doccontrol.js:409 | POST | legitimately exempt | no | no | Retired command returns 410 before any mutation; use staged-response routes |
| /api/v1/submittals/:id/revisions | backend/src/routes/consultant.js:232 | POST | audited-in-transaction | yes | no | backend/src/routes/consultant.js:232 auditedTransaction |
| /api/v1/submittals | backend/src/routes/doccontrol.js:383 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:383 auditedTransaction |
| /api/v1/supplier-invoices/:id/approve | backend/src/routes/procurement.js:641 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/supplier-invoices/:id/workflow/decide | backend/src/routes/procurement.js:343 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:343 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/v1/supplier-invoices/:id/workflow/start | backend/src/routes/procurement.js:336 | POST | delegates to an auditing service | yes | no | backend/src/routes/procurement.js:336 auditedProc; backend/src/routes/procurement.js:245 auditedTransaction |
| /api/v1/supplier-invoices | backend/src/routes/procurement.js:605 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/transmittals/:id/items | backend/src/routes/doccontrol.js:640 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:640 auditedTransaction |
| /api/v1/transmittals/:id/status | backend/src/routes/doccontrol.js:673 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:673 auditedTransaction |
| /api/v1/transmittals | backend/src/routes/doccontrol.js:567 | POST | audited-in-transaction | yes | no | backend/src/routes/doccontrol.js:567 auditedTransaction |
| /api/v1/users/:id | backend/src/routes/users.js:76 | PUT | audited-in-transaction | yes | yes | backend/src/routes/users.js:76 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT; backend/src/routes/users.js:76 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/variations/:id/client-response | backend/src/routes/client.js:70 | POST | audited-in-transaction | yes | no | backend/src/routes/client.js:70 auditedTransaction |
| /api/v1/variations/:id/decide | backend/src/routes/commercial.js:152 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/variations/:id/start | backend/src/routes/commercial.js:143 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/variations/:id | backend/src/routes/commercial.js:221 | PUT | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/variations | backend/src/routes/commercial.js:104 | POST | delegates to an auditing service | yes | no | backend/src/routes/commercial.js:204 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/v1/webhooks/:id/rotate-secret | backend/src/routes/v1.js:694 | POST | audited-in-transaction | yes | no | backend/src/routes/v1.js:694 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT |
| /api/v1/webhooks/:id | backend/src/routes/v1.js:748 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/v1/webhooks/:id | backend/src/routes/v1.js:716 | PUT | audited-in-transaction | yes | no | backend/src/routes/v1.js:716 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT |
| /api/v1/webhooks/deliveries/:deliveryId/redrive | backend/src/routes/v1.js:761 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/webhooks | backend/src/routes/v1.js:663 | POST | audited-in-transaction | yes | no | backend/src/routes/v1.js:663 policy.recordAuditEvent; backend/src/services/policy.js:719 direct audit INSERT |
| /api/v1/work-packages/work-packages/:id | backend/src/routes/boq.js:150 | DELETE | not audited | yes | yes | No audit helper in reachable handler/service graph |
| /api/v1/work-packages/work-packages/:id | backend/src/routes/boq.js:129 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/v1/work-packages/work-packages | backend/src/routes/boq.js:101 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/warehouses/:id/movements | backend/src/routes/warehouses.js:89 | POST | audited-in-transaction | yes | no | backend/src/routes/warehouses.js:89 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/warehouses/movements/:id/mir | backend/src/routes/warehouses.js:170 | POST | audited-in-transaction | yes | no | backend/src/routes/warehouses.js:170 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/warehouses/movements/:id/reverse | backend/src/routes/warehouses.js:149 | POST | audited-in-transaction | yes | no | backend/src/routes/warehouses.js:149 auditedTransaction |
| /api/warehouses/reservations/:id/release | backend/src/routes/warehouses.js:398 | POST | audited-in-transaction | yes | no | backend/src/routes/warehouses.js:398 auditedTransaction |
| /api/warehouses/reservations | backend/src/routes/warehouses.js:361 | POST | audited-in-transaction | yes | no | backend/src/routes/warehouses.js:361 auditedTransaction |
| /api/warehouses/transfers/:id/complete | backend/src/routes/warehouses.js:264 | PUT | audited-in-transaction | yes | no | backend/src/routes/warehouses.js:264 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/warehouses/transfers | backend/src/routes/warehouses.js:232 | POST | audited-in-transaction | yes | no | backend/src/routes/warehouses.js:232 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/work-orders/:id/completions | backend/src/routes/workorders.js:254 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/work-orders/:id/equipment | backend/src/routes/workorders.js:224 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/work-orders/:id/labor | backend/src/routes/workorders.js:194 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/work-orders/:id/materials | backend/src/routes/workorders.js:133 | POST | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/work-orders/:id | backend/src/routes/workorders.js:99 | DELETE | audited-in-transaction | yes | no | backend/src/routes/workorders.js:99 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/work-orders/:id | backend/src/routes/workorders.js:75 | PUT | not audited | yes | no | No audit helper in reachable handler/service graph |
| /api/work-orders/:woId/completions/:compId/verify | backend/src/routes/workorders.js:312 | PUT | audited-in-transaction | yes | no | backend/src/routes/workorders.js:312 logActivity; backend/src/utils/activity.js:3 direct audit INSERT |
| /api/work-orders | backend/src/routes/workorders.js:52 | POST | audited-in-transaction | yes | no | backend/src/routes/workorders.js:52 auditedTransaction |
