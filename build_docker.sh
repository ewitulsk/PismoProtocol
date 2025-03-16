#!/bin/bash
# Script to build and test the Docker image for price-feed-aggregator

echo "Building Docker image for price-feed-aggregator..."
docker build -t price-feed-aggregator .

# Check if the build was successful
if [ $? -eq 0 ]; then
    echo "Build complete. To run the image locally, use:"
    echo "docker run -p 8765:8765 -p 8080:8080 price-feed-aggregator"
    
    # Uncomment to automatically run the image
    # echo "Running the image locally..."
    # docker run -p 8765:8765 -p 8080:8080 price-feed-aggregator
else
    echo "Build failed. Please check the error messages above."
fi 