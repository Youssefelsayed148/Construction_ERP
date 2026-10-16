# Legacy documents

Kept for history only. Do not use them to judge the current state of the system.

If a legacy smoke script is manually run despite being superseded, provide `DEFAULT_OWNER_PASSWORD` in its process environment. The scripts no longer contain a reusable owner credential.

- `SYSTEM_TEST_REPORT.md` and the `*_test.ps1` / `run_tests.ps1` scripts: 18-module API smoke tests written before Phase 8. Superseded by the jest suites in `backend/src/scripts/__tests__` and the Playwright suite in `frontend/e2e`.
- `GAP_ANALYSIS_2026-09-17.md`: static gap analysis, superseded by `docs/ERP_CLOSEOUT_PLAN.md`.
- `IMPLEMENTATION_STATUS_planning_pass.md`: status from the planning pass, before the repository was audited.

Current status: `docs/IMPLEMENTATION_STATUS.md`.
