CREATE TABLE vault_transfers (
    id SERIAL PRIMARY KEY,
    transaction_hash TEXT NOT NULL,
    transfer_id TEXT NOT NULL,
    vault_marker_id TEXT NOT NULL,
    vault_address TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    to_user_address TEXT NOT NULL,
    fulfilled BOOLEAN NOT NULL DEFAULT FALSE,
    timestamp TIMESTAMPTZ NOT NULL
); 