# R2.0 UI/API project identity scan — 2026-10-14

Static AST scan of 69 production JS/JSX files under frontend/src examined 360 fetch/API-wrapper call expressions; 39 inline project-bearing mutation calls were identified, with zero project query + mutation-body candidates. Follow-up source inspection covered indirect body/URL variables, three/five-argument request/run/send wrappers and all URLSearchParams builders. Tests/setup files were excluded. No frontend fix is justified by this scan, so no new frontend test or dependency was added.

| File | Call | Verdict |
|---|---|---|
| pages/BOQ.js | POST/PUT sections and items (url/body variables) | Create sends Number(projectId) in body only; edit sends record ID in path; no project query |
| pages/Expenses.js; Invoices.js | POST/PUT record form | Selected numeric form project in body; URL contains only record ID; no duplicate query |
| pages/DocControlExtended.js; ProjectDocuments.js | Documents, transmittals, correspondence, RFIs, submittals | Project query filters belong to reads; mutation URLs have no project query |
| pages/Handover.js; HSE.js | Assets/warranties/claims and HSE creation | Project in body only; dynamic JSA/risk URL branches have no query |
| pages/QHSE.js; QHSEExtended.js; QHSECertificatesTab.js | Quality, incident, inspection, certificate forms | Read query filters are separate from mutation URLs and body projects |
| components/project/ProjectFinanceWorkbench.js | request/run application, budget, forecast, credit and retention commands | Read URL map has project query; write paths are separate, project carried in body only |
| components/project/ProcurementWorkspace.js | api/send PR, RFQ, award, order commands | Project query belongs to load/analytics; write paths have no project query |
| pages/ProjectDetail.js; SiteManagement.js; SiteWorkspace.js | Project child mutations | Path carries active project; inspected payloads have no different project identity |
| services/siteReportQueue.js | POST projects/item.projectId/site-reports | Queued project identifies path; report payload contains no second project ID |
| pages/PortalDashboard.js | Preview and subcontractor/consultant submissions | Preview project in body only; other writes use record path or submission body, not duplicate project query |
| pages/Schedule.js; Reports.js | Activities/baselines and report commands | Project list queries separate from creates; report params are nested saved configuration |
| Remaining URLSearchParams builders | Approvals, assets, clients, HR, items, legal, payroll, projects, work orders, suppliers | Read/search calls; no project query/body write conflict |

Command evidence: temporary AST scanner using already-installed frontend Babel parser: files=69, calls=360, projectWrites=39, dualCandidates=[]. Source searches: project query URLs, all URLSearchParams builders and run/send/request/submit call sites; manual indirect-variable inspection as above. This is a static source conclusion, not runtime coverage of every user-entered value. Ambiguous owner decisions: none found within the requested query/body identity scope. Asset/expense intentional project moves remain governed by existing source/destination policy; no product behavior changed.
