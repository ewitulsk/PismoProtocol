#!/bin/bash

# Script to run the TUI Trading Chart Application
# This will run both the chart server and the TUI client

echo "🚀 Starting Pismo Protocol Trading Chart TUI..."
echo ""

# Check if the server is already running
if pgrep -f "chart-builder-server" > /dev/null; then
    echo "⚠️  Chart server is already running"
else
    echo "📊 Starting chart server..."
    # Start the server in the background
    (cd server && cargo run) &
    SERVER_PID=$!
    echo "✅ Chart server started (PID: $SERVER_PID)"
    
    # Wait a moment for server to start
    sleep 2
fi

echo ""
echo "🖥️  Starting TUI client..."
echo "   Controls:"
echo "   - Press 'q' to quit"
echo "   - Press 1-9 to switch between assets"
echo ""

# Start the TUI client
cd client && cargo run

# If we started the server, clean it up
if [ ! -z "$SERVER_PID" ]; then
    echo ""
    echo "🧹 Cleaning up chart server..."
    kill $SERVER_PID 2>/dev/null
    echo "✅ Done!"
fi 