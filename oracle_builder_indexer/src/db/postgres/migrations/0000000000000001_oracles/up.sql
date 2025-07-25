CREATE TABLE oracles (
    oracle_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
