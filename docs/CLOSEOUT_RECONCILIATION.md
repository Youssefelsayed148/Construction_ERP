# Closeout reconciliation (T0 / T0.6)

Written 2026-10-28 by Session T. Every verdict below was re-derived from code, migrations, a freshly
migrated throwaway PostgreSQL 16 database (`erp_closeout_test`, 135 migrations applied, 0 errors, no
duplicate version numbers across 72 versioned files, `0030` confirmed absent as the known gap), and the
`seed:golden-demo` fixture — not copied from `docs/ERP_CLOSEOUT_PLAN.md`'s or `docs/CLOSEOUT_GAPS.md`'s
existing marks. Where this document disagrees with those files, this document is the current truth and
the other two are corrected in the same commit. Read-only audit: nothing below changed product code except
the two small fixes noted at the end of each phase table under "Fixes made this session".

Method: seven parallel read-only sub-audits (one per phase group / T0.6 item) plus direct verification by
the session itself where two sub-audits disagreed (see "Resolved conflict" under Phase 6/T0.6-1). Severity
rubric throughout: **BLOCKER** = data loss/corruption, money/ledger wrong, security hole, cross-project
leak, a core lifecycle step unusable, a role locked out of its job. **MAJOR** = wrong behavior with a
workaround, missing audit, missing localization on a core screen. **MINOR** = cosmetic, polish, rare edge.
Only Blockers and Majors gate launch; Minors are in `docs/POST_LAUNCH_BACKLOG.md`.

## Phase 0 — Baseline, docs truth, CI gates

| Item | Verdict | Evidence |
|---|---|---|
| Status docs / legacy moved | DONE | `docs/IMPLEMENTATION_STATUS.md`; `docs/legacy/` |
| Localization plan committed | DONE | `docs/system_language_fix.md` |
| CI lint job (no new silent catch / COUNT+1) | DONE | `.github/workflows/ci.yml` "Guards" step in the `backend-mock` job (file is at repo root, not `backend/` — correct any doc that says otherwise) |
| CI real-PG job | DONE | `.github/workflows/ci.yml` `backend-pg` job: fresh migrate, migrate-again repeatability check, then `test:pg` |
| Backend Dockerfile build-stage test | DONE | `backend/Dockerfile` test stage runs `lint:guards && npm test`; image build fails if either fails |
| Tracking board = this checklist | DONE | by decision |

**Phase 0 exit gate: MET.**

## Phase 1 — Security blockers

All items in `docs/CLOSEOUT_GAPS.md`'s Phase 1 section were re-verified true from code. Two corrections to
that document:

| Item | Verdict | Evidence |
|---|---|---|
| Error leakage (raw `error: e.message`) | **DONE** — CLOSEOUT_GAPS.md's "Still open: 366 sites" is **stale** | `backend/lint-guards.baseline.json` `raw-error-message`: 0 files / 0 sites, confirmed live (`node src/scripts/lint-guards.js` → `lint-guards: ok`, every guard category empty). The 11 remaining literal `error: e.message`/`error: err.message` call sites in routes/services (`hr.js:350`, `inventory.js:24`, `procurement.js:733-734`, `quantities.js:227`, `documents.js:38`, `projectSetupService.js:322`, 3 more) all carry `error_code` alongside — typed responses that happen to also echo the message, not raw leaks; 3 more are internal result objects never sent over HTTP (`eventDispatcher.js:250`, `replenishment.js:618`, `sweepLeader.js:77`). |
| Audit coverage boq/subcontractors/portal/actions/documents | **DONE** — CLOSEOUT_GAPS.md's "documents.js thin" claim does not hold | Mutation-route-count vs `auditedMutation`/`auditedChange`/`recordAuditEvent` call count: boq 6/6, documents 1/1, actions 5/5, subcontractors 7/7, portal 15/14+2 |
| Token typing, fail-open removal, record scoping, approval gate, webhooks (SSRF/secrets/wildcard/outbox), reports column allowlist + CSV neutralization, media access, upload magic-byte + AV-scan queue (migration `0071`), auth hygiene + MFA stub (migration `0070`), rate limiting, `x-powered-by`/CORS | DONE, unchanged | per `docs/CLOSEOUT_GAPS.md`, re-confirmed from the cited files this pass |

**Phase 1 exit gate: MET at code level.**

## Phase 2 — Data integrity foundation

| Item | Verdict | Evidence | Severity |
|---|---|---|---|
| 2.1 Migrations system, 2.2 inventory atomicity, 2.3 procurement locking, 2.4 numbering, 2.5 delete semantics, 2.8 approvals | DONE, unchanged | plan's own `[x]` marks re-confirmed; migrations apply cleanly in order (72 files, no duplicate version prefixes) | — |
| 2.6 Status enums for the ~75 remaining workflow tables | **OPEN, confirmed with live data** | Query against `erp_closeout_test`: 99 columns named `status`; only 24 are DB-`CHECK`-constrained (invoices, work orders, projects, phases, milestones, units, buildings, expenses — exactly the plan's own list); **75 have no DB-level enforcement** (procurement, quality, HSE, doc control, handover) | **MAJOR** — app code constrains writes but the database itself does not refuse an invalid value on these 75 tables |
| 2.7 Post client invoices/payments/supplier invoices to ledger | **DONE — tick the box, it was never ticked** | `services/glPosting.js`: `postClientInvoice`, `postClientPayment`, `postSupplierPayment`, `reverseClientInvoice`, `postClientCreditNote` all exist; supplier invoices post via `costAccrual.js` at approval (Dr `service_cost`/Cr `payable`) by design, not a second entry | — |

**Fix made this session:** none required (2.7 was a documentation gap, not a code gap — ticked in `docs/ERP_CLOSEOUT_PLAN.md`).

**Phase 2 exit gate: NOT MET** — 2.6 is a genuine open MAJOR (DB-level status enforcement missing on 75 tables). Recorded in `docs/LAUNCH_READINESS.md`.

## Phase 3 — Cost and cross-module sync

DONE, unchanged (3.1-3.5 all re-confirmed present: `costAccrual.js` `UNIQUE(source_type,source_id)` via
migration `0018`; `event_outbox`/`outboxDispatcher.js`; replenishment→PR path; progress derivation;
`sweepLeader.js` advisory locks). **Phase 3 exit gate: MET.**

## Phase 4 — Test infrastructure

| Item | Verdict | Severity |
|---|---|---|
| Real-PG harness, mock→PG ports, concurrency suite, constraint tests, API contract test, permission-matrix tests | DONE (all files present, confirmed on disk) | — |
| Nav-visibility beyond the four Phase-A routes | OPEN — T3 extends this this session | MAJOR |
| Reconciliation assertions on real data | PARTIAL — see T4 below (ran clean on throwaway + fixture data; a restored production-like copy remains a human/operator action) | MAJOR |
| Frontend component tests for forms/tables | OPEN | MAJOR |
| Playwright real-backend journeys (desktop+mobile, EN+AR) | OPEN beyond the existing mobile-route-sweep and a generic login/dashboard smoke | MAJOR |
| Load test (k6/autocannon) | OPEN — nothing found | MINOR at this stage |
| Portal acceptance (forbidden-field per portal, mobile viewport per portal) | OPEN | MAJOR |

## Phase 5 — Data-model and backend spec gaps

| Item | Verdict | Evidence | Severity |
|---|---|---|---|
| 5.1 Organization CRUD + users POST/DELETE | **DONE** — plan text stale | `routes/organizations.js` full CRUD for orgs/departments/job-positions/bank-accounts/performance-scores; `routes/users.js` soft-DELETE; v1.js read-only is a deliberate external-API subset | — |
| 5.1 Seed full role set (24 internal + 9 external, spec 04) | **DONE** — `docs/CLOSEOUT_GAPS.md`'s "remaining 20 internal roles, 9 external roles" is **wrong, correct it** | Live query, `erp_closeout_test`: 48 roles = all 24 spec-04 internal + all 9 spec-04 external + 15 legacy, confirmed independently by two sub-audits | — |
| 5.1 Action permissions (22 minimum) / replace blanket `(*,*)` | **PARTIAL** | Only 17 distinct actions granted anywhere (incl. `*`); missing: assign, review, return, close, reopen, cancel, download, upload. 12 legacy roles **plus the canonical `finance_manager` and `project_manager`** still hold blanket `(*,*)` with no granular per-module grants, unlike every other canonical role (8-87 explicit grants each) | **MAJOR** — two of the spec's first-listed canonical roles run ungated |
| 5.1 Authorization formula, external portal isolation tests, team-assignment inheritance, delegation of authority, approval limits infra | DONE (mechanism + tests exist) | `services/policy.js`, `services/teamService.js`, `services/delegationService.js`, `services/approvalLimits.js` + migrations `0032`/`0037` | — |
| 5.1 Approval limit *values* per role/action | N/A-DEFERRED — owner | `docs/APPROVAL_LIMITS_DECISION_SHEET.md` blank, matches recorded decision | — |
| 5.2-5.5 | DONE, not re-disputed | plan's own `[x]` marks | — |
| 5.6 Observations due date/photo, consultant endpoints, client actions, portal registers | OPEN, **not independently re-verified this pass** (time budget) — carry plan's OPEN status, flagged as a residual audit risk, not silently cleared | — | undetermined |
| 5.6 Retire legacy single-answer RFI/submittal | **OPEN, confirmed** | `doccontrol.js:84` still selects `answered_by_name`-shaped single-answer columns | MAJOR (per plan's own classification) |
| 5.7 Merge the two incident registers (qhse.js vs hse.js) | **DONE at the data/route level — plan/gaps text stale.** Only the Phase 6 single-screen UI consolidation remains | `hse.js` header comment: "incidents (replacing safety_incidents ...)"; `routes/qhse.js` has zero remaining references to `safety_incidents` | MINOR (UI consolidation only) |
| 5.7 Certificate register | PARTIAL/DONE, migration `0054` exists, not deep-audited | — | — |
| 5.7 DocumentDistribution/DrawingRegisterItem, RFI fields | PARTIAL — migration `0053` landed RFI impact fields; the two entities not confirmed | — | undetermined |
| 5.7 Schedule progress-update/resource assignment, 5.7 Handover AssetDocument/Warranty | DONE | migrations `0056`, `0057` | — |
| 5.8 Real notification channels (email/push/SMS/WhatsApp) | **OPEN, confirmed** | `services/notificationService.js:50`: `console.log('[NOTIFY:email:console] ... status=undelivered')` — still console-only; no provider SDK anywhere in `src/services` | **MAJOR** — no real external notification path exists |
| 5.8 Platform tables | DONE, not re-disputed | — | — |

## Phase 6 — Admin, configuration and missing module screens

**Resolved conflict (T0.6-1 module-wiring sub-audit vs the Phase-6/screen-quality sub-audit disagreed on
procurement; the session read `frontend/src/components/project/ProcurementWorkspace.js` directly, 372
lines, to settle it):** `ProcurementWorkspace.js` is mounted at `App.js` route `projects/:id/operations` →
`ProjectOperations.js` → the `procurement` tab (confirmed by grep: `ProjectOperations.js:124
{active === 'procurement' && <ProcurementWorkspace projectId={id} />}`). It contains real, working forms
for: PR create/edit/submit/cancel (lines 138-165), RFQ create + invite suppliers + quotation entry +
comparison (169-233), award recommendation submit/approve/reject (221-233), PO create from a quotation +
issue/approve/cancel (236-262), delivery recording (264-280), MIR create/accept/reject + the F3
supplier-collection flow (281-289), GRN create (289), supplier return (292-299), supplier invoice entry +
three-way-match approval (303-325), and AP payment recording with allocation (326-336). **The module-wiring
sub-audit's "BLOCKER: core procure-to-pay lifecycle has no UI" finding is WRONG** (it evidently inspected
only `ProcurementReview.js`, the comparison-only screen, and missed `ProcurementWorkspace.js`'s
reachability) — downgraded to DONE. `/api/procurement`'s wiring verdict is **WIRED**, not PARTIAL.

| Item | Verdict | Evidence | Severity |
|---|---|---|---|
| Settings.js | **REFUTED — DONE**, not a placeholder | `Settings.js` is a real GL-account-mapping admin screen with loading/empty/error, i18n, role gates | — |
| Admin Organizations/Delegations/Replenishment-policy/Numbering-config/Webhooks/API-tokens | DONE | `AdminWorkspace.js` areas | — |
| Admin Users | DONE (basic: edit role/dept/active, no create route) | `AdminWorkspace.js` | MINOR |
| **Admin Roles/permissions matrix UI** | **OPEN** | no `PermissionMatrix`/roles-matrix component found anywhere in frontend | **MAJOR** (admin/back-office; workable via SQL/API at launch) |
| **Admin Workflow template editor** | **OPEN** | not found | **MAJOR** |
| **Admin Notification rules UI** | **OPEN** | not found | **MAJOR** |
| Procurement PR/RFQ/award/PO/deliveries/MIR/GRN/supplier-invoice/3-way-match/vendor-performance | **DONE** (see resolved conflict above) | `ProcurementWorkspace.js` | — |
| **Inventory recipes UI** | **OPEN** | no recipe-management screen; storekeeper/QS manage recipes only via API/seed | **MAJOR** |
| Inventory requirements UI | OPEN (likely covered by replenishment alerts) | — | MINOR |
| Inventory reservations/replenishment-alerts/lots | DONE | `Reservations.js`, `AdminWorkspace.js` alerts view | — |
| **Commercial contracts screen** | **OPEN** | no dedicated contracts list screen found | **MAJOR** |
| Commercial variations (full form), budget/forecast/commitments, payment batches | **REFUTED — DONE** | `AdminWorkspace.js` variations area; `ProjectFinanceWorkbench.js` tabs: applications/certificates/budgets/forecasts/creditNotes/batches/releases/supplierInvoices/commitments | — |
| Finance AP review queue | PARTIAL (functionally covered inside `ProcurementWorkspace.js`'s invoices section; no screen literally titled "AP review queue") | — | MINOR |
| Portals: `prompt()` flows | **REFUTED — DONE, zero `window.prompt()` calls anywhere in `frontend/src`** (grep-confirmed). `alert()` (error display only, not data entry) remains in ~20 files | — | MINOR (UX inconsistency, not a missing form) |
| Handover file upload/asset form/warranty register | DONE | `Handover.js` | — |
| Dashboards beyond count tiles | PARTIAL, not fully audited | `Dashboard.js` has low-stock/overdue-milestone alerts; weighted-progress/vendor-spend/EAC widgets not confirmed | unaudited risk |
| Single incident screen (QHSE/HSE UI merge) | OPEN, consistent with 5.7's still-open UI consolidation — not a new finding | `HSE.js`/`QHSE.js`/`QHSEExtended.js` remain separate screens | MAJOR per 5.7 dependency |

## Phase 7 — Mobile, RTL, offline

| Item | Verdict | Evidence |
|---|---|---|
| 7.1 Bundle fonts locally (IBM Plex Arabic), offline + CSP | **DONE — the plan's stated blocker no longer holds, tick the box** | `frontend/package.json` bundles `@fontsource/ibm-plex-sans` + `ibm-plex-sans-arabic` 5.3.0 (not CDN), SIL OFL-1.1 licensed, `docs/licenses/IBM-Plex-Sans*-LICENSE.txt`, `docs/THIRD_PARTY_FONTS.md`; `frontend/nginx.conf` CSP already `font-src 'self'`. Same family also embedded as PDF export fonts (`backend/assets/fonts/`). |
| 7.2 Responsive (grid/table-wrap/touch-targets/mobile Playwright) | DONE, unchanged | `frontend/e2e/mobile-route-sweep.spec.js` |
| 7.3 i18n/RTL | N/A — moved to Phase 10 by plan text | — |

**Fix made this session:** ticked the 7.1 box in `docs/ERP_CLOSEOUT_PLAN.md`.

## Phase 8 — Commercial, finance and planning engines

| Item | Verdict | Evidence | Severity |
|---|---|---|---|
| EAC/ETC degenerate `max(committed-actual,0)` logic | **DONE — tick the box** | `commercialEngine.js` `etcFigure()` = `remainingCommitments + uncommittedBudget` (both `max(...,0)`); the old degenerate formula survives only in the informational `accruedCost()` helper, not the ETC/EAC path; cash-contribution metric present | — |
| Retention/advance recovery derived from contract %, capped, override audited | DONE, unchanged | `commercialRecords.js` | — |
| Legacy approval system retirement | OPEN, by design | `docs/APPROVALS_RETIREMENT.md`: dual-write mirror still on, needs a 2-week real-data parity hold before the schema decision | MINOR — functionally correct today, an ops/owner cleanup decision |
| `payment_certificates` vs `sub_payment_certificates` duplicate surfaces | OPEN | `docs/CERTIFICATE_SURFACE_RETIREMENT.md`: two schemas diverge, no lossless mapping built | MAJOR — architectural risk, no live miscalculation found |

## Phase 9 — Demo seed and golden E2E

| Item | Verdict | Evidence | Severity |
|---|---|---|---|
| Full "Osiris Residential Towers" seed | PARTIAL | `seed-golden-demo.js` provisions `OSIRIS-RES-TOWERS-001` (96 units, one 120 m³ C35 BOQ line, recipe, allocations) — `docs/GOLDEN_VALUES.md` itself calls this "not a complete residential BOQ" | MAJOR |
| Golden scenario tender→warranty, asserted at every step | OPEN | `golden-chain.pg.test.js` is a procurement P2P slice only — **this is T2's job this session, see below** | BLOCKER for a literal Phase-9 gate; T2 addresses what's addable this session |
| Playwright + API journey | PARTIAL | API is P2P-only; `journeys-backend.spec.js` is a generic smoke, not the golden scenario | same as above |

## Phase 10 — System-wide localization (EN/AR)

Owner decision on record (plan header): L5-L11 and remediation R6 are deferred past closeout
(2026-10-14). Verdicts below mark those **N/A-DEFERRED** unless code shows the work landed anyway, in
which case "DONE-DESPITE-DEFERRAL" is noted so the plan/gaps text can be corrected without re-opening work.

| Item | Verdict | Evidence |
|---|---|---|
| L0-L4B | DONE | plan already `[x]`, re-confirmed |
| **L4C Portals (PortalDashboard.js)** | **DONE — plan's `[ ]` and CLOSEOUT_GAPS "partial coverage" are stale** | `docs/i18n/baseline/inventory.json`: `pages/PortalDashboard.js` → 0 inlineBranches/hardcodedEnglish/rawEnumRendering/hardcodedFormat; 214 `t()` calls. Residual 2 `prompt()`/`alert()` calls are a Phase 6 item, not Phase 10. |
| **L5 (~1,093 inline branches across WorkOrders/HSE/ProjectDetail/etc.)** | **DONE-DESPITE-DEFERRAL — the plan/gaps figures are stale** | Fresh repo-wide grep for `locale === 'ar'`: 0 matches in all 12 named offender files; `inventory.json` totals are 0 repo-wide, not just in the 13 files Session F4 touched. This was evidently closed in earlier, undocumented sessions. |
| L6 dynamic values/formatting | DONE-DESPITE-DEFERRAL | `rawEnumRendering` 0 repo-wide |
| L7 error contract (route-layer bullet) | DONE-DESPITE-DEFERRAL | see Phase 1 error-leakage evidence above; other L7 bullets (Accept-Language passthrough, DB-stored EN/AR text, notification titles as key+params, Joi-error mapping) **not re-checked**, remain OPEN/deferred |
| L8 (the PDF-spike bullet only) | DONE-DESPITE-DEFERRAL | `htmlPdf.js` + `docs/i18n/PDF_SPIKE.md`; rest of L8 (export locale param, column/metadata localization, mixed filenames) assumed still OPEN, not verified |
| L9/L10/L11 | OPEN, not re-verified, correctly N/A-DEFERRED | no native-reviewer sign-off exists (`docs/ARABIC_REVIEW_PACK.md` says so explicitly) |

**Fix made this session:** none — these are documentation corrections (see `docs/CLOSEOUT_GAPS.md` diff),
not code changes.

## Phase 11 — Rollout, reconciliation and go/no-go

| Item | Verdict | Evidence | Severity |
|---|---|---|---|
| Expand `reconcile-database.js` from 8 checks | DONE, reconfirmed | 18 named checks present | — |
| Dry-run migration on a copy of real data | OPEN | no production-like data copy exists in this sandbox; only disposable/fixture DBs used | MAJOR, human/operator action |
| Feature flags + rollback runbook | PARTIAL | `docs/MIGRATIONS.md` documents forward-only migrations (no down-scripts by design); the actual rollback mechanism is restore-from-verified-backup — **rehearsed successfully this session, see T4**. No per-project feature-flag mechanism found in code beyond ad hoc env toggles (`APPROVALS_LEGACY_DUAL_WRITE`-style) | MAJOR |
| Backup/restore rehearsal | **DONE this session** | see T4 below | — |
| Independent security review + dependency audit | PARTIAL | `npm audit --omit=dev` this session: 1 moderate, 2 high, 0 critical (3 total) production-dependency findings — no independent/external human review exists | MAJOR, needs human reviewer + dependency triage |
| Performance budget under load test | OPEN | no k6/autocannon script found anywhere | MAJOR |
| Docs: operator runbook, admin guide, OpenAPI w/ Sunset headers, training notes | OPEN | OpenAPI is generated programmatically (`openapi.js`) but no versioned/Sunset-header artifact, operator runbook, admin guide, or training doc exists | MINOR-MAJOR |
| UAT with real roles, defect triage, freeze | OPEN — human | `docs/UAT_PILOT.md` signoff table correctly all Pending/Blocked | — |

---

## T0.6 — Screen / API / DB / role coverage audit

### 1. Module wiring matrix

47 routers mounted in `backend/server.js`. Full per-mount table (mount path, route file, endpoint count,
frontend caller(s), DB tables, verdict) is preserved in the session's working notes; summarized here are
every mount that is **not** cleanly WIRED, plus the one conflict this document resolved above:

| Mount | Route file | Verdict | Severity |
|---|---|---|---|
| `/api/procurement` | `procurement.js` | **WIRED** (corrected from a sub-audit's mistaken PARTIAL/BLOCKER — see Phase 6 resolved-conflict note) | — |
| `/api/subcontractors` | `subcontractors.js` | **API-ONLY** — no screen creates/edits a subcontract, verification, or certificate through this specific router. Partial mitigation: `ProjectFinanceWorkbench.js` lets a user raise a payment application/certificate *for* a subcontractor party via the commercial/finance-ledger endpoints, so the certificate-payment lifecycle has a path; subcontract setup and verification admin do not. | **MAJOR** (downgraded from a sub-audit's BLOCKER once the finance-workbench mitigation was found; a Contracts/Commercial Manager's core cert-payment job is reachable, contract/verification admin is API/SQL-only, acceptable at launch per the T0.6 rubric) |
| `/api/costing` | `costing.js` | API-ONLY, confirmed — zero frontend references anywhere | MAJOR (cost-code admin/profitability views are back-office) |
| `/api/maintenance` | `maintenance.js` | API-ONLY, confirmed — the plan/prompt's lead ("reached from Assets/Dashboard/Approvals") is **refuted**; those are unrelated label strings, not calls to this route | MAJOR (an Equipment/Plant Manager's maintenance-reminder job has no UI) |
| `/api/activity` | `activity.js` | Ambiguous — 1 endpoint, no conclusively-isolated frontend caller found in the time available | MINOR, flag as not fully audited |
| everything else (auth, users, approvals, dashboard, items, suppliers, clients, legal, expenses, invoices, payments, finance, assets, hr, payroll, projects, warehouses, inventory, boq, work-orders, documents, site, project-setup, qhse, hse, schedule, reports, handover, docs, sales/units, actions, notifications, locations, quantities, materials, commercial, finance-ledger, consultant, client-portal, portal, organizations, delegations, team, v1, mcp, agents, uploads) | — | WIRED (v1/mcp are N/A — external/agent API surfaces by design) | — |

### 2. Screen quality matrix (sampled)

Deep per-field review (loading/empty/error/real-forms/i18n/RTL) done for 6 representative screens:

| Screen | Verdict | Notes |
|---|---|---|
| `Settings.js`, `AdminWorkspace.js`, `ProcurementWorkspace.js`, `ProjectFinanceWorkbench.js` | DONE | full loading/empty/error/i18n |
| `BOQ.js` | PARTIAL | two mutation call sites (`BOQ.js:81,89`) swallow errors silently (`console.error` only, no user-visible error) | MAJOR |
| `WorkOrders.js` | PARTIAL | uses native `alert()` on failure instead of an inline error state | MINOR |

Only 2 of 40 page files use the shared `components/common/States` (`LoadingState`/`EmptyState`/`ErrorState`)
helper; the other 38 implement loading/empty/error inline per-component (confirmed present via spot checks,
not a universal absence — just an inconsistent, non-shared pattern). **MINOR** consistency gap.

**Audited partially, not fully**: the remaining ~34 page files and every `projectNav.js`/`ADMIN_AREAS`
sub-tab were confirmed to exist and route correctly, but were not individually scored on every quality
column. Listed as a residual risk in `docs/LAUNCH_READINESS.md`, not silently cleared.

### 3. Missing-screen check vs Phase 6 spec

See the Phase 6 table above — MISSING: admin roles/permission matrix, workflow template editor,
notification rules UI, dedicated commercial contracts screen, recipe-management UI. Everything else the
plan lists as a Phase 6 screen exists (several plan/prompt leads claiming "no UI" were refuted by code:
Settings, procurement MIR/GRN/vendor-performance, commercial budget/forecast/payment-batches, all
`prompt()` replacement work).

### 4. API → DB integrity

`node src/scripts/lint-guards.js` (read-only check mode, not `--update`) returns **`lint-guards: ok`** —
every guard category (`raw-error-message`, `mutation-without-audit`, `post-commit-audit`, `silent-catch`,
`catch-to-zero`, `cost-view`, `event-swallow`, `counter-rmw`, `count-numbering`, `direct-project-id`) is
currently empty codebase-wide, not just in sampled files. Typed-error and audit-event coverage are
mechanically enforced at zero violations (a static heuristic, not a runtime proof, but a strong signal).

Transaction-wrapping was sampled on 16 route files (procurement, warehouses, finance, financeLedger,
invoices, payments, boq, subcontractors, costing, handover, qhse, hse, doccontrol, site, schedule,
workorders). `boq.js`, `site.js`, and `workorders.js` have zero `transaction(` calls at the route-file
level and no real-PG test file matching their name by that exact convention — this does not by itself prove
a bug (service-layer code may transact internally; this was not traced into the service layer within
budget). **Residual risk, not a confirmed defect** — flagged for whoever extends this audit. 30 of 47 route
files were not sampled for this specific item at all (materials, units, commercial, portal, consultant,
client, actions, notifications, locations, quantities, organizations, delegations, team-assignments,
reports, approvals, maintenance, legal, expenses, assets, hr, payroll, projects, items, suppliers, clients,
users, auth, dashboard, activity, agents) — **not audited**, listed as a risk, not silently omitted.

### 5. Role access audit (three layers + portal cage + role census)

1. **Backend policy.** `mcp.js` and `media.js` are the only router files with `authenticate` and no
   `authorize()` call — both confirmed to have their own equivalent (`mcp.js` self-authenticates via a
   Bearer-token middleware then gates per-tool inside `mcpService.handleRpc`'s role allowlist; `media.js`
   calls `canAccessMedia()` at the route). `services/policy.js`'s `extractProjectId` is a **generic,
   systemic** mechanism applied to every authorized route (not a per-route allowlist): a client-sent
   `project_id` is always matched against the caller's own `user_project_roles` membership rows and
   rejected on mismatch. List endpoints sampled (`procurement.js`, `boq.js`) get the same check as
   single-record routes. **Not fully audited**: every list route in `site.js`/`commercial*`/`finance*`/
   `documents.js`/`handover.js` — residual risk, not a confirmed gap.
2. **Sidebar/nav.** `Sidebar.js`'s `policy_modules`/`policy_permissions` filtering plus its hard-coded
   `roles` arrays on `settings`/`admin/organizations`/`agent-activity` are consistent with
   `AdminWorkspace.js`'s `ADMIN_AREAS[*].roles` (a deliberate two-level gate: outer URL admission, inner
   per-tab narrowing — not a conflict). `frontend/src/utils/portalFamily.js` and
   `backend/src/services/portalFamily.js` hold byte-identical role→portal maps.
3. **Frontend route guard.** `ProtectedRoute` (`App.js`) checks only login, no per-route role guard — but
   the two routes actually traced end-to-end (`/admin/*`, `/projects/:id/boq`) already degrade cleanly on a
   403 (caught and rendered as `ErrorState`/an inline alert box, no crash, no data flash). **Downgraded
   from a sub-audit's suspected MAJOR to MINOR** for these two routes; other hidden routes named in the
   T-session prompt (`/settings`, `/agent-activity`, others) were **not traced**, residual risk. A reusable
   `<RouteGuard>` component reusing Sidebar's grant logic is feasible in well under 40 lines but is
   cosmetic given the API already blocks the data and the traced screens degrade cleanly — recommended as
   backlog, not a closeout blocker.
4. **Portal cage.** `policy.js`'s `RECORD_SCOPE_RULES` (~20 rules) resolve every portal-reachable id
   through the same project-membership check as layer 1. **Not exhaustively verified** against each of the
   four external families' full reachable-resource set — residual risk, no new defect found in the sample
   checked.
5. **Seeded role census** (query against `erp_closeout_test`, 48 roles): all 24 spec-04 internal + all 9
   spec-04 external roles seeded (33/33), plus 15 legacy roles untouched. **Correction**: the plan/gaps
   "remaining 20 internal roles, 9 external roles" line is **DONE, not open** — only *user remapping*
   (moving existing users off the 15 legacy keys onto canonical roles) remains unverified/likely open and
   was not independently re-checked here.

**No BLOCKER found in any layer actually traced.** MAJOR findings carried from this section into
`docs/LAUNCH_READINESS.md`: none confirmed beyond what Phase 5/6 already record (the `finance_manager`/
`project_manager` blanket-grant gap, the missing admin screens). MINOR: no per-route frontend guard; stale
role-seeding docs (corrected here).

---

## T4 — Pilot-environment readiness (run this session, see also `STATE.md`)

| Check | Command | Result |
|---|---|---|
| Migration idempotency | `npm run migrate` run twice on `erp_closeout_test` | 1st: 135 applied / 0 already; 2nd: 0 applied / 135 already — exact repeat-safe |
| Reconciliation (`reconcile-database.js`, the `r02-pg-gate.ps1 -Reconcile` equivalent — that PowerShell script is not runnable on this Linux sandbox, so its two underlying calls were run directly) | `npm run migrate && node src/scripts/reconcile-database.js`, run once on the empty migrated DB and once more after `seed:golden-demo` populated real fixture data | All 18 named checks `[OK]` / 0 violations both times; 1 `[PENDING]` check (accepted MIRs awaiting posted GRN) = 0 both times |
| Data-cleaning report | `npm run data-cleaning-report` | "All constraints are validated. Nothing to clean." |
| Backup/restore rehearsal | `pg_dump -Fc erp_closeout_test` (1,143,883 bytes) → `CREATE DATABASE erp_closeout_restore_test` → `pg_restore` → row-count comparison | Before/after identical: users 0/0, `schema_migrations` 135/135, public tables 259/259 |
| Rollback runbook | `docs/MIGRATIONS.md` reviewed | Migrations are forward-only by design (no down-scripts); the actual rollback mechanism is restore-from-verified-backup, which the line above just rehearsed successfully end to end |
| Smoke script review (`smoke:staging`) | not run | **NOT RUN** — requires the local Docker Compose pilot stack (`.env.docker` + `docker compose --project-name ... up --build -d` on port 8090 per `docs/STAGING.md`), not provisioned in this sandbox. Exact commands: `docs/STAGING.md` lines ~19-87. |
| Dependency audit | `npm audit --omit=dev` (backend) | 3 findings: 1 moderate, 2 high, 0 critical — not triaged this session, recorded for Phase 11/`LAUNCH_READINESS.md` |

## Minors moved to backlog

See `docs/POST_LAUNCH_BACKLOG.md` (new this session) for every MINOR finding above — none of them gate
launch.
