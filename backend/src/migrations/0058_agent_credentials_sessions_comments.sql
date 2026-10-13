CREATE TABLE IF NOT EXISTS api_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  audience VARCHAR(80) NOT NULL DEFAULT 'construction-erp:api-v1'
    CHECK (audience = 'construction-erp:api-v1'),
  token_prefix VARCHAR(24) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL CHECK (cardinality(scopes) > 0),
  token_version INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user_active
  ON api_tokens(user_id, created_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_name VARCHAR(120) NOT NULL DEFAULT 'MCP client',
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'revoked', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_recent
  ON agent_sessions(user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS action_comments (
  id SERIAL PRIMARY KEY,
  action_item_id INTEGER NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  visibility VARCHAR(20) NOT NULL DEFAULT 'internal' CHECK (visibility = 'internal'),
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_comments_action_created
  ON action_comments(action_item_id, created_at, id);
