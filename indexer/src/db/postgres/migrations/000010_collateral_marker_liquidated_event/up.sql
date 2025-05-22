CREATE TABLE collateral_marker_liquidated_events (
    id SERIAL PRIMARY KEY,
    transaction_hash TEXT NOT NULL,
    collateral_marker_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL
); 