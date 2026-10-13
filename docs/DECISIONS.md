# Decisions and unresolved confirmations

## 2026-10-13 — Provisional monetary approval limits

Migration `0037_role_action_approval_limits.sql` seeds provisional EGP caps by role and money-moving action. Missing or disabled mappings fail closed. These defaults are for local/test enablement only until the owner/finance team confirms operating thresholds and currency policy.

## 2026-10-13 — MFA design stub

No external identity or paid MFA provider is configured. Before production MFA is implemented, select an owner/admin enforcement policy and support at least TOTP or WebAuthn with single-use recovery codes. MFA enrollment, challenge/session claims, recovery, and audited reset must be designed together; password login lockout is not MFA and must not be represented as MFA coverage.

## 2026-10-13 — Upload scanning

The local upload boundary enforces a 25 MiB cap, extension allowlist, and magic-byte/text validation. ZIP, legacy Office, and spreadsheet formats are blocked. No antivirus service was added because it requires an external service; production deployment needs an isolated scanning adapter before enabling broader document formats.
