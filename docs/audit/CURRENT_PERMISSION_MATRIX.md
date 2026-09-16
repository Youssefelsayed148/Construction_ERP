# CURRENT_PERMISSION_MATRIX.md

**Audit date:** 2026-09-17
**Source file (verbatim):** `backend/src/middleware/auth.js` (63 lines).
**Cross-checked against:** every `role === 'owner'` / `role === 'admin'` / `module_permissions` reference in `backend/src/` (results below).

---

## 1. How `authorize(...)` resolves a role

```js
// backend/src/middleware/auth.js:45–61
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (req.user.role === 'owner' || req.user.role === 'admin') {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    next();
  };
};
```

The full resolution is:

1. **Authenticate must run first.** Without `req.user`, `authorize` returns 401. `authenticate` (lines 7–43) validates the JWT, fetches the row from `users`, rejects if missing or `is_active = false`, and copies `id, email, name, role, department` into `req.user` (it does **not** copy `module_permissions`).
2. **Hardcoded bypass for `owner` and `admin`.** If `req.user.role === 'owner'` or `req.user.role === 'admin'`, the middleware calls `next()` immediately. **The `...roles` list is never consulted for these two roles.**
3. **Otherwise, the role must literally appear in the `...roles` argument list** (`roles.includes(req.user.role)`). The comparison is a strict string equality check; no normalisation, no case folding, no role inheritance.
4. On failure: HTTP 403 with `{ success: false, error: 'Insufficient permissions' }`.

`authorize` is a **route-level guard only**. It does not see the URL, method, resource ID, project ID, or any record-level data. The "module" is encoded only by which route the developer chose to attach the guard to.

---

## 2. What `users.module_permissions[]` does (and does not)

Defined in `setupDb.js:47` as `module_permissions TEXT[] DEFAULT '{}'`. Populated in three places:

| File | Action |
|---|---|
| `setupDb.js:441–444` | Seeds the owner account with `['all']`. |
| `routes/auth.js:21,35–37` | Accepts an optional `module_permissions` array on registration and stores it on the new user. |
| `routes/users.js:42,62` | Accepts and persists `module_permissions` updates via `PUT /api/users/:id`. |

Read in **two places only**, both for echoing the column back over the API:

| File | Action |
|---|---|
| `routes/auth.js:66,102` | Returns `module_permissions` in the JWT login payload and in the `/me` response. |
| `routes/users.js:12,24,62` | Returns `module_permissions` in user-list / user-detail / user-update responses. |

**No code path anywhere in `backend/src/` consults `module_permissions` to allow or deny an action.** It is pure metadata exposed to the frontend for UI hints (and even there it is unused — `grep -r module_permissions frontend/src/` returns zero matches).

Consequence: **today, `module_permissions[]` has zero runtime effect**. The column is reserved for the future RBAC engine described in `ERP_EXPANSION_PLAN.html` phase 04 but is currently inert.

---

## 3. Every hardcoded bypass — `grep -rnE "role\s*===\s*['\"]" backend/src/`

Only **two** locations perform a hardcoded role check:

### A. `backend/src/middleware/auth.js:51`
```js
if (req.user.role === 'owner' || req.user.role === 'admin') {
  return next();
}
```
This is the universal bypass in `authorize(...)` itself. Applies to **every guarded route in the system**.

### B. `backend/src/routes/approvals.js` — six internal checks

| Line | Code | Purpose |
|---|---|---|
| 97 | `if (ar.requester_id === userId && role !== 'owner' && role !== 'admin')` | Self-approval guard. Requester cannot approve/reject their own request **unless** they are owner/admin. |
| 104 | `if (role !== 'owner' && role !== 'admin' && !allowedRoles.includes(role))` | `manager_review` stage approval: must be owner/admin OR a role listed in `MODULE_MANAGER_ROLES[ar.module_name]`. |
| 122 | `if (role !== 'owner' && role !== 'admin')` | `owner_review` stage approval: only owner/admin may approve. |
| 146 | `if (role !== 'owner' && role !== 'admin' && !allowedRoles.includes(role))` | `manager_review` stage rejection: same as line 104. |
| 150 | `if (role !== 'owner' && role !== 'admin')` | `owner_review` stage rejection: only owner/admin. |
| 217 | `if (role === 'owner' || role === 'admin')` | Inside `GET /pending`: owner/admin see both `manager_review` and `owner_review` rows; other roles see only `manager_review` rows for their own module. |

#### `MODULE_MANAGER_ROLES` map (`approvals.js:10–18`)

```js
const MODULE_MANAGER_ROLES = {
  expenses: ['finance_manager'],
  payroll: ['finance_manager'],
  legal: ['legal_mgr'],
  assets: ['maintenance_mgr'],
  maintenance: ['maintenance_mgr'],
  project_budgets: ['project_manager'],
  sub_contracts: ['project_manager'],
};
```

Plus `DIRECT_TO_OWNER_MODULES = ['purchase_orders', 'grn']` (line 8). **These two modules have no schema or route in the current codebase** — they are forward-references for future procurement/GRN work. A request raised against them jumps straight to `owner_review`.

### C. Role allow-lists at the API surface (route-layer `authorize(...)` calls)

These are the 13 `authorize(...)` invocations across the codebase. Recall from §1 that **`owner` and `admin` always pass**, so they are not a "bypass" in the same sense as §3.A — they are the explicit list of non-owner/admin roles that may also pass.

| Mount | Method+Path | authorize(...) |
|---|---|---|
| `/api/auth` | POST `/register` | `'owner', 'admin'` |
| `/api/users` | GET `/`, GET `/:id`, PUT `/:id`, DELETE `/:id` | `'owner', 'admin'` *(all four)* |
| `/api/approvals` | GET `/pending` | `'owner', 'admin', 'finance_manager', 'purchasing_mgr', 'project_manager', 'legal_mgr', 'maintenance_mgr'` |
| `/api/approvals` | GET `/audit` | `'owner', 'admin'` |
| `/api/hr` | POST `/employees`, PUT `/employees/:id`, DELETE `/employees/:id` | `'owner', 'admin'` *(all three)* |
| `/api/hr` | PUT `/leaves/:id` | `'owner', 'admin'` |
| `/api/payroll` | POST `/` | `'owner', 'admin', 'finance_manager'` *(only place `finance_manager` is added)* |
| `/api/payroll` | DELETE `/:id` | `'owner', 'admin'` |

**Net effect of §3.C:** only these roles can do anything not protected solely by `authenticate`:
- `finance_manager` — can create payroll periods (POST `/api/payroll`) and is on the approval-pending list. **Cannot** approve payroll periods in practice because `MODULE_MANAGER_ROLES.payroll = ['finance_manager']` only governs *pending-requests* visibility, not the create call.
- `purchasing_mgr`, `project_manager`, `legal_mgr`, `maintenance_mgr` — only on the approval-pending list. **No other route currently uses these role names**; they are accepted by `authorize` for `/api/approvals/pending` but otherwise inert.
- `admin`, `manager`, `staff`, `accountant`, `engineer`, `site_supervisor` — accept-list of the `POST /api/auth/register` Joi schema (`auth.js:19`). Roles other than `admin` are inserted as-is. **No other code path recognises `manager`, `staff`, `accountant`, `engineer`, or `site_supervisor`** — they only pass `authorize(...)` when explicitly listed (which they never are).

---

## 4. Roles currently in use

| Role | Where it is recognised |
|---|---|
| `owner` | Universal bypass in `authorize()`; approval self-approval bypass; `MODULE_MANAGER_ROLES` short-circuits; `/api/auth/register` Joi schema. Seeded by `setupDb.js`. |
| `admin` | Same as `owner` for routing purposes. Acceptable in Joi schema. Never appears in any non-bypass check. |
| `finance_manager` | Approval-pending list (`approvals.js:210–211`), payroll POST allow-list (`payroll.js:36`), approval stage 1 manager role for `expenses` + `payroll`. |
| `purchasing_mgr` | Approval-pending list only. No route grants access. **No schema/table references this role.** |
| `project_manager` | Approval-pending list, approval stage 1 manager for `project_budgets` + `sub_contracts`. **No code path uses `users.role = 'project_manager'` to scope access**; project membership is tracked separately in `project_team.employee_id`. |
| `legal_mgr` | Approval-pending list only. Approval stage 1 manager for `legal`. |
| `maintenance_mgr` | Approval-pending list only. Approval stage 1 manager for `assets` + `maintenance`. |
| `manager`, `staff`, `accountant`, `engineer`, `site_supervisor` | Acceptable on registration; no enforcement or scoping anywhere. Effectively unauthenticated-any-role. |

---

## 5. Net access model today

- **All 197 routes require authentication** (every router has `authenticate` first).
- **184 of 197 routes are then wide open to any authenticated user.** `authorize(...)` is absent; any role passes after JWT validation.
- **13 routes have a role-list guard**, of which **11 are `owner|admin`-only** (registration, user CRUD, HR employee CRUD, leave approval, payroll DELETE, approvals audit) and **2 admit one extra role** (approvals pending adds the 6 manager roles; payroll POST adds `finance_manager`).
- **`owner` and `admin` always pass any `authorize(...)` check**, regardless of what list it carries.
- **`module_permissions[]` is collected and echoed back but never enforced.**
- **There is no record-level scoping.** `req.user.id` is the only user identifier attached to the request; `req.user` carries no project memberships, no organisation memberships, no financial-visibility flags. Therefore a `staff` user can call `GET /api/projects/:id` on any project and `GET /api/payments` for any payment.
- **There is no project-scoped filter on dashboard/project routes** — `/api/projects/:id` returns whatever the URL says, with no check that `req.user` is in `project_team` (which itself is empty-by-default since `migrate-15.js` removed the legacy user-based rows).

---

## 6. What this means for the expansion plan's Phase 04 (Permission engine)

The Phase 04 deliverable replaces the flat role check with a `Company + Org + Project + Role + Module + Record + Action` policy plus visibility flags. To avoid breaking the existing app while Phase 04 lands, the migration must:

1. Treat `role === 'owner'` and `role === 'admin'` as a temporary compatibility bypass until the new role-assignment system has echoed those roles into `user_project_roles`.
2. Read `module_permissions[]` for the first time — at minimum to honour `['all']` (the seed value) and refuse routes that are not in the list, before falling back to the role list.
3. Resolve `MODULE_MANAGER_ROLES` (currently a JS map in `approvals.js:10–18`) into a configurable `WorkflowTemplate/Step` table so the approval engine doesn't hard-code role-to-module bindings.
4. Re-target every "current user can see this project" inference from `users.role` to a new `user_project_roles` join, since `project_team` (now keyed to `employee_id`) no longer tells you whether a `users` row is a project member.
