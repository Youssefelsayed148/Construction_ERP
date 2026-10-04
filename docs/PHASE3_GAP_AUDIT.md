# Phase 3 gap audit (closeout A1)

Verified against the code at commit 478e37f (top of the Phase 3 stack, PR #35), 2026-10-04. Plan numbering is used from here on; the earlier working labels map as:

| Earlier label (PR) | Plan section |
|---|---|
| 3.1 cost accrual (#30) | 3.1 Cost posting |
| 3.2 invoice dedupe (#31) | 3.1 (duplicate refusal; also closes a 2.6 item) |
| 3.3 outbox (#32) | 3.2 Events |
| 3.4 sweep leader (#33) | 3.5 Background jobs |
| 3.5 progress (#34) | 3.4 Progress |
| approvals cancel (#35) | open item of 2.8 (not a Phase 3 checkbox) |

Status key: DONE (PR) / PARTIAL (what is missing) / NOT DONE. "A2.n" is the closeout item that closes it.

## 3.1 Cost posting

| Item | Status | Evidence / gap | Closed by |
|---|---|---|---|
| Post to project_costs from GRN accepted (stocked) | DONE (#30) | `costAccrual.accrueGrnCost` | |
| Post from supplier invoice approved (services) | DONE (#30) | `accrueSupplierInvoiceCost` | |
| Supplier payment allocation | DONE (#30) | ledger Dr payable / Cr cash, void reverses once | |
| Material issue to project_costs | NOT DONE | no INSERT into project_costs from `issueMaterialToWorkPackage` or warehouse issues | A2.3 |
| Expenses to project_costs | NOT DONE | expenses post to the ledger only (2.7a) | A2.3 |
| Payroll allocation to project_costs | NOT DONE | payroll posts to the ledger only | A2.3 |
| Supplier-return reversal of the GRN cost | NOT DONE | decision 2 | A2.1 |
| UNIQUE (source_type, source_id) | DONE (#30, migration 0018) | | |
| Remove the catch-to-zero guards | NOT DONE | 11 in dashboard.js, 3 in quantities.js, 4 in materials.js, 2 in site.js, 3 in consultantEngine.js, plus hr, documents, locations, approvals, subcontractors, workorders, qaqcEngine, webhookService (`.catch(() => ...)` returning an empty value); 2 try/catch-to-`[]` in commercialEngine; `safeAll` in siteEngine | A2.4 |
| One shared cost view read by dashboards, commercialEngine, costing | NOT DONE | no cost view exists; dashboard.js sums project_costs inline, costing.js and commercialEngine read the table directly | A2.4 |

## 3.2 Events

| Item | Status | Evidence / gap | Closed by |
|---|---|---|---|
| Outbox table, same-transaction write, dispatcher with retry | DONE (#32, migration 0020) | `services/outboxDispatcher.js` | |
| Cost consumers read from the outbox, idempotent, catch-up | DONE (#32) | `costEventListener` (work completion, labor payment, subcontractor payment) | |
| `rfi.created` vs `rfi.submitted` | NOT DONE | doccontrol.js:279 emits `rfi.created`; the route is `rfi.submitted` | A2.5 |
| `invoice.overdue` actually emitted | NOT DONE | route exists; financeEngine emits `receivable.<stage>` and no code emits `invoice.overdue` | A2.5 |
| `purchase_orders` module vs `purchase_requisition.*` naming | NOT DONE | workflowEngine.js:235 maps module `purchase_orders` to `purchase_requisition.<outcome>` | A2.5 |
| Routes for unrouted events | NOT DONE | `EVENT_ROUTES` has 9 entries; none for purchase_order.issued, delivery.received, payment.received, invoice.created, variation.approved, handover.advanced, permit.*, wir.submitted, instruction.*, transmittal.*. mir.* is emitted (accepted/rejected) but not routed | A2.5 |
| fireEvent never emits before commit | PARTIAL | the function writes to the outbox on the caller's query, but 29 route call sites pass no query at all, so the event is enqueued on its own connection; a scan suggests about 11 of them run inside a transaction (heuristic, A2.5 confirms each; example: workorders.js:336 inside `transaction(...)`), where a rollback would leave the event behind | A2.5 |
| fireEvent never swallows errors | PARTIAL | the function throws, but 5 call sites discard the failure: hr.js:303, locations.js:93, subcontractors.js:209, workorders.js:336 (`.catch(() => {})`) and approvals.js:167 (not awaited). The lint guard covers migrations only | A2.5 |
| `site_report.created` direct bus emit | NOT DONE | site.js:68 `global.eventBus.emit(...)` outside the outbox | A2.5 |
| Webhook fan-out | OUT OF SCOPE | plan 1.5 owns it | |

## 3.3 Replenishment to procurement

| Item | Status | Evidence / gap | Closed by |
|---|---|---|---|
| Creates a PR (not a PO) through the PR workflow | PARTIAL | `ensureDraftPurchaseRequest` creates a draft PR, but never starts the PR workflow, and `ensurePurchaseOrder` still creates POs directly in auto mode | A2.2 |
| Carries project_id and material | PARTIAL | material on the line (2.6c); no project_id on the PR | A2.2 |
| Respects project stock | NOT DONE | stock is read per warehouse, no project filter | A2.2 |
| Shared numbering service | DONE (2.4) | `numbering.nextNumber` | |
| Idempotent sweep | PARTIAL | `source_key` lookup; no test that two runs create one PR | A2.2 |
| PR location, cost code, work package | NOT DONE | no such columns on purchase_requests | A2.2 |
| Budget-check step in the PR workflow | PARTIAL | the template has a `budget_check` step (resolver accountant) but nothing checks a budget; it is a manual step | A2.2 |

## 3.4 Progress

| Item | Status | Evidence / gap | Closed by |
|---|---|---|---|
| Derived completion_percentage, override gated and audited | DONE (#34) | `progressEngine`, migration 0021 | |
| Schedule percent recomputes on measurement change | DONE (#34) | | |
| Daily-report measurements push to measurements, schedule and progress | NOT DONE | `siteEngine` reads `quantity_measurements` for the report, nothing writes from the report | A2.6 |
| Dashboard PM progress uses the weighted figure | PARTIAL | dashboards read `projects.completion_percentage`, which the engine now writes, so per-project figures are weighted; the portfolio average is an unweighted mean and there is no test pinning that the dashboard shows the derived value | A2.6 |

## 3.5 Background jobs

| Item | Status | Evidence | |
|---|---|---|---|
| Advisory-lock leader for the sweeps | DONE (#33) | `services/sweepLeader.js`, six sweeps | |

## Phase 3 exit gate

| Item | Status | Closed by |
|---|---|---|
| Golden-chain test (requirement to cost, reconciled) | NOT DONE (no test exists) | A2.7 |

Everything above that is not DONE is inside the A2 list, so the work continued without a checkpoint.
