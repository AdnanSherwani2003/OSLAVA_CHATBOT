-- Migration 001: Initial Chatbot Database Schema

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, status);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  request_id VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL, -- 'USER', 'ASSISTANT', 'SYSTEM_EVENT'
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at ASC);

CREATE TABLE IF NOT EXISTS chat_session_state (
  session_id UUID PRIMARY KEY REFERENCES chat_sessions(id) ON DELETE CASCADE,
  current_event_id UUID,
  current_event_label TEXT,
  current_worker_id UUID,
  current_worker_label TEXT,
  recent_event_results JSONB DEFAULT '[]'::jsonb,
  recent_worker_results JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tool_executions (
  id UUID PRIMARY KEY,
  request_id VARCHAR(100) NOT NULL,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  tool_name VARCHAR(100) NOT NULL,
  arguments_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL, -- 'SUCCESS', 'ERROR'
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL,
  error_code VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_tool_executions_session ON tool_executions(session_id, started_at DESC);

CREATE TABLE IF NOT EXISTS chat_traces (
  id UUID PRIMARY KEY,
  request_id VARCHAR(100) NOT NULL,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  reasoning_effort VARCHAR(20),
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER,
  output_tokens INTEGER,
  duration_ms INTEGER NOT NULL,
  outcome VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_traces_session ON chat_traces(session_id, created_at DESC);
