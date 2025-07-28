#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Clean and restart the oracle_builder database
echo "Cleaning and restarting the oracle_builder database..."
docker rm -f oracle_builder || true 
../pg_local_clean oracle_builder -p 7655

# Run database migrations
echo "Running database migrations..."
DATABASE_URL="postgresql://postgres:postgres@localhost:7655/oracle_builder"
(cd src/db/postgres/migrations && DATABASE_URL=$DATABASE_URL diesel migration run)

# Create a local config file with SSL enabled
echo "Creating local config with SSL enabled..."

(CONFIG_PATH=config/testnet.toml cargo run)
echo "Oracle builder indexer startup script finished successfully." 