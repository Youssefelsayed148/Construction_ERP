-- Persistent per-identity failed-login throttling. The application stores normalized
-- email identifiers only; passwords and submitted credentials are never recorded.
CREATE TABLE IF NOT EXISTS auth_login_attempts (
  email_key TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_updated_at ON auth_login_attempts(updated_at);
