# Chart Publisher

A Rust-based chart publisher that connects to Pyth Network price feeds via WebSocket.

## Project Structure

```
chart_publisher/
├── config/
│   └── config.toml              # Configuration file
├── src/
│   ├── main.rs                  # Main binary entry point
│   ├── lib.rs                   # Library entry point
│   ├── config.rs                # Configuration structs
│   └── websockets/
│       └── pyth/
│           ├── mod.rs           # Pyth message types
│           └── handlers/
│               ├── mod.rs       # Handlers module
│               └── pyth_handler.rs  # Main WebSocket handler
└── examples/
    └── pyth_example.rs          # Example usage
```

## Configuration

The project uses TOML configuration files. Default configuration:

```toml
[pyth]
websocket_url = "https://hermes-beta.pyth.network/v2/updates/price/stream"
```

## WebSocket Message Types

### Subscribe Message
```json
{
    "type": "subscribe",
    "feed_id": "<feed_id>"
}
```

### Connection Established Response
```json
{
    "type": "connection_established",
    "client_id": "<client_id>",
    "message": "Connected to Pyth Price Feed Websocket Server"
}
```

### Subscription Confirmed Response
```json
{
    "type": "subscription_confirmed",
    "feed_id": "<feed_id>"
}
```

## Usage

### Running the Main Binary
```bash
cargo run
```

### Running the Example
```bash
cargo run --example pyth_example
```

### Using as a Library
```rust
use chart_publisher::config::Config;
use chart_publisher::websockets::pyth::handlers::pyth_handler::PythWebSocketHandler;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = Config::load("config/config.toml")?;
    let mut handler = PythWebSocketHandler::new(config.pyth.websocket_url);
    
    // Subscribe to a price feed
    handler.subscribe("0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace").await?;
    
    Ok(())
}
```

## Features

- ✅ TOML-based configuration
- ✅ WebSocket connection to Pyth Network
- ✅ Subscribe to price feeds
- ✅ Handle connection established messages
- ✅ Handle subscription confirmed messages
- ✅ Structured logging with tracing
- ✅ Async/await support

## Dependencies

- `tokio` - Async runtime
- `tokio-tungstenite` - WebSocket client
- `serde` - Serialization/deserialization
- `anyhow` - Error handling
- `tracing` - Structured logging
- `toml` - Configuration parsing

## Building

```bash
cargo build
```

## Testing

```bash
cargo check
``` 