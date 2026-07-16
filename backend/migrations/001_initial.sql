CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  concept TEXT NOT NULL CHECK (concept = 'load_balancing'),
  state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE session_events (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  type TEXT NOT NULL,
  action TEXT,
  command TEXT,
  explanation TEXT NOT NULL,
  result JSONB,
  timestamp TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER
);

CREATE INDEX session_events_session_timestamp_idx ON session_events (session_id, timestamp);
