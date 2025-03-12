#!/bin/bash

# Simple script to run the polygon-only subscription example

# Check if the price feed aggregator is running
if ! pgrep -f "run.py" > /dev/null; then
    echo "Starting the Price Feed Aggregator service..."
    echo "Opening a new terminal window to run the service..."
    
    # Different command based on OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        osascript -e 'tell app "Terminal" to do script "cd \"'"$(pwd)"'/..\"; python run.py"'
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux with GUI
        if command -v gnome-terminal &> /dev/null; then
            gnome-terminal -- bash -c "cd $(pwd)/..; python run.py; exec bash"
        elif command -v xterm &> /dev/null; then
            xterm -e "cd $(pwd)/..; python run.py; exec bash" &
        else
            echo "Unable to open new terminal window. Please run the service manually in another terminal:"
            echo "cd ../; python run.py"
            exit 1
        fi
    else
        echo "Unsupported OS. Please run the service manually in another terminal:"
        echo "cd ../; python run.py"
        exit 1
    fi
    
    # Give the service time to start
    echo "Waiting for the service to start..."
    sleep 5
fi

# List available Polygon tickers
echo "Listing available Polygon tickers..."
python list_polygon_tickers.py

# Start the Polygon-only subscription example
echo "Starting the Polygon-only subscription example..."
python polygon_only_subscription.py X:BTCUSD X:ETHUSD