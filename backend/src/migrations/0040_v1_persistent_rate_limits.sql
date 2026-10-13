-- Per-authenticated-subject fixed-window limiter shared by all API replicas.
CREATE TABLE IF NOT EXISTS v1_rate_limits (
  subject_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  PRIMARY KEY (subject_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_v1_rate_limits_window ON v1_rate_limits(window_start);
