# GAP_ANALYSIS.md

**Audit date:** 2026-09-17
**Sources compared:**
- `ERP_EXPANSION_PLAN.html` (footer says *"Originally audited 2026-09-10, corrected 2026-09-16 against the running codebase — 63 tables, 28 API modules, 20 screens, plus an in-flight `project_team` migration."*). Today's audit is one calendar day later than that correction pass.
- `construction_erp_agent_pack/construction_erp_agent_pack/` — 31 markdown files (`00_README.md` → `30_UI_UX_STANDARD.md`) + `AGENT_START_PROMPT.md`, `IMPLEMENTATION_STATUS.md`, `REPOSITORY_ACCESS_REQUIREMENTS.md`, `mcp_tool_catalog.json`, `openapi_skeleton.yaml`. Of these, `01_CURRENT_STATE_AUDIT.md`, `04_RBAC_AND_ORGS.md`, and `IMPLEMENTATION_STATUS.md` make the most concrete claims about today.

The expansion plan and the agent pack are mostly forward-looking — they describe target architecture and a 31-phase migration. The factual "today" surface is concentrated in the section "Where the product stands today" (`ERP_EXPANSION_PLAN.html:249–272`) and the bullet list in `01_CURRENT_STATE_AUDIT.md:3–14`.

This document (a) confirms the claims that match the running code, (b) flags every stale or imprecise claim, and (c) walks phase by phase through the expansion plan to identify where the "today" snapshot the plan was written against no longer matches reality.

---

## 1. Plan footer vs. running code — quick reconciliation

| Plan footer claim | What the running code shows today | Verdict |
|---|---|---|
| 63 tables | 63 tables in `db_dump/init.sql`; setupDb.js + 15 migrations all reflected | **MATCHES** |
| 28 API modules | 28 router files in `backend/src/routes/`, mounted at 27 distinct `/api/*` prefixes (projects/site share `/api/projects`) | **MATCHES** |
| 20 screens | 20 page files in `frontend/src/pages/` | **MATCHES** |
| `project_team` migration is "in-flight" | `backend/src/scripts/migrate-15.js` is **committed** (in `aca7716`, 2026-09-16 — same day as the plan's "corrected" pass), and `projects.project_manager_id` is already re-targeted to `employees(id)` by `migrate-14.js` (also committed) | **STALE** — see §3.1 |

---

## 2. Per-claim verification of `ERP_EXPANSION_PLAN.html` "Where we are" rows

| Plan row | Plan's claim | Running code | Verdict |
|---|---|---|---|
| Stack | Express + PostgreSQL + React, project-scoped | Confirmed by `backend/package.json` + `frontend/src/` + 28 of 63 tables have `project_id` | MATCH |
| Execution | Solid: `work_orders` + `work_order_materials`/`_labor`/`_equipment`/`work_completions` + `sub_work_verifications` | All present (migrate-3.js, migrate-4.js) | MATCH |
| BOQ | `boq_sections` + `boq_items` with single `completed_quantity`; no location/cost/certified split | Confirmed (computed columns are `total_price`, `completion_percentage` only) | MATCH |
| Structure | `buildings` (floors as integer, not rows) + `units`; no site/zone/floor/area/room tree | Confirmed | MATCH |
| Permissions | Flat `users.role` + `module_permissions[]`; `authorize()` is role-list check with owner/admin bypass | Confirmed (`CURRENT_PERMISSION_MATRIX.md` §1) | MATCH |
| Approvals | Generic 2-stage (`manager_review → owner_review`) with hardcoded `MODULE_MANAGER_ROLES` map | Confirmed, **plus** a stage 1 self-approval guard at `approvals.js:97` that the plan doesn't mention | MATCH (minor omission — see §3.2) |
| Parties | Three separate tables: clients, suppliers, subcontractors. No unified Organization. No consultants | Confirmed (no `consultants` table) | MATCH |
| Procurement | Absent. Spend captured as `expenses + invoices + payments` | Confirmed (no PR/RFQ/PO/GRN) | MATCH |
| Inventory | `warehouses + warehouse_stock + inventory_transfers`; no movement ledger, no GRN/MIR gate, no reservations, no reorder logic | Mostly true — but `warehouse_stock` *does* have a `reorder_level` column with a `quantity <= reorder_level` alert in `dashboard.js:85`. The plan's "no reorder logic" is wrong in spirit: there is a single-stock-level alert but no auto-PR / auto-PO engine. **Worth tightening.** | PARTIAL (see §3.3) |
| Commercial | `sub_contracts, sub_payment_certificates, project_budgets, cost_codes, journal_entries`; profit = `contract_value − total_cost`; no forecast model / no client-side certificates / no variations | `costing.js:52 GET /project/:projectId/profitability` and `finance.js:6 GET /project/:id` both compute profit = invoiced − expenses. There is also `dashboard.js:34 GET /portfolio` which emits `budget_variance` and an `at_risk` boolean. **No client certificates, no variations, no forecast model.** | MATCH (plan is right that there's no forecast model; claim about profit formula is *technically* outdated by a hair — see §3.4) |
| RFI / Submittal | `project_rfis` + `project_submittals`, single-answer | Confirmed (`doccontrol.js` only has `respond` + `close`; no coordinator/reviewer stages) | MATCH |
| QHSE | `ncrs, quality_tests, safety_incidents, safety_inspections, site_visits, site_daily_reports`; basic | Confirmed; **plus** `engineer_instructions` (`site.js`) which the plan's list omits but which exists in `migrate-7.js` and feeds the site-engineer workflow the plan later describes in Phase 18 (Site Operations) | PARTIAL (see §3.5) |
| Doc control | `document_categories + document_versions` already has revision history and approval reset | Confirmed (`doccontrol.js` PUT appends a `document_versions` row and bumps `project_documents.version`) | MATCH |
| Property sales | `units + buildings` with reservations/contracts; not in spec's core construction model | Confirmed; **plus** `units.js` auto-creates an `invoices` row on `available→reserved/contracted` transition (`createUnitSaleInvoice` helper, `units.js:23–53`). Plan omits this side effect | MATCH (minor omission — see §3.6) |
| HR / Payroll / Legal / Assets | Four modules (`hr.js`, `payroll.js`, `legal.js`, `maintenance.js`) + `employees`; built after the original audit; not org-scoped, not permission-engine-aware, no workflow hooks | Confirmed. Plan also omits that **`assets.js` and `clients.js` are NOT in this group** in the running code — both have their own route files (`assets.js` is 168 lines, `clients.js` is 98 lines). The "HR/Payroll/Legal/Assets" header in the plan is ambiguous. | PARTIAL (see §3.7) |
| In-flight drift | `project_team.user_id → project_team.employee_id` re-target is uncommitted | **Committed and applied** as `migrate-15.js`. Same story for `projects.project_manager_id → employees(id)` (`migrate-14.js`) | **STALE** (see §3.1) |
| Absent entirely | Portals, action/notification engine, scheduling, reporting engine, versioned API, MCP, immutable audit log, handover/warranty/DLP, site-operations daily workspace, backup/observability/DR | All correct, **but** an `event_log` table + `fireEvent()` helper exist (`setupDb.js:77`, `utils/activity.js:15`) and are called from 4 route files (approvals, costing, hr, subcontractors, workorders). So the *notification engine* is absent but a *minimal event bus* is in place. | PARTIAL (see §3.8) |

---

## 3. Stale / imprecise claims that need correcting

### 3.1 The `project_team` "in-flight" migration is no longer in flight

The plan's "In-flight drift" row says:
> *An uncommitted migration already re-points `project_team.user_id` (login account) to `project_team.employee_id` (staffing record). Phase 03's absorption of `project_team` into `project_participants` must design against this employee-based shape, not the pre-migration one.*

**Reality (as of 2026-09-17):**
- `backend/src/scripts/migrate-15.js` was committed on 2026-09-16 (commit `aca7716`, same commit that introduced the expansion plan).
- The dump at `db_dump/init.sql` reflects the post-migration shape: `project_team` has `project_id, role, assigned_at, employee_id` — there is no `user_id` column.
- `migrate-14.js` is also committed: `projects.project_manager_id` now references `employees(id) ON DELETE SET NULL`, not `users(id)`. The dump confirms `projects_project_manager_id_fkey` references `public.employees`.
- `routes/projects.js:50–53` already joins `project_team` to `employees`:
  ```sql
  FROM project_team pt LEFT JOIN employees e ON pt.employee_id = e.id
  ```

**Implication for later phases:** Phase 3 may treat this as a free refactor; there is no legacy data to preserve. Phase 3 should still drop the legacy `user_id` only as a defence-in-depth, not a data fix.

### 3.2 Approvals self-approval guard

The plan says "Approvals: One generic 2-stage flow… A proto-workflow engine, not configurable." It omits the self-approval check at `approvals.js:97`:
```js
if (ar.requester_id === userId && role !== 'owner' && role !== 'admin') {
  return { statusCode: 403, body: { success: false, error: 'You cannot approve or reject your own request' } };
}
```
This is a small but real segregation-of-duties control. Phase 4's policy engine should preserve it (and likely extend it).

### 3.3 Inventory: "no reorder logic" is half-true

`warehouse_stock.reorder_level` (migrate-2.2.js) is **not** auto-PR/auto-PO logic. But:
- `dashboard.js:85` joins `warehouse_stock JOIN warehouses JOIN item_master` to surface `quantity <= reorder_level AND reorder_level > 0` rows as a "low_stock" alert.
- This is an alert only; no replenishment workflow exists.

**Implication:** Phase 9 (Replenishment, per the plan) does not have to invent the data model — `reorder_level` already exists. It only has to add the `purchase_requests` table + the engine.

### 3.4 Profit formula

The plan's "Commercial" row says profit = `contract_value − total_cost`. This is true for the original `costing.js` profitability endpoint, but `finance.js:6` and the dashboard now compute different things:
- `finance.js:6 GET /project/:id` — `profit = paid − expenses` (cash contribution, **not** `contract_value − total_cost`).
- `costing.js:52 GET /project/:projectId/profitability` — actually returns `contract_value − retention − total_cost − retention`, with retention pulled from `business_rules.retention_percent` (default 10%).
- `dashboard.js:72` returns `budget_burn_percent = total_spent / budget * 100`.

These three formulas disagree, and the plan's wording picks the least-deployed one. **Phase 9 (Commercial) needs to pick a canonical profit model** before any forecast feature lands, or it will inherit the ambiguity.

### 3.5 QHSE row omits `engineer_instructions`

`engineer_instructions` (created in `migrate-7.js`, used in `site.js:131–181`) is not in the plan's QHSE list. It has its own state machine (`issued → acknowledged → implemented → closed`) implemented via `POST /:projectId/instructions/:id/:action(acknowledge|implement|close)` (`site.js:181`). It already does what Phase 18 (Site Operations) will want — but Phase 18 currently lists only `site_visits` and `site_daily_reports` as the spine. The plan should pull `engineer_instructions` into Phase 18 explicitly.

### 3.6 Property sales auto-invoice

The plan keeps `units + buildings` as "Property Development" and notes "reservations/contracts for unit sales". It does not mention that **selling a unit auto-creates a project invoice** via `units.js:23–53 createUnitSaleInvoice`. This means the sales module already feeds the AR pipeline; Phase 10 (Finance / AR) should reuse `units.js` rather than re-implement.

### 3.7 "HR / Payroll / Legal / Assets" header is misleading

The plan groups `hr.js + payroll.js + legal.js + maintenance.js` under one header and then discusses them collectively. In the running code:

| Module | Route file | Lines | Notes |
|---|---|---|---|
| HR (employees, attendance, leaves) | `hr.js` | 325 | Employee CRUD requires `owner|admin`; labor-payments and laborers are unguarded. |
| Daily laborers + labor payments | `hr.js` (same file) | 325 | Mixed with HR but logically procurement/labour. |
| Employees (HR + is_manager flag) | migration 14 | — | `is_manager BOOLEAN` added; `project_team` reads `employees(id)`. |
| Payroll | `payroll.js` | 145 | Create requires `owner|admin|finance_manager`; delete requires `owner|admin`. |
| Legal | `legal.js` | 83 | No role guard; status `pending|verified|rejected` updated by anyone. |
| Assets | `assets.js` | 168 | Equipment, equipment_type, hourly/daily rates; **unguarded**. **Not in the plan's HR/Payroll/Legal/Assets group.** |
| Maintenance reminders | `maintenance.js` | 88 | Per-asset; **unguarded**. **In the plan's group.** |
| Clients | `clients.js` | 98 | Directory; **unguarded**. **Not in the plan's group.** The plan's "Parties" row does mention `clients`. |
| Suppliers | `suppliers.js` | 202 | Directory + supplier-materials; **unguarded**. **Not in the plan's group.** The plan's "Parties" row does mention `suppliers`. |
| Subcontractors | `subcontractors.js` | 223 | Directory + contracts + verifications + certificates; **unguarded**. **Not in the plan's group.** The plan's "Parties" row does mention `subcontractors`. |

The plan's grouping should be **HR + Payroll + Legal + Maintenance** (no Assets), and **Clients + Suppliers + Subcontractors** should be treated as a single "out-of-scope directories that Phase 3 will absorb into `organizations`" group with explicit treatment.

### 3.8 `event_log` + `fireEvent()` partially scaffold the absent engine

The plan's "Absent entirely" row says "action & notification engine" is absent. Strictly true: there is no notification dispatcher. But:

- `setupDb.js:77–89` creates `event_log (event_type, entity_type, entity_id, user_id, user_name, user_role, payload JSONB, created_at)`.
- `utils/activity.js:15` exports `fireEvent({ eventType, entityType, entityId, userId, userName, userRole, payload })` which inserts a row into `event_log`.
- `fireEvent` is called from `routes/costing.js:5` (imported only), `routes/hr.js:304`, `routes/subcontractors.js:210`, `routes/workorders.js:216`, and `routes/approvals.js:5` (imported only).
- `setupDb.js` is not in the live dump (`db_dump/init.sql` has no `event_log`) — see `CURRENT_DATABASE_SCHEMA.md` §5. So a live DB may or may not have the table; the schema is committed but the dump is one step behind.

**Implication:** Phase 19 (Actions & Notifications) does not start from a blank slate. It has a target table (`event_log`), a writer (`fireEvent`), and 4 production call sites that already use it as a fire-and-forget audit pipe. Phase 19 should add: a notification dispatcher (consumer of `event_log`), the `ActionItem` table the plan describes, and a polling/webhook layer.

---

## 4. Per-phase diff against `ERP_EXPANSION_PLAN.html`

The plan declares 31 phases (it split phase 16 into 18 in the 2026-09-16 correction pass). For each phase I record whether the "today" anchor the phase depends on still holds, and what drift to watch out for.

### Phase 01 — Audit
- **Plan status:** "this audit".
- **Running code:** the five files in `docs/audit/` produced by this audit.
- **Drift:** none.

### Phase 02 — Reconcile out-of-spec modules
- **Plan status:** decide what to do with `hr.js, payroll.js, legal.js, maintenance.js`.
- **Running code drift to flag:** the plan's list omits `assets.js` and the `clients/suppliers/subcontractors` directories (see §3.7). Phase 2 needs to explicitly decide for **all six** out-of-spec modules: HR, Payroll, Legal, Maintenance, Assets, plus the three party directories. The current "four modules" framing will leave `assets.js` and `clients/suppliers/subcontractors` untreated and Phase 3's organization unification will have to absorb them without a decision record.

### Phase 03 — Core data architecture (organisations, locations, WBS)
- **Plan assumes:** `project_team.user_id` is the old shape.
- **Actual:** `project_team.employee_id` is the new shape (`migrate-15.js`). See §3.1.
- **Other drift:** `projects.location` was dropped (`migrate-12.js`); only `address + city` remain. Phase 5 will conflict with itself if it tries to populate a `location` column.

### Phase 04 — Permission engine
- **Plan assumes:** flat `role` + `module_permissions[]` with `owner|admin` bypass.
- **Actual:** confirmed (see `CURRENT_PERMISSION_MATRIX.md`). Additionally, the `MODULE_MANAGER_ROLES` map in `approvals.js:10–18` and the self-approval guard (see §3.2) are app-level policy that needs to be ported into the new engine.

### Phase 05 — Project creation wizard
- **Plan assumes:** "single INSERT creation path that can leave a project without locations, team, folders, or workflows".
- **Actual:** confirmed — `routes/projects.js:64 POST /api/projects` is a single INSERT wrapped in a transaction, with no default phases/team/folders.
- **Drift:** none.

### Phase 06 — Workflow / approvals engine
- **Plan assumes:** "hardcoded 2-stage" + `MODULE_MANAGER_ROLES` map.
- **Actual:** confirmed. Plus the `cleanup-orphan-approvals.js` script (post-audit addition) and the `enrichApprovalRows` enrichment that localises summaries (both committed in `053221a`). Phase 6 should preserve the orphan-cleanup behaviour as an idempotent helper on the new `WorkflowInstance` table.

### Phase 07 — Locations & quantities
- **Plan assumes:** `buildings` as a flat integer-floor table; `units` only for sales.
- **Actual:** confirmed. No conflict, but Phase 7 must migrate `buildings` *and* `units` (which is sales-only today but the plan says it will be re-purposed as a generic location tree). The plan's `§81`-footnoted "Property Development is optional" means the merge is non-trivial.

### Phase 08 — Locations + BOQ allocation (per plan section "Locations + quantities")
- **Plan assumes:** `boq_items` has only a `completed_quantity`.
- **Actual:** confirmed. Plus two generated columns (`total_price`, `completion_percentage`). Phase 8 should treat generated columns as frozen.

### Phase 09 — Materials & recipes / Inventory / Replenishment / Procurement / Commercial
- **Plan assumes:** no materials/inventory/forecast scaffolding.
- **Actual:** `item_master` + `supplier_materials` + `warehouse_stock.reorder_level` + `inventory_transfers` are in place. See §3.3. Phase 9 does not start from zero.

### Phase 10 — Finance / AR / AP
- **Plan assumes:** "cash in/out".
- **Actual:** `invoices`, `payments`, `expenses`, `journal_entries`, `journal_entry_lines`, `accounts` are all present. `finance.js` already computes `total_invoiced`, `total_paid`, `outstanding`, `net_profit`. Phase 10 should not rewrite; it should layer AR/AP ledgers, VAT, 3-way match.

### Phase 11 — RFI / submittal (multi-stage)
- **Plan assumes:** single-answer.
- **Actual:** confirmed. `doccontrol.js` already supports `respond` + `close`; the multi-stage flow is the upgrade.

### Phase 12 — QA/QC (ITP, WIR, MIR, checklists, CAPA, punch lists, mock-ups, calibration)
- **Plan assumes:** basic NCR/tests/inspections.
- **Actual:** confirmed.

### Phase 13 — HSE (Permits, JSA, toolbox, inductions, near-misses, PPE, drills, HSE dashboard)
- **Plan assumes:** incidents/inspections only.
- **Actual:** confirmed.

### Phase 14 — Document control (controlled registers, transmittals, correspondence, superseded warnings, auto numbering)
- **Plan assumes:** versioned docs.
- **Actual:** confirmed. Phase 14 should keep the existing `document_versions` shape and the `PUT /documents/:id` that appends a version row.

### Phase 15 — Property sales (kept as optional module)
- **No drift beyond §3.6 (auto-invoice on sale).** Phase 15 should reuse `units.js` and `createUnitSaleInvoice`.

### Phase 16 — HR / payroll / legal / assets (project-scoped)
- **Drift:** see §3.7. The plan's "four modules" is missing `assets.js`. Phase 16 must extend to all six: HR, Payroll, Legal, Maintenance, Assets, and the three party directories (Clients, Suppliers, Subcontractors).

### Phase 17 — Scheduling
- **Drift:** none. `project_phases` + `project_milestones` are the seed; no scheduling engine exists.

### Phase 18 — Dashboards / Site Operations
- **Dashboard drift:** `dashboard.js:120 GET /overview` already returns per-module summary strips for the owner landing view (committed in `191b46d` on 2026-09-06). Phase 18's "16 role dashboards" target must include an owner-role dashboard, not just 16 distinct dashboards.
- **Site Operations drift:** `engineer_instructions` (`site.js:131–181`) is already a workflow with `acknowledge|implement|close` actions. Phase 18 should treat `engineer_instructions` as part of the site-engineer daily workspace, not as a separate workstream.

### Phase 19 — Reporting
- **Drift:** none.

### Phase 20 — Client & consultant portals
- **Drift:** `clients` and `clients.js` are in place. `consultants` table is absent.

### Phase 21 — Subcontractor portal
- **Drift:** `subcontractors.js` already exposes `/contracts/:projectId`, `/verifications/:contractId`, `/certificates/:contractId`. The portal can be built on top.

### Phase 22 — Supplier portal
- **Drift:** `suppliers.js` already exposes `/:id/materials` and `/specialties`. Phase 22's "RFQ response, PO acknowledgement" must be added on top.

### Phase 23 — Handover & warranty
- **Drift:** none. (No handover tables exist.)

### Phase 24 — External API (versioned `/api/v1`, OAuth, scoped tokens, webhooks, OpenAPI, sandbox)
- **Drift:** the agent pack already ships `openapi_skeleton.yaml` and `mcp_tool_catalog.json`. These are forward-looking; no `/api/v1` route exists yet.

### Phase 25 — MCP & agents
- **Drift:** none.

### Phase 26 — Audit (immutable `AuditEvent` with before/after)
- **Drift:** `activity_log` is mutable; `event_log` is append-only-by-convention but has no UPDATE/DELETE guards. The replacement should keep `event_log` as the bus and add `audit_events` as the immutable before/after mirror (the plan already names both).

### Phase 27 — Security & observability
- **Drift:** none.

### Phases 28–31 (per plan footer — added in 2026-09-16 correction)
- No "today" surface in the codebase; nothing to drift against.

---

## 5. Verification against the agent pack

I cross-checked each of the 31 files in `construction_erp_agent_pack/construction_erp_agent_pack/`:

| Agent-pack file | Concrete "today" claims | Verdict |
|---|---|---|
| `00_README.md` | No current-state facts; rules-of-engagement only | OK |
| `01_CURRENT_STATE_AUDIT.md` | Lists 15 capabilities (lines 3–14) | All confirmed against running code (see §2) |
| `02_TARGET_ARCHITECTURE.md` | Target only | OK |
| `03_CORE_DATA_MODEL.md` | Target only | OK |
| `04_RBAC_AND_ORGS.md` | Lists 23 internal roles + 9 external roles as targets | **All 23 internal roles are absent from the running code** (the running code uses 11 role names). The agent pack's role list is a *target*; not a drift. But the audit's `CURRENT_PERMISSION_MATRIX.md` §4 should be cited when this file is implemented. |
| `05_PROJECT_CREATION_WIZARD.md` | Target only | OK |
| `06_LOCATION_WBS_QUANTITIES.md` | Target only | OK |
| `07_MATERIALS_INVENTORY_REPLENISHMENT.md` | Target only | OK |
| `08_PROCUREMENT.md` | Target only | OK |
| `09_COMMERCIAL_COST_CONTROL.md` | Target only | OK |
| `10_FINANCE_INVOICING.md` | Target only | OK |
| `11_SITE_OPERATIONS.md` | Target only | OK |
| `12_CONSULTANT_PORTAL.md` | "Internal preview route must always work even before a client organization or portal user is assigned." | Target-only constraint; no running code |
| `13_CLIENT_PORTAL.md` | Target only | OK |
| `14_SUBCONTRACTOR_SUPPLIER_PORTALS.md` | Target only | OK |
| `15_QA_QC_HSE.md` | Target only | OK |
| `16_DOCUMENT_CONTROL_RFI_SUBMITTALS.md` | Target only | OK |
| `17_PLANNING_SCHEDULING.md` | Target only | OK |
| `18_DASHBOARDS_ACTIONS_NOTIFICATIONS.md` | Target only | OK (but see Phase 18 drift above) |
| `19_HANDOVER_WARRANTY.md` | Target only | OK |
| `20_API_SPEC.md` | "versioned REST API: /api/v1" | Confirmed absent in running code |
| `21_MCP_AGENT_SPEC.md` | "Log every tool call…" | No MCP server in running code |
| `22_DOCUMENT_TEMPLATE_CATALOG.md` | Target only | OK |
| `23_CALCULATION_CATALOG.md` | Target only | OK |
| `24_WORKFLOW_CATALOG.md` | Target only | OK |
| `25_MIGRATION_ROLLOUT.md` | "Enable new module per project/company feature flag" | No feature-flag system in running code |
| `26_TEST_ACCEPTANCE.md` | Target only | OK |
| `27_AGENT_EXECUTION_BACKLOG.md` | "M0: generate current architecture/schema/route/API/permission maps" | This audit **is** the M0 deliverable. The other M0 items (verify test framework, run the staging instance) are outside this audit's scope. |
| `28_SEED_DEMO_PROJECT.md` | Target only | OK |
| `29_SECURITY_OBSERVABILITY.md` | Target only | OK |
| `30_UI_UX_STANDARD.md` | "Do not show every module to every role. Navigation derives from role and project permissions." | No nav-by-role today; the current App.js renders all routes to every authenticated user |
| `AGENT_START_PROMPT.md` | Rule 1: "First inspect the repository and produce the Phase-1 current-system documents. Do not guess framework/schema details." | This audit follows rule 1. |
| `IMPLEMENTATION_STATUS.md` | "Pending code-level M0 audit" | M0 audit now complete (this document + the four sibling files in `docs/audit/`). |
| `REPOSITORY_ACCESS_REQUIREMENTS.md` | Repository access rules | OK |
| `mcp_tool_catalog.json` | Target only | OK |
| `openapi_skeleton.yaml` | Target only | OK |

**Two agent-pack items that are no longer accurate after this audit:**
- `IMPLEMENTATION_STATUS.md` still says "Pending code-level M0 audit". The M0 audit is now done — update this file as part of the Phase 1 sign-off.
- `30_UI_UX_STANDARD.md` rule "Do not show every module to every role" is currently violated by `App.js` — every authenticated user sees every route in `Layout`'s nav. Flag this for Phase 4 (Permission engine) to also fix.

---

## 6. Items that have appeared since the plan's "corrected" date

The plan's footer says it was corrected 2026-09-16. The latest commit on the repo (`aca7716`, 2026-09-16) is the "before copy" commit that introduced the plan itself. Between 2026-09-06 and 2026-09-16 the following items landed in `backend/src/`:

| Item | Commit | Plan coverage |
|---|---|---|
| `routes/dashboard.js` `GET /overview` (per-module owner strip) | `191b46d` (2026-09-06) | Mentioned in plan's "Dashboards" target (Phase 18) but not in "today" |
| `routes/approvals.js` `enrichApprovalRows` (structured summary, missing-source flag) | `053221a` (2026-09-06) | Mentioned in plan's "Approvals" row only at the high level; the missing-source flag is not mentioned |
| `routes/approvals.js` `GET /audit` | `ff25bac` (2026-09-06) | Not mentioned in plan's "today" row |
| `routes/approvals.js` `GET /:id/details` | `ff25bac` (2026-09-06) | Not mentioned in plan's "today" row |
| `routes/approvals.js` `GET /check/:module/:requestId` | (pre-audit) | Not mentioned in plan's "today" row |
| `scripts/cleanup-orphan-approvals.js` | `053221a` (2026-09-06) | Not mentioned in plan's "today" row |
| `scripts/migrate-14.js` (project_manager_id → employees) | `aca7716` (2026-09-16) | Plan's "In-flight drift" row mentions this *only* for `project_team`, not for `project_manager_id` — same drift, different column |
| `scripts/migrate-15.js` (project_team → employee_id) | `aca7716` (2026-09-16) | Plan's "In-flight drift" row calls this uncommitted; it is committed |
| `routes/projects.js` 13-line change (buildings/projects delete added; phase/milestone/team routes unchanged) | `aca7716` (2026-09-16) | Cosmetic; no plan drift |
| `event_log` + `fireEvent()` (added in original Sep-6 commit but **missing from `db_dump/init.sql`**) | (initial) | Plan's "Absent entirely: action & notification engine" partially contradicted (see §3.8) |

The plan's "corrected 2026-09-16" line is therefore **partially stale already**, by one day. The audit items to track are:

1. Phase 3's `project_team` → `project_participants` design should target the post-migration shape (employee_id, not user_id) — the plan itself says this, but the "in-flight" framing is wrong; the migration is *done*.
2. Phase 6 should preserve `cleanup-orphan-approvals.js` behaviour when porting to the configurable engine.
3. Phase 18 should pull `engineer_instructions` into the site-engineer daily workspace, not treat it as a missing module.
4. Phase 19 should not start from zero — `event_log` + `fireEvent` exist.
5. `IMPLEMENTATION_STATUS.md` and `30_UI_UX_STANDARD.md`'s navigation rule should be updated to reflect this audit's findings before later phases start.

---

## 7. Net diff for later phases

A short checklist every later phase must run against before starting work:

- [ ] **Phase 3 (data arch):** confirm `project_team.employee_id` is the live shape; don't introduce a parallel `user_id` column.
- [ ] **Phase 4 (permissions):** preserve the `MODULE_MANAGER_ROLES` map and the self-approval guard (`approvals.js:97`); respect the existing role names (`owner, admin, finance_manager, purchasing_mgr, project_manager, legal_mgr, maintenance_mgr`) as inputs to the policy layer; flag the agent-pack's 23-role target list as Phase 4's scope expansion.
- [ ] **Phase 5 (wizard):** populate `address + city` (not `location`, which `migrate-12` already dropped).
- [ ] **Phase 6 (workflow):** keep `cleanup-orphan-approvals.js` as a backstop on the new `WorkflowInstance` table.
- [ ] **Phase 7 (locations):** migrate `buildings` *and* `units` carefully; `units` is sales-only today.
- [ ] **Phase 9 (replenishment):** target the existing `warehouse_stock.reorder_level` column; do not add a parallel one.
- [ ] **Phase 9 (procurement):** no `purchase_orders` or `grn` tables exist — the `DIRECT_TO_OWNER_MODULES` array in `approvals.js:8` is forward-reference only.
- [ ] **Phase 10 (finance):** pick a canonical profit formula before adding forecast features (see §3.4).
- [ ] **Phase 16 (HR/payroll/legal/maintenance/assets refactor):** extend scope to six modules including `assets.js`; treat `clients/suppliers/subcontractors` directories as part of the org migration, not as out-of-scope.
- [ ] **Phase 18 (dashboards/site ops):** owner-role dashboard already exists (`dashboard.js:120`); include `engineer_instructions` in the site-ops spine.
- [ ] **Phase 19 (actions/notifications):** start from the existing `event_log` table + `fireEvent()` helper; add a dispatcher and `ActionItem` table.
- [ ] **Phase 26 (audit):** keep `event_log` as the bus and add `audit_events` as the immutable before/after mirror.
- [ ] **Phase 30 (UI/UX nav):** make `App.js` + `Layout` filter nav by role; currently every authenticated user sees every route.

---

## 8. Files produced by this audit (Phase 1 deliverables)

1. `docs/audit/CURRENT_DATABASE_SCHEMA.md` — 63 tables, every column, project-scoped vs. global, indexes, drift notes.
2. `docs/audit/CURRENT_MODULE_MATRIX.md` — one row per backend route file (28) + one row per frontend page (20).
3. `docs/audit/CURRENT_API_MATRIX.md` — every route (197 across 27 mounts) with the explicit `authorize(...)` role list it carries.
4. `docs/audit/CURRENT_PERMISSION_MATRIX.md` — full breakdown of `authorize()`, `module_permissions[]`, every hardcoded `role === 'owner'` / `role === 'admin'` site, and the net access model.
5. `docs/audit/GAP_ANALYSIS.md` — this file.
