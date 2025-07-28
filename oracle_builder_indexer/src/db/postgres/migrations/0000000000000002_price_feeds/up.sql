CREATE TABLE price_feeds (
    price_feed_id TEXT PRIMARY KEY,
    oracle_id TEXT NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    api_key TEXT,
    api_key_config TEXT,
    underlying_url TEXT NOT NULL,
    response_field TEXT NOT NULL,
    live_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY (oracle_id) REFERENCES oracles(oracle_id)
);
