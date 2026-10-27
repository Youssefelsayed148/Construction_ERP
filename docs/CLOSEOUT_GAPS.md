# Closeout Gap Register

As of 2026-10-18. This register lists every unchecked item in `docs/ERP_CLOSEOUT_PLAN.md`, grouped under its phase, and adds concrete findings from the latest recorded demo verification in `STATE.md`. The checklist is reproduced as the plan records it; an unchecked box is not proof that the item was re-audited today, and some recorded demo results may post-date the plan text.

## Current closeout position

- The plan verdict remains **NO-GO** until its required phase gates pass.
- Latest demo checkpoint: RUN F, 2026-10-18. It recorded a reproduced high-severity AR posting defect, approval verification, and no full test suite/build/closeout gate during that run.
- The latest documented UI crawl in RUN D2 passed 76/76 English and Arabic logins and 1,792 page visits across 59 routes, with zero React crashes, HTTP 500s, or captured request failures.
- The latest RUN D2+E record also reports an AP subledger/GL difference and an approval-flow behavior defect under the tested configuration; RUN F later confirmed one above-limit approval could be completed by an owner. These observations are recorded separately below because individual flow results do not close the plan-wide gates.

## Confirmed defects and verification gaps from STATE.md

### C-FIN-AR-001 — high-severity client invoice journal posting defect

- Reproduced through the real API in RUN F on 2026-10-18. A past-due contract valuation can be recalculated to `overdue` during a list GET without calling `glPosting.syncInvoicePosting`. `POST /api/payments` then accepts payment and posts only the receipt; the invoice becomes `paid`, and the normal `paid -> issued` transition is refused.
- Reproduction `E2E-AR-INV-0010`: gross EGP 1,000, retention EGP 100, net EGP 900. No `client_invoice` journal entry was created; the receipt JE was EGP 900. After receipt, invoice subledger open balance was EGP 0 while GL receivable net was -EGP 900 (delta +EGP 900).
- RUN F also observed INV-0005 paid/allocated for EGP 90,000 with a `client_payment` posting and no `client_invoice` posting. Earlier RUN D2 reported company AR open EGP 270,000 versus GL receivable EGP 180,000, a EGP 90,000 difference.
- Controls recorded in RUN F: a plain invoice and a normally issued valuation invoice posted and reconciled correctly. The defect was not corrected in the recorded run.

### AP reconciliation mismatch in demo data

- RUN D2 recorded AP subledger open EGP 43,000 versus GL payable credit EGP 67,500. The notes attribute this observed mismatch to an EGP 43,000 AP payment left unallocated to `DEMO-AP-001` (PO-00002), while PO-00001 GRNs contributed EGP 72,000 and a supplier return reversed EGP 4,500.
- The run characterized this as a seed-order/reconciliation artifact; payment allocation and the relationship between the documents still need to be reconciled and the invariant rerun. Do not treat the amounts as a confirmed general product defect without further diagnosis.

### Approval-flow verification notes

- RUN D2+E: a PO issue request of EGP 1.1M was correctly refused for a finance manager whose configured limit was EGP 1M; an owner later approved the pending request in RUN F.
- RUN D2+E also recorded an under-limit EGP 50,000 request being queued when the test expected it not to queue. This remains a flow behavior to resolve or document against the intended approval rules.
- Earlier notes mention no `purchasing_mgr` approval-limit row; RUN F later observed 35 enabled role/action limit rows. The current matrix and intended behavior should be rechecked before treating the earlier observation as current.

### Closeout gates still requiring evidence

- RUN F explicitly did not run a test suite, build, full closeout gate, or Docker test stage.
- RUN D2+E exercised selected demo flows, not the complete golden journey or the full Phase 4 and Phase 11 acceptance matrix.
- The plan requires all GO criteria to pass; selected route crawls and scenario passes do not by themselves establish GO.

## Unchecked items copied from ERP_CLOSEOUT_PLAN.md

### Phase 0: Baseline, docs truth, CI gates

### Phase 1: Security blockers

- [ ] Monetary approval limits per spec 21: no limit values exist in the two source documents; built in Phase 5.1 as a configurable role/action/max-amount table. Until then every tool flagged `movesMoney` (payment, retention, certificate, invoice issue, void, PO issue) can only be approved by an owner (admin excluded). Gated requests must resolve to a project (from `project_id` or the target record) or are refused.
- [ ] SSRF guard: block private/loopback/link-local ranges, resolve-then-pin IP, disable redirects.
- [ ] Never return secrets from GET; hash or encrypt at rest; show once on creation.
- [ ] Fix wildcard subscriptions (`rfi.*` etc.) with a pattern matcher on the bus.
- [ ] Add project filter per hook; add an outbox table with retry and dispatch tracking.
- [ ] Reports: whitelist columns server-side, authorize on `spec.module`, remove arbitrary column filters, neutralise CSV formula prefixes (`= + - @`).
- [ ] Media access: visibility/approval filter for client and consultant photos; validate `file_url` ownership.
- [ ] Uploads: magic-byte validation, size limits, remove zip/doc/xlsx unless justified, queue for AV scan.
- [ ] Auth hygiene: constant-time login path, no disabled-account disclosure before password check, bcrypt cost 12, lockout, MFA design stub; prevent demoting or deactivating the last owner.
- [ ] Rate limiting: set `TRUST_PROXY` correctly; keyed limiter after v1 authentication; store in Redis or Postgres for multi-replica.
- [ ] Error leakage: central error handler returns generic messages plus correlation id; log details server-side (replace ~483 `error: e.message`). Use the stable error-code contract from Phase 10 L7 so security and localization share one change.
- [ ] Audit: make `logActivity` fail loudly in transactions, add before/after, IP, request id, log denials; cover boq, subcontractors, portal, actions, documents mutations.
- [ ] `x-powered-by` off; validate `CORS_EXTRA_ORIGINS`.
### Phase 2: Data integrity foundation

- [ ] Status enums (`scripts/status-audit.sql` lists every distinct status value per table for a restored copy): done for invoices, work orders, projects, phases, milestones, units, buildings, expenses (vocabularies read from the writing code). Open: the other ~75 workflow tables, which need a status audit first (procurement, quality, HSE, doc control, handover are written from several places and by the workflow engine maps).
- [ ] Post client invoices, payments and supplier invoices to the ledger, with balanced-entry checks. Client invoices and client payments (and their voids) done in 2.7b (migration 0016, `services/glPosting.js`); supplier invoices and payments are posted with the cost accrual in 3.1 (no approve step exists yet, and the accrual point decides the posting).
### Phase 3: Cost and cross-module sync

### Phase 4: Test infrastructure

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
### Phase 5: Data-model and backend spec gaps

- [ ] Organization CRUD routes (currently read-only in v1.js:525); users POST and DELETE (soft).
- [ ] Seed the full role set from spec 04. Today there are 16 roles (12 legacy internal roles that all hold a blanket `('*','*')` grant, plus 4 external). Spec 04 defines 24 internal and 9 external roles:
  - [ ] Remaining 20 internal roles, the 9 external roles, user remapping.
- [ ] Authorization formula to implement: Company scope + Project membership + Organization relation + Role + Module policy + Record policy + Action policy.
- [ ] Action permissions (22 minimum): view, create, edit, submit, assign, review, approve, reject, return, close, reopen, cancel/void, export, download, upload, see_internal_cost, see_client_value, see_subcontract_value, see_supplier_value, issue_financial_document, record_payment, manage_permissions. Replace the blanket `('*','*')` for internal roles with real per-module grants of these actions.
- [ ] External portal isolation tests (mandatory per spec 04): consultant cannot reach internal budget endpoints; client cannot see supplier/subcontractor rates unless permitted; subcontractor cannot see another subcontractor's commercial records; supplier cannot see other suppliers' quotations; external users cannot enumerate unassigned projects; MCP tools return the same authorization result as UI/API.
- [ ] Team assignment inherits access: role-template grants, notification subscriptions, expiry, revoke on removal (6-point inheritance outside the wizard).
- [ ] Delegation of authority with dates and limits (feeds approval limits from Phase 1.4).
- [ ] Approval limits table: role, action, max amount (configurable). Replaces the interim owner-only rule on `movesMoney` agent tools.
- [ ] Observations: due date, reference drawing, before/after photo link.
- [ ] Consultant endpoints: site visit, WIR/MIR inspect, issue instruction, recommend variation/certificate; WIR pending reads the formal `wirs` table; review SLA due dates in the inbox.
- [ ] Retire legacy single-answer RFI/submittal responses (doccontrol.js:256,273,329) in favour of the staged flow.
- [ ] Client actions: variation approve/respond, document acknowledge; multi-project and expired-assignment handling.
- [ ] Portals: formal registers for WIR/MIR, manpower, equipment, NCR/observation response, variation quote (not just portal_submissions); supplier expiring-compliance documents.
- [ ] Merge the two incident registers (qhse.js legacy `safety_incidents` vs hse.js `incidents`) with a migration and a compatibility view.
- [ ] Certificate register, safety observation.
- [ ] DocumentDistribution, DrawingRegisterItem; RFI location, work package, cost and schedule impact fields.
- [ ] Schedule entity and progress-update table; resource assignment.
- [ ] Handover: AssetDocument, standalone Warranty table, real file upload for package items and asset details.
- [ ] Notification channels: real email (add nodemailer or provider), push, SMS and WhatsApp adapters behind a provider interface; remove console-only stubs.
### Phase 6: Admin, configuration and missing module screens

- [ ] Shared form kit: validated modal forms, file upload, confirm dialogs, toasts (build once, reuse everywhere).
- [ ] Admin: Organizations, Users, Roles and permissions matrix, Delegations, Settings (currently a literal placeholder in App.js:106), Workflow template editor, Replenishment policy, Numbering config, Notification rules, Webhooks and API tokens.
- [ ] Project: WBS and work packages, team with role templates, project settings and calendars.
- [ ] Procurement: PR, RFQ, quotation entry, bid comparison (extend ProcurementReview), PO, deliveries, MIR (no UI today), GRN, returns, supplier invoices, three-way match, vendor performance.
- [ ] Inventory: recipes, requirements, reservations, replenishment alerts, lots and expiry.
- [ ] Commercial: contracts, variations (full form), budget, forecast, commitments.
- [ ] Finance: AP review queue, cash flow, valuations with certified-quantity pull, payment batches.
- [ ] Portals: replace `prompt()` flows with real forms and per-portal registers.
- [ ] Handover: file upload, asset form, warranty register.
- [ ] Dashboards: role dashboards beyond count tiles (weighted progress, project-scoped low stock, vendor spend, EAC).
- [ ] Single incident screen after the Phase 5.7 merge.
### Phase 7: Mobile, RTL and offline

- [ ] Bundle fonts locally (IBM Plex Arabic) so the app works offline; adjust nginx CSP. No licensed font asset is present in the repository/frontend dependencies; nginx font-src is already same-origin. Obtain the licensed font artifact before closing this item.
- [ ] Moved to Phase 10 (System-wide localization), which supersedes the earlier ternary-migration, formatter, logical-CSS and `index.html` direction items.
### Phase 8: Commercial, finance and planning engines

- [ ] EAC: real forecast input per cost code (ForecastVersion), `EAC = actual + ETC` with ETC from forecast or remaining-commitment rules; fix the degenerate `max(committed - actual, 0)` logic; add the cash-contribution metric.
- [ ] Retention and advance: derive recovery from contract percentage and cap; manual override audited.
- [ ] Decide and execute the retirement of the legacy approval system: workflow-backed status projections and a reversible dual-write flag are prepared; keep the mirror enabled until a real-data two-week parity hold and an approved migration resolve the legacy pending-index re-submission blocker. Then migrate/verify in-flight items, drop dual writes, remove `verify-approval-parity.js`.
- [ ] Remove duplicate surfaces: transition view, `payment_certificates` vs `sub_payment_certificates`. Legacy routes, scope policy, and cost listener still use the old table; schemas differ and no lossless financial mapping is established. See `docs/CERTIFICATE_SURFACE_RETIREMENT.md`; additive real-data mapping and parity are required.
### Phase 9: Demo seed and golden E2E

- [ ] Seed: full organization set, users per role, project from the residential template, BOQ with C35 concrete and a recipe, schedule, suppliers, items and stock.
- [ ] Golden scenario (spec 26 / 28): contract -> project setup -> BOQ and locations -> material requirement from recipe -> replenishment -> PR -> RFQ -> award -> PO -> delivery -> MIR -> GRN -> supplier invoice -> payment -> site daily report and quantities -> WIR/NCR -> consultant observation -> variation -> client valuation -> invoice -> payment -> handover -> warranty claim. Owner decision 2026-10-14: begin with a signed client contract; tender/bid is deferred to a later version.
- [ ] Assert at every step: stock, cost, progress, approvals, notifications, audit trail.
- [ ] Run the golden scenario as a Playwright journey (UI) and as an API test (fast).
### Phase 10: System-wide localization (EN/AR)

- [ ] 4C Portals (PortalDashboard.js), all four variants (consultant, client, subcontractor, supplier): titles, widgets, fields, empty states, booleans, quick actions, all 39 prompts (replaced by real forms in Phase 6), preview controls, Action Center, My Reviews, dynamic API field names such as `open_rfqs`, backend setup notes. Portal dashboard widget/field catalog labels, enum statuses, localized booleans, locale-formatted numbers, keyed empty states, shell/preview labels, keyed zero-assignment setup messages, Arabic-first record titles, and locale-formatted record dates/amounts have partial coverage. APIs preserve empty_label and add empty_key for compatibility; this item remains open.
- [ ] QA/QC (ITP, WIR, punch, CAPA, mock-ups, calibration; severity, result, stage, status; placeholders, overdue, serial labels).
- [ ] HSE (permits, incidents, near misses, JSA, registers; categories, likelihood, severity, results).
- [ ] Document control (register, transmittals, correspondence; direction, purpose, type, revision, superseded).
- [ ] Schedule (activities, Gantt, CPM, lookaheads, baselines, S-curve, KPI labels, alerts, project-finish text).
- [ ] Reports (catalog controls, saved views, schedules, backend report titles and column labels).
- [ ] Handover (lifecycle stages, package and claim statuses, asset headings, document/PDF actions).
- [ ] Agent Activity (roles, risks, decisions, execution statuses, system-generated reasons).
- [ ] Core pages not listed above hold most of the ~1,093 inline `locale === 'ar'` branches (WorkOrders 86, HSE 81, ProjectDetail 74, ProjectDocuments 66, HR 66, QHSEExtended 65, QHSE 64, Invoices 57, Approvals 48, SiteManagement 46, UnitsSales 42, DocControlExtended 40, Suppliers, Clients, Assets, Login, wizard, BOQ, Items, Expenses, Payroll, Legal). Policy: per-file CI baseline that may only go down, block new inline branches, migrate pages when touched, schedule the largest files explicitly.
- [ ] Dashboard (role-widget titles, metric keys, alert values and scopes, Arabic-first entity names).
- [ ] Send API values unchanged (`pending_approval`) and render through `enums.status.pendingApproval`; never `replaceAll('_', ' ')` as a translation. PortalDashboard now follows this rule for widget/field labels and record statuses; system-wide audit remains open.
- [ ] Error contract: add `error_code` and `error_params` next to the existing `error` string (about 482 responses use `{ success:false, error:"text" }`; changing `error` into an object breaks callers). Frontend maps `errors.inspectionNotFound` from the code. Keep the English string for logs and old clients.
- [ ] Compatibility layer for older endpoints during migration; map Joi validation errors to stable codes.
- [ ] System notification and action titles stored as key + params (+ optional rendered snapshot where history requires it); dashboard and portal contracts use keys, not English titles. Portal empty/setup messages now add stable keys while retaining legacy English fields; full notification/action migration remains open.
- [ ] Pass locale through `Accept-Language` or an explicit parameter where the server must render content (no handling exists today).
- [ ] Database-stored text: `roles.name`, seeded workflow/notification/document templates and report catalog titles need EN/AR values.
- [ ] Decide handling for native date/number inputs (they follow the browser locale); bundle the Arabic font locally for offline use.
- [ ] Do not translate user-entered titles and notes, supplier/client content, historical text, internal codes.
- [ ] Locale on report/export requests; EN/AR labels for catalog names, packs, columns, metadata, sections, empty states.
- [ ] CSV headers localized, UTF-8 BOM preserved.
- [ ] Embed a licensed Arabic-capable font; Arabic shaping and RTL-aware alignment; handle mixed Arabic/Latin content such as document numbers; mirror table alignment.
- [ ] Localize procurement, QA/QC, HSE, handover and project documents; translate statuses inside exported rows; safe, predictable filenames separate from display names.
- [ ] Logical CSS properties (margin-inline-start, padding-inline, text-align: start) replacing physical left/right.
- [ ] Review drawers, tabs, tables, breadcrumbs, back buttons; mirror directional arrows only (not download, calendar, check); verify charts and timelines individually; test long Arabic labels on cards and narrow screens.
- [ ] Localize `aria-label`, `title`, image `alt`, screen-reader messages; keep labels associated with controls.
- [ ] Mixed-content direction: emails, URLs, document numbers and codes stay LTR; Arabic titles and descriptions follow RTL.
- [ ] Unit: provider behavior, lookup and fallback, namespace parity, enum translation, entity-name selection, date/number/currency, error-code mapping.
- [ ] Integration: toggle while mounted, navigate after toggle, refresh restores locale, async translation loading, API errors in selected language, Arabic-first fields.
- [ ] E2E matrix, both languages, for owner/admin, project manager, site engineer, consultant, client, subcontractor, supplier and finance/procurement/QHSE roles.
- [ ] CI fails on: missing key, empty namespace, obvious hard-coded user-facing English in new JSX, raw status rendering, unmapped user-facing server error, export without localized labels.
- [ ] Visual regression EN and AR: login and shell, dashboard, project workspace, portals, large tables, modals, reports, PDF sample pages.
- [ ] Native Arabic construction-domain reviewer verifies terminology; check abbreviations and Egyptian accounting vocabulary.
- [ ] Role-based UAT; optional localization-complete feature flag.
- [ ] Log missing keys in dev/staging; track unmapped backend error codes.
- [ ] PR checklist and CI to block new hard-coded strings; developer guide for adding keys and localized enums.
### Phase 11: Rollout, reconciliation and go/no-go

- [ ] Dry-run migration on a copy of real data; fix findings; keep the report.
- [ ] Spec 25 rollout: per-project feature flags and dual-validation cutover; rollback runbook.
- [ ] Backups, restore drill, monitoring and alerting (errors, job failures, outbox lag).
- [ ] Security review: independent pass over Phase 1 items plus dependency audit.
- [ ] Performance budget verified under load test.
- [ ] Docs: operator runbook, admin guide, API docs (OpenAPI served and versioned with Sunset headers), user training notes.
- [ ] UAT with the real roles; defect triage; freeze.

## Source records

- Plan and phase authority: `docs/ERP_CLOSEOUT_PLAN.md` (plan verdict currently NO-GO).
- Latest run evidence: `STATE.md` (RUN F, 2026-10-18), with preceding RUN D2+E and Gate C/D records in the same file.
scm-history-item:d%3A%5CThe%20Osiris%20Labs%5CConstruction_ERP?%7B%22repositoryId%22%3A%22scm0%22%2C%22historyItemId%22%3A%22146b8e66914c727dda9c92a796612ab591591ad9%22%2C%22historyItemParentId%22%3A%224c5862b820afc054419baa37262cdc9c35e49fe2%22%2C%22historyItemDisplayId%22%3A%22146b8e6%22%7D- Detailed appended run log: `docs/CLOSEOUT_PROGRESS.md`.
