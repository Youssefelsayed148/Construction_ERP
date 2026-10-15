-- R4.2: atomic fixed-window counters shared by all backend replicas.
CREATE TABLE IF NOT EXISTS distributed_rate_limits (
  scope VARCHAR(40) NOT NULL,
  subject_hash CHAR(64) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  PRIMARY KEY (scope, subject_hash, window_start)
);
CREATE INDEX IF NOT EXISTS idx_distributed_rate_limits_window
  ON distributed_rate_limits (window_start);
