# Admin guide

Grounded in `frontend/src/pages/AdminWorkspace.js`'s `ADMIN_AREAS` map and `frontend/src/App.js`'s routes,
read at the time this was written (commit `6b932f6`, `closeout/batch-a-to-6`). A parallel part of this
closeout batch is actively building new admin screens for roles/permission-matrix, workflow templates and
notification rules — they may land after this document was written. Re-check `ADMIN_AREAS` before trusting
the "planned, not yet built" entries below.

All `/admin/:area` screens are rendered by the single generic `AdminWorkspace` component
(`frontend/src/pages/AdminWorkspace.js`), routed at `admin/:area` (`frontend/src/App.js:137`). Each area's
access is gated client-side by `canAccessAdminArea(user, area)` (`AdminWorkspace.js:95-103`, checking
`config.roles`, the user's `policy_modules`, and a `view`-or-`*` grant) **and** server-side by the backend
route's own `authorize()` middleware — the frontend check is a UX convenience, not the security boundary.
The sidebar only shows a link into `/admin/organizations` for `owner`, `admin`, `owner_ceo`, `coo`
(`frontend/src/components/layout/Sidebar.js:30`); other roles that hold a narrower admin area (e.g.
`storekeeper` for `inventory-documents`) can still reach it by direct URL — there is no sidebar entry for
them.

## Users, roles and the permission matrix

**Users (exists today).** Area key `users`, route `/admin/users`, roles `['owner', 'admin']`
(`AdminWorkspace.js:25-29`). Lists/edits `name`, `role`, `department`, `is_active`; deactivates via
`DELETE /users/:id`. The `role` field is a plain dropdown of a hardcoded role list
(`AdminWorkspace.js:14`, `roleOptions`) or, when available, the live role catalog from
`GET /users/preview/roles` — it sets a user's single `role` key, it does not expose or edit the
module/action permission matrix itself.

**Roles / permission matrix (planned, not yet built).** There is no `ADMIN_AREAS` entry for editing the
role → module/action grant matrix (the `roles`/`permissions`/`role_permissions` tables seeded by
`backend/src/migrations/0031_organizations_rbac.sql` and earlier migrations) today. This is called out as
open in `docs/LAUNCH_READINESS.md`'s open-Majors list, item 12 ("T0.6: no admin roles/permission-matrix
screen") — see that document's "Shortest remaining path to launch" item 3 for the planned agent work.
Today, changing a role's grants requires a new SQL migration (per `docs/MIGRATIONS.md`'s additive-only
rule), not a UI action.

**Delegations (exists today).** Area key `delegations`, route `/admin/delegations`, roles
`['owner', 'admin', 'owner_ceo', 'coo']` (`AdminWorkspace.js:30-34`). Create/list/deactivate temporary
authority delegation (`delegate_user_id`, `module_scope`, `max_amount`, validity window) — this is the
closest existing screen to "who can act as whom," but it delegates an existing user's own grants
temporarily; it does not edit the grant catalog itself.

## Workflow templates

**Planned, not yet built.** No `ADMIN_AREAS` entry exists for a workflow-template editor. Workflow
templates (`template_workflows`, referenced by `backend/src/routes/projects.js:90` and the `legacy_module_
approval`, `permit`, and `wir` templates named in `routes/approvals.js:12`, `routes/hse.js:6`, and
`routes/qhse.js:537`) are currently defined only in migrations/seed data, not editable through any screen.
This is `docs/LAUNCH_READINESS.md`'s open-Majors item 13 ("no workflow-template editor screen").

## Notification rules

**Per-user preferences exist today; a company-wide rules screen is planned.** `NotificationPreferences.js`
(route `/notification-preferences`, `frontend/src/App.js:111`) lets the signed-in user opt in/out of
specific event-type/channel combinations via `GET`/`PUT /api/notifications/preferences`
(`backend/src/routes/notifications.js:78,88`). This is self-service, not an admin screen, and it has no
`ADMIN_AREAS` entry or role gate beyond "is logged in." A company-wide notification-**rules** admin screen
(who gets notified of what, by default, org-wide) does not exist; this is `docs/LAUNCH_READINESS.md`'s
open-Majors item 14 ("no notification-rules screen").

## Approval limits

**Exists today.** Area key `approval-limits`, route `/admin/approval-limits`, roles
`['owner', 'admin']` (`AdminWorkspace.js:35-39`). Backed by `GET`/`PUT /api/approval-limits`
(`backend/src/routes/approvalLimits.js`). Fields: `role`, `action` (one of
`approvalLimits.MONEY_TOOLS` — `issue_purchase_order`, `issue_client_invoice`, `record_payment`,
`approve_payment_certificate`, `release_retention`, `void_financial_record`, `approve_supplier_invoice`),
`max_amount`, `currency`, `enabled`. This is a single global table (one row per role+action), not
project-scoped. See `docs/APPROVAL_LIMITS_DECISION_SHEET.md` for the production values awaiting owner
sign-off before launch.

## Projects

**Exists today**, but not as an `/admin/*` area — it is a first-class module. List/portfolio view at
route `/projects` (`frontend/src/pages/Projects.js`, `App.js:115`); creation via the 11-step wizard at
`/projects/new` (`frontend/src/pages/ProjectWizard.js`, `App.js:118-119`); per-project detail/tabs at
`/projects/:id/*` (`App.js:120-134`, `ProjectShell.js`). All backend routes
(`backend/src/routes/projects.js`) go through `authenticate` + `authorize()` with no explicit role list in
the route file — the module-level grant decides access. Per
`backend/src/migrations/0031_organizations_rbac.sql`, `projects`/`create` is granted to `owner_ceo`, `coo`,
and `projects_director` among the canonical roles (lines 309, 339, 369); `construction_manager`,
`site_manager`, and most other internal roles hold `projects`/`view` only. The legacy blanket roles
(`owner`, `admin`, `project_manager`, `finance_manager`, `manager`, `staff`, `accountant`, `engineer`,
`site_supervisor`, `purchasing_mgr`, `legal_mgr`, `maintenance_mgr`) hold `('*','*')` and so can also create
projects (`backend/src/scripts/policy-migration.js` lines 75-89, `INTERNAL_ROLES`) — this is the same
blanket-grant gap flagged in `docs/LAUNCH_READINESS.md`'s open-Majors item 2.

## Other existing admin areas (for completeness)

The remaining `ADMIN_AREAS` keys at the time of writing, not asked for above but present in the same
screen: `organizations` (company/client/supplier/subcontractor/consultant master records — roles `owner`,
`admin`, `owner_ceo`, `coo`), `inventory-documents` (issues/returns/adjustments — roles include
`storekeeper`, `site_supervisor`), `variations` (commercial variations), `sla` (handover claim SLA
viewer), `webhooks` and `api-tokens` (integration credentials, `owner`/`admin` only, one-time-secret
reveal), `numbering` (document-numbering scheme per project), and `replenishment` (materials replenishment
policies/alerts). See `AdminWorkspace.js:18-73` for the exact field/role list of each.
