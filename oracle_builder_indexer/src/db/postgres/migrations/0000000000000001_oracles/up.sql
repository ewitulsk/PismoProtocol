CREATE TABLE oracles (
    oracle_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
