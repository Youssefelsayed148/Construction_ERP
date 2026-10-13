CREATE TABLE IF NOT EXISTS notification_deliveries (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(30) NOT NULL
    CHECK (channel IN ('in_app', 'email', 'push', 'sms', 'whatsapp')),
  event_type VARCHAR(255),
  entity_type VARCHAR(100),
  entity_id INTEGER,
  action_item_id INTEGER,
  idempotency_key CHAR(64) NOT NULL,
  provider VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'undelivered', 'suppressed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  last_error_code VARCHAR(100),
  next_retry_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, channel, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_due
  ON notification_deliveries(next_retry_at, id) WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user_recent
  ON notification_deliveries(user_id, created_at DESC);

ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS notification_id BIGINT REFERENCES notifications(id) ON DELETE SET NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS delivery_id BIGINT REFERENCES notification_deliveries(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_delivery
  ON notifications(delivery_id) WHERE delivery_id IS NOT NULL;
