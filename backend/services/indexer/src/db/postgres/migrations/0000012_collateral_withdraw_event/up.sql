CREATE TABLE collateral_withdraw_events (
    id SERIAL PRIMARY KEY,
    transaction_hash TEXT NOT NULL,
    collateral_id TEXT NOT NULL,
    collateral_marker_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    token_address TEXT NOT NULL,
    withdrawn_amount NUMERIC NOT NULL,
    marker_destroyed BOOLEAN NOT NULL,
    remaining_amount_in_marker NUMERIC NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL
); 