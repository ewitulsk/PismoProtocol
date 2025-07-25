#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Function to display usage
usage() {
    echo "Usage: $0 <protocol>"
    echo "  protocol: 'perps' or 'oracle_builder'"
    echo ""
    echo "Examples:"
    echo "  $0 perps           # Deploy perps protocol"
    echo "  $0 oracle_builder  # Deploy oracle builder protocol"
    exit 1
}

# Check if protocol argument is provided
if [ $# -eq 0 ]; then
    echo "Error: Protocol argument is required."
    usage
fi

PROTOCOL=$1

# Validate protocol argument
if [ "$PROTOCOL" != "perps" ] && [ "$PROTOCOL" != "oracle_builder" ]; then
    echo "Error: Invalid protocol '$PROTOCOL'. Must be 'perps' or 'oracle_builder'."
    usage
fi

echo "Starting deployment for $PROTOCOL protocol..."

# Protocol-specific deployment logic
if [ "$PROTOCOL" = "perps" ]; then
    echo "=== PERPS PROTOCOL DEPLOYMENT ==="
    
    # Clean and restart the indexer database
    echo "Cleaning and restarting the indexer database..."
    docker rm -f indexer || true # Stop and remove the container, ignore error if it doesn't exist
    ./pg_local_clean indexer -p 7654

    # Run database migrations
    echo "Running database migrations..."
    DATABASE_URL="postgresql://postgres:postgres@localhost:7654/indexer"
    (cd indexer/src/db/postgres/migrations && DATABASE_URL=$DATABASE_URL diesel migration run)

    # Navigate to the contracts directory and publish
    echo "Publishing perps contracts..."
    (cd contracts && sui client publish --json --skip-dependency-verification > deployment.json)

    # Navigate to the deployment-manager directory and run initialization
    echo "Initializing perps deployment manager..."
    (cd deployment-manager && npm run dev:perps)

    # Run copydata in the deployment-manager directory
    echo "Copying perps configuration..."
    (cd deployment-manager && npm run dev-copy:perps)

elif [ "$PROTOCOL" = "oracle_builder" ]; then
    echo "=== ORACLE BUILDER PROTOCOL DEPLOYMENT ==="
    
    # Note: Oracle builder indexer doesn't use a database, so no database setup needed
    echo "Skipping database setup (oracle builder indexer doesn't use a database)..."

    # Navigate to the oracle_builder_contracts directory and publish
    echo "Publishing oracle builder contracts..."
    (cd oracle_builder_contracts && sui client publish --json --skip-dependency-verification > deployment.json)

    # Navigate to the deployment-manager directory and run initialization
    echo "Initializing oracle builder deployment manager..."
    (cd deployment-manager && npm run dev:oracle-builder)

    # Run copydata in the deployment-manager directory
    echo "Copying oracle builder configuration..."
    (cd deployment-manager && npm run dev-copy:oracle-builder)
fi

echo "Deployment script for $PROTOCOL protocol finished successfully." 