# Current continuation - 2026-10-17

The historical account blocker below is corrected in the inherited working tree. Current command output verifies 38 accounts, 38 successful logins and zero registrations on rerun. The demo services were restarted only within erp-demo-20261017; db/backend healthy, frontend running, migrate exited 0. Focused safety tests: 34/34 passed, exit 0. No reset or business seed was executed in this session.

Port 55442 belongs on the frontend container by design: backend/scripts/company-demo-nginx.conf declares an nginx stream listener on 5432 forwarding to db:5432; docker-compose.demo.yml publishes loopback 55442 there. The database/backend retain the internal-only demo network. Historical ECONNREFUSED came from the missing host-facing ingress on that internal-only layout, whose published mappings were reported as :0. The current proxy mapping is the correction, not a new Compose defect. No attempt was made to recreate the old connectivity failure by breaking the working demo; its original reproduction remains historical evidence.

Accounts use POST /api/auth/register authenticated as the bootstrap owner, never direct SQL. Registration and login both use Joi.string().email().required() in backend/src/routes/auth.js. Registration hashes passwords and transactionally writes the user, internal company role seat and activity audit. External roles intentionally receive no company-wide seat and still need project assignments. New accounts use demo-<rolekey>@demo.example.com without changing login validation.

Continuation STOP: baseline regression-evidence reconstruction failed twice during setup (Windows inline quoting SyntaxError, then suppressed helper failure). No valid expected-red result was obtained. Current gate B evidence is partial; C/D/E remain unrun. Full details and exact next action: [new verification report](DEMO_VERIFICATION_REPORT_2026-10-17.md) and STATE.md.

---

Historical checkpoint follows; its one-account/failed-login statements are superseded above.

# Demo environment verification - STOP at Phase B stage 1

Date: 2026-10-17. Target: `erp-demo-20261017`, `construction_erp_demo`, UI `http://127.0.0.1:8092`, PG loopback55442. **Gate B FAILED; Phase C NOT STARTED.** 5A is **functionally complete, gates deferred** under the owner's replacement; production remains NO-GO. Deferred gates remain listed in STATE.md and must pass before any UAT sign-off, finance sign-off or production move.

## Actual results

| Check | Actual result |
|---|---|
| Bounded Docker info | 28.3.2; second wrapper execution exit0; first wrapper incorrectly interpreted null ExitCode, version/empty stderr proved daemon available |
| Windows exclusions | 8092/55442 outside all listed ranges; no port substitution |
| Ignored credentials | `git check-ignore .env.demo .demo-users.json .demo/results.json` returned all3 paths; generated38 entries once, values withheld |
| Focused new safety tests | 1 suite /33 tests passed /0 skipped,0.327s; only company-demo-safety.test.js executed |
| Initial HTTP/DB access | Both ECONNREFUSED; internal API200 ready; owned published-port queries returned`:0` |
| Ingress correction | Expected-red safety test1failed/32passed; then33passed. Credential-free nginx publishes UI+PG; backend/db stay on internal-only network |
| Corrected HTTP/DB access | Demo `/api/health` HTTP200 ready; read-only own DB count users1 |
| Account attempt2 | `Demo login workflow_owner: HTTP 400`,exit1; STOP, no third attempt |
| Migrations | schema_migrations130; demo migrate container exit0 |
| Real accounts | Bootstrap owner1; API registrations0; full38-account/API rerun not achieved |
| Unit idempotency | Stable key create-once and existing-account no-registration cases passed |
| Runtime idempotency | NOT VERIFIED; login blocked before registration |
| Financial arithmetic / PO / journal / numbering / list invariants | NOT RUN; stage1 did not finish; no broad/golden suite substituted |
| Full PG / Docker test stage / golden / full mocks/frontend/i18n/API-lint sweep | DEFERRED; not run |

The first safety run failed loading the not-yet-created helper. The added initializer tests then showed2 failures/30 passes before implementation. The ingress safety assertion failed before its fix. No guard test was removed, disabled, retried internally or weakened. No production application route was edited.

## Stop and proven diagnosis

Account attempt1 failed before HTTP login because host connections were refused. Read-only diagnostics and internal API health isolated the problem to the new demo network layout. After its tested correction, host DB and HTTP access both succeeded.

Account attempt2 reached `/api/auth/login` and returned400. This is the second failure at the same step, triggering the owner's hard STOP. No further login/registration/seed attempt was made.

**D-001 / MEDIUM / demo bootstrap configuration:** generated bootstrap/roster email domain `.invalid` is incompatible with the existing `Joi.string().email()` validator at backend/src/routes/auth.js. A local validator call with the synthetic bootstrap address returned `"value" must be a valid email`; the same local validator accepts the reserved `demo.example.com` subdomain. This demonstrates a seeder configuration error, not an application regression. Do not weaken the application validator or repair users with raw SQL.

Next authorized continuation: add a failing-first email-contract safety regression; use the reserved example.com subdomain consistently; recheck ownership, Docker and exclusions; explicitly reset/reinitialize ONLY the owned demo using the guarded entry point and regenerate its own ignored artifacts without exposing them. Preserve current evidence. Then repeat account setup and prove real idempotency before checkpointing stage1 as passed. This proposed correction/reset was NOT executed.

## Data and stage coverage

All251 public tables were counted in a read-only transaction after checking `current_database()`. [Every table count](DEMO_TABLE_COUNTS_2026-10-17.md) includes defaults produced by existing migrations, not fabricated company records.

| Area | Rows / coverage |
|---|---|
| schema_migrations / users / organizations | 130 /1 /1 |
| Projects / clients / suppliers / employees | 0 /0 /0 /0 |
| PR / RFQ / PO / delivery / MIR / GRN | 0 /0 /0 /0 /0 /0 |
| Client invoices / payments / expenses / journals | 0 /0 /0 /0 |
| All9 interesting demo states | Missing |
| Stage1 environment/guard/tests/accounts | Partial; account setup blocked |
| Stages2-7 | Not started |
| Phase C chains / isolation routes / account-language coverage | 0 /0 /0of38 /0of2; GateB prerequisite failed |

Raw SQL seed/back-date operations: **none**. Initial owner creation used the application's existing explicit bootstrap migration path; other business writes were not attempted. No external sends or provider calls. Reset was guard-tested but not executed. No 20-minute running-company walkthrough can be presented from this partial state.

## Docker preservation

| Resource | Before | After | Removed baseline names | Added |
|---|---:|---:|---:|---:|
| Containers |25|29|0|4|
| Volumes |595|597|0|2|
| Networks |8|10|0|2|

Added containers: erp-demo-20261017-{frontend,db,backend,migrate}-1. Added named volumes: erp-demo-20261017_demo_db, erp-demo-20261017_demo_uploads. Added networks: erp-demo-20261017_demo, erp-demo-20261017_ingress. No anonymous volumes or cleanup/prune. Demo retained:db/backend healthy,frontend running,migrate exited0. PilotHTTP8090=200; no pilot/clone rebuild/restart/query/seed/mutation. Free RAM before environment setup2032MiB,CPU2%; no other heavy task ran with migrations.

Local diagnostic files remain under `.scratch-company-demo/`; ignored report data under `.demo/`. Credential contents were not printed or staged. scratch_pdf.txt remains untouched CRLF and needs owner decision. Policy commit5912917 was pushed successfully to the explicitly owner-approved GitHub destination; this blocked Phase B checkpoint is local until Gate B is satisfied.
