-- Brainstorm persistence tables
-- Run this migration in Supabase SQL Editor

-- Sessions table
CREATE TABLE IF NOT EXISTS brainstorm_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Session',
  source_text TEXT NOT NULL,
  current_phase INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Messages table
CREATE TABLE IF NOT EXISTS brainstorm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES brainstorm_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  is_source BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_brainstorm_sessions_user_id ON brainstorm_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_brainstorm_messages_session_id ON brainstorm_messages(session_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_brainstorm_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brainstorm_sessions_updated_at
  BEFORE UPDATE ON brainstorm_sessions
  FOR EACH ROW EXECUTE FUNCTION update_brainstorm_session_timestamp();

-- RLS Policies (users can only access their own sessions)
ALTER TABLE brainstorm_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE brainstorm_messages ENABLE ROW LEVEL SECURITY;

-- Sessions: users can CRUD their own
CREATE POLICY "Users can view own sessions"
  ON brainstorm_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sessions"
  ON brainstorm_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON brainstorm_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON brainstorm_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Messages: users can CRUD messages in their own sessions
CREATE POLICY "Users can view messages in own sessions"
  ON brainstorm_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM brainstorm_sessions
    WHERE brainstorm_sessions.id = brainstorm_messages.session_id
    AND brainstorm_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can create messages in own sessions"
  ON brainstorm_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM brainstorm_sessions
    WHERE brainstorm_sessions.id = brainstorm_messages.session_id
    AND brainstorm_sessions.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete messages in own sessions"
  ON brainstorm_messages FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM brainstorm_sessions
    WHERE brainstorm_sessions.id = brainstorm_messages.session_id
    AND brainstorm_sessions.user_id = auth.uid()
  ));
