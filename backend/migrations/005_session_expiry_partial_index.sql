-- 004's composite index (state, updated_at) doesn't help expireStale()'s
-- actual predicate (state NOT IN (...) AND updated_at < cutoff): a
-- negated IN-list on the leading column isn't selective the way a B-tree
-- expects, so the planner can't use it as a range scan. A partial index
-- matching the query's WHERE clause directly is what this needed.
DROP INDEX IF EXISTS sessions_state_updated_at_idx;

CREATE INDEX sessions_active_updated_at_idx ON sessions (updated_at)
  WHERE state NOT IN ('completed', 'failed');
