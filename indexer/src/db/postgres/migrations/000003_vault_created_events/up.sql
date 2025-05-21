CREATE TABLE vault_created_events (
    id SERIAL PRIMARY KEY,
    transaction_hash TEXT NOT NULL,
    vault_address TEXT NOT NULL,
    vault_marker_address TEXT NOT NULL,
    coin_token_info TEXT NOT NULL,
    lp_token_info TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL
); 