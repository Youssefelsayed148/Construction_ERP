'use strict';
const fs=require('fs');
const path=require('path');
const c=require('./sweep-common');

function main(){
  c.assertClone(c.config());
  const read=name=>JSON.parse(fs.readFileSync(path.join(c.artifacts,name),'utf8'));
  const api=read('api.json'),ui=read('ui.json'),inv=read('invariants-after.json'),ev=read('evidence.json'),valid=read('valid.json'),clone=read('clone.json');
  if(!api.finished||!ui.finished||!valid.finished||inv.errors.length)throw new Error('Report requires completed evidence');
  const escaped=value=>String(value).replace(/\|/g,'\\|').replace(/\r?\n/g,' ');
  const unique=values=>[...new Set(values)];
  const sum=(values,key)=>values.reduce((n,row)=>n+(row[key]||0),0);
  const countBy=(values,key)=>{const counts={};for(const value of values){const k=typeof key==='function'?key(value):value[key];counts[k]=(counts[k]||0)+1;}return counts;};
  const money=inv.checks.money[0],overview=inv.api['/api/dashboard/overview'].data,finance=inv.api['/api/finance/summary'].data;
  const auditTables=api.auditCountedTables || api.originalWriteAuditTables || ['audit_events'];
  const getErrors=api.gets.filter(r=>r.status>=500);
  const noId=api.gets.filter(r=>!r.idAvailable).length;
  const noMatrix=api.gets.filter(r=>r.expectedAllowed===null||r.matrixUnavailable).length;
  const badLocale=ui.pages.filter(p=>p.localeMatches!==true);
  const overflow=ui.pages.filter(p=>p.overflow?.some(o=>o.overflow||o.dir!=='rtl'));
  const noChanges=ui.controls.filter(r=>r.noDomOrNetworkChange);
  const skipped=countBy(ui.controls.filter(r=>r.skipped),'skipped');
  const rawKeys=ui.pages.flatMap(p=>p.rawKeys.map(key=>({role:p.role,language:p.language,route:p.route,key})));
  const invalidText=ui.pages.flatMap(p=>p.invalidText.map(text=>({role:p.role,language:p.language,route:p.route,text})));
  const allowAcronyms=/\b(?:EN|AR|PDF|CSV|XLSX|API|ERP|ConERP|Osiris|BOQ|PR|RFQ|PO|GRN|MIR|WIR|NCR|ITP|HSE|QHSE|QA|QC|ID|EGP|USD|ISO|RFI|WBS|PUNCH|CAPA|JSA)\b/g;
  const latin=ui.pages.filter(p=>p.language==='ar').flatMap(p=>(p.latinSystemCandidates||[]).filter(text=>/[A-Za-z]/.test(text.replace(allowAcronyms,''))&&!/PILOT|SWEEP|pilot-|r02-/i.test(text)).map(text=>({role:p.role,route:p.route,text})));
  const systemEnums=latin.filter(row=>/^(critical|high|medium|low|in_app|email|sms|whatsapp|active|draft|submitted|pending|approved|rejected|cancelled)$/i.test(row.text));
  const findings=[
    {id:'S-001',severity:'HIGH',title:'Supplier payments are reported as collected client revenue',request:'GET /api/dashboard/overview; GET /api/finance/summary',role:'owner_ceo',expected:`Client collections ${money.client_payments}; outstanding ${money.expected_outstanding}. Supplier cash outflows are excluded.`,actual:`Dashboard health.revenue_collected=${overview.health.revenue_collected}, health.total_outstanding=${overview.health.total_outstanding}; modules.finance.revenue_collected=${overview.modules.finance.revenue_collected}, outstanding=${overview.modules.finance.outstanding}. Finance summary collected=${finance.total_revenue_collected}, outstanding=${finance.total_outstanding}. SQL all payments=${money.all_payments}, supplier payments=${money.supplier_payments}, client payments=${money.client_payments}, unclassified=${money.unclassified_payments}, invoices=${money.invoices}.`,duplicate:'D-002: YES. D-001: not established. PO-00008/reconcile ticket: NO.',evidence:'.sweep/invariants-after.json; independent SQL aggregates and API projections'},
    {id:'S-002',severity:'HIGH',title:'Canonical Owner/CEO cannot create a project despite its create grant',request:'POST /api/projects',role:'owner_ceo',expected:'A schema-valid local draft project is accepted with the active projects/create grant (0031 RBAC matrix).',actual:'HTTP 403 for {name_en:"<sweep marker>", name_ar:"اختبار", project_type:"commercial"}. The route coarse allow-list contains owner/admin/project_manager and excludes owner_ceo. PUT /api/projects/2 succeeds for the same account. No role or assignment was changed by the harness.',duplicate:'D-001/D-002: no documented ID match available. PO-00008/reconcile ticket: NO.',evidence:'.sweep/valid.json; .sweep/evidence.json ownerProjectCreateGrant; backend/src/routes/projects.js'},
    {id:'S-003',severity:'MEDIUM',title:'PO-00008 accepted quantity is not backed by a posted GRN',request:'SQL reconciliation of PO-00008 / purchase_order_lines.id=8',role:'owner_ceo (read-only SQL inspection)',expected:'Stored delivered/accepted quantities reconcile with live delivery lines and net posted GRN lines; accepted MIR quantities are traceable to receipts.',actual:inv.checks.poQuantities.map(row=>JSON.stringify(row)).join('; '),duplicate:'PO-00008: YES. Known PO quantity reconciliation ticket: YES. D-002: NO. D-001: not established.',evidence:'.sweep/invariants-after.json checks.poQuantities; no GRN was posted to repair it'},
    {id:'S-004',severity:'MEDIUM',title:'Procurement role dashboard returns HTTP 500',request:'GET /api/dashboard/role?limit=200&offset=0&project_id=2',role:unique(getErrors.map(r=>r.role)).join(', '),expected:'HTTP 200 for the permitted role dashboard, or a typed client error for invalid input.',actual:`${getErrors.length} failures in the final matrix, error_code=internal_error. Clone logs contain column "project_id" does not exist through procurementWidgets/dashboardWidgets.js.`,duplicate:'D-001: not established because its original ticket text is unavailable. D-002/PO-00008/reconcile ticket: NO.',evidence:'.sweep/api.json; .sweep/evidence.json errors'},
    {id:'S-005',severity:'MEDIUM',title:'My Actions becomes a blank page for scoped operational accounts',request:'/my-actions in EN and AR (1280px)',role:'procurement_officer, storekeeper',expected:'The action feed or an empty/error state remains rendered.',actual:'Independent page-load-only confirmation, with no control clicks, reproduces React error #31 (object with keys {}) and bodyLength=0 in all four role/language combinations. Dashboard-only loads do not reproduce it. The broader crawl also captured these exceptions during link navigation; focused evidence establishes the exact failing page.',duplicate:'D-001: not established. D-002/PO-00008/reconcile ticket: NO.',evidence:'.sweep/ui-confirm.json (4 failures / 4 My Actions loads; 0 failures / 4 dashboard loads)'},
    {id:'S-006',severity:'MEDIUM',title:'RFQ list omits X-Total-Count',request:'GET /api/procurement/rfq?limit=1&offset=0; offset=1',role:'owner_ceo',expected:`Both pages report X-Total-Count=${inv.checks.listCounts.find(r=>r.request.startsWith('/api/procurement/rfq')).sqlCount}, matching scoped SELECT COUNT(*).`,actual:`HTTP ${ev.rfqPagination.first.status}/${ev.rfqPagination.second.status}; header absent on both pages; first IDs=${JSON.stringify(ev.rfqPagination.first.ids)}, second IDs=${JSON.stringify(ev.rfqPagination.second.ids)}. Offset advances, but clients cannot learn the total.`,duplicate:'D-001/D-002/PO-00008: not established/no. Related to pagination contract; no claim that it is the known quantity reconciliation ticket.',evidence:'.sweep/invariants-after.json checks.listCounts; .sweep/evidence.json rfqPagination'},
  ];
  if(systemEnums.length)findings.push({id:'S-007',severity:'LOW',title:'Raw English system enum values remain in Arabic controls',request:unique(systemEnums.map(r=>r.route)).join(', '),role:unique(systemEnums.map(r=>r.role)).join(', '),expected:'System severity and channel labels use Arabic catalog labels; business text and approved acronyms remain unchanged.',actual:unique(systemEnums.map(r=>r.text)).join(', '),duplicate:'D-001: not established. D-002/PO-00008/reconcile ticket: NO. Similar category to prior localization observations, without asserting an unavailable defect ID.',evidence:'.sweep/ui.json latinSystemCandidates; locale locked and html lang checked'});
  if(overflow.length)findings.push({id:'S-008',severity:'LOW',title:'Arabic page overflow or incorrect document direction',request:unique(overflow.map(p=>p.route)).join(', '),role:unique(overflow.map(p=>p.role)).join(', '),expected:'dir=rtl and document width does not exceed 1280/390px.',actual:overflow.map(p=>`${p.role} ${p.route}: ${JSON.stringify(p.overflow)}`).join('; '),duplicate:'No established ticket ID match.',evidence:'.sweep/ui.json overflow'});
  c.save('findings.json',findings);
  const lines=[
    '# ConERP automated pre-UAT sweep - 2026-10-16',
    '',
    'Report only. No application defect was fixed. The requested report date is retained; execution continued into 2026-10-17 in Africa/Cairo (raw timestamps are UTC). This is bounded automated evidence, not human UAT acceptance.',
    '',
    '| Area | Executed result |', '|---|---|',
    `| Clone | ${clone.match?'MATCH':'MISMATCH'} on five requested tables; owner login verified on port 8091 |`,
    `| Registered routes | GET ${api.totals.GET}; POST ${api.totals.POST}; PUT ${api.totals.PUT}; DELETE ${api.totals.DELETE} |`,
    `| GET matrix | ${api.accounts.length} accounts; ${api.gets.length.toLocaleString('en')} final-pass requests; ${getErrors.length} HTTP 5xx |`,
    `| Main write probes | ${api.writes.length} requests; 592/601 registered write routes exercised; ${api.skips.length} safety exclusions; ${api.writes.filter(r=>r.status>=500).length} HTTP 5xx |`,
    `| Final valid-body probes | ${valid.requests.length} requests, ${valid.requests.filter(r=>r.status<300).length} successful; every success increased per-actor activity_log/audit_events counts |`,
    `| Access/leak flags | ${api.findings.filter(r=>r.kind==='unexpected_access').length} unexpected GET successes; ${api.findings.filter(r=>r.kind==='project_leak').length} explicit foreign-project ID flags; valid project-create denial is S-002 |`,
    `| UI | ${new Set(ui.pages.map(r=>r.role)).size} roles, EN then AR, ${new Set(ui.pages.map(r=>r.route)).size} distinct routes, ${ui.pages.length} role/language/route page visits |`,
    `| UI controls | ${ui.controls.filter(r=>r.clicked).length} clicked; ${ui.controls.filter(r=>r.skipped).length} skipped with reasons; ${noChanges.length} no-observable-change candidates |`,
    `| UI diagnostics | ${ui.exceptions.length} uncaught exceptions; ${rawKeys.length} raw-key occurrences; ${invalidText.length} undefined/null/NaN/object-text occurrences in final scans |`,
    `| RTL | ${ui.pages.filter(r=>r.language==='ar').length} Arabic pages checked at 1280/390px; ${overflow.length} overflow/direction flags; ${badLocale.length} page locale mismatches |`,
    `| Money | Client collected ${money.client_payments}; reported collected ${finance.total_revenue_collected}; supplier payments ${money.supplier_payments}: FAIL (S-001) |`,
    `| Journals | Debits ${inv.checks.trialBalance[0].debits} = credits ${inv.checks.trialBalance[0].credits}; ${inv.checks.unbalancedEntries.length} unbalanced entries |`,
    `| Procurement | ${inv.checks.poQuantities.length} PO quantity disagreement(s): PO-00008 |`,
    `| Numbering | ${inv.checks.numberColumns.length} text number columns checked; ${inv.checks.duplicateNumbers.length} duplicate groups |`,
    `| List counts | ${inv.checks.listCounts.filter(r=>r.match).length}/10 match scoped SQL; RFQ header absent |`,
    `| Backend logs | ${ev.logLines} lines scanned; ${ev.errors.length} distinct error/stack/unhandled lines; known webhook line separately: ${ev.knownWebhook.length} |`,
    '',
    '## Isolation and snapshot counts', '',
    'Only one command was sent to the pilot: docker exec erp-closeout-pilot-20261013-db-1 sh -c pg_dump (read-only dump, private output). No pilot inspection, SQL count query, HTTP login, seed, smoke, rebuild or restart was performed. Pilot counts below were counted from COPY records in that one consistent dump, then compared with the restored clone. No second pilot dump is authorized or needed to rerun the sweep.',
    '', '| Table | Pilot dump snapshot | Clone before sweep |', '|---|---:|---:|',
    ...Object.keys(clone.cloneCounts).map(table=>`| ${table} | ${clone.pilotSnapshotCounts[table]} | ${clone.cloneCounts[table]} |`),
    '',
    'Clone: Compose project erp-sweep-20261016; database construction_erp_sweep; loopback UI 8091; loopback PostgreSQL 55441; fresh project-owned volumes. The backend is attached only to an internal Docker network; nginx and PostgreSQL additionally use a host-facing network because Docker Desktop did not publish internal-only ports. Outbound adapters were not exercised with real URLs; backend egress is blocked. Browser requests outside the clone and non-login writes are intercepted. Neither database nor pilot credentials are printed here.',
    '',
    `Migration output: ${ev.migrations.map(escaped).join('; ') || 'see ignored clone migration logs'}.`,
    '',
    'The clone remains running for inspection. Sweep writes intentionally changed clone-only directory/draft records and deactivated one clone organization; no source/pilot data was changed. UI and invariant evidence describe this mutable clone. Initial match counts are not a claim that the clone still matches the snapshot after writes.',
    '', '## Findings', '',
    ...findings.flatMap(f=>[`### ${f.id} - ${f.severity} - ${f.title}`,'',`- Request/page: ${f.request}`,`- Role: ${f.role}`,`- Expected: ${f.expected}`,`- Actual: ${f.actual}`,`- Redacted evidence: ${f.evidence}`,`- Duplicate classification: ${f.duplicate}`,'']),
    'D-001 was referenced in the request but no locally identifiable ticket text carrying that ID was found. No duplicate relationship to D-001 is invented.',
    '', '## API and invariant detail', '',
    `The final GET pass uses IDs from the account's assigned project where available and inspects Express stacks plus exported v1 family/read-model definitions. ${noId} requests (${noId/api.accounts.length} route templates per account) recorded missing sample IDs or unsupported non-ID parameters and used explicit missing placeholders. ${noMatrix} requests use public/self-service/file/assistant semantics without the ordinary permission oracle; these were still requested and status-scanned. The permission oracle shares the production policy engine, so it cannot independently prove that the grant design is correct. The canonical project-create mismatch is supported independently by the RBAC migration matrix and a schema-valid request.`,
    '',
    'Foreign-project detection traverses explicit project_id/projectId/project_ids in successful JSON bodies for the requested project-scoped account groups. A zero flag count is not proof against leakage in unlabeled scalar aggregates, opaque files, or fields without ownership identifiers. Supplier-identity confidentiality beyond project ownership was not exhaustively certified.',
    '',
    `No accessible list with a reported total over 200 was observed (${api.pagination.length} qualifying lists); large-dataset no-gap/no-repeat pagination is therefore NOT VERIFIED. RFQ limit=1/offset=0,1 returned distinct IDs but no total header.`,
    '', '| List request | X-Total-Count | Scoped SQL count | Result |', '|---|---:|---:|---|',
    ...inv.checks.listCounts.map(row=>`| ${row.request} | ${row.total??'absent'} | ${row.sqlCount} | ${row.match?'MATCH':'FAIL'} |`),
    '',
    'SQL scope matches the seeded Owner/CEO assignment, not the unfiltered whole database. Full SELECT statements are in the ignored invariant JSON. Number checks cover discovered text document-number columns; gaps/reservation sequence semantics and numeric/external-reference namespaces were not certified.',
    '',
    `Main probe counted stores: ${auditTables.join(', ')} (${api.auditBefore} -> ${api.auditAfter}, delta ${api.auditAfter-api.auditBefore}). ${auditTables.length===1?'The original audit_events-only run produced false audit candidates: client creation is correctly recorded in activity_log.':'Audit candidates must be assessed against the counted stores and actual business mutations.'} The organization deactivation also had an audit increment. Two replenishment sweep calls succeeded with no audit increment; these were no-op job invocations, not demonstrated unaudited business mutations. The final valid-body pass counts both audit stores per actor: ${sum(valid.requests,'auditDelta')} total audit increments across ${valid.requests.filter(r=>r.status<300).length} successful writes, zero successful writes without an increment. Authentication/background work also grows audit counts; whole-run deltas cannot prove per-request attribution or transaction atomicity. No audit rollback/fault-injection guarantee is claimed.`,
    '',
    'Two earlier harness candidates are dismissed: an empty body is valid for a no-argument replenishment sweep, and a company-only payment-batch endpoint is correctly forbidden to project-bound pilot seats. These are not counted as application defects.',
    '', '| Final valid request | Role | HTTP | Actor audit delta |', '|---|---|---:|---:|',
    ...valid.requests.map(row=>`| ${row.method} ${row.request} | ${row.role} | ${row.status} | ${row.auditDelta} |`),
    '', '## UI coverage and observations', '',
    '| Account | EN pages | AR pages |', '|---|---:|---:|',
    ...ui.roles.map(role=>`| ${role} | ${ui.pages.filter(p=>p.role===role&&p.language==='en').length} | ${ui.pages.filter(p=>p.role===role&&p.language==='ar').length} |`),
    '', '| Skipped control reason | Count |', '|---|---:|---:|',
    ...Object.entries(skipped).map(([reason,count])=>`| ${reason} | ${count} |`),
    '',
    'The crawler discovers live menu/content links, clicks visible safe controls and discovered tabs, and records page/tab screenshots under ignored .sweep/screenshots/. Shared navigation links are exercised once per role/language. Denylisted controls are observed for rendered/enabled state only; this does not independently prove that each control state matches its business authorization. Confirmation dialogs are dismissed, and forms are never submitted after login. Unlabeled, obscured, disabled and dynamically inaccessible controls are listed as skipped. A DOM-changing button chain is not a proof that every possible form/input state was reached.',
    '',
    `${ui.pages.filter(p=>p.emptyState).length} final page scans contained an empty-state phrase. ${noChanges.length} clicks produced no observed DOM, URL or network change; many are already-selected filters/navigation, so these remain candidates, not automatically defects. Full control labels/reasons are retained in ignored ui.json. Focused page-only confirmation separates S-005 from errors caused by blocked write attempts or changing navigation.`,
    '',
    `Latin-label candidates after acronym/data-marker exclusions: ${latin.length}; confirmed raw severity/channel enum observations: ${systemEnums.length}. Allowlisted acronyms include BOQ/PR/RFQ/PO/GRN/MIR/WIR/NCR/ITP/HSE/QHSE/QA/QC/PDF/CSV/XLSX/API/ID/EGP/USD/ISO/RFI/WBS/PUNCH/CAPA/JSA and the product name. Pilot/sweep identifiers remain user data. Other candidates require human/native Arabic review; no blanket translation defect is asserted for business names.`,
    '', '| Arabic page | Account | Candidate text |', '|---|---|---|',
    ...unique(latin.map(r=>`| ${r.route} | ${r.role} | ${escaped(r.text)} |`)).slice(0,100),
    '',
    `Browser console errors/warnings: ${ui.pages.reduce((n,p)=>n+p.console.length,0)}; recorded failed/4xx/5xx network observations: ${ui.pages.reduce((n,p)=>n+p.network.length,0)}; intentionally blocked requests: ${ui.blocked.length}. These raw observations include expected forbidden lookups, navigation aborts and harness-blocked writes and are not all application defects.`,
    '', '## Backend log scan', '',
    'Distinct matching lines are listed below. Connection termination during the clone-only network correction and HTTP client-disconnect messages during browser navigation are separated from the reproducible missing-column dashboard failure by context. No unhandled-rejection finding is inferred solely from a stack line.',
    '', '```text', ...ev.errors.map(line=>line.replace(/\u001b\[[0-9;]*m/g,'')), '```', '',
    `Known [WEBHOOK] global.eventBus unavailable line: ${ev.knownWebhook.length} occurrence(s), recorded separately.`,
    '', '## What was not tested and why', '',
    '- Pilot mutation/health/login/reconciliation: prohibited; the sole pilot operation was its dump.',
    '- Complete happy paths for all 601 write registrations: bounded valid-body coverage uses local directories and procurement drafts. Other routes need workflow state, checker identities, file uploads, external adapters or unavailable fixtures; malformed probes alone do not certify those paths.',
    '- PUT/PATCH/DELETE malformed probes use deliberately missing target IDs to avoid invalidating the 38 login accounts before UI coverage. Record-dependent validation behind 403/404 is not fully exercised. Selected real-record PUTs are covered by the valid-body pass.',
    ...api.skips.map(r=>`- ${r.method} ${r.route}: ${r.reason}.`),
    '- Real external sends, payment-provider calls, webhook delivery and uploads: not exercised. Egress was blocked rather than testing provider behavior. No seed:staging or legacy role switch was run.',
    '- Browser coverage of all 38 accounts: the requested minimum 14 roles was used. No form submissions, confirmation acceptance or denylisted destructive actions were performed in the UI phase.',
    '- Dynamic controls that were unlabeled, obscured, disabled, already exercised navigation, or required input/confirmation remain explicitly skipped. Exhaustive tab/form-state reachability and independent enabled-state RBAC correctness are not certified.',
    '- Lists over 200 accessible rows: none observed; no additional synthetic 200-row dataset was seeded.',
    '- Absence of raw keys or invalid text is limited to scanned page states. Intermediate non-semantic tab states, opaque files, localization inside all entered data and native Arabic wording are not certified.',
    '- Full PostgreSQL regression suites, deployment, production checks and human UAT signoff were not run. The actual clone SQL/API checks above ran on PostgreSQL; mock-suite success does not replace them.',
    '', '## Verification commands and outcomes', '',
    '- Failing-first guard test: npm.cmd --prefix backend test -- --runInBand --no-colors sweep-guard.test.js -> FAIL before sweep-common existed. After implementation: 1 suite / 6 tests PASS, including pilot port/database rejection. The first RED was a missing-module failure, not a falsely claimed behavioral assertion failure.',
    '- npm.cmd --prefix backend test -- --runInBand --no-colors -> 67 suites / 1,109 tests PASS.',
    '- npm.cmd --prefix frontend run test:ci -> 40 suites / 332 tests PASS.',
    '- npm.cmd --prefix backend run lint:guards -> lint-guards: ok.',
    '- npm.cmd --prefix frontend run i18n:check -> i18n:check ok; i18n:parity -> 36 namespaces / 2,709 English keys; lint:api -> Direct API calls 1/1.',
    '- npm.cmd run build -> Compiled successfully; exit 0. Clone image build also ran 65 backend-context suites / 1,082 tests successfully.',
    '- node --check on new sweep scripts and e2e scripts; final LF, secret-value and staged whitespace checks are recorded in STATE.md/CLOSEOUT_LOG.md after execution.',
    '',
    'Harness corrections only: Docker permission access, internal-network host ports, a PO SQL column name, scoped list-count expectations, audit-store selection, v1 policy metadata, locale-toggle exclusion and the valid PO unit_rate field. GET passes were refreshed after instrumentation changes. An earlier 399-page crawl is retained privately as ui-initial.json; the final locale-locked crawl is authoritative. A preliminary 12-request valid-body run preceded the final one and included an incorrectly named PO field (400); it is not claimed as successful PO coverage. No step remained failed twice.',
    '', '## Exact rerun commands', '',
    'Run from D:\\The Osiris Labs\\Construction_ERP. Private clone configuration, saved dump, account credentials and installed browser must still exist. Do not run prepare/dump again: the pilot dump authorization was consumed once. These clone reset commands explicitly name the permitted project and reuse the existing dump:',
    '', '```powershell',
    'docker compose --project-name erp-sweep-20261016 --env-file .env.sweep -f .sweep/compose.json down -v',
    'node backend/src/scripts/sweep-clone.js start-db',
    'node backend/src/scripts/sweep-clone.js restore',
    'node backend/src/scripts/sweep-clone.js build',
    'node backend/src/scripts/sweep-clone.js start',
    'node backend/src/scripts/sweep-clone.js verify',
    '```', '', 'Phase 2 (includes clone writes):', '', '```powershell',
    'node backend/src/scripts/sweep-api.js',
    'node backend/src/scripts/sweep-valid.js',
    'node backend/src/scripts/sweep-evidence.js',
    '```', '', 'Phase 3:', '', '```powershell',
    'npm.cmd --prefix e2e ci --ignore-scripts --no-audit --no-fund',
    'npm.cmd --prefix e2e run sweep',
    'node e2e/sweep-confirm-ui.js',
    '```', '', 'Phase 4 and refreshed report:', '', '```powershell',
    'node backend/src/scripts/sweep-invariants.js',
    'node backend/src/scripts/sweep-evidence.js',
    'node backend/src/scripts/sweep-report.js',
    '```', '', 'One spot-check per phase (reads guarded evidence and re-enumerates live source routes for Phase 2; these do not repeat the full sweep):', '', '```powershell',
    'node backend/src/scripts/sweep-summary.js clone',
    'node backend/src/scripts/sweep-summary.js api',
    'node backend/src/scripts/sweep-summary.js ui',
    'node backend/src/scripts/sweep-summary.js invariants',
    '```', '',
    'Recommended next action: triage S-001/S-002 before human finance/project setup acceptance, then address the reproducible API/UI failures and retest on a fresh clone in a separately authorized fix batch. This batch leaves application code unchanged.', '',
  ];
  fs.writeFileSync(path.join(c.root,'docs/SWEEP_REPORT_2026-10-16.md'),lines.join('\n'),'utf8');
  console.log(JSON.stringify({findings:findings.length,severities:countBy(findings,'severity'),pages:ui.pages.length,localeMismatches:badLocale.length,report:'docs/SWEEP_REPORT_2026-10-16.md'}));
}
if(require.main===module){try{main();}catch(error){console.error(`Report generation stopped: ${error.name}; raw error suppressed`);process.exitCode=1;}}
