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

**Status: Partial.** Site visit CRUD is already in `routes/site.js`; formal WIR/MIR routes are in `routes/qhse.js`; consultant review inbox and staged RFI/submittal response APIs are in `consultant.js`. The inbox and dashboard now read consultant-stage WIRs from the formal `wirs` register, plus variations at `consultant_recommendation`, certificates at `consultant_client`, and unreviewed issued/acknowledged engineer instructions. Due timestamps use each active workflow step's `opened_at + sla_hours` when configured. The consultant portal can record formal WIR results, variation/certificate recommendations, and a single linked engineer-instruction recommendation through localized review buttons; target assignment is rechecked and activity plus workflow action history commit transactionally where the formal workflow owns transitions. Engineer-instruction recommendations are stored against the instruction and do not alter its lifecycle. Certificate consultant approval leaves the certificate in finance review; ledger/certificate finalization waits for workflow approval. Missing SLAs remain null; no default SLA is invented. Still open: SLA administration/configuration coverage. Do not treat `portal_submissions` as the source of formal workflow state.

**Acceptance:** each action checks assignment, project and role; recommendations link to their formal target record; inbox totals agree with formal WIR/MIR/RFI/submittal registers; SLA due dates are deterministic and visible in the inbox.

**Focused checks:** real-Postgres consultant/WIR/MIR tests cover role and project boundaries, state transitions, formal-register reads, SLA calculations, and the WIR/instruction HTTP routes. `consultant-observation.pg.test.js` passed 6/6 including out-of-project refusal, audit, pending-inbox removal, and duplicate recommendation refusal; the named certificate workflow test in `commercial-5-5.pg.test.js` passed 1/1 with consultant recommendation followed by finance finalization. Consultant/QHSE/scope mock tests passed 35/35; policy module/action and record-scope coverage passed 9/9; the portal component suite passed 2/2; `i18n:check` passed. Engineer-instruction recommendations are implemented; SLA administration/configuration remains open.

### 5.6.3 Retire single-answer RFI and submittal responses

**Status: Complete.** There are no frontend callers of the single-answer handlers, but both are part of the v1 API contract. They now return typed `410 staged_response_required` responses that point to the replacement versioned paths. `0049_backfill_rfi_submittal_response_history.sql` preserves existing RFI answers and submittal responses in their revision tables. The consultant API returns each record with its ordered response/revision history and latest entry; v1 exposes the same reads and staged RFI response write. The RFI staged endpoint now accepts the acknowledgement stage already supported by the service.

**Acceptance:** met for the covered routes. Existing answers remain in place and are backfilled; staged writes append attributed, timestamped rows; latest response and history are returned together; old v1 write paths return a typed deprecation response with replacement path parameters.

**Focused checks:** `consultant-observation.pg.test.js` passed 7/7, including idempotent legacy backfill, staged acknowledgement, ordered history through v1, cross-project read denial, and both legacy v1 410 responses without overwriting existing fields. The external API router remount check passed 1/1. Policy module/action and record-scope checks passed 9/9.

### 5.6.4 Client project actions and assignment expiry

**Status: Complete.** Client portfolio/action-center and assignment-based project resolution are enforced against active client organization assignments. The client action center now offers formal variation approve/reject and document acknowledgement actions. Both writes lock and recheck current participant assignment; variation responses call the existing formal workflow service and preserve workflow action history, while document acknowledgements store the actor, organization, comment, and timestamp in `client_document_acknowledgements` and advance the formal document status. Role permissions, record scope, internal API routes, and v1 family mappings are covered. The portal hides action controls during read-only preview and provides paired EN/AR labels and errors.

**Acceptance:** met. Each action writes to its formal entity with actor, time and audit trail; client users see only active assigned projects; expired assignments and other projects are denied on both list and record endpoints.

**Focused checks:** `client-actions.pg.test.js` passed 4/4, covering active multi-project assignment, expired and other-organization denial, variation workflow action/actor/comment, acknowledgement actor/time/status/idempotency, cross-project denial, and the HTTP activity audit. `client-portal.test.js`, module override, and record-scope tests passed 19/19. `PortalDashboard.test.js` passed 3/3; v1 router remount check passed 1/1; `i18n:check`, changed-file syntax checks, and `git diff --check` passed. Migrations 0050 and 0051 and the policy role grant applied to the disposable PostgreSQL database. No full suite was run.

### 5.6.5 Formal external registers and portal forms

**Status: Partial.** Formal WIR/MIR, observation, variation, RFI and submittal records exist internally. Supplier users see MIR number, current status, and decision date through their own delivered purchase orders; line-level accepted/rejected quantities and full review detail remain in the internal procurement register. Subcontractors see formal WIR number, status, result, and inspection date only for their assigned organization and active package projects. The supplier dashboard lists scoped compliance documents expiring within 90 days, with explicit expired, 30-day, and 90-day alert states. The subcontractor portal has typed, audited intake for WIR/MIR requests, manpower/equipment reports, NCR/observation responses, and variation quotes, plus scoped submission history; intake does not update formal registers. RFI/submittal creation and follow-up, package/instruction acknowledgement, quantity claims, and payment applications now use scoped forms instead of typed record-ID prompts. No subcontractor prompt actions remain in the portal.

**Acceptance:** portal screens list the user's assigned projects and scoped records, show status/history, validate each submission, and provide accessible EN/AR forms with empty/loading/error states; server payloads contain no internal cost fields.

**Focused checks:** Slice 5.6.5.b passed `portal.test.js` 15/15, `subcontractor-submissions.pg.test.js` 3/3 including formal WIR organization/project isolation, `PortalDashboard.test.js` 5/5 including localized formal WIR/MIR registers, and `i18n:check`. Slice 5.6.5.c passed `PortalDashboard.test.js` 7/7 for package-derived RFI and submittal form payloads. Slice 5.6.5.d passed `portal.test.js` 16/16 including resubmittal option isolation, `PortalDashboard.test.js` 8/8 for RFI acknowledgement and returned-submittal resubmission, and `i18n:check`. Slice 5.6.5.e passed `portal.test.js` 17/17 including assigned instruction filtering, `PortalDashboard.test.js` 9/9 for package/instruction acknowledgements and quantity/payment payloads, and `i18n:check`. The preceding 5.6.5.a checks and migration 0052 are recorded in `docs/CLOSEOUT_LOG.md`. No full suite was run.

## Phase 5.7 — QA/QC, HSE, document control, planning and handover

### 5.7.1 Converge incident paths on the canonical register

**Status: Partial; incident source consolidation is complete.** QHSE reads/writes and site daily-report aggregation now use canonical `incidents`; the migration-owned `safety_incidents` compatibility view remains for legacy SQL/API consumers. The legacy conversion preserves row IDs and count, the compatibility view mirrors those rows, reruns do not duplicate data, and the canonical sequence advances beyond migrated IDs. No new migration was needed.

**Acceptance:** both APIs expose one canonical incident record; no duplicate or lost rows; compatibility behavior and rollback/recovery expectations are documented.

**Focused checks:** `migration-runner.pg.test.js`'s populated legacy conversion case passed 1/1 for exact row IDs/values, compatibility-view count, rerun idempotency and sequence continuation. The site daily-report source-census case passed 1/1 using canonical `incidents`. A source scan found no internal route/service SQL reading or writing `safety_incidents`; full HSE/Phase 5.7 exit gates remain for the phase boundary.

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
