# Construction ERP: Closeout Plan (Full Spec Parity)

Date: 2026-10-02
Scope: close every Critical/High finding from the four audits, deliver the spec gaps, and reach a GO verdict.
Basis: static audits (integrity/sync/tests/mobile, security/API/MCP, spec-vs-implementation). Nothing was run, so every phase starts by confirming its findings in code before fixing them.

Current verdict: NO-GO (per docs/audit/PHASES_09_18_REVIEW.md, blockers still open).

---

## 0. Ground rules

- One phase = one branch = one PR series. No phase starts until the previous phase's exit gate is green, except where the dependency map says parallel is safe.
- Every fix ships with a test that fails before and passes after. Concurrency and constraint fixes need tests on real Postgres, not mock-db.
- Money is stored as DECIMAL; stop doing arithmetic in JS floats on money paths (use integer minor units or a decimal library in the new code).
- Migrations are forward-only, versioned, transactional. No new `.catch(() => {})`.
- Soft-delete is the default for anything financial, procurement, or contractual.
- Out of scope: new product ideas. Only spec items and audit findings.

## 1. Phase map and dependencies

| # | Phase | Depends on | Parallel with | Est. effort |
|---|-------|-----------|---------------|-------------|
| 0 | Baseline, docs truth, CI gates | none | none | 2-3 days |
| 1 | Security blockers | 0 | 2 | 8-10 days |
| 2 | Data integrity foundation | 0 | 1 | 10-12 days |
| 3 | Cost and cross-module sync | 2 | 4 | 8-10 days |
| 4 | Test infrastructure (real PG, concurrency, golden skeleton) | 0 (grows with 2, 3) | 3 | 6-8 days |
| 5 | Data-model and backend spec gaps | 2 | 6 | 15-20 days |
| 6 | Admin and configuration UIs, missing module screens | 1, 5, 10 (L1-L3) | 5 | 15-20 days |
| 7 | Mobile, RTL, offline | 0 | 5, 6 | 8-10 days |
| 8 | Commercial, finance, planning engines | 3, 5 | 6, 7 | 10-12 days |
| 9 | Demo seed and golden E2E | 3, 5, 6, 8 | none | 5-7 days |
| 10 | System-wide localization (EN/AR) | L1-L3 after 0; L4-L9 follow 5/6 screens | 1-9 (L1-L3 first) | about 4 weeks (6-8 if all inline branches are migrated) |
| 11 | Rollout, reconciliation, go/no-go | all | none | 5 days |

Rough total: 14-18 weeks for one engineer with AI coding agents; compress by running parallel tracks (Security + Integrity, then Backend gaps + UI + Mobile).

---

## Phase 0: Baseline, docs truth, CI gates

Goal: stop working from stale documents and make regressions visible.

Tasks
- [x] Replace IMPLEMENTATION_STATUS.md and docs/audit/GAP_ANALYSIS.md with a current status doc generated from this plan. (docs/IMPLEMENTATION_STATUS.md; old files in docs/legacy/)
- [x] Mark SYSTEM_TEST_REPORT.md and the root *.ps1 scripts as legacy (18 modules, pre-Phase 8); move to `docs/legacy/`.
- [x] Commit the localization plan into docs/system_language_fix.md (currently empty and untracked); it is the source for Phase 10.
- [x] Add a CI job that fails on new `.catch(() => {})` in migrations and on new `COUNT(*)+1` numbering (grep-based lint).
- [x] Add a CI job that runs backend tests against real Postgres 16 (already used for migrate; extend to a `test:pg` suite).
- [x] Tracking board: by decision the checklist in this file is the board; `scripts/plan-to-issues.js` stays a dry run.
- [x] Backend Dockerfile: add a build-stage test step (or enforce CI before image build).

Exit gate: CI has three green gates (mock-db jest, real-PG jest, build+Playwright); status doc matches reality.

---

## Phase 1: Security blockers

Goal: no credential or role can do more than it was issued for.

1.1 Token typing (Critical)
- [x] Separate signing secrets per token type: internal session, v1 access, v1 refresh, preview.
- [x] Every verifier enforces `iss`, `aud`, `kind`. Refresh tokens never authenticate API calls. Preview tokens are read-only on `/api/*`, `/api/v1` and `/api/mcp`.
- [x] Fix refresh TTL bug (`parseInt('30 * 24 * 3600')` yields 30 seconds, oauthService.js:39): parse a numeric env var or a constant.
- [x] Session JWT: shorten from 7 days, add revocation (token version on user row or denylist), invalidate on password change, audit password change.
- Tests (done, real PG + real app: `token-typing.pg.test.js`, `tokens.test.js`): scoped token on internal route is 401; refresh token as bearer is 401; preview token cannot write via v1/MCP.

1.2 Remove fail-open paths (Critical)
- [x] `authorize()` legacy path: users with no `user_project_roles` rows are denied (or forced through the migration), not allowed.
- [x] `apiResources.js` single-record reads: remove the `source==='legacy'` skip.
- [x] `agentPolicy.js` unknown roles get no tools by default.
- [x] `PUT /api/users/:id` role change syncs `user_project_roles` (old role's rows replaced by the new role's company-wide row; external roles get none), bumps `token_version`, accepts every key in `roles`, audits `role_change`, and only an owner can grant or change `owner`.
- Test (done, real PG: `fail-closed.pg.test.js`): user with zero role rows is denied on hr, payroll, suppliers, items, legal, expenses, projects, schedule. Role changes: `role-sync.pg.test.js`.

1.3 Record scoping (Critical)
- [ ] Rework `policy.recordScopeRule` to key on resource and id, not on `req.route.path`, so it works under `/api/v1/*` and MCP synthetic requests.
- [ ] Add project filters to UPDATE/DELETE in projects.js (phase PUT :295, milestone PUT :361, DELETE :371) and subcontractors.js (`/certificates/:id`, `/verifications/:id`); add their RECORD_SCOPE_RULES.
- [ ] Fix the `agents` scope-rule key vs the `/api/agent` mount.
- [ ] Scope the project list (projects.js:21-49) so project-bound users do not see other projects' budget and contract value.
- Test matrix: project-bound user A against project B's records, across internal, v1 and MCP, for read, update, delete and transition.

1.4 Approval gate and agent safety (Critical/High)
- [ ] `decideRequest`: atomic `UPDATE ... WHERE decision IS NULL RETURNING`, execute only on a returned row.
- [ ] Require approver != requester, approver project authority, and monetary limits per spec 21.
- [ ] Enforce v1 scopes in `mcpService.callTool/executeTool` and on `/api/v1/assistants/*` and v1-only lists.
- [ ] Validate tool args against schema (required fields, `additionalProperties:false`).
- [ ] Rate limit `/api/mcp`; cap JSON-RPC batch size; stop trusting the client `session id` header.
- [ ] Mark record text as untrusted content in tool output; make draft tools that notify or complete work (`assign_action`, `complete_action_with_evidence`) require evidence/gating.
- [ ] Replace key-name redaction with an allow-list per role; apply `see_client_value` and `see_subcontract_value`; redact before logging.
- [ ] Align gated tool names with the catalog (`void_financial_record`, `change_authority_rules`).

1.5 Webhooks (High)
- [ ] SSRF guard: block private/loopback/link-local ranges, resolve-then-pin IP, disable redirects.
- [ ] Never return secrets from GET; hash or encrypt at rest; show once on creation.
- [ ] Fix wildcard subscriptions (`rfi.*` etc.) with a pattern matcher on the bus.
- [ ] Add project filter per hook; add an outbox table with retry and dispatch tracking.

1.6 Medium items
- [ ] Reports: whitelist columns server-side, authorize on `spec.module`, remove arbitrary column filters, neutralise CSV formula prefixes (`= + - @`).
- [ ] Media access: visibility/approval filter for client and consultant photos; validate `file_url` ownership.
- [ ] Uploads: magic-byte validation, size limits, remove zip/doc/xlsx unless justified, queue for AV scan.
- [ ] Auth hygiene: constant-time login path, no disabled-account disclosure before password check, bcrypt cost 12, lockout, MFA design stub; prevent demoting or deactivating the last owner.
- [ ] Rate limiting: set `TRUST_PROXY` correctly; keyed limiter after v1 authentication; store in Redis or Postgres for multi-replica.
- [ ] Error leakage: central error handler returns generic messages plus correlation id; log details server-side (replace ~483 `error: e.message`). Use the stable error-code contract from Phase 10 L7 so security and localization share one change.
- [ ] Audit: make `logActivity` fail loudly in transactions, add before/after, IP, request id, log denials; cover boq, subcontractors, portal, actions, documents mutations.
- [ ] `x-powered-by` off; validate `CORS_EXTRA_ORIGINS`.

Exit gate: security test suite (token, scope, IDOR, approval race, SSRF) green on real PG; external review checklist signed.

---

## Phase 2: Data integrity foundation

Goal: the database refuses to be wrong.

2.1 Migrations system
- [x] Add `schema_migrations` version table; run each migration in a transaction; record checksum.
- [x] Remove silent `.catch(() => {})`; make failures fatal. (19 removed from migrate-1.3/1.4/2.1/11/12/13; migrate-8 had none)
- [x] Fix hse-migration.js:262-287 (copy, DROP TABLE, CREATE VIEW) into one transaction.
- [x] `setval` after every explicit-id insert and after db_dump init; resolve the docker-compose `db_dump/` init conflict with the migrator.
- [x] migrate-39: backfill `project_id` for legal_documents, maintenance_reminders, agent_action_requests so existing rows are visible to scoped users. (reminders and agent requests done in `0001_backfill_project_scope.sql`; legal_documents has nothing to derive a project from and stays company-wide)
- [x] Review the silent column drops in migrate-12 and migrate-15.

2.2 Inventory atomicity
- [ ] Wrap all warehouses.js movement/reservation routes (:110,141,175,342,367) in `transaction()`.
- [ ] `createMovement`: take a row lock or advisory lock on (warehouse, material) before the availability check; make the projection update incremental inside the same transaction.
- [ ] Add `CHECK (quantity >= 0)` on warehouse_stock; lock reservations; scope `rebuildWarehouseStock` to the affected pairs (stop reading every reservation and the full ledger).
- [ ] Add valuation columns to stock_movements (unit cost, total) and make issue cost server-derived (weighted average), not client-supplied (`work_order_materials.unit_cost`).
- Test: N concurrent issues against limited stock; stock never goes negative; crash between insert and projection leaves consistent state.

2.3 Procurement locking
- [ ] `createDelivery`: lock PO lines (`FOR UPDATE`), enforce `delivered <= ordered + tolerance` in code and via CHECK.
- [ ] `decideMir`: atomic status transition (`UPDATE ... WHERE status='pending'`).
- [ ] `createSupplierReturn`: validate against GRN accepted quantity and decrement it.
- [ ] `threeWayMatch`: query by PO/GRN id, not `SELECT *` + JS filter.

2.4 Document numbering
- [x] One numbering service (`services/numbering.js`) with an atomic counter (`UPDATE ... RETURNING`, `INSERT ... ON CONFLICT DO UPDATE`), per NUMBERING_STANDARD.md. Backed by new table `document_counters`, which is the only counter: `numbering_sequences` (cannot key on year/prefix; UNIQUE(project_id, entity) does not hold for NULL project) and `document_number_sequences` are no longer incremented.
- [x] Replace all COUNT/MAX call sites; `backend/lint-guards.baseline.json` (`count-numbering`, 3-line window) is the authority and must end empty. The list that follows is only a starting point.
- [x] (starting point) Replace all ~15 COUNT/MAX call sites (procurementService:49, replenishment:283/310, invoices:97, units:31, boq:27/102, hr, suppliers, projects:210, qhse:126, hse:594, doccontrol, financeEngine:134).
- [x] Single invoice creation path (invoices.js and units.js currently duplicate it).
- [x] Journal entry numbers via the same service.
- [x] Document control (`doccontrolEngine`, PREFIX-DISCIPLINE-TYPE-SEQ-REV) allocates SEQ through `document_counters` (it did read, JS +1, write). Migration 0005 copies the old per-scope values, drops the dead `numbering_sequences.next_value`, and the default `project_numbering_settings` insert is now `ON CONFLICT DO NOTHING`.
- [x] Guard rule `counter-rmw` flags read-then-write counters (`row.seq + 1`, `SET seq = $1`).
- Test (done, real PG): 50 concurrent creates, no duplicates, no reuse after deletes; 50 concurrent document registrations (`doccontrol-numbering.pg.test.js`).

2.5 Delete semantics
- [ ] Change 171 `ON DELETE CASCADE`: financial, procurement, contractual and handover tables become RESTRICT; add `deleted_at`/`deleted_by` soft-delete.
- [ ] Convert hard-delete routes (items.js:212, suppliers.js:138, payments.js:123, invoices.js:166) to soft-delete or void-with-reason.
- [ ] 135 `REFERENCES users` with no ON DELETE: define policy (RESTRICT plus deactivate-only users).
- [ ] stock_movements immutability: ensure parent delete is blocked cleanly rather than raising a trigger error.

2.6 Constraints
- [ ] Add CHECKs: PO line qty > 0, delivered <= ordered (+tolerance), invoice amount > 0, status enums on all workflow tables, non-negative money where applicable.
- [ ] Unify money columns (NUMERIC(14,2) vs DECIMAL(15,2)) to one standard.
- [ ] Partial UNIQUE index on pending approvals (module_name, request_id, request_type); UNIQUE one-current-revision on doc revisions.
- [ ] Remove the legacy single `material_id` on PR/PO headers and the try/catch fallbacks for missing line tables.

2.7 Journal / GL
- [ ] `utils/journal.js` runs inside the caller's transaction and throws on failure.
- [ ] Account ids come from configuration (chart of accounts), not hard-coded 1/8/9/10; real `createdBy`.
- [ ] Post client invoices, payments and supplier invoices to the ledger, with balanced-entry checks.

2.8 Approvals
- [ ] Insert `approval_requests` and start the workflow in one transaction.
- [ ] Lock in `recordLegacyDecision`; plan retirement of the legacy approval system (see Phase 8 note) with parity script until removed.

Exit gate: reconcile-database.js expanded (see Phase 11) passes on a copy of production-like data; concurrency suite green.

---

## Phase 3: Cost and cross-module sync

Goal: one truthful chain, from requirement to cost.

3.1 Cost posting
- [ ] Post to `project_costs` (idempotent, same transaction) from: material issue, GRN accepted, supplier invoice approved, expenses, payroll allocation, supplier payment allocation. Define which event is the accrual point per type, to avoid double counting between GRN and invoice.
- [ ] `UNIQUE (source_type, source_id)` on project_costs.
- [ ] Dashboards, commercialEngine and costing read one cost view; remove the 20 `.catch(() => ({rows:[]}))` guards that turn failures into zeros.

3.2 Events
- [ ] Introduce an outbox table; write events in the same transaction as the change; a dispatcher delivers after commit with `dispatched_at` and retry (generalise what eventDispatcher does for its 9 events).
- [ ] costEventListener consumes from the outbox: idempotent, with catch-up after restart.
- [ ] Fix mismatches: `rfi.created` vs `rfi.submitted`; `invoice.overdue` actually emitted; module `purchase_orders` mapped to `purchase_requisition.*` naming.
- [ ] Add routes for unrouted events: purchase_order.issued, delivery.received, payment.received, invoice.created, variation.approved, handover.advanced, permit.*, wir.submitted, instruction.*, mir.*, transmittal.*.
- [ ] fireEvent never emits before commit and never swallows errors silently.

3.3 Replenishment to procurement
- [ ] Replenishment creates a PR (not a PO) through the PR workflow; carries project_id and material; respects project stock; uses the shared numbering service.
- [ ] Add PR location, cost code and work package; implement the budget-check step in the PR workflow.

3.4 Progress single source of truth
- [ ] Derive `projects.completion_percentage` from weighted schedule/quantity progress (quantityEngine policies); manual override only with permission and audit.
- [ ] Site daily-report measurements push to measurements, schedule activities and project progress.
- [ ] Schedule percent recomputes on measurement changes, not only on explicit PUT.
- [ ] Dashboard PM progress uses the weighted figure.

3.5 Background jobs
- [ ] Leader lock (Postgres advisory lock) for the five setInterval sweeps (escalation, finance, HSE, replenishment, webhooks), or move to a job table; safe under multiple replicas.

Exit gate: golden-chain skeleton test (Phase 4) shows requirement -> PR -> PO -> GRN -> invoice -> payment -> cost, with totals reconciled.

---

## Phase 4: Test infrastructure

Goal: tests that can actually fail on the problems found.

- [ ] Real-PG test harness (testcontainers or CI service): migrate once, transaction-per-test or schema-per-suite.
- [ ] Port critical suites from mock-db to real PG: inventory, finance, procurement, workflow-engine, policy. Keep mock-db for fast unit-level tests only.
- [ ] Concurrency suite: stock issue race, double MIR decision, double approval, numbering collisions, duplicate delivery, idempotent cost posting.
- [ ] Constraint tests: negative stock, over-delivery, FK RESTRICT, duplicate pending approval.
- [ ] API contract tests: OpenAPI spec vs live responses for `/api/v1`.
- [ ] Permission matrix tests: every role x module x action against the seeded policy, including MCP.
- [ ] Navigation visibility tests: for every role, the project page shows exactly the groups in the Phase 6 matrix, and a hidden group's API returns 403 for that role.
- [ ] Reconciliation assertions on real data (see Phase 11).
- [ ] Frontend: component tests for forms and tables; empty-state and error-state tests for each screen.
- [ ] Playwright: real-backend journeys (not API-mocked), at desktop and mobile viewports, Arabic and English.
- [ ] Load test: k6 or autocannon on dashboards, list endpoints, three-way match, replenishment sweep.
- [ ] Portal acceptance: forbidden financial field per portal, mobile viewport per portal.

Exit gate: each of spec 26's 12 layers has at least one automated test in CI.

---

## Phase 5: Data-model and backend spec gaps

About 35 of ~190 spec entities have no table. Deliver in vertical slices; each slice = migration, service, routes, tests.

5.1 Organization and RBAC (spec 03, 04)
- Tables: Company, Department, JobPosition, Delegation, OrgQualification, OrgBankAccount, OrgPerformanceScore.
- [ ] Organization CRUD routes (currently read-only in v1.js:525); users POST and DELETE (soft).
- [ ] Seed the full role set from spec 04. Today there are 16 roles (12 legacy internal roles that all hold a blanket `('*','*')` grant, plus 4 external). Spec 04 defines 24 internal and 9 external roles:
  - Internal: Owner/CEO, COO, Projects Director, Construction Manager, Project Manager, Site Manager, Site Engineer, Planning Engineer, Technical Office Engineer, Quantity Surveyor, Commercial Manager, Contracts Manager, Procurement Manager, Procurement Officer, Finance Manager/CFO, Accountant AR, Accountant AP, Storekeeper, QA/QC Manager/Engineer, HSE Manager/Officer, Document Controller, Equipment/Plant Manager, HR, Business Development/Tendering.
  - External: Client Executive, Client Reviewer, PMC/Construction Manager, Consultant Coordinator, Consultant Discipline Reviewer, Subcontractor Manager, Subcontractor Site Engineer, Supplier Sales/Operations, Testing Lab.
  - Map the legacy keys (`admin`, `manager`, `staff`, `accountant`, `engineer`, `site_supervisor`, `purchasing_mgr`, `finance_manager`, `legal_mgr`, `maintenance_mgr`) to the new roles in a migration, keeping a compatibility alias until all users are moved.
- [ ] Authorization formula to implement: Company scope + Project membership + Organization relation + Role + Module policy + Record policy + Action policy.
- [ ] Action permissions (22 minimum): view, create, edit, submit, assign, review, approve, reject, return, close, reopen, cancel/void, export, download, upload, see_internal_cost, see_client_value, see_subcontract_value, see_supplier_value, issue_financial_document, record_payment, manage_permissions. Replace the blanket `('*','*')` for internal roles with real per-module grants of these actions.
- [ ] External portal isolation tests (mandatory per spec 04): consultant cannot reach internal budget endpoints; client cannot see supplier/subcontractor rates unless permitted; subcontractor cannot see another subcontractor's commercial records; supplier cannot see other suppliers' quotations; external users cannot enumerate unassigned projects; MCP tools return the same authorization result as UI/API.
- [ ] Team assignment inherits access: role-template grants, notification subscriptions, expiry, revoke on removal (6-point inheritance outside the wizard).
- [ ] Delegation of authority with dates and limits (feeds approval limits from Phase 1.4).

5.2 Project setup (spec 05, 06)
- Tables: ProjectSetting, ProjectCalendar, WorkPackage links (location, BOQ, activity, participant).
- [ ] Fix wizard advance payment bug (ProjectWizard.js:141: percentage sent as amount); remove "stubbed" workflow comment and verify workflows are real.
- [ ] Wizard atomic list: add role assignments and default reports.
- [ ] WBS and work-package routes; link ITP, WIR, schedule and BOQ to work_packages by FK instead of free text.

5.3 Materials and inventory (spec 07)
- Tables: StockLot, unit-conversion table; material issue/return/adjustment as first-class documents referencing stock_movements.
- [ ] Lot tracking, batch and expiry; implement the expiry alert (currently a no-op).
- [ ] Replenishment endpoints: alerts list, policy/mode config, manual sweep.
- [ ] Single "open procurement requirement" formula.

5.4 Procurement (spec 08)
- [ ] Award recommendation as a real entity with approval; vendor-performance and spend-by-category/project queries.
- [ ] PR/PO update and cancel; RFQ list and GET by id.

5.5 Commercial and finance (spec 09, 10)
- Tables: ContractParty, Guarantee, Insurance, PaymentApplication, InvoiceLine, CurrencyRate, BudgetVersion/Line, ForecastVersion/Line, credit note, payment batch, maker/checker, bank accounts.
- [ ] Variation fields: cause, responsibility, linked RFI/instruction, days impact, submitted/recommended/approved split.
- [ ] Budget, forecast and commitment-adjust endpoints.
- [ ] Start the seeded `payment_certificate` and `supplier_subcontract_invoice` workflows.

5.6 Site, consultant, client, portals (spec 11-14)
- Tables: DailyReport child tables (manpower, equipment, work, issues), ObservationAttachment, SubmittalReview, ActivityProgressUpdate, ActionComment.
- [ ] Observations: due date, reference drawing, before/after photo link.
- [ ] Consultant endpoints: site visit, WIR/MIR inspect, issue instruction, recommend variation/certificate; WIR pending reads the formal `wirs` table; review SLA due dates in the inbox.
- [ ] Retire legacy single-answer RFI/submittal responses (doccontrol.js:256,273,329) in favour of the staged flow.
- [ ] Client actions: variation approve/respond, document acknowledge; multi-project and expired-assignment handling.
- [ ] Portals: formal registers for WIR/MIR, manpower, equipment, NCR/observation response, variation quote (not just portal_submissions); supplier expiring-compliance documents.

5.7 QA/QC, HSE, doc control, planning, handover (spec 15-19)
- [ ] Merge the two incident registers (qhse.js legacy `safety_incidents` vs hse.js `incidents`) with a migration and a compatibility view.
- [ ] Certificate register, safety observation.
- [ ] DocumentDistribution, DrawingRegisterItem; RFI location, work package, cost and schedule impact fields.
- [ ] Schedule entity and progress-update table; resource assignment.
- [ ] Handover: AssetDocument, standalone Warranty table, real file upload for package items and asset details.

5.8 Platform
- Tables: OutboxEvent (Phase 3), APIToken, AgentSession, action comments.
- [ ] Notification channels: real email (add nodemailer or provider), push, SMS and WhatsApp adapters behind a provider interface; remove console-only stubs.

---

## Phase 6: Admin, configuration and missing module screens

Goal: everything the backend does has a usable screen. Replace all `prompt()` calls (portal ~41, others ~40) with real forms.

Rule: every new screen uses translation keys from the Phase 10 catalog and the shared enum/format helpers from day one. No inline `locale === 'ar'` branches and no raw enum rendering; CI enforces this once Phase 10 L2 is in.

- [ ] Shared form kit: validated modal forms, file upload, confirm dialogs, toasts (build once, reuse everywhere).
- [ ] Admin: Organizations, Users, Roles and permissions matrix, Delegations, Settings (currently a literal placeholder in App.js:106), Workflow template editor, Replenishment policy, Numbering config, Notification rules, Webhooks and API tokens.
- [ ] Project: WBS and work packages, team with role templates, project settings and calendars.
- [ ] Project page restructure and role-based navigation (spec 30: "navigation derives from role and project permissions"):
  - Today `ProjectDetail.js` shows 13 hard-coded module links to every internal role with no role check, and internal roles all hold `('*','*')`, so permission-driven filtering shows everything until Phase 5.1 grants are real.
  - Replace the 13 links with 6 groups, each with sub-tabs: **Overview** (default: summary cards, phases, milestones, team, "needs attention" list), **Scope & Planning** (BOQ, Locations & Quantities, Schedule), **Site & Quality** (Site Management, Site Workspace, Work Orders, QHSE, HSE; merged by Phase 5.7), **Procurement & Cost** (Materials & Commercial; PR/PO/GRN, variations, invoices as they land), **Documents & Reports**, **Handover & Sales** (Units & Sales only for project types that sell units).
  - One visibility map (role -> groups and sub-tabs) kept in a single module, with a permission-driven path once Phase 5.1 grants exist. The sidebar already filters by `roles` and `policy_modules`; reuse that mechanism rather than adding a second one. Hiding a tab is presentation only; the backend policy stays the enforcement point (Phase 1).
  - Keep existing sub-page URLs working. Tab badges show counts (open actions, NCRs, pending approvals) instead of adding tabs.
  - Move edit, add phase and add member actions into Overview; add the spec 30 record layout (timeline/audit, files/comments, related records).
  - Proposed role -> group matrix (to confirm with the owner; external roles use portals, not this page):

| Role | Overview | Scope & Planning | Site & Quality | Procurement & Cost | Documents & Reports | Handover & Sales |
|---|---|---|---|---|---|---|
| Owner/CEO, COO, Projects Director, Project Manager | yes | yes | yes | yes | yes | yes |
| Construction Manager | yes | yes | yes | yes (no finance) | yes | handover only |
| Site Manager | yes | schedule, locations | yes | no | yes | no |
| Site Engineer | yes | locations & quantities | yes | no | yes | no |
| Planning Engineer | yes | yes | no | no | yes | no |
| Technical Office Engineer | yes | yes | RFI/WIR/ITP | no | yes | no |
| Quantity Surveyor | yes | yes | no | yes | reports | no |
| Commercial / Contracts Manager | yes | BOQ | no | yes | yes | no |
| Procurement Manager / Officer | yes | no | no | procurement | yes | no |
| Finance Manager/CFO | yes | no | no | yes | reports | sales |
| Accountant AR | yes | no | no | invoices | reports | sales |
| Accountant AP | yes | no | no | supplier invoices | reports | no |
| Storekeeper | yes | no | no | inventory only | no | no |
| QA/QC Manager/Engineer | yes | no | quality | no | yes | handover (snags) |
| HSE Manager/Officer | yes | no | HSE | no | yes | no |
| Document Controller | yes | no | no | no | yes | no |
| Equipment/Plant Manager | yes | no | equipment | equipment | no | no |
| HR, Business Development | team only | no | no | no | no | no |
- [ ] Procurement: PR, RFQ, quotation entry, bid comparison (extend ProcurementReview), PO, deliveries, MIR (no UI today), GRN, returns, supplier invoices, three-way match, vendor performance.
- [ ] Inventory: recipes, requirements, reservations, replenishment alerts, lots and expiry.
- [ ] Commercial: contracts, variations (full form), budget, forecast, commitments.
- [ ] Finance: AP review queue, cash flow, valuations with certified-quantity pull, payment batches.
- [ ] Portals: replace `prompt()` flows with real forms and per-portal registers.
- [ ] Handover: file upload, asset form, warranty register.
- [ ] Dashboards: role dashboards beyond count tiles (weighted progress, project-scoped low stock, vendor spend, EAC).
- [ ] Single incident screen after the Phase 5.7 merge.

Exit gate: every spec screen reachable from navigation; no `prompt()` left; empty/error/loading states tested.

---

## Phase 7: Mobile, RTL and offline

7.1 Offline (spec 30 requires it)
- [ ] Web manifest and service worker (app shell cache).
- [ ] IndexedDB queue for site posts: photos, measurements, daily reports, with idempotency keys, retry, conflict display and a visible sync status.
- [ ] Bundle fonts locally (IBM Plex Arabic) so the app works offline; adjust nginx CSP.

7.2 Responsive
- [ ] Replace the 97 inline `gridTemplateColumns` with responsive CSS classes/utilities.
- [ ] Wrap every `<table>` (about 71 across 27 files) in `.table-container`; priority: HSE, QHSE, DocControl.
- [ ] Touch targets: raise `btn-sm` and icon buttons on site screens to 44px; minimum 14px text on forms.
- [ ] Mobile viewport Playwright test per major screen and per portal.

7.3 i18n and RTL
- [ ] Moved to Phase 10 (System-wide localization), which supersedes the earlier ternary-migration, formatter, logical-CSS and `index.html` direction items.

Exit gate: Lighthouse PWA pass; airplane-mode site journey passes in Playwright. (RTL/LTR visual snapshots are gated in Phase 10.)

---

## Phase 8: Commercial, finance and planning engines

- [ ] EAC: real forecast input per cost code (ForecastVersion), `EAC = actual + ETC` with ETC from forecast or remaining-commitment rules; fix the degenerate `max(committed - actual, 0)` logic; add the cash-contribution metric.
- [ ] Retention and advance: derive recovery from contract percentage and cap; manual override audited.
- [ ] Valuation: pull `gross_current_work` from certified quantities.
- [ ] Reminder tiers including pre-due (-7) and per-client rules.
- [ ] Earned value: enable SPI/CPI by default where baselines exist; resource-loaded planning.
- [ ] Decide and execute the retirement of the legacy approval system: migrate in-flight items, drop dual writes, remove `verify-approval-parity.js` once parity is proven.
- [ ] Remove duplicate surfaces: transition view, `payment_certificates` vs `sub_payment_certificates`.

Exit gate: commercial and finance numbers on the demo project match hand-calculated golden values.

---

## Phase 9: Demo seed and golden E2E

Spec 28 ("Osiris Residential Towers") is missing; the current seed is one "Nile Residential Tower" project.

- [ ] Seed: full organization set, users per role, project from the residential template, BOQ with C35 concrete and a recipe, schedule, suppliers, items and stock.
- [ ] Golden scenario (spec 26 / 28): tender -> contract -> project setup -> BOQ and locations -> material requirement from recipe -> replenishment -> PR -> RFQ -> award -> PO -> delivery -> MIR -> GRN -> supplier invoice -> payment -> site daily report and quantities -> WIR/NCR -> consultant observation -> variation -> client valuation -> invoice -> payment -> handover -> warranty claim.
- [ ] Assert at every step: stock, cost, progress, approvals, notifications, audit trail.
- [ ] Run the golden scenario as a Playwright journey (UI) and as an API test (fast).

Exit gate: golden journey green in CI on every merge to main.

---

## Phase 10: System-wide localization (EN/AR)

Source: docs/system_language_fix.md (its "Corrections and additions" section overrides the summary below where they differ). This is a localization program, not a page-by-page Arabic patch. Database and API values stay stable and untranslated; everything shown to the user is translated.

Target behavior
- Toggling EN/AR changes every mounted component immediately, with no reload.
- The choice persists across navigation, refresh and login/logout.
- `<html lang>` and `dir` switch between en/ltr and ar/rtl.
- Navigation, forms, dialogs, validation, API errors, statuses, dashboards and accessibility labels follow the selected language.
- Dates, numbers and currency use the matching locale.
- Arabic record fields are preferred in Arabic, with fallback to English.
- PDFs, CSV exports and generated reports follow the requested language.

Sequence: L0 -> L1 -> L2 -> L3 must come first (later translation work would otherwise rely on the broken non-reactive toggle). L1-L3 run beside Phases 0-2 and must finish before Phase 6 screens are built. Each sub-phase is a separate reviewable change.

L0 Localization contract and baseline
- [ ] Supported locales: `en` and `ar-EG`. Keep stored/API values `ar` and `en`; use `ar-EG` only for Intl formatting.
- [ ] Glossary for BOQ, RFI, WIR, MIR, NCR, JSA, HSE, QA/QC, procurement, retention, variation, snag/punch, handover, DLP, roles, workflow actions and financial terms; decide which acronyms stay Latin in Arabic.
- [ ] Content rules: UI labels and system text are translated; user-entered text is never auto-translated; IDs, document numbers, codes and route paths unchanged; database enums stay English machine identifiers.
- [ ] Baseline inventory: hard-coded English, inline `locale === 'ar'` branches, empty or missing namespaces, raw enums rendered to the UI, English server messages.
- [ ] Screenshots of principal routes in both languages.
- Deliverables: Arabic glossary, route/module checklist, machine-readable missing-key report, baseline screenshots.
- Exit: every visible text category has an explicit localization policy.

L1 Repair the global locale architecture
- [ ] Global `LocaleProvider` around the app; `useLocale()` consumes it instead of creating local state. Keep the interface (`locale`, `setLocale`, `t`, `isRTL`, `loading`).
- [ ] `setLocale()` rerenders the whole app; persist in localStorage; validate stored value and fall back safely.
- [ ] Set `lang` and `dir` before React renders (no LTR/RTL flash); optional cross-tab sync.
- [ ] Cached translation loading that exposes loading and failure states; interpolation and plural support instead of string concatenation.
- Files: hooks/useLocale.js, index.js, public/index.html, new i18n/ or context/LocaleContext.js.
- Tests: toggle from the sidebar updates a mounted page; toggle on Login updates Login; persistence after navigation and refresh; invalid stored locale; `lang`/`dir` always correct.
- Exit: no page reload to switch language.

L2 Translation catalog
- [ ] Namespaces (keep existing key names `workorders`, `subcontractors`, `costing`): common, auth, navigation, dashboard, projects, projectWizard, locations, boq, workorders, subcontractors, costing, site, inventory, procurement, commercial, finance, clients, suppliers, portals, qhse, hse, documentControl, schedule, reports, handover, actions, approvals, agents, hr, payroll, assets, expenses, legal, errors, enums.
- [ ] Semantic keys (`procurement.comparison.noQuotations`, `enums.status.pendingApproval`), never English-text keys.
- [ ] Fill EN and AR for every namespace; interpolation for project numbers, counts, dates and record ids.
- [ ] Recursive parity checker: every EN key in AR and vice versa; no missing namespace; empty namespace file fails.
- [ ] Missing keys visible in dev/test; safe fallback in production with no raw key paths.
- Exit: translation parity enforced in CI.

L3 Application shell
- [ ] Sidebar, portal navigation, Agent Activity and Procurement Comparison links (the English items in the Arabic sidebar), language and logout tooltips, user and role display, mobile nav aria-labels, offline banner, Settings placeholder, file-unavailable messages, generic loading/empty/error states, confirm dialogs and form actions.
- [ ] Translate role names for display, keep role codes; mirror directional icons (back/next) in RTL.
- Exit: shell has no unconditional English in Arabic mode.

L4 English-only expansion screens
- [ ] 4A Project Operations (ProjectOperations.js): title, tabs, table headings, commercial/financial metrics, empty states, procurement stage names, statuses, Arabic-first material and project names.
- [ ] 4B Procurement Comparison (ProcurementReview.js): nav entry, RFQ form, comparison columns, booleans, document buttons, recommendation and empty states, request/download errors.
- [ ] 4C Portals (PortalDashboard.js), all four variants (consultant, client, subcontractor, supplier): titles, widgets, fields, empty states, booleans, quick actions, all 39 prompts (replaced by real forms in Phase 6), preview controls, Action Center, My Reviews, dynamic API field names such as `open_rfqs`, backend setup notes.
- Exit: these routes have no hard-coded user-facing English except approved acronyms and user data.

L5 Partially localized modules
- [ ] QA/QC (ITP, WIR, punch, CAPA, mock-ups, calibration; severity, result, stage, status; placeholders, overdue, serial labels).
- [ ] HSE (permits, incidents, near misses, JSA, registers; categories, likelihood, severity, results).
- [ ] Document control (register, transmittals, correspondence; direction, purpose, type, revision, superseded).
- [ ] Schedule (activities, Gantt, CPM, lookaheads, baselines, S-curve, KPI labels, alerts, project-finish text).
- [ ] Reports (catalog controls, saved views, schedules, backend report titles and column labels).
- [ ] Handover (lifecycle stages, package and claim statuses, asset headings, document/PDF actions).
- [ ] Agent Activity (roles, risks, decisions, execution statuses, system-generated reasons).
- [ ] Core pages not listed above hold most of the ~1,093 inline `locale === 'ar'` branches (WorkOrders 86, HSE 81, ProjectDetail 74, ProjectDocuments 66, HR 66, QHSEExtended 65, QHSE 64, Invoices 57, Approvals 48, SiteManagement 46, UnitsSales 42, DocControlExtended 40, Suppliers, Clients, Assets, Login, wizard, BOQ, Items, Expenses, Payroll, Legal). Policy: per-file CI baseline that may only go down, block new inline branches, migrate pages when touched, schedule the largest files explicitly.
- [ ] Dashboard (role-widget titles, metric keys, alert values and scopes, Arabic-first entity names).
- Exit: no expansion module renders raw English enums or English-only controls in Arabic mode.

L6 Dynamic values and formatting helpers
- [ ] Shared helpers: `translateStatus/Role/Priority/Severity/EntityType/WorkflowAction`, `localizedName(record, locale, fields)`, `formatDate/DateTime/Number/Currency/Percent`.
- [ ] Send API values unchanged (`pending_approval`) and render through `enums.status.pendingApproval`; never `replaceAll('_', ' ')` as a translation.
- [ ] Name order: Arabic = `name_ar`, neutral, `name_en`; English = `name_en`, neutral, `name_ar`. Same for descriptions, titles, project and material names.
- [ ] Remove hard-coded `en-US` from shared formatters; `ar-EG` for Arabic; configurable Arabic-digit behavior; EGP / ج.م by locale.
- Exit: statuses and system values translate consistently; number and date formats follow the language.

L7 API errors, notifications and server content
- [ ] Error contract: add `error_code` and `error_params` next to the existing `error` string (about 482 responses use `{ success:false, error:"text" }`; changing `error` into an object breaks callers). Frontend maps `errors.inspectionNotFound` from the code. Keep the English string for logs and old clients.
- [ ] Compatibility layer for older endpoints during migration; map Joi validation errors to stable codes.
- [ ] System notification and action titles stored as key + params (+ optional rendered snapshot where history requires it); dashboard and portal contracts use keys, not English titles.
- [ ] Pass locale through `Accept-Language` or an explicit parameter where the server must render content (no handling exists today).
- [ ] Database-stored text: `roles.name`, seeded workflow/notification/document templates and report catalog titles need EN/AR values.
- [ ] Decide handling for native date/number inputs (they follow the browser locale); bundle the Arabic font locally for offline use.
- [ ] Do not translate user-entered titles and notes, supplier/client content, historical text, internal codes.
- Exit: errors and system messages render correctly in both languages without parsing English sentences.

L8 Reports, CSV and PDF
- [ ] Locale on report/export requests; EN/AR labels for catalog names, packs, columns, metadata, sections, empty states.
- [ ] CSV headers localized, UTF-8 BOM preserved.
- [ ] Spike first (decide before building): pdfkit with an Arabic font and shaping/bidi layer versus HTML-to-PDF with headless Chromium. The backend uses pdfkit, which as far as I know does not do RTL shaping by itself.
- [ ] Embed a licensed Arabic-capable font; Arabic shaping and RTL-aware alignment; handle mixed Arabic/Latin content such as document numbers; mirror table alignment.
- [ ] Localize procurement, QA/QC, HSE, handover and project documents; translate statuses inside exported rows; safe, predictable filenames separate from display names.
- PDF checks: connected glyphs, correct text order, readable numbers and codes, header/cell/footer alignment, multi-page font and direction, English PDFs unchanged.
- Exit: Arabic exports are readable Arabic documents, not English PDFs with a translated filename.

L9 RTL layout and accessibility
- [ ] Logical CSS properties (margin-inline-start, padding-inline, text-align: start) replacing physical left/right.
- [ ] Review drawers, tabs, tables, breadcrumbs, back buttons; mirror directional arrows only (not download, calendar, check); verify charts and timelines individually; test long Arabic labels on cards and narrow screens.
- [ ] Localize `aria-label`, `title`, image `alt`, screen-reader messages; keep labels associated with controls.
- [ ] Mixed-content direction: emails, URLs, document numbers and codes stay LTR; Arabic titles and descriptions follow RTL.
- Exit: supported pages work at desktop and mobile sizes with no clipped or reversed content.

L10 Automated coverage
- [ ] Unit: provider behavior, lookup and fallback, namespace parity, enum translation, entity-name selection, date/number/currency, error-code mapping.
- [ ] Integration: toggle while mounted, navigate after toggle, refresh restores locale, async translation loading, API errors in selected language, Arabic-first fields.
- [ ] E2E matrix, both languages, for owner/admin, project manager, site engineer, consultant, client, subcontractor, supplier and finance/procurement/QHSE roles.
- [ ] CI fails on: missing key, empty namespace, obvious hard-coded user-facing English in new JSX, raw status rendering, unmapped user-facing server error, export without localized labels.
- [ ] Visual regression EN and AR: login and shell, dashboard, project workspace, portals, large tables, modals, reports, PDF sample pages.
- Exit: every major route has an Arabic E2E assertion; the toggle is tested without reload.

L11 Review and rollout
- [ ] Native Arabic construction-domain reviewer verifies terminology; check abbreviations and Egyptian accounting vocabulary.
- [ ] Role-based UAT; optional localization-complete feature flag.
- [ ] Log missing keys in dev/staging; track unmapped backend error codes.
- [ ] PR checklist and CI to block new hard-coded strings; developer guide for adding keys and localized enums.
- Exit: zero missing keys in production builds; zero known English-only system strings in Arabic mode; no raw workflow enums in either language; Arabic PDFs pass human review; switching language never needs re-login or reload.

Exit gate (phase): all L0-L11 exits met.

---

## Phase 11: Rollout, reconciliation and go/no-go

- [ ] Expand `reconcile-database.js` from 8 checks to cover: stock ledger vs projection, project_costs vs source documents, invoice/payment/allocation balances, PO delivered vs GRN, retention and advance ledgers, journal balance, orphaned approvals, sequence vs max id.
- [ ] Dry-run migration on a copy of real data; fix findings; keep the report.
- [ ] Spec 25 rollout: per-project feature flags and dual-validation cutover; rollback runbook.
- [ ] Backups, restore drill, monitoring and alerting (errors, job failures, outbox lag).
- [ ] Security review: independent pass over Phase 1 items plus dependency audit.
- [ ] Performance budget verified under load test.
- [ ] Docs: operator runbook, admin guide, API docs (OpenAPI served and versioned with Sunset headers), user training notes.
- [ ] UAT with the real roles; defect triage; freeze.

### GO criteria (all required)
1. Zero open Critical/High findings from the three audits.
2. Golden E2E, concurrency and permission-matrix suites green in CI on real Postgres.
3. Reconciliation report clean on migrated data.
4. Cost, progress and finance totals on the demo project match golden values.
5. Offline site journey and mobile checks pass; Phase 10 localization exit met (no English-only system strings in Arabic mode, Arabic PDFs reviewed).
6. Restore drill and rollback runbook rehearsed.
7. UAT signed by finance, procurement, site and the owner.

---

## Appendix A: Critical path

Phase 0 -> Phase 2 (locking, numbering, deletes, migrations) -> Phase 3 (cost sync) -> Phase 8 (EAC) -> Phase 9 (golden) -> Phase 11.
Security (Phase 1), mobile/offline (Phase 7) and UI (Phase 6) run beside this path and must be done before Phase 11. Localization (Phase 10) is a cross-cutting track: its foundations (L1-L3) must land before Phase 6 screens are built.

## Appendix B: First two weeks (suggested order)

1. Phase 0 in full (days 1-3), including committing the localization plan.
2. Phase 1.1 token typing and 1.2 fail-open removal (days 3-8).
3. In parallel: Phase 2.1 migrations table and 2.4 numbering service (days 3-9).
4. Phase 4 real-PG harness, then Phase 2.2 inventory atomicity with its concurrency test (days 8-14).
5. Phase 2.5 FK and soft-delete migration drafted, reviewed on a data copy before applying.
6. Phase 10 L0-L3 (locale provider, catalog and parity check, shell) in parallel, so Phase 6 screens are built on keys.

## Appendix C: Risks

| Risk | Mitigation |
|------|-----------|
| RESTRICT/soft-delete migration breaks existing deletes in UI | Inventory delete routes first; ship UI "void/deactivate" at the same time |
| Cost posting double counts (GRN vs invoice) | Decide accrual point per cost type in Phase 3.1 before coding; reconcile in Phase 11 |
| Retiring legacy approvals loses in-flight items | Migrate in-flight first; keep parity script until zero diff for two weeks |
| i18n migration of ~1,000 ternaries is mechanical but large | Codemod plus lint rule; do screen by screen with snapshots |
| Spec scope (35 entities, many screens) outruns time | Order inside Phase 5/6 by golden-scenario dependency; defer pure-reporting entities last |
| Audit findings were static reads | Each fix starts with a reproducing test; downgrade or drop findings that do not reproduce |
