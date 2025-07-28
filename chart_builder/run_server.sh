#!/bin/bash

# Chart Builder Service Runner
echo "🚀 Starting Chart Builder Service..."

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust/Cargo is not installed. Please install Rust from https://rustup.rs/"
    exit 1
fi

# Build the project
echo "🔨 Building the project..."
cargo build --release

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please check the errors above."
    exit 1
fi

echo "✅ Build successful!"

# Run the server
echo "🌐 Starting Chart Builder Server on ws://127.0.0.1:8080..."
echo "📊 The service will connect to Pyth Network and start building OHLC charts"
echo "🔗 You can now connect clients to ws://127.0.0.1:8080"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

RUST_LOG="info" CONFIG_PATH=config/config.toml cargo run --package chart-builder-server -- --nocapture