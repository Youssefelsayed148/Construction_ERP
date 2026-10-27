# MFA design stub

Phase 1 of `docs/ERP_CLOSEOUT_PLAN.md` calls for an "MFA design stub" — not a working second
factor, a documented plan plus the reserved schema shape, so a later phase can build it without a
migration that reshapes `users` again. This is that stub. Nothing in the codebase sets or reads
`users.mfa_enabled` or `users.mfa_secret_encrypted` yet (migration `0070_mfa_design_stub.sql`); login
behaviour is completely unchanged until a future phase wires the flow below in.

## Planned flow (TOTP, RFC 6238)

1. **Enrollment** (`POST /api/auth/mfa/enroll`, authenticated, self-service only — same rule as
   `authorizeSelfSession` in `middleware/auth.js`): server generates a random secret, encrypts it with
   the app's existing encryption-at-rest primitive (reuse whatever Phase 1's "secrets never returned
   from GET" item uses for other at-rest secrets — see `services/webhookService.js`'s secret handling
   for the existing pattern), stores it in `mfa_secret_encrypted`, and returns the provisioning URI
   *once* (never again, matching the "show once on creation" rule) for the user to scan into an
   authenticator app. `mfa_enabled` stays `false` until step 2 confirms a correct code.
2. **Confirmation**: user submits the current 6-digit code; the server verifies it against the stored
   secret and only then sets `mfa_enabled = true`. Rejects if `mfa_enabled` is already `true`.
3. **Login** (`routes/auth.js`): after the existing constant-time password check succeeds, if
   `mfa_enabled` is true, the route returns a short-lived, single-purpose "mfa_required" token instead
   of a session — not the final session token — and the client POSTs the TOTP code against a second
   endpoint to exchange it for the real session. This keeps the constant-time/no-disclosure password
   check exactly as it is today; MFA is a second gate after it, not a replacement.
4. **Recovery**: out of scope for the stub. A real rollout needs backup codes or an admin-assisted
   reset path (an admin disabling MFA for a locked-out user should itself be an audited action via
   `policy.recordAuditEvent`, same as any other security-relevant admin action).
5. **Disabling**: self-service disable requires re-entering the current TOTP code (or password, as a
   fallback); an owner/admin disabling another user's MFA is itself audited, same reasoning as the
   last-owner-protection check in `routes/users.js`.

## Why a stub now instead of the full flow

Building TOTP verification, QR provisioning and the enroll/confirm/recover UI is Phase 6/7-sized
frontend and backend work, well beyond what Batch 3's security re-audit can responsibly scope and test
in this session. Reserving the column shape now means Phase 6 does not need another `ALTER TABLE
users` migration just to add the fields the flow above already needs.
