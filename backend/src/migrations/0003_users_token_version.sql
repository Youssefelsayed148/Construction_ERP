-- Phase 1.1: session revocation. Session and delegated v1 tokens carry the user's token_version;
-- bumping it (password change, logout-everywhere) invalidates every token issued before.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
