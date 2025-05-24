#!/bin/sh
set -e

echo "Waiting for PostgreSQL to be ready..."
# This is a simple wait loop; a more robust solution might use pg_isready or similar in a loop
# However, docker-compose's depends_on with service_healthy condition should handle this.
# If issues persist, a tool like wait-for-it.sh could be integrated here.

echo "Running database migrations..."
diesel migration run --migration-dir src/db/postgres/migrations

echo "Migrations complete."

echo "Starting indexer application..."
exec indexer 