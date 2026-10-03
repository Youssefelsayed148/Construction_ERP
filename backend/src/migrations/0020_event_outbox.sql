-- Phase 3.3: the transactional outbox and its delivery queue.
--
-- fireEvent now writes the same event twice in the caller's transaction: once to event_log (the audit
-- trail of what happened) and once to event_outbox (the delivery queue). The dispatcher
-- (services/outboxDispatcher.js) delivers to the routed consumers at least once:
--   * a short claim marks a batch as 'dispatching' under SELECT ... FOR UPDATE SKIP LOCKED, so two
--     dispatcher instances can never claim the same row;
--   * a success stamps dispatched_at and 'delivered'; a failure increments the attempt count, sets
--     next_attempt_at by backoff, and dead-letters the event after the attempt limit;
--   * a dispatcher that dies mid-claim leaves a stale 'dispatching' row; the reaper returns those to
--     'pending' (delivery is at-least-once, so consumers dedupe);
--   * every row carries a stable event_id (never reused, even across redelivery) so consumers can be
--     idempotent; the project-cost consumers key on (source_type, source_id) and replay-safely recompute.
--
-- Existing rows: no rows exist yet — this is a new queue. Legacy event_log rows without dispatched_at are
-- seeded by the dispatcher at startup with event_id 'log-<id>' (see seedLegacyEventLog); nothing in this
-- migration reads existing tables. Nothing to dedupe on a restored copy.
--
-- background_sweep_runs is the observability ledger for the six background sweeps (Phase 3.4): one row
-- per run, error text on failure. `npm run outbox:stats` reads both to print the pending/failed/dead
-- counts, so no separate admin UI is needed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_outbox') THEN
    CREATE TABLE event_outbox (
      id BIGSERIAL PRIMARY KEY,
      event_id VARCHAR(64) NOT NULL DEFAULT gen_random_uuid()::text,
      event_type VARCHAR(100) NOT NULL,
      entity_type VARCHAR(100),
      entity_id INTEGER,
      user_id INTEGER,
      user_name VARCHAR(200),
      user_role VARCHAR(60),
      payload JSONB NOT NULL DEFAULT '{}',
      status VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending | dispatching | delivered | dead
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 8,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_error TEXT,
      source_event_log_id INTEGER,                     -- set when the row came from event_log catch-up
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      dispatched_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX uq_event_outbox_event_id ON event_outbox (event_id);
    CREATE INDEX idx_event_outbox_claim ON event_outbox (status, next_attempt_at);
    CREATE INDEX idx_event_outbox_type ON event_outbox (event_type);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'background_sweep_runs') THEN
    CREATE TABLE background_sweep_runs (
      id BIGSERIAL PRIMARY KEY,
      sweep VARCHAR(60) NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ,
      status VARCHAR(20),                              -- ok | failed | skipped
      error TEXT
    );
    CREATE INDEX idx_background_sweep_runs_sweep ON background_sweep_runs (sweep, started_at);
  END IF;
END $$;

-- Report query (run on a restored copy, or `npm run outbox:stats`):
--   SELECT status, count(*) FROM event_outbox GROUP BY status;
