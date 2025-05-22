CREATE TABLE collateral_transfers (
    id SERIAL PRIMARY KEY,
    transaction_hash TEXT NOT NULL,
    transfer_id TEXT NOT NULL,
    collateral_marker_id TEXT NOT NULL,
    collateral_address TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    to_vault_address TEXT NOT NULL,
    fulfilled BOOLEAN NOT NULL DEFAULT FALSE,
    timestamp TIMESTAMPTZ NOT NULL
); 