#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

CONTAINER_NAME="oracle_builder_migrations"
PORT="9876"

echo "=== Oracle Builder Migrations Setup ==="

# 1) Check for existing container and kill it if it exists
echo "Checking for existing container '$CONTAINER_NAME'..."
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    echo "Stopping and removing existing container '$CONTAINER_NAME'..."
    docker rm -f "$CONTAINER_NAME" || true
else
    echo "No existing container found."
fi

# 2) Start new migrations database using pg_local_clean
echo "Starting new migrations database..."
cd ../../../../../
DATABASE_URL=$(./pg_local_clean "$CONTAINER_NAME" -p "$PORT" | tail -n 1)
cd oracle_builder_indexer/src/db/postgres/migrations

echo "Database URL: $DATABASE_URL"

# 3) Remove the diesel schema file
echo "Clearing diesel schema file..."
rm -f ../schema.rs

# 4) Run diesel migrations
echo "Running diesel migrations..."
DATABASE_URL="$DATABASE_URL" diesel migration run

echo "=== Migration setup completed successfully! ==="
echo "Database is running at: $DATABASE_URL" 