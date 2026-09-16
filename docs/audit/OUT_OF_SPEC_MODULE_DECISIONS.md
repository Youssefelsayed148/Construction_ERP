# OUT_OF_SPEC_MODULE_DECISIONS.md

**Phase:** 2 (Reconcile out-of-spec modules)
**Date:** 2026-09-17
**Scope:** HR, Payroll, Legal, Maintenance, **Assets** (five modules — `assets.js` is the fifth, called out separately because the expansion plan's earlier drafts lumped it under "HR/Payroll/Legal/Maintenance" or scattered it into the Execution/Inventory rows. See `docs/audit/GAP_ANALYSIS.md` §3.7.)

This document records, for each module, the decision between two shapes:

- **(a) Fold into the Phase 3 Organization / participant model** — i.e. treat internal staff as an `internal organization` participant type alongside clients/suppliers/subcontractors.
- **(b) Keep standalone** — preserve the current standalone tables, add `project_id` only where it is genuinely meaningful, and let Phase 4's permission engine scope access without restructuring the data model.

The default recommendation below is **(b)** for all five modules. The reasoning is in each section. Out of scope for this decision: `clients.js`, `suppliers.js`, `subcontractors.js` — those directories are already slated for absorption into `organizations` by Phase 3 and are not re-litigated here.

---

## 1. HR (`hr.js`, 325 lines)

### Tables
| Table | Project-scoped today? | Has guard? |
|---|---|---|
| `employees` | NO (directory) | `POST/PUT/DELETE /employees` require `owner|admin` |
| `attendance` | **NO** — added in `migrate-16.js` | none |
| `leave_requests` | NO (per-employee) | `PUT /leaves/:id` requires `owner|admin` |
| `daily_laborers` | NO (directory) | none |
| `labor_payments` | YES (already had nullable `project_id`, no FK) | none |

### Decision: **(b) Standalone, project-taggable where meaningful**

Internal staff are not "external parties". Folding them into the `organizations` table would conflate two distinct concepts (an internal payroll subject vs. an external contractual counterparty) and complicate Phase 4's permission model — `users.role` and `project_team.employee_id` already give the engine everything it needs for internal-staff scoping without another indirection through `organizations`.

- **`employees`** — directory, *not* project-scoped. Already used as the staffing reference by `project_team.employee_id` (migrate-15) and `projects.project_manager_id` (migrate-14), so the project link lives on the join table, not on `employees` itself.
- **`attendance`** — daily timesheet row, *project-taggable* via the new `attendance.project_id` (Phase 2 migration). A worker on site X all week has every attendance row point at site X.
- **`leave_requests`** — per-employee, *not* project-scoped. Out of scope for cost allocation.
- **`daily_laborers`** — directory (the daily-wage roster), *not* project-scoped.
- **`labor_payments`** — already project-scoped (nullable, no FK — preserved as-is, FK not enforced in this phase; Phase 4 can promote it).

### Guard prep done this phase
- `// TODO(phase-4)` markers added to every unguarded route in `hr.js`: `GET /employees`, `GET /employees/:id`, `GET /attendance`, `POST /attendance`, `GET /leaves`, `POST /leaves`, `GET /laborers`, `GET /laborers/skills`, `GET /laborers/:id`, `POST /laborers`, `PUT /laborers/:id`, `DELETE /laborers/:id`, `GET /labor-payments`, `POST /labor-payments`, `DELETE /labor-payments/:id`. (Routes that already had `authorize('owner','admin')` left untouched.)

### Mapping to Phase 13 (Resource / Labour cost)
**Formula:** `Labour Cost = Regular Hours × Rate + Overtime Hours × Overtime Rate`

Inputs already present in the schema, by source:

| Formula input | Source table.column | Notes |
|---|---|---|
| Worked hours (present) | `attendance.check_in` + `attendance.check_out` (TIME) | Subtract to get hours-per-day. `attendance.status` of `present` or `late` counts as a worked day; `absent` / `on_leave` does not. |
| Worked hours (absent → still owed) | `employees.salary` (monthly, EGP) | Convert: `hourly_rate = salary / (working_days_per_month × 8)`. Phase 13 will introduce a `working_days_per_month` constant or a per-org setting. |
| Overtime hours | **GAP — no column exists** | Phase 13 must add `attendance.overtime_hours DECIMAL(5,2)` (or a separate `attendance_overtime` child table) **and** `employees.overtime_rate DECIMAL(10,2)`. Documented here so Phase 13's design picks this up. |
| Daily-wage path (alternative) | `labor_payments.days_worked × labor_payments.daily_rate = labor_payments.total_amount` | This is the second labour model — for daily laborers, not salaried employees. Phase 13's calculator must support both and decide which path applies per employee based on `daily_laborers` vs `employees`. |
| Project attribution | `attendance.project_id` (new) + `labor_payments.project_id` (existing) | Both feed the per-project cost roll-up. |

Phase 13 must **not** write directly to `project_costs`; it must follow the same event-log pattern that `labor_payments` POST already uses (`fireEvent('labor_payment.created', …)` in `hr.js:303–310`) so payment events flow through the audit/event log.

---

## 2. Payroll (`payroll.js`, 115 lines)

### Tables
| Table | Project-scoped today? | Has guard? |
|---|---|---|
| `payroll_periods` | NO (company-wide) | `POST /` requires `owner|admin|finance_manager`, `DELETE /:id` requires `owner|admin` |
| `payroll_details` | NO (per-payroll-period, company-wide) | inherits via `payroll_periods` |

### Decision: **(b) Standalone, company-level. Not project-tagged.**

Payroll runs are *definitionally* company-wide. You don't run "the October payroll for project X"; you run "the October payroll for the company, charged to cost code Y". Adding `project_id` to `payroll_periods` or `payroll_details` would actively *mislead* the cost roll-up, because a payroll line is a sum across many projects.

If/when Phase 13 wants per-project labour cost, it should compute it from `attendance` × `employees.salary` × project-allocation, **not** from `payroll_details`. The decision record explicitly warns against the latter path.

### Guard prep done this phase
- No new TODOs added in `payroll.js`. Existing guards (`POST /` requires `owner|admin|finance_manager`, `DELETE /:id` requires `owner|admin`) are correct today; `GET /`, `GET /:id`, `PUT /:id` already authenticate and their current open access matches the audit's posture.
- Phase 4 should add a scoped check that payroll reads are limited to `owner|admin|finance_manager|hr` and writes to `finance_manager` only — recorded here as a Phase 4 input.

### Schema action this phase
- None. `payroll_periods` and `payroll_details` are deliberately not touched by `migrate-16.js`.

---

## 3. Legal (`legal.js`, 83 lines)

### Tables
| Table | Project-scoped today? | Has guard? |
|---|---|---|
| `legal_documents` | **NO** — added in `migrate-16.js` | none |

### Decision: **(b) Standalone, project-taggable.**

Two real-world shapes must coexist in one table:
1. **Project-attributable legal docs** — a client MSA for project X, a subcontract for project X, a permit tied to a site. These want `project_id` populated.
2. **Company-wide legal docs** — internal policy templates, the company trade licence, master service agreement templates. These want `project_id = NULL`.

A single nullable `project_id` column covers both without an artificial split into two tables. Phase 4 will scope reads by `project_id` when present and fall back to a `org-wide legal visibility` policy when NULL — recorded here as a Phase 4 input.

### Guard prep done this phase
- `// TODO(phase-4)` markers added to all 5 routes in `legal.js` (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`). All 5 currently require only `authenticate`; the audit confirms `authenticate` is already in place, so this phase only adds the marker.

### Schema action this phase
- `migrate-16.js` adds `legal_documents.project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL` (nullable). Existing rows continue to have `project_id = NULL` and are unchanged.

---

## 4. Maintenance (`maintenance.js`, 88 lines)

### Tables
| Table | Project-scoped today? | Has guard? |
|---|---|---|
| `maintenance_reminders` | **NO** — added in `migrate-16.js` | none |

### Decision: **(b) Standalone, project-taggable.**

Maintenance is per-asset. The asset itself already carries `current_project_id` (migrate-12), but storing `project_id` on `maintenance_reminders` gives a direct attribution path for cost roll-up without a join, and survives the case where the asset moves projects between the reminder being scheduled and the work being executed.

### Guard prep done this phase
- `// TODO(phase-4)` markers added to all 5 routes in `maintenance.js`. All 5 currently require only `authenticate`.

### Schema action this phase
- `migrate-16.js` adds `maintenance_reminders.project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL` (nullable).
- `maintenance_reminders.actual_cost` and `actual_hours` already exist and are populated by `PUT /:id`; these feed the Phase 13 Equipment Cost formula (see §5 below).

### Mapping to Phase 13 (Equipment Cost)
**Formula:** `Equipment Cost = Usage Hours × Rate + Fuel + Mobilization + Allocated Maintenance`

Inputs already present in the schema, by source:

| Formula input | Source table.column | Notes |
|---|---|---|
| Usage hours | `equipment_usage_logs.hours_operated` (per equipment per date) | Joins to `assets.id` and `assets.current_project_id` (or `equipment_usage_logs.project_id`). |
| Rate (hourly) | `assets.hourly_rate` (EGP) | Already populated at asset creation. |
| Rate (daily, alternative) | `assets.daily_rate` | Use when `equipment_usage_logs` records whole-day usage. Phase 13 picks the right one based on whether hours were logged. |
| Fuel | `equipment_usage_logs.fuel_liters` (volume) | **GAP — no fuel unit price.** Phase 13 must add a `fuel_price_per_liter` config (probably in `business_rules` or a new `project_settings` table) to convert liters → EGP. |
| Mobilization | **GAP — no column exists** | Phase 13 must add either `assets.mobilization_cost` (default per asset) or a `project_mobilizations` table. |
| Allocated maintenance | `maintenance_reminders.actual_cost` (when status = `closed` and the new `project_id` is set) | Sum per project over the cost period. |

---

## 5. Assets (`assets.js`, 168 lines)

### Tables
| Table | Project-scoped today? | Has guard? |
|---|---|---|
| `assets` | YES via `current_project_id` (migrate-12) | none |
| `equipment_assignments` | YES (`project_id` nullable, no FK; migrate-1.3) | none |
| `equipment_usage_logs` | YES (`project_id` nullable, no FK; migrate-1.3) | none |

### Decision: **(b) Standalone, project-taggable via the existing columns.**

`assets` is the equipment/plant register. It maps to the spec's §54 *Equipment Cost* and to the agent pack's `04_RBAC_AND_ORGS.md` line "Equipment/Plant Manager" internal role. It is not a directory of *people* (HR) or *contracts* (legal) — it is a directory of *physical assets*. Folding it into `organizations` would be the wrong shape.

The three tables already carry project attribution where it matters:
- `assets.current_project_id` — the asset's current home site.
- `equipment_assignments.project_id` — historical timeline of which project an asset was on (when).
- `equipment_usage_logs.project_id` — daily usage attribution for cost roll-up.

This phase **does not add new columns** to any of these three tables. `migrate-16.js` deliberately does not touch the `assets` family. The reason: the existing columns cover every Phase 13 input (see below), and Phase 12 / 13's data model is already a superset of what would be added here.

### Guard prep done this phase
- `// TODO(phase-4)` markers added to all 10 routes in `assets.js` (`GET /categories`, `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`, `GET /:id/assignments`, `POST /:id/assignments`, `GET /:id/usage-logs`, `POST /:id/usage-logs`). All 10 currently require only `authenticate`.

### Schema action this phase
- None. The existing `assets.current_project_id`, `equipment_assignments.project_id`, and `equipment_usage_logs.project_id` columns are sufficient. Phase 4 will add scoped checks; no migration is required here.

### Mapping to Phase 13 (Equipment Cost)
**Formula:** `Equipment Cost = Usage Hours × Rate + Fuel + Mobilization + Allocated Maintenance` (same formula as §4 — repeated here so Phase 13 has both halves side-by-side).

The Asset side carries the *rates* (`assets.hourly_rate`, `assets.daily_rate`); the EquipmentUsageLog side carries the *usage* (`equipment_usage_logs.hours_operated`, `equipment_usage_logs.fuel_liters`); the Maintenance side carries the *allocated maintenance* (`maintenance_reminders.actual_cost`). The three are linked via `equipment_id`. Phase 13 should:
1. For each `equipment_usage_logs` row: `cost = hours × assets.hourly_rate + fuel_liters × fuel_unit_price`.
2. Roll up per project (via `equipment_usage_logs.project_id` or `assets.current_project_id` as the policy decides).
3. Add allocated maintenance (sum of `maintenance_reminders.actual_cost` by `project_id`).
4. Add mobilization per the new column/table Phase 13 introduces.

---

## 6. Modules deliberately out of scope

Per the phase brief: `clients.js`, `suppliers.js`, `subcontractors.js` are party directories that already feed Phase 3's `organizations` absorption. They are not re-decided here. Decisions about their treatment live in Phase 3's design.

---

## 7. Net schema change this phase

Exactly one new migration: **`migrate-16.js`** (committed alongside this document).

| Table | Column added | Type | FK | Index |
|---|---|---|---|---|
| `attendance` | `project_id` | INTEGER | `projects(id) ON DELETE SET NULL` | `idx_attendance_project` |
| `maintenance_reminders` | `project_id` | INTEGER | `projects(id) ON DELETE SET NULL` | `idx_maintenance_reminders_project` |
| `legal_documents` | `project_id` | INTEGER | `projects(id) ON DELETE SET NULL` | `idx_legal_documents_project` |

All three columns are **nullable**, **additive only** (no column dropped or renamed), and **idempotent** (`ADD COLUMN IF NOT EXISTS`). Existing rows are unaffected. No route handler Joi schema was widened to accept `project_id` on POST — that change belongs to a later phase that also wires the value through.

---

## 8. Net guard change this phase

No code paths were tightened. No `authorize()` calls were added or removed. The only auth-related change is the addition of `// TODO(phase-4)` comments to **30 unguarded routes** across `legal.js` (5), `assets.js` (10), `maintenance.js` (5), and the unguarded sub-routes of `hr.js` (15: `attendance` 2, `leaves` GET+POST, `laborers` 5, `labor-payments` 3, `employees` GET x2; one of these — `laborers/skills` — was inlined). These are explicit pointers for Phase 4 to revisit; they do not change runtime behavior.

Existing role guards (`authorize('owner','admin')` and `authorize('owner','admin','finance_manager')` in `hr.js` and `payroll.js`) are unchanged.
