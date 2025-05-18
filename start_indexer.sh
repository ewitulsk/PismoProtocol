#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Clean and restart the indexer database
echo "Cleaning and restarting the indexer database..."
docker rm -f indexer || true 
./pg_local_clean indexer -p 7654

# Run database migrations
echo "Running database migrations..."
DATABASE_URL="postgresql://postgres:postgres@localhost:7654/indexer"
(cd indexer/src/db/postgres/migrations && DATABASE_URL=$DATABASE_URL diesel migration run)

(cd indexer && CONFIG_PATH=config/testnet.toml cargo run)
echo "Indexer startup script finished successfully."
