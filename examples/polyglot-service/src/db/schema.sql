CREATE TABLE score_events (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  raw_value INTEGER NOT NULL,
  normalized_score INTEGER NOT NULL,
  risk_band TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX score_events_user_idx ON score_events (user_id);
