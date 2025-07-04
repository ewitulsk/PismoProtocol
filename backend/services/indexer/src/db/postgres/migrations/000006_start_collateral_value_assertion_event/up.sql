CREATE TABLE start_collateral_value_assertion_events (
    cva_id TEXT PRIMARY KEY,
    transaction_hash TEXT NOT NULL,
    account_id TEXT NOT NULL,
    program_id TEXT NOT NULL,
    num_open_collateral_objects BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL
); 