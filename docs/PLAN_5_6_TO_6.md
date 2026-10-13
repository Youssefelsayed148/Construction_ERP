# Implementation plan: Phases 5.6 through 6

**Code audit date:** 2026-10-13
**Scope source:** `docs/ERP_CLOSEOUT_PLAN.md`, lines 275–343
**State:** Audit completed before implementation. This plan is the implementation baseline; update its ticket status and evidence as slices land.

## Working rules

- Run the test or check tied to the current ticket. Run broader integration checks at the end of each phase, not after every slice.
- Follow the repository's Express, PostgreSQL migration, React, locale-catalog, shared enum and permission-policy conventions.
- Keep portal project and organization scoping enforced by the API. Hiding a screen is not authorization.
- Preserve supported API behavior while replacing legacy paths. Add compatibility only where an existing consumer needs it.
- Do not send email, SMS, push or WhatsApp, or configure paid providers, until a provider and credentials are explicitly approved. Local tests must use fakes.
- Keep GL account mappings provisional until the finance owner confirms the account purposes. Human pilot UAT remains a separate sign-off.

## Audit summary

| Area from the source plan | Current code evidence | Audit result |
|---|---|---|
| Phase 5.6: observations, consultant workflow, client actions, external registers | `backend/src/routes/consultant.js`, `services/consultantEngine.js`, `routes/site.js`, `routes/qhse.js`, `routes/doccontrol.js`, `routes/client.js`, `routes/portal.js`; `frontend/src/pages/PortalDashboard.js` | Partial. Observation workflow, site visits, formal WIR/MIR APIs, staged RFI/submittal response records and client portfolio/action-center APIs exist. Observation metadata and consultant recommendations, old one-step RFI/submittal handlers, action coverage and usable portal registers still need work. Portal actions still rely on many `prompt()` calls. |
| Phase 5.7: quality, HSE, document control, planning, handover | `scripts/hse-migration.js`, `routes/qhse.js`, `routes/hse.js`, `routes/doccontrol.js`, `routes/schedule.js`, `scripts/handover-migration.js`, `routes/handover.js`, `routes/documents.js` | Partial. The incident data migration and `safety_incidents` compatibility view already exist. WIR/MIR, schedule activities, site reports, handover package items, asset register, warranty claims and document upload endpoints already exist. Direct use of the compatibility view, missing registers/impact fields/resource links, URL-only handover attachment entry and standalone warranty model remain. |
| Phase 5.8: delivery channels and platform records | `services/notificationService.js`, `services/eventDispatcher.js`, `routes/notifications.js`, `scripts/migrate-38-agent-layer.js`, `scripts/action-engine-migration.js`, `routes/v1.js` | Partial. In-app notifications, preferences and an email-provider hook exist. Push, SMS and WhatsApp are console stubs; email can also log to console when SMTP or nodemailer is absent. Agent tool/action audit tables exist, but `agent_session` is a correlation string; no dedicated `APIToken`, durable `AgentSession`, or generic action-comment register was found in the migration/route audit. Token endpoint behavior in `v1.js` is not a substitute for a scoped, revocable ERP API-token admin surface. |
| Phase 6: screens and prompt removal | `frontend/src/App.js`, existing page modules, `components/common/{FormField,ConfirmDialog,States,Toast}.js`, `components/project/{ProcurementWorkspace,ProjectFinanceWorkbench}.js`, backend route families | Partial. The shared form/state/dialog pieces, project shell, procurement journey, project finance workbench, and many module pages exist. The Phase 6 list is stale in places: the Settings route renders `Settings.js`, project setup APIs exist, and several screens called missing by the source plan have since landed. A current route-to-API screen audit is needed before selecting each screen ticket. Prompt calls remain in many portal and internal pages. |

The incident-table merge requested in 5.7 is not a fresh schema project: `hse-migration.js` copies legacy rows into `incidents`, drops the old table and creates an updatable compatibility view. The remaining ticket is to converge service and route access on `incidents`, validate old-client compatibility, and keep the migration regression covered.

## Phase 5.6 — site, consultant, client and portals

### 5.6.1 Observation record completeness

**Status: Implemented in slice `Phase 5.6.1` (2026-10-13).** Observations now store due date and drawing reference/document link, attach before/after evidence through the shared photo model, and show due dates in the consultant inbox. Drawing links are checked for project and consultant visibility; evidence must be an upload owned by the actor. Protected media access is limited to consultants in the assigned organization and project. Date-only values are preserved through PostgreSQL reads and JSON responses.

**Acceptance:** create, update, list, and detail preserve the metadata and evidence; users cannot attach or read evidence across project scope; EN/AR forms have loading, empty and error states.

**Verification:** migration `0046_observation_record_completeness.sql` applied to the isolated PostgreSQL test database; focused real-Postgres observation test passed 1/1; consultant and media-access tests passed 2 suites / 18 tests; portal observation-form test passed 1/1; `i18n:check`, production build, Node syntax checks and `git diff --check` passed. No full suite was run.

### 5.6.2 Consultant site and review workflow

**Status: Partial.** Site visit CRUD is already in `routes/site.js`; formal WIR/MIR routes are in `routes/qhse.js`; consultant review inbox and staged RFI/submittal response APIs are in `consultant.js`. Complete the missing actions and correct reads at the source: WIR-pending inbox data must come from `wirs`; support inspection decisions and instruction/variation/certificate recommendations through auditable records; compute and expose review due dates/SLA from configured project rules. Do not treat `portal_submissions` as the source of formal workflow state.

**Acceptance:** each action checks assignment, project and role; recommendations link to their formal target record; inbox totals agree with formal WIR/MIR/RFI/submittal registers; SLA due dates are deterministic and visible in the inbox.

**Focused checks:** real-Postgres consultant/WIR/MIR route tests for role and project boundaries, state transitions, formal-register reads and SLA calculations; focused inbox component test.

### 5.6.3 Retire single-answer RFI and submittal responses

**Status: Open.** `routes/doccontrol.js` still exposes `POST /rfis/:id/respond` and `POST /submittals/:id/respond`, while staged response/revision APIs exist in `routes/consultant.js` and `consultantEngine.js`. Move remaining consumers to staged records. Keep a compatibility adapter only if repository call-site and API-contract searches show a live consumer; do not silently discard prior response history.

**Acceptance:** all new responses are revisioned, attributed, timestamped and auditable; latest response and history are returned consistently; old clients receive a documented compatible response or a typed deprecation refusal.

**Focused checks:** doc-control and consultant real-Postgres tests for revisions, history, API v1 parity and legacy-path behavior.

### 5.6.4 Client project actions and assignment expiry

**Status: Partial.** Client portfolio/action-center and assignment-based project resolution exist in `client.js` and `clientEngine.js`. Audit each requested action (variation decision/response and document acknowledgement), add missing formal endpoints, and verify multi-project results and expiry filtering across every list and mutation. Reuse the existing read-only client preview for UI review.

**Acceptance:** each action writes to its formal entity with actor, time and audit trail; client users see only active assigned projects; expired assignments and other projects are denied on both list and record endpoints.

**Focused checks:** client-engine/API PostgreSQL tests for multiple projects, active/expired assignment, each action, and cross-project denial; focused client portal component tests.

### 5.6.5 Formal external registers and portal forms

**Status: Partial.** Formal WIR/MIR, observation, variation, RFI and submittal records exist internally, but portal work remains concentrated in the dashboard and prompt-driven mutations. Add formal portal registers and forms for WIR/MIR, manpower, equipment, NCR/observation responses and variation quotes; add supplier compliance expiry list and alerts. Keep the formal records authoritative and submissions as an intake mechanism only.

**Acceptance:** portal screens list the user's assigned projects and scoped records, show status/history, validate each submission, and provide accessible EN/AR forms with empty/loading/error states; server payloads contain no internal cost fields.

**Focused checks:** one portal API test per changed register for scope and field redaction; focused portal component tests for the touched form/register; locale check.

## Phase 5.7 — QA/QC, HSE, document control, planning and handover

### 5.7.1 Converge incident paths on the canonical register

**Status: Partial; schema migration exists.** Change QHSE and site/dashboard readers that still query the compatibility view to use `incidents`; keep the view only for external legacy SQL/API consumers that are documented. Verify historical counts and IDs after migration; make the migration safely repeatable on clean and legacy fixtures.

**Acceptance:** both APIs expose one canonical incident record; no duplicate or lost rows; compatibility behavior and rollback/recovery expectations are documented.

**Focused checks:** migration-runner PostgreSQL regression for populated legacy table and rerun; QHSE/HSE incident route tests and reconciliation count assertion.

### 5.7.2 Certificates, safety observations and project record links

**Status: Partial.** Finance certificates now have a project workbench; add a dedicated project certificate register where required by spec 15. Reuse the observation workflow from 5.6 for safety observations rather than adding a second observation table. Add `DocumentDistribution` and `DrawingRegisterItem` records only after confirming no equivalent transmittal/register entity satisfies the fields. Extend RFI with location, work package, cost and schedule impacts using nullable/additive migration fields and explicit permissions.

**Acceptance:** register rows link to existing certificate/document/drawing/RFI records; impact fields are validated and included in project-scoped detail/history; no duplicate canonical entity is introduced.

**Focused checks:** route/service PostgreSQL tests for links, project scope and impact field round trips; focused register component test.

### 5.7.3 Schedule progress and resource assignment

**Status: Partial.** `schedule_activities` and `activity_relationships` already implement schedule entities and relationships, and progress entry exists in `routes/schedule.js`. Audit whether a separate progress-update history and resource assignment entity exists in deployed migrations before adding either. Preserve progress history and link assignments to project team/assets/labor using existing foreign keys where appropriate.

**Acceptance:** updates are attributed and historical; assignments validate resource/project scope and date overlap; schedule and project views agree on progress and resource allocation.

**Focused checks:** schedule PostgreSQL tests for progress history, overlap, scope and calculations; focused schedule component test.

### 5.7.4 Handover evidence and warranty register

**Status: Partial.** `handover_package_items`, `asset_register`, and `warranty_claims` exist, and `/api/documents/upload` already accepts files. Handover currently accepts document URLs. Add asset-document links and real upload flow using the existing upload/protected-media mechanisms; audit whether warranty claims can become the required standalone warranty register without breaking claim lifecycle. Add only the missing warranty entity/fields after that audit.

**Acceptance:** package items and assets link to authorized stored documents; warranty coverage has dates, issuer, asset/package linkage and claim history; file reads enforce access policy.

**Focused checks:** handover/document PostgreSQL tests for links and authorization; focused upload/form component test.

## Phase 5.8 — notification providers

**Status: Partial; external provider decision required for live delivery.** Preserve the current provider interface and in-app path. Add provider configuration, delivery result/status and retry/error handling, then wire email through an explicitly chosen SMTP/provider adapter. Implement push, SMS and WhatsApp only after provider, credential ownership, template/consent rules and spend limits are approved. Tests must inject fake providers and never contact live services.

**Acceptance:** missing configuration fails closed to a visible undelivered result; retries are idempotent; secrets are not returned or logged; user preferences are honored; in-app delivery remains available.

**Focused checks:** notification-service unit tests with fakes for success/failure/retry/idempotency and preference routing; one focused route test for status visibility. Live-send verification waits for provider approval and approved credentials.

### 5.8.1 API tokens, agent sessions and action comments

**Status: Open after static inventory.** The agent tool and approval request audit tables are present, but `agent_session` is only a string field; no dedicated API-token or durable agent-session lifecycle tables/routes, nor a generic action-comment thread, were located in the audited source. Confirm required token audience/scopes, session retention and comment visibility from the relevant specs before schema design. Store token hashes only, support revocation/expiry, scope every token to an identity and least privilege, and audit session/comment reads and writes.

**Acceptance:** token secrets are shown once and stored hashed; expired/revoked tokens fail closed; agent sessions have ownership, state and retention rules; comments are tied to an action and respect project/role access.

**Focused checks:** real-Postgres token/session lifecycle and policy tests, plus action-comment project-scope tests. Never use real credentials in tests.

## Phase 6 — administration and missing module screens

### 6.1 Current screen inventory and shared form kit

**Status: Partial.** `FormField`, `ConfirmDialog`, `States`, `Toast`, `formUtils` and permission-aware buttons exist. First create a route-to-screen-to-API inventory from `App.js`, sidebar/navigation, API routes and current page call sites. Identify actual missing screens; the source plan's Settings placeholder and broad missing-screen statements are stale. Extend shared pieces only for gaps proven by the inventory (validated dialog form, upload state, confirmation/toast wiring); do not replace working components wholesale.

**Acceptance:** every active API module has an owner-facing screen decision (usable screen, intentionally API-only, or deferred with reason); shared forms cover validation, submit state, accessible errors and confirmation; no raw enum display or inline locale branching is introduced.

**Focused checks:** tests for any shared components changed, plus the affected page tests and `i18n:check`.

### 6.2 Replace prompt flows in bounded screen slices

**Status: Open and cross-cutting.** `rg "prompt\\(" frontend/src` finds remaining calls in portal, assets, approvals, document control, clients, Handover, HR, expenses, legal, QHSE/HSE, schedule, reports, site and unit-sales pages. Replace them in coherent slices, using project/record context to select IDs and shared forms/dialogs for data entry or confirmation. Prioritize 5.6 formal portal forms first, then internal destructive confirmations and record-edit forms.

**Acceptance:** no `prompt()`/`window.prompt()` remains in application UI; every converted flow validates input and reports errors in EN/AR; referenced records are chosen from scoped lists rather than guessed IDs.

**Focused checks:** page tests for each converted screen and i18n parity. Run the prompt inventory at the Phase 6 exit gate.

### 6.3 Admin and project setup coverage

**Status: Partial.** Backend route families already exist for organizations, users, delegations, approval limits, project settings, WBS/work packages, calendars, numbering and workflow/approval operations. The frontend has `Settings.js`, `ProjectWizard.js`, `ProjectShell.js`, and project setup views, but route coverage and permission UX need inventory. Build the missing Organizations, Roles/permission matrix, Delegations, workflow templates, replenishment policy, numbering, notification rules, webhook/API token screens as supported by real backend APIs. Keep owner/admin operations guarded in both UI and API.

**Acceptance:** each screen maps to an existing or explicitly planned endpoint; role grants and project scope are reflected in API 403 tests; secrets are write-only/one-time shown; settings changes are audited.

**Focused checks:** permission-policy route tests and component tests for the changed admin page; secret redaction test for tokens/webhooks.

### 6.4 Module workspaces and project navigation

**Status: Mostly implemented; validate remaining requirements.** The project shell/navigation, procurement workspace, inventory operations, commercial records and finance workbench have landed. Compare live navigation against Phase 6 requirements for PR/RFQ/quotation/award/PO/delivery/MIR/GRN/return/invoice, inventory lots/expiry/replenishment, contract/variation/budget/forecast/commitment, AP review/cash flow/valuations/payment batches, and handover. Add only missing journeys. Add count badges and the Overview “needs attention” list if still absent; retain project permission-driven visibility and backend 403 enforcement.

**Acceptance:** each required register/action is reachable from navigation for an authorized role; forbidden roles receive API 403; detail and mutations remain project-scoped; badges derive from existing authoritative counts.

**Focused checks:** role/navigation component tests and one affected backend API test per new/changed journey.

### 6.5 Dashboards and incident entry point

**Status: Partial.** Weighted progress, low-stock signals, vendor spend and EAC calculations exist in dashboard/reporting code, but the target role dashboards and shared incident entry point need a current route/widget audit. Finish only absent role views and consolidate incident navigation after 5.7.1.

**Acceptance:** each dashboard widget has an authoritative project/role-scoped query and empty/error state; incident creation and review route to the canonical register.

**Focused checks:** dashboard-widget PostgreSQL tests for scope and values; focused dashboard component test.

## Phase integration gates

At the end of 5.6, run the focused real-Postgres portal/consultant integration tests and the affected portal browser journey in EN/AR. At the end of 5.7, run migration regression, focused register tests and the affected project workspace journey. At the end of 5.8, run fake-provider integration tests; live delivery is a separate approved gate. At the end of Phase 6, run the route-to-screen inventory, remaining-prompt scan, targeted permission/navigation checks, i18n validation and affected end-to-end journeys. Do not rerun unrelated suites at each ticket boundary.

## External decisions and deferred verification

- Finance owner: confirm provisional GL account purposes before enabling operational postings beyond the approved pilot.
- Business pilot users: execute and sign `docs/UAT_PILOT.md`.
- Business/IT owner: select notification provider(s), approve credentials, message templates/consent requirements and spend limits before live delivery.
- Product owner: approve any API deprecation window if repository inspection finds external consumers of the single-answer RFI/submittal endpoints.
