# R0/R1 scorecard - 2026-10-14

R0/R1 exit GREEN. Command evidence is in CLOSEOUT_LOG.md and root STATE.md. Original six-gate pre-change baseline was interrupted by superseded environment stops; comparator counts below are the requested/review baseline. R1.2 is identified by its commit subject below because this file is included in that commit; the completion reply supplies the resulting hash.

| Ticket | Review finding | Failing test/script | Before output | After output | Commit |
|---|---|---|---|---|---|
| R0.1 | REV-012 | script-passwords.test.js | 5 launcher cases failed | 2 focused suites / 13 tests PASS; guards ok | 73bb8fb |
| R0.2 | REV-007 | get-routes.pg.test.js | Seven reported GETs returned 500; expanded sweep found further filter/shadowing defects | 8 tests PASS; 448 GETs / 0 server failures; 71 existing focused mock tests PASS | a1ab470 |
| R0.3 | Typed unknown API 404 | api-not-found.test.js | GET/POST/DELETE returned text/html | 3 cases PASS; focused suites 53 tests PASS | 10bc873 |
| R0.4 | REV-009 | media-role-matrix.pg.test.js | Corrected oracle: 48 roles / 11 mismatches | 48 roles / 0 mismatches; 29 existing focused tests PASS | 8e8791e |
| R0.5 | REV-013 | auth-infrastructure.test.js | Three pool failures returned 401 instead of 503 | 5 cases PASS; 368 focused tests PASS | faa1300 |
| R0.6 | INF-4 | tokens/external-api regression cases | 6to4 accepted; missing exp accepted | 59 focused tests PASS | 4c901ab |
| R0.7 | Unused deps | R0.7 dependency declaration check | axios still declared; reference grep no matches | Declaration check PASS; frontend 31/128 and build PASS | 10a8d93 |
| R0.8 | Redux removal | R0.8 Redux declaration/import check | Toolkit still declared | Check PASS; frontend 32/131; build PASS; Playwright 16 passed / 8 existing skips | 33e40f9 |
| R0.9 | REV-022 / locked decisions | R0.9 documentation check | docs STATE 114 lines instead of 3 | Pointer/decision checks PASS; current docs and archived histories preserved | 126760b |
| R1.1 | REV-001 | project-identity.test.js / project-id-mismatch.pg.test.js | Five valid query-A/body-B calls returned 201 and inserted foreign rows; generic sweep failed | Typed 400 / zero inserted rows; 91-handler sweep; dual-project HSE/asset move checks PASS | 940c41e inventory; 60b735a implementation |
| R1.2 | REV-002 | aggregate-scope.pg.test.js / project-read-scope.test.js | Finance totals 100/22/8 instead of 10/2/1; 28 identical nonempty responses | 238 GETs / zero unexplained identical bodies / zero server errors; scoped totals and owner baseline PASS | R1.2: scope aggregate reads before calculating project totals |

| Gate | Requested/review baseline | Final R1 exit output |
|---|---|---|
| Backend mock | 54 / 1,013 | PASS 59 / 1,048 (+35 tests) |
| Real PG | 68 / 635 | PASS 72 / 656 (+21 tests) |
| Guards | PASS | PASS lint-guards: ok |
| Frontend CI | 31 / 128 | PASS 32 / 131 (+3 regression tests) |
| i18n check | PASS | PASS; parity 35 namespaces / 1,287 keys |
| Production build | PASS | PASS Compiled successfully |
| Fresh golden reconciliation | Not run before remediation | PASS 16 checks / zero discrepancies |
| Focused Playwright login/shell + locale | Existing suite | PASS 16 passed / 8 existing skips at R0.8 |

No plan checkbox was newly ticked. R2-R5 are outside this session; tender is deferred to a later version, localization/accessibility REV-019/020 L5-L11/R6 deferred past closeout. No deployment, external adapters, production or restored-real-data verification performed. Production remains NO-GO. Owner must rotate the historical credential (sole literal in root STATE.md), confirm finance rules/mappings and perform UAT; webhook encryption-key fallback risk remains unchanged. Canonical external media aliases retain denial where portal resolvers are absent. Original pre-change six-gate baseline remains unrun; current exit gates all passed. Explained environment/fixture corrections and legacy GET commitment-write behavior deferred to R3 are recorded in CLOSEOUT_LOG.md. Discovery allows seven shared reference catalogs and nine verified zero-business-value payloads; it permits no nonzero financial aggregate exception.

New files: backend/src/scripts/__tests__/script-passwords.test.js, get-routes.pg.test.js, api-not-found.test.js, media-role-matrix.pg.test.js, auth-infrastructure.test.js, project-identity.test.js, project-id-mismatch.pg.test.js, project-read-scope.test.js, aggregate-scope.pg.test.js; backend/src/services/authorizedProject.js and projectReadScope.js; frontend/src/store/AuthContext.js; frontend/src/components/layout/Sidebar.test.js; docs/R1_PROJECT_ID_INVENTORY.md, R1_AGGREGATE_DISCOVERY.md, R1_AGGREGATE_ALLOWLIST.json and this scorecard. No new migration. Temporary verification scripts/logs were outside tracked source and contain no generated credentials.
