#!/bin/bash
# Script to run the Docker container for testing

echo "Running price-feed-aggregator Docker container..."
docker run -p 8765:8765 -p 8080:8080 price-feed-aggregator

# The container will continue running until stopped with Ctrl+C 