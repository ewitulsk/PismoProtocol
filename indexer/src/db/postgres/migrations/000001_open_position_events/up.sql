CREATE TABLE open_position_events (
    transaction_hash TEXT PRIMARY KEY,
    position_id TEXT NOT NULL,
    position_type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    leverage_multiplier NUMERIC NOT NULL,
    entry_price NUMERIC NOT NULL,
    entry_price_decimals INTEGER NOT NULL,
    supported_positions_token_i INTEGER NOT NULL,
    price_feed_id_bytes TEXT NOT NULL,
    account_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL
);
