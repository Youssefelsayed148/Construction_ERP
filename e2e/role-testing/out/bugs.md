# Bugs / findings collected during the run (fixed ones marked)
1. FIXED  projectProvisioning: wizard 500 "invalid input syntax for type date" (Joi Date stringified) - dateStr()
2. FIXED  projectProvisioning: wizard participants created without legacy_*_id, so supplier/client portals never see the project
3. OPEN   quantities POST /measurements/:id/review judged as `create`: site_engineer can approve/reject measurements (incl. its own); no role holds quantities.approve
4. FIXED  qaqcEngine/hseEngine/consultantEngine/eventDispatcher hard-code legacy role keys (site_supervisor, engineer): canonical site_engineer/site_manager/qa_qc_manager/hse_manager could not submit or decide WIRs and permits, and were not notified
5. OPEN   consultant routes use authorize('consultant') (legacy key): consultant_coordinator/reviewer 403 on every /api/consultant write (known, deferred in CLOSEOUT_LOG)
6. OPEN   no API to add project participants after creation; organizations created via API get no legacy_*_id, so new subcontractor/consultant orgs have no portal scope
- 7. FIXED  hse/qaqc engines threw Error.statusCode=403 (ignored by typedRoute) so forbidden deciders got HTTP 500 instead of 403
8. FIXED  consultant write routes + engine role lists accept only legacy key 'consultant' (canonical consultant_coordinator/reviewer 403)
9. OPEN   a client created via API gets no organization mapping, so the client portal cannot show its projects (portal keyed on legacy_client_id of a migrated org)
10. FIXED  consultantEngine threw 32 untyped Errors: every guard failure (wrong stage, wrong role, not found) answered HTTP 500; now typed 400/403/404/409
11. FIXED  handover: project_manager (the role the router names) held no handover.create/edit grant, so only legacy owner/admin could start a handover (migration 0086)
12. OPEN   value-visibility flags (see_client_price / see_subcontractor_price / see_internal_cost) are not enforced on regular REST list endpoints: roles holding module.view see invoice, payment-application and subcontract amounts without the flag (15 probe leaks); only commercial budget/forecast, procurement analytics, client portal and agent/MCP enforce them. Needs an owner decision on masking policy
