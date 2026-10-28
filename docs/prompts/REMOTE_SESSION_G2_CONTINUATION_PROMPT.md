# Task: Construction ERP closeout - Session G, continuation (finish G1.2, G2, integrate in-flight work)

Continue the closeout of the Osiris Labs Construction ERP (React, Express, PostgreSQL, bilingual EN/AR,
RBAC) on branch `closeout/batch-a-to-6`. The previous Session G was stopped by the owner mid-batch. Read
first, in this order: `AGENTS.md`, this file, `STATE.md`'s top entry ("G-SESSION IN PROGRESS..." and
everything under it down to the T-session entry - it is the authoritative, non-fabricated record of what
the previous session actually did and found), `docs/prompts/REMOTE_SESSION_G_FINAL_FIXES_PROMPT.md` (the
*original* G-session brief - still the source of truth for scope, hard constraints, and the per-item
specs; this file only tells you what's already done and what to do differently because of it).

Do not re-audit anything `docs/LAUNCH_READINESS.md`/`docs/CLOSEOUT_RECONCILIATION.md` already covered.
Do not re-derive the G1.2 target table list or the G2 screen list from scratch - they are restated below
exactly as the previous session verified them live.

## What is already done and pushed (do not redo)

On `origin/closeout/batch-a-to-6`, as of commit `1b0c016`:

- **G1.1** - migration `0074_finance_project_manager_grants.sql` (finance_manager/project_manager blanket
  grant retired). Done, verified, tested. Nothing to do here.
- **G3** - `docs/OPERATOR_RUNBOOK.md`, `docs/ADMIN_GUIDE.md`, `docs/TRAINING_NOTES.md`,
  `docs/API_VERSIONING.md`, `docs/STAGING.md`'s "Feature flags" section. Done. One thing you DO need to
  do: once G1.3's SMTP work is integrated (below), check `docs/STAGING.md` ends up with BOTH a "Feature
  flags" section AND a "Notification adapters" section, not one overwriting the other.
- A `docs/LAUNCH_READINESS.md` correction (the "no load test exists" claim was stale; corrected).

The next free migration number on the real branch is still **`0075`** - `0074` is taken, confirmed.

## What exists but is NOT yet integrated - three backup branches on origin

The previous session dispatched three background agents in isolated git worktrees. Those worktrees only
existed in that session's sandbox and would not survive into a fresh session, so before stopping it
pushed each one to `origin` as a plain branch (no PR opened). **All three were built from a stale base**
(commit `c8242b5`, well before this branch's current tip) due to a worktree-creation quirk - this matters
for exactly the files listed as "real risk" below, nothing else.

Fetch them first: `git fetch origin wip/g1-3-to-6-notifications-boq-audit-rfi
wip/g2-screens-7-of-8 wip/g1-2-status-checks-batch1`.

### 1. `wip/g1-3-to-6-notifications-boq-audit-rfi` - COMPLETE, needs integration only

Four commits, each already implemented and tested by the previous agent (read each commit's own message
for the full contract/test-output detail before touching anything):

- `6259e08` - real SMTP adapter for the `notify` email channel (`nodemailer`, disabled unless
  `NOTIFICATION_EMAIL_PROVIDER=smtp` + `NOTIFICATION_LIVE_SEND_ENABLED=true` + `SMTP_HOST`/`SMTP_FROM_ADDRESS`
  set; audit event on dispatch failure; env var names documented in `docs/STAGING.md`'s new "Notification
  adapters" section; one new test, 3/3 passing per the agent's report).
- `0c4f626` - `BOQ.js` lines ~81/89 now show a localized error via the shared `errorMessage(error, t)`
  helper instead of `console.error`, form stays open; one new test, 1/1 passing.
- `ae4451e` - `npm audit --omit=dev` fixes in both lockfiles (backend: 3 findings, all fixed via
  non-breaking bumps, 0 remaining; frontend: 10 of 49 fixed non-breaking, 39 remain, all transitive to
  `react-scripts`/`jest` build tooling, documented with per-package exposure analysis in a new
  `docs/SECURITY_REVIEW_PREP.md`).
- `e78e52f` - `doccontrol.js`'s legacy single-answer RFI/submittal fields were investigated and found
  **not** safe to retire (`consultantEngine.js` and `frontend/src/pages/ProjectDocuments.js` both still
  read them) - added `Deprecation`/`Sunset` response headers instead (sunset date 2027-01-26) and a new
  `docs/POST_LAUNCH_BACKLOG.md` with one row recording it.

**Known, confirmed integration issue**: this branch's `docs/POST_LAUNCH_BACKLOG.md` is a from-scratch
1-row file (the stale base predates the real one). The real branch already has an 11-row
`docs/POST_LAUNCH_BACKLOG.md` from an earlier session. **Do not let either version overwrite the other** -
merge by hand: keep the real 11 rows, add this branch's one new row for the RFI/submittal deprecation.

**Known, confirmed real conflict risk**: `backend/src/routes/doccontrol.js` changed substantially on the
real branch since the stale base (a Phase-1 error-leakage cleanup converted every `catch` block in that
file from `res.status(500).json({error: error.message})` to `routeFail(...)`, including the exact
`GET /rfis`/`GET /submittals` handlers commit `e78e52f` also touches). Do not blind-cherry-pick this
commit - diff it against the current file and reapply the Deprecation/Sunset header logic by hand onto
the current (already-`routeFail`-converted) handlers.

Everything else this branch touches (`notificationService.js`, `BOQ.js`, `backend/package.json`) was
checked directly against the real branch and is either byte-identical or changed by only a handful of
unrelated lines - low risk, but still verify with `git diff` before trusting a clean cherry-pick, don't
assume.

**To integrate**: for each of the 4 commits, in order, either `git cherry-pick <sha>` (if the diff-check
above says it's clean) or manually reapply the change against the current file (for `doccontrol.js` and
`docs/POST_LAUNCH_BACKLOG.md`). After each one lands, re-run that commit's own one test file once (per
TEST-RUN DISCIPLINE below) to confirm it's still green against the current codebase, not just the stale
base. Re-run `npm audit --omit=dev` once more only if you touch either lockfile further.

### 2. `wip/g2-screens-7-of-8` - 7 of 8 screens done, 2 items remaining

Seven commits, each a complete screen (read each commit message for its contract/endpoints/i18n-keys/test
detail): `94f07da` (material recipes), `29d77a9` (equipment maintenance), `708ab4e` (cost codes + CRUD
endpoints), `76a755e` (commercial contracts + a contract-header PUT endpoint), `63c7ad8` (subcontractor
contracts/verification), `1c606db` (notification-rules read-only view), `faaf0d6` (roles x permissions
matrix).

**File-overlap check already done**: of the 11 files this branch touches, 6 are byte-identical to the
real branch (`AdminWorkspace.js`, `AdminWorkspace.test.js`, both `locales/*/admin.json` files,
`commercial.js`, `notifications.js` route) - cherry-pick those commits directly, they should apply clean.
The other 5 (`costing.js`, `maintenance.js`, `materials.js`, `subcontractors.js`, `users.js` route files)
each have a small (5-14 line) unrelated change on the real branch since the stale base - still low risk,
but check the diff before trusting a clean apply. This branch never touched `App.js` (it used the
existing `ADMIN_AREAS` config pattern throughout, correctly avoiding new routes) so `App.js`'s own
unrelated changes on the real branch don't matter here.

**Still to build**, per the original dispatch brief (`docs/prompts/REMOTE_SESSION_G_FINAL_FIXES_PROMPT.md`'s
G2.2) - neither was started:

- **Workflow-template editor** screen. Backend is fully table-driven already (`workflow_templates` +
  `workflow_steps`, schema in `backend/src/scripts/workflow-engine-migration.js` - NOT the numbered
  migrations directory, a legacy JS-script layer, already applied, do not re-migrate it;
  `resolver_value` is the approver role when `resolver_type='role'`, `sla_hours` is the SLA). No route
  currently exposes these tables for admin editing - add a small new router (or extend
  `backend/src/routes/approvals.js`, which already references `workflow_steps` in a comment) with
  `GET /workflow-templates` (list + step counts), `GET /workflow-templates/:id` (template + ordered
  steps), `PUT /workflow-templates/:id/steps/:stepId` (edit `resolver_value`/`sla_hours` only, reject
  attempts to change `resolver_type`), `PUT /workflow-templates/:id` (toggle `is_active`) -
  `authorize('owner','admin')` only, typed errors, audit event in the same transaction. Build the screen
  as a new `ADMIN_AREAS` entry in `frontend/pages/AdminWorkspace.js` (same pattern as the other 7 screens
  this branch already added) with a UI note that changes apply only to NEW workflow instances (true per
  `workflowEngine.js`'s own snapshot behavior - confirm, don't just assert). One focused test
  (loading/empty/error/success/permission-hidden), run once.
- **Connectivity script**, `frontend/scripts/check-screen-connectivity.js` - this was explicitly the LAST
  step of the original brief and was never reached. For every one of the 8 screens (the 7 already built
  plus the workflow-template editor you just built), assert: an `ADMIN_AREAS` key + `admin/:area` route
  resolution exists; the area's `module`/`roles` are set (permission gating); every API path the screen
  calls is mounted in the backend; the namespace's EN/AR i18n keys resolve in both locale files. Print a
  table, `process.exit(1)` on any gap. Run it once, include the real output in your report - if it finds
  gaps, fix them (within TEST-RUN DISCIPLINE's two-attempt limit per item) or report them honestly, don't
  fabricate a clean pass.

**To integrate**: cherry-pick the 7 commits (checking each file-diff first per above), build the 2 missing
pieces as new commits on top, then this screen batch is G2-complete.

### 3. `wip/g1-2-status-checks-batch1` - 1 of ~9-11 planned batches done

One commit, `88e6265` "G1.2: add NOT VALID status CHECK constraints — procurement batch (9 tables)",
migration `0075_procurement_status_checks.sql` (purely additive, new file only - zero overlap risk,
cherry-pick directly). An uncommitted, unfinished `backend/scripts/validate-status-constraints.sql` was
in progress when this agent was cut off by an account-wide rate limit mid-edit - check whether anything
useful survived in the branch's working tree (it may not have - only committed work is guaranteed to be
on the pushed branch) and rebuild that file from scratch if not, per the spec below.

**63 of the original 72 target tables still need a migration.** The full table list, the batching, and
the exact method (derive each column's vocabulary from every writer - routes, services, workflow maps,
seeds, triggers - not one file; batch by subsystem; `NOT VALID` so existing rows can't block the
migration; handle NULL explicitly; include a value when uncertain rather than risk blocking a legitimate
write) are all specified in `docs/prompts/REMOTE_SESSION_G_FINAL_FIXES_PROMPT.md`'s G1.2 item - follow it
exactly, continuing the numbering from `0076` (since `0075` is now taken by the procurement batch). The
72-table list and suggested batch groupings (commercial/finance, QA/HSE, doc control, handover/
maintenance, HR, workflow/approvals engine, schedule/work, inventory/materials, misc/infra - 8 batches
covering the remaining 63 tables) are in `STATE.md`'s "IN FLIGHT" section item 3 and in this session's
own prior work (re-derive via `information_schema.columns` joined to `information_schema.check_constraints`
on `status` columns, filtering to base tables, if that record isn't available to you).

Finish `backend/scripts/validate-status-constraints.sql` (one `ALTER TABLE ... VALIDATE CONSTRAINT ...`
line per table across every batch, grouped by batch with a comment) and add the `docs/MIGRATIONS.md`
subsection explaining it, once all batches are in.

## TEST-RUN DISCIPLINE (unchanged from the original G prompt - owner instruction)

No full suites, no full builds, no per-batch gates. Per slice: one focused test, red then green, run
ONLY that file, once. Never rerun an unchanged passing file. Allowed once, at the very end of this whole
continuation (not per item): `npm --prefix backend run lint:guards`, `i18n:check`, `i18n:parity`,
`i18n:inventory --check`, and the screen-connectivity script. No retry loops - after two failed attempts
at a step, stop that item, record the exact blocker in `STATE.md`, continue.

## Hard constraints (unchanged - repeated because they bear directly on this continuation)

- Additive, versioned SQL migrations only, numbered after the highest existing version (`0075` is taken
  as of this writing - check `ls backend/src/migrations/` before picking the next number, in case the
  integration above already added more). `0030` is a known gap, never reuse it.
- Every endpoint: authenticate, authorize, project-scope filter, typed errors via `routeFail`/`error_code`,
  audit event in the same transaction, EN/AR keys. Every new screen: loading/empty/error states, i18n via
  the shared catalog, RTL-safe logical CSS, permission-driven visibility, the shared form kit/API client.
- Throwaway local PostgreSQL 16 only (a database named like `erp_closeout_test`) - the previous session's
  instance does not persist into a new sandbox; recreate it (`createdb`, then `npm run migrate` from
  `backend/` with `DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=...`).
  Never touch demo/pilot databases, `.env`, secrets, external services.
- Git: work directly on `closeout/batch-a-to-6`, do not create a new long-lived branch (the three `wip/*`
  backup branches are fine to fetch from and delete once merged - delete them only after their content is
  safely integrated and pushed, not before). One commit per slice, with the harness's Co-Authored-By
  trailer. Before each push: `git pull --rebase origin closeout/batch-a-to-6`, then
  `git push origin closeout/batch-a-to-6`. Never `main`, no PR, no force-push, no deploy.
- After finishing G1.2 and G2: update `STATE.md`, `docs/CLOSEOUT_PROGRESS.md`, and `docs/CLOSEOUT_LOG.md`
  with real command output (not claims). Then, and only then, run the four static checks plus the
  connectivity script once, and write the actual closing report: per-batch commits (hash + subject),
  done/already-done/blocked status, a gate table of only what was actually run, migrations added, new
  routes/screens with their menu entries and required permissions. Put `G-SESSION COMPLETE <commit>` at
  the top of `STATE.md` only once every item in the original G1/G2/G3 scope is genuinely done - not before.
- G4 remains explicitly out of scope. Do not start it.

## At a stop condition

Record the state, exact blocker, evidence, and next action in `STATE.md`, same as the previous session did.
