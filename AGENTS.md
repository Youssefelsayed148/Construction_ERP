# Repository instructions

- Use the existing React, Express, PostgreSQL, bilingual EN/AR, and RBAC architecture. Inspect the implementation before changing it; keep changes scoped and maintainable.
- Treat `docs/ERP_CLOSEOUT_PLAN.md` as the phase authority. Audit and status claims require current command output.
- Use additive, versioned SQL migrations only, numbered after the highest existing version. `0030` is a known gap; never reuse it. Keep English/Arabic columns paired and i18n keys namespaced. Preserve the locked decisions in the closeout request (no Redux Toolkit or Socket.io; labour cost from `labor_payments.total_amount`; centralized listener costs; business-rule retention with per-contract override).
- Every endpoint must authenticate, authorize, filter by project scope, return typed errors, write audit events in the same transaction as changes, and have EN/AR keys. New screens need loading, empty, error, localization, RTL-safe styles, and permission-driven visibility.
- Use only local Docker and throwaway databases. Refuse production-looking names; never read or print secrets, edit `.env`, send external messages, call paid services, or execute the legacy role switch. Use stubs for external adapters.
- Preserve existing work. Do not deploy, push, open PRs, force-push, rewrite history, or run destructive migrations without the required authorization.
- For this closeout, commit each implementation slice on `closeout/batch-a-to-6`, update `STATE.md`, `docs/CLOSEOUT_PROGRESS.md`, and `docs/CLOSEOUT_LOG.md` with command output, and run the requested gates at the end of each batch. Do not claim an unrun gate passed.
- At a stop condition, record the state, exact blocker, evidence, and next action in `STATE.md` and report it.
