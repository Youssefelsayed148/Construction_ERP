-- Phase 1 security closeout (Batch 3): MFA design stub (docs/MFA_DESIGN_STUB.md has the full plan).
-- Additive and inert: mfa_enabled defaults false and nothing in the codebase sets it or reads
-- mfa_secret_encrypted yet, so this migration changes no runtime behaviour. It exists only so the
-- column shape for the planned TOTP flow is agreed and reserved ahead of building it.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_secret_encrypted TEXT;
