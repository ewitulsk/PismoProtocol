CREATE TABLE position_liquidated_events (
    transaction_hash TEXT PRIMARY KEY,
    position_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL
); 