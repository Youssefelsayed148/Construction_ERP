CREATE TABLE IF NOT EXISTS engineer_instruction_recommendations (
  id SERIAL PRIMARY KEY,
  instruction_id INTEGER NOT NULL UNIQUE REFERENCES engineer_instructions(id) ON DELETE CASCADE,
  consultant_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('approve', 'reject')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instruction_recommendations_consultant
  ON engineer_instruction_recommendations (consultant_user_id, created_at DESC);
