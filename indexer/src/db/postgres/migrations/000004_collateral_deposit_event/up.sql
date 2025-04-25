-- Migration to create the collateral_deposit_events table
CREATE TABLE IF NOT EXISTS collateral_deposit_events (
    transaction_hash TEXT PRIMARY KEY,
    collateral_id TEXT NOT NULL,         -- Move address represented as hex string
    collateral_marker_id TEXT NOT NULL,  -- Move address represented as hex string
    account_id TEXT NOT NULL,            -- Move address represented as hex string
    token_account_address TEXT NOT NULL, -- From TokenIdentifier
    token_creation_num BIGINT NOT NULL,  -- From TokenIdentifier (assuming u64 fits in BIGINT)
    amount NUMERIC NOT NULL,             -- Using NUMERIC for u64 amount to avoid overflow
    timestamp TIMESTAMPTZ NOT NULL
); 