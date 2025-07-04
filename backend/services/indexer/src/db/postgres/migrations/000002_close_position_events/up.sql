CREATE TABLE close_position_events (
    transaction_hash TEXT PRIMARY KEY,
    position_id TEXT NOT NULL,
    position_type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    leverage_multiplier NUMERIC NOT NULL,
    entry_price NUMERIC NOT NULL,
    entry_price_decimals INTEGER NOT NULL,
    close_price NUMERIC NOT NULL,
    close_price_decimals INTEGER NOT NULL,
    price_delta NUMERIC NOT NULL,
    transfer_amount NUMERIC NOT NULL,
    transfer_to TEXT NOT NULL,
    account_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL
);
