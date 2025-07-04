-- Migration to create the new_account_events table
CREATE TABLE IF NOT EXISTS new_account_events (
    transaction_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL, -- Move address represented as hex string
    stats_id TEXT NOT NULL,   -- Move address represented as hex string
    timestamp TIMESTAMPTZ NOT NULL
); 