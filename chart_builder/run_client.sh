#!/bin/bash

# Chart Builder Client Runner
echo "🖥️  Starting Chart Builder Test Client..."

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

# Run the client
echo "🔗 Connecting to Chart Builder Server at ws://127.0.0.1:8080..."
echo "📈 The client will request available assets and subscribe to SOL 1-minute charts"
echo ""
echo "Press Ctrl+C to stop the client"
echo ""

cargo run --package chart-builder-client