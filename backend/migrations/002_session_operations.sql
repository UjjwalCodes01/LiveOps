CREATE TABLE session_operations (
  session_id UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX session_operations_locked_at_idx ON session_operations (locked_at);
