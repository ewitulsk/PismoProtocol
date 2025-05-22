CREATE TABLE position_liquidated_events (
    id SERIAL PRIMARY KEY,
    transaction_hash TEXT NOT NULL,
    position_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL
); 