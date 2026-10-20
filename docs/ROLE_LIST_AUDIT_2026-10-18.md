# Role list audit — 2026-10-18 (Phase B2)

Method. The declared coarse role lists were read from the live routers
(`middleware.authorizeRoles`, backend/src/middleware/auth.js:213) and the exact grant a
request is judged under was computed with the production policy engine
(`services/policy.js` `effectiveModule` / `effectiveAction` + MODULE_OVERRIDES +
ACTION_OVERRIDES). Canonical grants are parsed from migrations 0006, 0031, 0034, 0035,
0036, 0047, 0051 and 0052 plus the legacy `('*', '*')` parity grants of
`scripts/policy-migration.js` (legacy internal roles: owner, admin, finance_manager,
purchasing_mgr, project_manager, legal_mgr, maintenance_mgr, manager, staff, accountant,
engineer, site_supervisor). A canonical role "holds" a route when it carries exactly the
module:action pair that route is judged under (exact match, `module:*`, `*:action` or
`*:*`; visibility flags such as `see_supplier_value` never count for a write action).

Counts measured this session: 63 `authorize('...')` call sites across the route files;
40 of them sit on write routes (POST/PUT/DELETE); 255 write routes run on the policy grant
alone (`authorize()` with no list). Rows below are the 17 write routes whose list blocks at
least one canonical holder of the exact grant, plus every write route with a legacy-only
list, so a reviewer sees the full decision surface.

Reading the table: "missing" = canonical role holds the exact grant for that route but the
coarse list excludes it (the list is ANDed with the policy grant in auth.js:167-170, so the
list wins and the role is blocked). "noGrant" = declared role with no matching grant rows —
harmless for allow behaviour (the policy denies anyway) but kept visible because it shows
which declared keys are dead lists.

## Applied changes (unambiguous class only)

| # | Route | Change | Proof |
|---|-------|--------|-------|
| 1 | hr POST /employees | add `hr_manager` | 0031:543 `('hr_manager','hr','create')` |
| 2 | hr PUT /employees/:id | add `hr_manager` | 0031:543 `('hr_manager','hr','edit')` |
| 3 | hr PUT /leaves/:id | add `hr_manager` | 0031:543 `('hr_manager','hr','edit')` |
| 4 | schedule ×5 | `planning` → `planning_engineer` (non-existent key replaced; legacy keys kept) | 0031:422 `('planning_engineer','schedule','create'/'edit')` |
| 5 | schedule PUT /activities/:id/budgeted-cost | add `projects_director`, `construction_manager`, `site_manager`, `site_engineer` | all four hold `schedule:edit` (0031:371-372, 392, 409; 0006 site_engineer schedule edit) |
| 6 | schedule PUT /assignments/:id/status | same four | same grants |

Deliberately NOT changed: hr DELETE /employees and payroll DELETE /:id (no canonical holder
of `hr:delete`/`payroll:delete` exists — 0031 grants hr/payroll view/create/edit only, never
delete), `owner_ceo`/`coo` on hr routes (0031 grants them `hr view` only).

## Needs decision (NOT edited)

| Route (judged under) | Declared list | Canonical holders blocked | Why it is not unambiguous |
|---|---|---|---|
| procurement POST /rfq/:id/award (`procurement:approve`, ACTION_OVERRIDES) | owner, admin | `procurement_manager` (0035:76), `owner_ceo` (0035:78), `coo` (0035:79) | Who may award an RFQ is a commercial-delegation decision: blocking procurement_manager from the award step may be intentional separation of purchasing and award authority although the grant exists. Owner decision required. |
| commercial POST /payment-certificates/:id/void (`commercial:create`, override not registered) | owner, admin, finance_manager | `owner_ceo`, `coo`, `commercial_manager`, `contracts_manager`, `quantity_surveyor` (all hold commercial create) | Voiding a certified payment certificate is a money-destroying action; also the action override is missing (it is judged `create`, not `void`). Needs a decision on both the role set and whether to add the override. |
| users PUT /:id (`users:edit`) | owner, admin | `owner_ceo`, `coo`, `hr_manager` (all hold users edit per 0031:545) | Account administration: the owner may deliberately want user edits restricted beyond the grant mirror. |
| users POST /preview/:role (`users:create`) | owner, admin | `owner_ceo`, `coo` | Preview-as-role is an admin demo tool; extending it to owner_ceo/coo is a product choice. |
| payroll POST / (`payroll:create`) | owner, admin, finance_manager | `hr_manager` (holds payroll create, 0031:544) | Creating payroll runs releases money; HR-manager approval may be wanted as maker/checker separation, or not. |
| organizations POST /company (`organizations:create`) | owner, admin | `owner_ceo`, `coo`, `hr_manager` | Company profile creation is tenant-level; likely intentional for list `/` and `/:id` (which name manager roles) to differ. |
| organizations bank-accounts create/edit/make-primary | owner, admin, owner_ceo, coo, finance_manager, accountant_ap | missing `hr_manager` (holds organizations create/edit) — and `accountant_ap` is declared without any `organizations` grant | Bank account administration interacts with payroll/payments; owner call on hr_manager. |
| organizations POST /performance-scores | owner, admin, owner_ceo, coo, commercial_manager | missing `hr_manager` | Scores are HR commercial data; owner call. |
| schedule POST /activities/:id/progress, /assignments, /activities/import | owner, admin, project_manager, planning | `planning_engineer` (applied) — no other role holds `schedule:create` | Only planning_engineer held the create grants, so the applied change covers the whole class. |
| site POST /:projectId/instructions/:id/:action(acknowledge\|implement\|close) | (no list; policy-driven) | `construction_manager`, `site_manager`, `site_engineer` already unblocked by the policy-only call | Listed for completeness: the odd empty declared list means policy grant alone decides — not a blocked route. |
| doccontrol POST /documents/:id/:action(approve\|reject) | (no list) | policy alone | Same note. |

Every other write route in the 40-with-list set is a legacy-only list with no canonical
holder missing under the exact-grant rule (consultant recommendation endpoints, client
portal, portal, delegations, team, organizations departments/job-positions, hr/users
DELETE): their missing lists are empty in the parsed grant data, and their
declared-role/no-grant rows are inert.

## Notes

Legacy keys kept on the schedule routes: `owner`, `admin`, `project_manager`. The dead key
`planning` was replaced because no role is named `planning` in the roles tables (0006,
0031); planning engineers were only reachable through the policy grant while the coarse
list still denied every route for them.
