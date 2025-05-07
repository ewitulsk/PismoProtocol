#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Clean and restart the indexer database
echo "Cleaning and restarting the indexer database..."
docker rm -f indexer || true # Stop and remove the container, ignore error if it doesn't exist
./pg_local_clean indexer -p 7654

# Run database migrations
echo "Running database migrations..."
DATABASE_URL="postgresql://postgres:postgres@localhost:7654/indexer"
(cd indexer/src/db/postgres/migrations && DATABASE_URL=$DATABASE_URL diesel migration run)

# Navigate to the contracts directory and publish
echo "Publishing contracts..."
(cd contracts && sui client publish --json --skip-dependency-verification > deployment.json)

# Navigate to the deployment-manager directory and run initialization
echo "Initializing deployment manager..."
(cd deployment-manager && npm run initialize)

# Run copydata in the deployment-manager directory
echo "Copying data..."
(cd deployment-manager && npm run copydata)

echo "Deployment script finished successfully." 