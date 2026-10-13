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
