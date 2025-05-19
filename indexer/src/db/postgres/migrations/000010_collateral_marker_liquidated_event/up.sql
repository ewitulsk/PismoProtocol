CREATE TABLE collateral_marker_liquidated_events (
    transaction_hash TEXT PRIMARY KEY,
    collateral_marker_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL
); 