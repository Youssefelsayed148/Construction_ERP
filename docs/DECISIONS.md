# Decisions and unresolved confirmations

## 2026-10-13 — Provisional monetary approval limits

Migration `0037_role_action_approval_limits.sql` seeds provisional EGP caps by role and money-moving action. Missing or disabled mappings fail closed. These defaults are for local/test enablement only until the owner/finance team confirms operating thresholds and currency policy.

## 2026-10-13 — Finance chart mappings remain provisional

Migration `0042_provisional_gl_account_mappings.sql` adds explicit confirmation state to `gl_account_map` and adds provisional keys for client/subcontractor retention, advance recovery, certificate deductions, and subcontractor certificate cost. Initial local defaults reuse existing COA codes (`1100`, `2000`, `5200`, `4000`, `5150`) so they are configurable without inserting guessed chart accounts. They are not approved accounting policy. Every existing and new mapping is marked provisional until the finance owner confirms the account-purpose pairing in Settings. Editing any mapping clears its confirmation. No postings are backfilled or existing journal entries rewritten. Production finance signoff is blocked until the owner confirms these mappings and reviews certificate posting treatment.

## 2026-10-13 — MFA design stub

No external identity or paid MFA provider is configured. Before production MFA is implemented, select an owner/admin enforcement policy and support at least TOTP or WebAuthn with single-use recovery codes. MFA enrollment, challenge/session claims, recovery, and audited reset must be designed together; password login lockout is not MFA and must not be represented as MFA coverage.

## 2026-10-13 — Upload scanning

The local upload boundary enforces a 25 MiB cap, extension allowlist, and magic-byte/text validation. ZIP, legacy Office, and spreadsheet formats are blocked. No antivirus service was added because it requires an external service; production deployment needs an isolated scanning adapter before enabling broader document formats.

## 2026-10-13 — API token, agent session, and action comment defaults

The repository had no owner-selected details for the platform records in Phase 5.8.1, so implementation uses restrictive defaults: personal API tokens are issued by owner/admin for their own identity, have audience `construction-erp:api-v1`, accept only explicit v1 family scopes (no `api:*` wildcard), default to 30 days, and cannot exceed 90 days. The opaque secret is shown once and stored as a SHA-256 hash; account token-version changes, expiry, and revocation disable it.

MCP session UUIDs are server-created, bound to the authenticating user, and expire after 90 days. Foreign, malformed, closed, and expired IDs are rejected. Internal action comments inherit the parent action's project policy and are not exposed to external portal roles. Comments are append-only. The existing 90-day expiry is the session lifecycle boundary; archival deletion policy can be added if a retention owner requires one.

## 2026-10-14 — Contract retention and advance recovery defaults

New client and subcontract records use the active `retention_percent` business rule when the contract does not explicitly override it; invalid or missing configuration falls back to 10%. Advance amounts are derived from contract value and advance percentage when omitted. Certificate retention is capped by the project retention cap, and automatic advance recovery uses the project's `advance.recovery_percent` setting, defaulting to 0% when absent or invalid. Both are also capped by the contract's remaining balance. Existing subcontract records receive an advance amount of 0 from migration `0061`; finance must configure their outstanding advances before automatic recovery is enabled for them. Manual certificate recovery overrides remain allowed only up to the outstanding contract advance and are recorded in the same audit transaction. Finance must approve these operating defaults before production use.

## 2026-10-14 — ForecastVersion input basis

The current Phase 8 plan defines EAC as `actual cost + estimate to complete (ETC)`, with ETC coming from a per-cost-code ForecastVersion or the remaining commitment/current-budget fallback. New ForecastVersions therefore treat each `forecast_amount` line as ETC. Older approved versions were created under the earlier Phase 13 meaning (forecast amount is total EAC); migration `0062` defaults existing versions to basis `eac`, while the API labels new versions `etc`. The engine retains the old calculation only for versions explicitly marked `eac`. This preserves previously approved finance figures while making new entries match the current plan. Finance owner signoff on this transition remains required before production.

## 2026-10-14 — Phase 9 residential golden-fixture assumptions

The referenced spec 28 is absent from the repository and `docs/legacy`; `docs/ERP_CLOSEOUT_PLAN.md` and the residential template migration are the available scope sources. The template has two towers × 12 floors × four units (96 units). Until the owner supplies or approves a different fixture, `docs/GOLDEN_VALUES.md` uses the existing pilot material quantities/rates (BOQ 1,376,500 EGP), a 1,500,000 EGP budget, a 1,600,000 EGP base contract, a 100,000 EGP approved variation, 20% advance, 10% retention and recovery, and no tax or returns. These figures are a calculation proposal, not approved finance policy and not yet asserted by an end-to-end scenario. They must not be represented as a Phase 9 exit or used for production posting without finance review.
