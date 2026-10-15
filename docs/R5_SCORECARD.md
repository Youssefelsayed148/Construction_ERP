# R5 Missing Screens and Frontend Resilience Scorecard

Status: **R5.0-R5.6 complete.** All required automated exit gates passed on 2026-10-15. No R5 migration was added.

## Screens

The ten requested work areas share the permission-aware `/admin/:area` route and one workspace component. The screen tests exercise each area’s rendered list route; shared interaction tests cover permission denial, organization validation/create/server failure, and API-token one-time display. The existing test environment has no React Testing Library, and no dependency was added.

| Screen | Route | Permission | Tests | Commit |
|---|---|---|---|---|
| Organizations | `/admin/organizations` | Owner, admin, owner CEO, COO; organization module/view grant | `AdminWorkspace.test.js`: renders; organization required-field validation, create, typed server failure; permission denial | `b5a90f5` |
| Users and existing roles | `/admin/users` | Owner/admin; users module/view grant | `AdminWorkspace.test.js`: list route render and role/module access checks; no create/role-definition API exists | `b5a90f5` |
| Delegations | `/admin/delegations` | Owner, admin, owner CEO, COO, with backend self/authority checks | `AdminWorkspace.test.js`: list route render; shared permission-denied coverage | `b5a90f5` |
| Approval limits | `/admin/approval-limits` | Owner/admin; approvals module/view grant | `AdminWorkspace.test.js`: list route render; shared permission-denied coverage | `b5a90f5` |
| Inventory documents | `/admin/inventory-documents` | Owner, admin, storekeeper, site supervisor; backend project/warehouse scope | `AdminWorkspace.test.js`: list route render; shared permission-denied coverage | `b5a90f5` |
| Variations | `/admin/variations?project_id=:id` | Owner, admin, project manager, engineer; project commercial authorization | `AdminWorkspace.test.js`: list route render and required project context | `b5a90f5` |
| Claim SLA | `/admin/sla?project_id=:id` | Owner, admin, project manager, consultant, client; project claim scope | `AdminWorkspace.test.js`: list route render and required project context; read-only SLA API | `b5a90f5` |
| Webhooks and API tokens | `/admin/webhooks`, `/admin/api-tokens` | Owner/admin; integrations or agents module/view grant | `AdminWorkspace.test.js`: both list renders; API token creation secret is shown once and cleared on dismiss | `b5a90f5` |
| Numbering sequences | `/admin/numbering?project_id=:id` | Owner, admin, project manager; project doc-control authorization | `AdminWorkspace.test.js`: list route render and required project context | `b5a90f5` |
| Replenishment | `/admin/replenishment` | Owner, admin, storekeeper, purchasing manager; materials module/view grant | `AdminWorkspace.test.js`: list route render; shared permission-denied coverage | `b5a90f5` |
| Existing paginated lists | See `docs/R4_PAGINATION_UI_IMPACT.md` | Existing module permissions and backend project scopes | Frontend CI; API client total-count test; existing page suites, including project operations and portal dashboard | `e5d7f9e`, `9c7dc27` |

Backend capabilities constrain supported actions: no user creation or role-definition CRUD; delegations support create/deactivate; approval limits support list/upsert; SLA is read-only; numbering is project-scoped read/update. No UI operation was added beyond the backend contract.

## API client guard

| Measure | R5 baseline | R5 exit |
|---|---:|---:|
| Direct `fetch` call sites | 61 across 41 files | 1 internal call in `services/apiClient.js` |
| Axios references | 0 | 0 |
| Guard | Added with ratcheting baseline | PASS: 1/1 call site, 1 file |

## Exit gates

| Gate | Result |
|---|---|
| Backend mock | PASS: 65/65 suites, 1,084/1,084 tests |
| Full PostgreSQL | PASS: 84/84 suites, 1,896/1,896 tests, 130 migrations; disposable container removed |
| Backend `lint:guards` | PASS |
| Frontend `lint:api` | PASS: 1/1 direct API call |
| Frontend CI | PASS: 36/36 suites, 169/169 tests |
| i18n check | PASS |
| i18n parity | PASS: 36 namespaces, 1,432 English keys |
| Production build | PASS |
| Golden reconciliation | PASS: 16/16 checks, zero violations, 130 migrations; disposable container removed |

## Not verified and waiting decisions

- Visual layout, RTL appearance, and real-browser behavior are **NOT VERIFIED**; no browser check was run.
- React Testing Library is not installed. Tests use the repository’s existing React DOM harness; the screen-specific interaction tests cover the shared organization form and API-token secret flow, while each admin area has a parameterized route render test.
- R5.5 trial balance remains unimplemented pending owner direction. No trial-balance HTTP endpoint exists. Proposal recorded in `STATE.md`: add a read-only, company/project-scoped view using aggregate SQL over existing journal data; confirm desired filters and output before any endpoint is built.
- R4 limitations remain as documented in `docs/R4_SCORECARD.md`: full-application c=50 scrypt performance was not measured, and Windows OS-level SIGTERM delivery is unverified.
