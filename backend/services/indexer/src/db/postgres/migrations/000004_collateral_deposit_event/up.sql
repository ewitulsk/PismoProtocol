-- Migration to create the collateral_deposit_events table
CREATE TABLE IF NOT EXISTS collateral_deposit_events (
    transaction_hash TEXT PRIMARY KEY,
    collateral_id TEXT NOT NULL,         -- Move address represented as hex string
    collateral_marker_id TEXT NOT NULL,  -- Move address represented as hex string
    account_id TEXT NOT NULL,            -- Move address represented as hex string
    token_address TEXT NOT NULL, -- From TokenIdentifier
    amount NUMERIC NOT NULL,             -- Using NUMERIC for u64 amount to avoid overflow
    timestamp TIMESTAMPTZ NOT NULL
); 