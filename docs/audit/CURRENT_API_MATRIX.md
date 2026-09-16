# CURRENT_API_MATRIX.md

**Audit date:** 2026-09-17
**Method:** every route below is taken verbatim from `backend/src/routes/*.js`. The mount path is taken from `backend/server.js`. The `authorize(...)` column reflects the literal arguments passed to `authorize(...)` at the call site (or `authenticate only` when no `authorize` is present).

**Important non-route endpoints** (not part of `/api/*`):
- `GET /api/health` — anonymous liveness probe (`backend/server.js:33`).
- `ANY /uploads/*` — static files served from `backend/uploads/`.

**Auth convention:** every route below calls `authenticate` middleware first. The `authorize(...)` column shows **only the role list passed explicitly to `authorize(...)`**. `owner` and `admin` always pass regardless (see `CURRENT_PERMISSION_MATRIX.md`), so they are listed where the role guard is intentionally used to whitelist additional roles. `(none)` means *no explicit authorize — only authenticated, any role*.

---

## `/api/auth` — `routes/auth.js`

| Method | Path | authorize(...) |
|---|---|---|
| POST | `/register` | `'owner', 'admin'` |
| POST | `/login` | *(no authenticate — public)* |
| GET | `/me` | *(none)* |
| POST | `/change-password` | *(none)* |

## `/api/users` — `routes/users.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/` | `'owner', 'admin'` |
| GET | `/:id` | `'owner', 'admin'` |
| PUT | `/:id` | `'owner', 'admin'` |
| DELETE | `/:id` | `'owner', 'admin'` (soft-deactivate) |

## `/api/approvals` — `routes/approvals.js`

| Method | Path | authorize(...) |
|---|---|---|
| POST | `/request` | *(none)* |
| GET | `/pending` | `'owner', 'admin', 'finance_manager', 'purchasing_mgr', 'project_manager', 'legal_mgr', 'maintenance_mgr'` |
| PUT | `/:id/approve` | *(none — `advanceApproval()` does stage-specific role check inside)* |
| PUT | `/:id/reject` | *(none — `advanceApproval()` does stage-specific role check inside)* |
| GET | `/my-requests` | *(none)* |
| GET | `/audit` | `'owner', 'admin'` |
| GET | `/check/:module/:requestId` | *(none)* |
| GET | `/:id/details` | *(none)* |

## `/api/activity` — `routes/activity.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/` | *(none)* |

## `/api/dashboard` — `routes/dashboard.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/` | *(none)* |
| GET | `/portfolio` | *(none)* |
| GET | `/project/:id` | *(none)* |
| GET | `/alerts` | *(none)* |
| GET | `/overview` | *(none)* |

## `/api/items` — `routes/items.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/categories` | *(none)* |
| GET | `/` | *(none)* |
| GET | `/:id` | *(none)* |
| GET | `/:id/suppliers` | *(none)* |
| POST | `/` | *(none)* |
| PUT | `/:id` | *(none)* |
| DELETE | `/:id` | *(none)* |

## `/api/suppliers` — `routes/suppliers.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/` | *(none)* |
| GET | `/specialties` | *(none)* |
| GET | `/:id` | *(none)* |
| POST | `/` | *(none)* |
| PUT | `/:id` | *(none)* |
| DELETE | `/:id` | *(none)* |
| GET | `/:id/materials` | *(none)* |
| POST | `/:id/materials` | *(none)* |
| DELETE | `/:id/materials/:material_id` | *(none)* |

## `/api/clients` — `routes/clients.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/` | *(none)* |
| GET | `/:id` | *(none)* |
| POST | `/` | *(none)* |
| PUT | `/:id` | *(none)* |
| DELETE | `/:id` | *(none)* |

## `/api/legal` — `routes/legal.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/` | *(none)* |
| GET | `/:id` | *(none)* |
| POST | `/` | *(none)* |
| PUT | `/:id` | *(none)* |
| DELETE | `/:id` | *(none)* |

## `/api/expenses` — `routes/expenses.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/categories` | *(none)* |
| GET | `/` | *(none)* |
| GET | `/:id` | *(none)* |
| POST | `/` | *(none)* |
| PUT | `/:id` | *(none)* |
| DELETE | `/:id` | *(none)* |

## `/api/invoices` — `routes/invoices.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/` | *(none)* |
| GET | `/:id` | *(none)* |
| POST | `/` | *(none)* |
| PUT | `/:id` | *(none)* |
| DELETE | `/:id` | *(none)* |

## `/api/payments` — `routes/payments.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/` | *(none)* |
| POST | `/` | *(none)* |
| DELETE | `/:id` | *(none)* |

## `/api/finance` — `routes/finance.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/project/:id` | *(none)* |
| GET | `/summary` | *(none)* |

## `/api/assets` — `routes/assets.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/categories` | *(none)* |
| GET | `/` | *(none)* |
| GET | `/:id` | *(none)* |
| POST | `/` | *(none)* |
| PUT | `/:id` | *(none)* |
| DELETE | `/:id` | *(none)* |
| GET | `/:id/assignments` | *(none)* |
| POST | `/:id/assignments` | *(none)* |
| GET | `/:id/usage-logs` | *(none)* |
| POST | `/:id/usage-logs` | *(none)* |

## `/api/maintenance` — `routes/maintenance.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/` | *(none)* |
| GET | `/:id` | *(none)* |
| POST | `/` | *(none)* |
| PUT | `/:id` | *(none)* |
| DELETE | `/:id` | *(none)* |

## `/api/hr` — `routes/hr.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/employees` | *(none)* |
| GET | `/employees/:id` | *(none)* |
| POST | `/employees` | `'owner', 'admin'` |
| PUT | `/employees/:id` | `'owner', 'admin'` |
| DELETE | `/employees/:id` | `'owner', 'admin'` |
| GET | `/attendance` | *(none)* |
| POST | `/attendance` | *(none)* |
| GET | `/leaves` | *(none)* |
| POST | `/leaves` | *(none)* |
| PUT | `/leaves/:id` | `'owner', 'admin'` |
| GET | `/laborers` | *(none)* |
| GET | `/laborers/skills` | *(none)* |
| GET | `/laborers/:id` | *(none)* |
| POST | `/laborers` | *(none)* |
| PUT | `/laborers/:id` | *(none)* |
| DELETE | `/laborers/:id` | *(none)* |
| GET | `/labor-payments` | *(none)* |
| POST | `/labor-payments` | *(none)* |
| DELETE | `/labor-payments/:id` | *(none)* |

## `/api/payroll` — `routes/payroll.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/` | *(none)* |
| GET | `/:id` | *(none)* |
| POST | `/` | `'owner', 'admin', 'finance_manager'` |
| PUT | `/:id` | *(none)* |
| DELETE | `/:id` | `'owner', 'admin'` |

## `/api/projects` — `routes/projects.js` (and `routes/site.js` is mounted on the same path)

### projects.js

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/portfolio` | *(none)* |
| GET | `/` | *(none)* |
| GET | `/:id` | *(none)* |
| POST | `/` | *(none)* |
| PUT | `/:id` | *(none)* |
| POST | `/:id/phases` | *(none)* |
| PUT | `/:projectId/phases/:phaseId` | *(none)* |
| DELETE | `/:projectId/phases/:phaseId` | *(none)* |
| POST | `/:id/team` | *(none)* |
| DELETE | `/:projectId/team/:teamId` | *(none)* |
| POST | `/:id/milestones` | *(none)* |
| PUT | `/:projectId/milestones/:milestoneId` | *(none)* |
| DELETE | `/:projectId/milestones/:milestoneId` | *(none)* |

### site.js (mounted at `/api/projects`)

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/:projectId/site-reports` | *(none)* |
| GET | `/:projectId/site-reports/:date` | *(none)* |
| POST | `/:projectId/site-reports` | *(none)* |
| PUT | `/:projectId/site-reports/:id` | *(none)* |
| GET | `/:projectId/instructions` | *(none)* |
| POST | `/:projectId/instructions` | *(none)* |
| PUT | `/:projectId/instructions/:id` | *(none)* |
| POST | `/:projectId/instructions/:id/:action(acknowledge\|implement\|close)` | *(none)* |
| GET | `/:projectId/site-visits` | *(none)* |
| POST | `/:projectId/site-visits` | *(none)* |
| PUT | `/:projectId/site-visits/:id` | *(none)* |
| DELETE | `/:projectId/site-visits/:id` | *(none)* |

## `/api/warehouses` — `routes/warehouses.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/` | *(none)* |
| GET | `/:id` | *(none)* |
| POST | `/:id/stock` | *(none)* |
| GET | `/transfers` | *(none)* |
| POST | `/transfers` | *(none)* |
| PUT | `/transfers/:id/complete` | *(none)* |

## `/api/boq` — `routes/boq.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/sections/:projectId` | *(none)* |
| POST | `/sections` | *(none)* |
| PUT | `/sections/:id` | *(none)* |
| DELETE | `/sections/:id` | *(none)* |
| GET | `/items/:projectId` | *(none)* |
| POST | `/items` | *(none)* |
| PUT | `/items/:id` | *(none)* |
| DELETE | `/items/:id` | *(none)* |
| GET | `/summary/:projectId` | *(none)* |

## `/api/work-orders` — `routes/workorders.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/project/:projectId` | *(none)* |
| GET | `/:id` | *(none)* |
| POST | `/` | *(none)* |
| PUT | `/:id` | *(none)* |
| DELETE | `/:id` | *(none)* |
| POST | `/:id/materials` | *(none)* |
| POST | `/:id/labor` | *(none)* |
| POST | `/:id/equipment` | *(none)* |
| POST | `/:id/completions` | *(none)* |
| PUT | `/:woId/completions/:compId/verify` | *(none)* |

## `/api/subcontractors` — `routes/subcontractors.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/` | *(none)* |
| GET | `/:id` | *(none)* |
| POST | `/` | *(none)* |
| PUT | `/:id` | *(none)* |
| GET | `/contracts/:projectId` | *(none)* |
| POST | `/contracts` | *(none)* |
| GET | `/verifications/:contractId` | *(none)* |
| POST | `/verifications` | *(none)* |
| PUT | `/verifications/:id` | *(none)* |
| GET | `/certificates/:contractId` | *(none)* |
| POST | `/certificates` | *(none)* |
| PUT | `/certificates/:id` | *(none)* |

## `/api/costing` — `routes/costing.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/codes` | *(none)* |
| GET | `/project/:projectId` | *(none)* |
| GET | `/project/:projectId/summary` | *(none)* |
| GET | `/project/:projectId/profitability` | *(none)* |

## `/api/documents` — `routes/documents.js` (file-upload service)

| Method | Path | authorize(...) |
|---|---|---|
| POST | `/upload` | *(none)* |

## `/api/qhse` — `routes/qhse.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/quality-tests` | *(none)* |
| POST | `/quality-tests` | *(none)* |
| PUT | `/quality-tests/:id` | *(none)* |
| DELETE | `/quality-tests/:id` | *(none)* |
| GET | `/ncrs` | *(none)* |
| POST | `/ncrs` | *(none)* |
| POST | `/ncrs/:id/status` | *(none)* |
| PUT | `/ncrs/:id` | *(none)* |
| GET | `/inspections` | *(none)* |
| POST | `/inspections` | *(none)* |
| PUT | `/inspections/:id` | *(none)* |
| GET | `/incidents` | *(none)* |
| POST | `/incidents` | *(none)* |
| PUT | `/incidents/:id` | *(none)* |

## `/api/docs` — `routes/doccontrol.js`

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/categories` | *(none)* |
| POST | `/categories` | *(none)* |
| GET | `/documents` | *(none)* |
| GET | `/documents/:id` | *(none)* |
| POST | `/documents` | *(none)* |
| POST | `/documents/:id/versions` | *(none)* |
| PUT | `/documents/:id` | *(none)* |
| POST | `/documents/:id/:action(approve\|reject)` | *(none)* |
| DELETE | `/documents/:id` | *(none)* |
| GET | `/rfis` | *(none)* |
| POST | `/rfis` | *(none)* |
| POST | `/rfis/:id/respond` | *(none)* |
| POST | `/rfis/:id/close` | *(none)* |
| GET | `/submittals` | *(none)* |
| POST | `/submittals` | *(none)* |
| POST | `/submittals/:id/respond` | *(none)* |

## `/api/sales` — `routes/units.js` (buildings + units, real-estate)

| Method | Path | authorize(...) |
|---|---|---|
| GET | `/buildings` | *(none)* |
| POST | `/buildings` | *(none)* |
| PUT | `/buildings/:id` | *(none)* |
| DELETE | `/buildings/:id` | *(none)* |
| GET | `/buildings/:buildingId/units` | *(none)* |
| POST | `/buildings/:buildingId/units` | *(none)* |
| POST | `/buildings/:buildingId/bulk-units` | *(none)* |
| PUT | `/units/:id` | *(none)* |
| POST | `/units/:id/status` | *(none)* (transitions the state machine; auto-creates an invoice) |
| DELETE | `/units/:id` | *(none)* |
| GET | `/summary` | *(none)* |

---

## Summary

| Mount | Route file | Routes | With explicit `authorize()` | With `owner|admin` | Other role lists |
|---|---|---|---|---|---|
| `/api/auth` | `auth.js` | 4 | 1 | 1 | 0 |
| `/api/users` | `users.js` | 4 | 4 | 4 | 0 |
| `/api/approvals` | `approvals.js` | 8 | 2 | 1 | 1 (`/pending`) |
| `/api/activity` | `activity.js` | 1 | 0 | 0 | 0 |
| `/api/dashboard` | `dashboard.js` | 5 | 0 | 0 | 0 |
| `/api/items` | `items.js` | 7 | 0 | 0 | 0 |
| `/api/suppliers` | `suppliers.js` | 9 | 0 | 0 | 0 |
| `/api/clients` | `clients.js` | 5 | 0 | 0 | 0 |
| `/api/legal` | `legal.js` | 5 | 0 | 0 | 0 |
| `/api/expenses` | `expenses.js` | 6 | 0 | 0 | 0 |
| `/api/invoices` | `invoices.js` | 5 | 0 | 0 | 0 |
| `/api/payments` | `payments.js` | 3 | 0 | 0 | 0 |
| `/api/finance` | `finance.js` | 2 | 0 | 0 | 0 |
| `/api/assets` | `assets.js` | 10 | 0 | 0 | 0 |
| `/api/maintenance` | `maintenance.js` | 5 | 0 | 0 | 0 |
| `/api/hr` | `hr.js` | 19 | 4 | 4 (`POST|PUT|DELETE /employees`, `PUT /leaves/:id`) | 0 |
| `/api/payroll` | `payroll.js` | 5 | 2 | 1 (`DELETE /`) | 1 (`POST /` adds `finance_manager`) |
| `/api/projects` (+ `site.js`) | `projects.js`, `site.js` | 13 + 12 = 25 | 0 | 0 | 0 |
| `/api/warehouses` | `warehouses.js` | 6 | 0 | 0 | 0 |
| `/api/boq` | `boq.js` | 9 | 0 | 0 | 0 |
| `/api/work-orders` | `workorders.js` | 10 | 0 | 0 | 0 |
| `/api/subcontractors` | `subcontractors.js` | 12 | 0 | 0 | 0 |
| `/api/costing` | `costing.js` | 4 | 0 | 0 | 0 |
| `/api/documents` | `documents.js` | 1 | 0 | 0 | 0 |
| `/api/qhse` | `qhse.js` | 14 | 0 | 0 | 0 |
| `/api/docs` | `doccontrol.js` | 17 | 0 | 0 | 0 |
| `/api/sales` | `units.js` | 11 | 0 | 0 | 0 |
| **Total** | **28 files** | **197 routes** | **13 with explicit `authorize`** | **11 use `owner|admin`** | **2 use other lists** |

Of the 197 routes, **184 require only authentication** (any role) and **13 enforce a specific role list** at the route layer. `owner` and `admin` always pass through (see `CURRENT_PERMISSION_MATRIX.md`).
