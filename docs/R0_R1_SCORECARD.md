# R0/R1 scorecard - 2026-10-14

R0 exit GREEN. R1 pending. Command evidence is in CLOSEOUT_LOG.md and root STATE.md. Original six-gate pre-change baseline was interrupted by superseded environment stops; comparator counts below are the requested/review baseline.

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
| R0.9 | REV-022 / locked decisions | R0.9 documentation check | docs STATE 114 lines instead of 3 | Pointer/decision checks PASS; current docs and archived histories preserved | See R0.9 commit in git log |
| R1.1 | REV-001 | Pending | Not yet reproduced in this remediation | Not implemented | None |
| R1.2 | REV-002 | Pending | Not yet reproduced in this remediation | Not implemented | None |

| Gate | Requested/review baseline | R0 exit output |
|---|---|---|
| Backend mock | 54 / 1,013 | PASS 57 / 1,034 (+21 regression tests) |
| Real PG | 68 / 635 | PASS 70 / 644 (+9 regression tests) |
| Guards | PASS | PASS lint-guards: ok |
| Frontend CI | 31 / 128 | PASS 32 / 131 (+3 regression tests) |
| i18n check | PASS | PASS; parity 35 namespaces / 1,285 keys |
| Production build | PASS | PASS Compiled successfully |

No plan checkbox was newly ticked. R1 exit reconciliation has not run. R2-R5 are outside this session; tender is deferred to a later version, localization/accessibility REV-019/020 L5-L11/R6 deferred past closeout. No deployment, external adapters, production or restored-real-data verification performed. Production remains NO-GO. Owner must rotate the historical credential (sole literal in root STATE.md), confirm finance rules/mappings and perform UAT; webhook encryption-key fallback risk remains unchanged. Canonical external media aliases retain denial where portal resolvers are absent. Original pre-change six-gate baseline remains unrun; current exit gates all passed. One optional canvas artifact and one MCP timestamp substring test false positive were corrected with evidence before green gates.

New files: backend/src/scripts/__tests__/script-passwords.test.js, get-routes.pg.test.js, api-not-found.test.js, media-role-matrix.pg.test.js, auth-infrastructure.test.js; frontend/src/store/AuthContext.js; frontend/src/components/layout/Sidebar.test.js; this scorecard. No new migration. Temporary verification scripts/logs were outside tracked source and contain no generated credentials.
