CREATE TABLE collateral_combine_events (
    id SERIAL PRIMARY KEY,
    transaction_hash TEXT NOT NULL,
    old_collateral_id1 TEXT NOT NULL,
    old_collateral_marker_id1 TEXT NOT NULL,
    old_collateral_id2 TEXT NOT NULL,
    old_collateral_marker_id2 TEXT NOT NULL,
    new_collateral_id TEXT NOT NULL,
    new_collateral_marker_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    token_address TEXT NOT NULL,
    combined_amount NUMERIC NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL
); 