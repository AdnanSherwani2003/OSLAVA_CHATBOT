-- Migration 002: Pending Actions & Confirmations Schema

CREATE TABLE IF NOT EXISTS pending_actions (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  display_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_request_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  execution_request_id VARCHAR(100),
  execution_error_code VARCHAR(100),
  result_summary JSONB
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_session ON pending_actions(session_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_actions_user ON pending_actions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_actions_expiry ON pending_actions(expires_at) WHERE status = 'PENDING';
