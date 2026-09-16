# CURRENT_MODULE_MATRIX.md

**Audit date:** 2026-09-17
**Source paths:** `backend/src/routes/*.js` (28 files), `frontend/src/pages/*.js` (20 files).
Each row's description was derived by reading the file (header comments, route definitions, function names, schema literals, and the routes the file calls) — not by guessing from the filename.

---

## Backend — `backend/src/routes/` (28 files)

Mount paths are taken from `backend/server.js`.

| File | Mount | One-line description |
|---|---|---|
| `activity.js` | `/api/activity` | Single `GET /` returning the most recent N activity log entries (delegates to `utils/activity.getRecentActivities`). |
| `approvals.js` | `/api/approvals` | 2-stage generic approval flow: `POST /request` to raise, `GET /pending` filtered by `MODULE_MANAGER_ROLES`, `PUT /:id/approve|reject` (drives `manager_review`→`owner_review`→`approved`/`rejected`), `GET /my-requests`, `GET /audit`, `GET /check/:module/:requestId`, `GET /:id/details`; `DIRECT_TO_OWNER_MODULES` (`purchase_orders`,`grn`) bypass stage 1 (current schema has no such rows yet — these keys are forward-references). |
| `assets.js` | `/api/assets` | CRUD on `assets` plus `/:id/assignments` (history of project assignments) and `/:id/usage-logs` (operator/fuel/hours). |
| `auth.js` | `/api/auth` | `POST /register` (owner/admin only), `POST /login` (JWT issuance), `GET /me`, `POST /change-password` (bcryptjs + jsonwebtoken, JWT_SECRET from env). |
| `boq.js` | `/api/boq` | CRUD on `boq_sections` (hierarchical via `parent_id`) and `boq_items` (with computed `total_price` and `completion_percentage` columns), plus `GET /summary/:projectId` returning grouped totals. |
| `clients.js` | `/api/clients` | Full CRUD on `clients` with auto-generated `CLI-NNNN` codes, soft-state via `is_active`. |
| `costing.js` | `/api/costing` | Read-only roll-ups: `/codes` returns the seeded CSI cost-code tree; `/project/:id` and `/project/:id/summary` aggregate cost-code spend vs budget; `/project/:id/profitability` returns contract_value − total_cost − retention. |
| `dashboard.js` | `/api/dashboard` | Four endpoints: `/` returns module-record counts, `/portfolio` lists projects with budget variance + at-risk flag, `/project/:id` returns a single project's phases/spent/upcoming-milestones, `/alerts` aggregates low-stock / overdue milestones / budget overruns / stale daily reports / overdue RFIs, `/overview` returns per-module summary strips for an owner landing view. |
| `doccontrol.js` | `/api/docs` | Document library: categories CRUD, project documents with version history (PUT appends a `document_versions` row and bumps `project_documents.version`), approve/reject via `POST /documents/:id/:action(approve\|reject)`, RFIs (raise + respond + close), submittals (raise + respond). Uploaded files referenced by `file_url` arrive via `/api/documents/upload` first. |
| `documents.js` | `/api/documents` | Multer disk-storage upload endpoint `POST /upload` (max 10 files × 25 MB; allowed extensions listed); writes to `backend/uploads/` and returns `/uploads/` URLs. |
| `expenses.js` | `/api/expenses` | CRUD on `expenses` with the 12 fixed `EXPENSE_CATEGORIES`; on create, fires `journalExpenseCreated()` to write a journal entry (fire-and-forget). |
| `finance.js` | `/api/finance` | Two read-only aggregates: `/project/:id` returns contract value, invoiced, paid, outstanding, expenses, profit for a project; `/summary` returns global revenue/expenses/profit + overdue invoice count. |
| `hr.js` | `/api/hr` | Sub-routes for `/employees` (full CRUD; create/update/delete require `owner|admin`), `/attendance` (list + create), `/leaves` (list, create, approve/reject — last requires `owner|admin`), `/laborers` (full CRUD on `daily_laborers`), `/laborers/skills` static list, `/labor-payments` (list, create, delete — note: no `owner|admin` gate). |
| `invoices.js` | `/api/invoices` | Full CRUD on `invoices`; `GET /:id` and `PUT /:id` recompute status (`paid`/`partially_paid`/`overdue`) from payments. |
| `items.js` | `/api/items` | CRUD on `item_master` with 7 categories and 50+ sub-categories (returned by `/categories`); `GET /:id/suppliers` returns prices/lead times via `supplier_materials`. |
| `legal.js` | `/api/legal` | Full CRUD on `legal_documents`; `PUT /:id` with `status: 'verified'` writes `verified_by = req.user.id`. |
| `maintenance.js` | `/api/maintenance` | Full CRUD on `maintenance_reminders` (linked to `assets`); no project filter applied — asset-centric. |
| `payments.js` | `/api/payments` | `GET /` (list with optional filters), `POST /` (create, recomputes parent invoice status to `paid`/`partially_paid`/`overdue`), `DELETE /:id` (and again recomputes the parent invoice status). |
| `payroll.js` | `/api/payroll` | Full CRUD on `payroll_periods` (create requires `owner|admin|finance_manager`, delete requires `owner|admin`); the period + its `payroll_details` are returned together. |
| `projects.js` | `/api/projects` | CRUD on `projects` (with auto-generated `PRJ-NNNN` codes) plus nested CRUD on `project_phases`, `project_team` (now keyed to `employee_id` after `migrate-15.js`), and `project_milestones`. |
| `qhse.js` | `/api/qhse` | Quality tests CRUD, NCRs CRUD + `/ncrs/:id/status` (advance open→investigating→closed/void), safety inspections CRUD, safety incidents CRUD. All list endpoints filter by `?project_id`. |
| `site.js` | `/api/projects` (same mount as `projects.js`) | Three per-project sub-resources under `/:projectId/...`: `site-reports` (one-per-day; PUT only updates today's report), `instructions` (engineer instructions with `acknowledge`/`implement`/`close` actions via `:action(acknowledge\|implement\|close)`), and `site-visits` (visitor log with action items + photos). |
| `subcontractors.js` | `/api/subcontractors` | CRUD on `subcontractors` directory, `/:projectId` contract listing, contracts CRUD (`retention_percent` defaults to 10 from `business_rules.retention_percent`), sub-work-verifications CRUD, sub-payment-certificates CRUD (with `retention_deduction`/`penalties`/`materials_deducted` adjustments). |
| `suppliers.js` | `/api/suppliers` | CRUD on `suppliers` (includes `specialty` enum of 11 values returned by `/specialties`); manages the `supplier_materials` linking table through `/:id/materials` (list/add/delete). |
| `units.js` | `/api/sales` | Buildings + units CRUD for the real-estate sales module; defines a `UNIT_TRANSITIONS` state machine (`available→reserved→contracted→delivered→closed`, plus `blocked` side-state). `POST /units/:id/status` walks the state machine and **auto-creates an `invoices` row** on the `available→reserved/contracted` transition (helper `createUnitSaleInvoice`). Also `POST /buildings/:buildingId/bulk-units` generates units from floor plans. |
| `users.js` | `/api/users` | Owner/admin-only full CRUD on `users`; `PUT /:id` allows changing `role`, `department`, `module_permissions[]`, and `is_active`; `DELETE /:id` is a soft-deactivate (sets `is_active = false`). |
| `warehouses.js` | `/api/warehouses` | Warehouse CRUD (`GET /`, `GET /:id` returns warehouse + current stock), stock upsert at `POST /:id/stock`, inventory transfers (`GET /transfers`, `POST /transfers` with array of items, `PUT /transfers/:id/complete` runs an atomic transaction that decrements source stock and increments destination). |
| `workorders.js` | `/api/work-orders` | CRUD on `work_orders` (filtered by `?status` and `?phase_id`); sub-resources for materials (`POST /:id/materials`), labor (`POST /:id/labor`), equipment (`POST /:id/equipment`), and completions (`POST /:id/completions` + `PUT /:woId/completions/:compId/verify`). |

---

## Frontend — `frontend/src/pages/` (20 files)

Routes come from `frontend/src/App.js`. Each description is pulled from reading the file's main component body (lookups to `/api/...`, useState names, JSX headings), not from guessing.

| File | App.js route | One-line description |
|---|---|---|
| `Login.js` | `/login` | Page with email/password inputs that posts to `/api/auth/login`, stores JWT and user in `authService` (localStorage), and navigates to `/dashboard`; redirects already-authenticated users. |
| `Dashboard.js` | `/dashboard` | Tiles dashboard: top cards (active projects, clients, items, assets, employees, subcontractors), a portfolio table with status colour-coding, an alerts panel (low stock, overdue milestones, budget overruns, stale site reports, overdue RFIs), and a per-module "owner overview" strip rendered as compact summary rows. |
| `Projects.js` | `/projects` | List page of all projects (filter by `status`, `project_type`, free-text search), shows code/client/PM/dates/completion, links into `ProjectDetail`. |
| `ProjectDetail.js` | `/projects/:id` | Single-project workspace: header with status/budget, tabs/sections for phases, team (employees), milestones, and quick links to BOQ, work orders, site, QHSE, documents, and units for that project. |
| `BOQ.js` | `/projects/:id/boq` | BOQ editor for a single project: tree of `boq_sections` + items table (description, unit, qty, rate, computed total, completed qty, completion %, type). |
| `WorkOrders.js` | `/projects/:id/work-orders` | Work-orders workspace for a single project: list with status filter, create/edit modal, drill-down to materials/labor/equipment/completions; assigns to a phase and a BOQ section. |
| `SiteManagement.js` | `/projects/:id/site` | Three-tab workspace: daily site reports (with photos/weather/workers), engineer instructions (with acknowledge/implement/close), site visits (with action items). |
| `QHSE.js` | `/projects/:id/qhse` | Quality + safety workspace for a project: quality tests, NCRs (with severity + workflow status), safety inspections (with JSONB checklist), safety incidents. |
| `ProjectDocuments.js` | `/projects/:id/documents` | Document library: categories sidebar, file grid, upload via `/api/documents/upload`, version history, RFIs + submittals sub-tabs. |
| `UnitsSales.js` | `/projects/:id/units` | Buildings + units sales workspace for a project: building list, unit grid per building, status pills (available/reserved/contracted/delivered/blocked), state-machine transitions, and triggers the backend's `createUnitSaleInvoice`. |
| `Items.js` | `/inventory` | Global `item_master` editor: 7 categories × 50+ sub-categories, search/filter, supplier pricing tab (`/items/:id/suppliers`). |
| `Suppliers.js` | `/suppliers` | Supplier directory: contact details, specialty badges, supplier-materials price/lead-time panel per supplier. |
| `Clients.js` | `/clients` | Client directory: bilingual names, client type, contact info, credit limit, balance. |
| `Legal.js` | `/legal` | Legal documents list with status tabs (`all` / `pending` / `verified` / `rejected`); approve/reject via status update; verifies set `verified_by`. |
| `Approvals.js` | `/approvals` | Approval inbox + my-requests + audit (audit requires `owner|admin`); tabbed by status; allows access only to roles in the local `PENDING_ALLOWED_ROLES` list; action buttons call `PUT /api/approvals/:id/approve|reject`. |
| `Expenses.js` | `/expenses` | Expenses list + create/edit modal with 12-category picker, optional project assignment, status (`pending`/`approved`/`rejected`); date/search filters. |
| `Invoices.js` | `/invoices` | Invoice list with status badges (draft/sent/partially_paid/paid/overdue), detail modal with linked payments, create/edit modal scoped to a project + client. |
| `Assets.js` | `/assets` | Equipment + non-equipment assets list: filter by category/equipment-type, manufacturer/model/serial, project assignment history, usage logs. |
| `HR.js` | `/hr` | HR workspace combining 4 sub-tabs: employees (CRUD with bilingual name, designation, salary, manager flag), attendance, leaves, daily laborers + labor payments. |
| `Payroll.js` | `/hr/payroll` | Payroll periods list with expand-to-show `payroll_details`; create-period flow allows entering per-employee basic/allowances/deductions; period status `draft`→`posted`. |
