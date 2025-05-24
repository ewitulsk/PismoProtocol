#!/bin/bash
set -e

# Function to log messages
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Create logs directory if it doesn't exist
mkdir -p /app/logs

# Set default values for environment variables if not provided
export LOG_LEVEL=${LOG_LEVEL:-INFO}
export PYTH_SSE_URL=${PYTH_SSE_URL:-"https://hermes-beta.pyth.network/v2/updates/price/stream"}
export WS_HOST=${WS_HOST:-"0.0.0.0"}
export WS_PORT=${WS_PORT:-8765}
export API_HOST=${API_HOST:-"0.0.0.0"}
export API_PORT=${API_PORT:-8080}

log "Starting Price Feed Aggregator..."
log "Configuration:"
log "  Log Level: $LOG_LEVEL"
log "  Pyth SSE URL: $PYTH_SSE_URL"
log "  WebSocket Server: $WS_HOST:$WS_PORT"
log "  REST API Server: $API_HOST:$API_PORT"

# Wait for network connectivity (simplified check)
log "Checking network connectivity..."
timeout=10
while ! python3 -c "import socket; socket.create_connection(('8.8.8.8', 53), timeout=3)" >/dev/null 2>&1; do
    timeout=$((timeout - 1))
    if [ $timeout -eq 0 ]; then
        log "WARNING: Limited network connectivity detected, proceeding anyway..."
        break
    fi
    log "Waiting for network connectivity... ($timeout seconds remaining)"
    sleep 1
done
log "Network connectivity check completed"

# Execute the command passed to the container
log "Executing command: $@"
exec "$@"
