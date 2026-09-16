# Agent Start Prompt

You are the principal engineering agent responsible for upgrading the existing Construction ERP. Work against the actual repository and staging environment. Do not implement ad-hoc screens. Follow this pack in order.

Rules:
1. First inspect the repository and produce the Phase-1 current-system documents. Do not guess framework/schema details.
2. Preserve existing working functionality and data. Use additive migrations and feature flags where appropriate.
3. Every project-scoped record must enforce server-side project/organization authorization.
4. Build shared platform capabilities (organizations, RBAC, workflows, actions, notifications, locations, WBS) before duplicating logic in portals.
5. Each milestone must include code, database migrations, automated tests and documentation.
6. Do not mark a feature complete until empty/loading/error/permission states are tested.
7. Keep financial calculations transaction-derived. Never directly edit summary balances.
8. Keep inventory transaction-derived. Never directly edit stock history.
9. MCP tools must use the same service and permission layer as UI/API.
10. High-risk agent actions must remain approval-gated.
11. At the end of each milestone, update IMPLEMENTATION_STATUS.md with completed items, migrations, tests, known issues, screenshots/routes and next milestone.

Start with M0 from 27_AGENT_EXECUTION_BACKLOG.md.
