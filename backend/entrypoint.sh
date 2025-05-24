#!/bin/bash

# entrypoint.sh - Production entrypoint for the Flask application

set -e

# Function to wait for dependencies (if needed in the future)
wait_for_dependencies() {
    echo "Checking dependencies..."
    # Add any dependency checks here if needed
    echo "Dependencies ready."
}

# Function to run database migrations or setup (if needed)
setup_application() {
    echo "Setting up application..."
    # Add any setup steps here if needed
    echo "Application setup complete."
}

# Main execution
main() {
    echo "Starting Pismo Protocol Backend..."
    
    # Wait for any dependencies
    wait_for_dependencies
    
    # Setup application if needed
    setup_application
    
    # Start the application
    echo "Starting Flask application..."
    exec python server.py
}

# Trap signals for graceful shutdown
trap 'echo "Received shutdown signal, exiting gracefully..."; exit 0' SIGTERM SIGINT

# Run main function
main "$@"
