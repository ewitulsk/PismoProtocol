# Chart Builder Service

A Rust service that connects to Pyth price feeds and builds real-time OHLC (Open, High, Low, Close) charts for cryptocurrency assets.

## Features

- **Real-time Price Feeds**: Connects to Pyth Network WebSocket API to receive live price updates
- **OHLC Chart Generation**: Automatically builds OHLC bars across multiple timeframes:
  - 1 second
  - 10 seconds
  - 1 minute
  - 10 minutes
  - 1 hour
- **WebSocket Server**: Serves chart data to clients via WebSocket connections
- **Multi-threaded**: Uses async/await and tokio for concurrent processing
- **Configurable**: Supports multiple assets with configurable bar history (default: 1000 bars per timeframe)

## Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Pyth Network      │    │  Chart Builder      │    │     Client          │
│   WebSocket API     │────▶│     Service         │────▶│   Applications      │
│                     │    │                     │    │                     │
│ Price Feed Updates  │    │ OHLC Chart Builder  │    │ WebSocket Client    │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## Setup

1. **Install Rust**: Make sure you have Rust installed. If not, install it from [rustup.rs](https://rustup.rs/).

2. **Clone and navigate to the chart_builder directory**:
   ```bash
   cd chart_builder
   ```

3. **Build the project**:
   ```bash
   cargo build --release
   ```

## Usage

### Running the Server

Start the chart builder service:

```bash
cargo run --bin server
```

The server will:
- Connect to Pyth Network WebSocket API
- Subscribe to hardcoded assets (SOL and BTC by default)
- Start building OHLC charts in real-time
- Serve chart data on `ws://127.0.0.1:8080`

### Running the Test Client

In another terminal, run the test client:

```bash
cargo run --bin client
```

The client will:
- Connect to the chart server
- Request available assets
- Subscribe to SOL 1-minute charts
- Display incoming chart updates

## WebSocket API

### Client Messages

#### Get Available Assets
```json
{
  "type": "get_assets"
}
```

#### Subscribe to Asset Charts
```json
{
  "type": "subscribe",
  "asset_id": "SOL",
  "time_scale": "1m"
}
```

#### Unsubscribe from Asset Charts
```json
{
  "type": "unsubscribe",
  "asset_id": "SOL",
  "time_scale": "1m"
}
```

### Server Responses

#### Available Assets
```json
{
  "type": "assets",
  "assets": [
    {
      "asset_id": "SOL",
      "time_scales": ["1s", "10s", "1m", "10m", "1h"]
    }
  ]
}
```

#### Subscription Confirmed
```json
{
  "type": "subscription_confirmed",
  "asset_id": "SOL",
  "time_scale": "1m"
}
```

#### Bar Update
```json
{
  "type": "bar_update",
  "asset_id": "SOL",
  "time_scale": "1m",
  "bar": {
    "timestamp": "2023-12-01T12:00:00Z",
    "open": 100.50,
    "high": 102.75,
    "low": 99.25,
    "close": 101.80,
    "volume": 1250.0
  }
}
```

## Configuration

### Adding New Assets

To add new assets, modify the `main` function in `src/main.rs`:

```rust
// Add your asset with its Pyth feed ID
service.subscribe_to_asset("ETH", "your_eth_feed_id_here").await;
```

### Pyth Feed IDs

The service uses hardcoded Pyth feed IDs. You may need to update these with current feed IDs from the [Pyth Network documentation](https://docs.pyth.network/price-feeds/price-feed-ids).

Currently configured:
- SOL: `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d`
- BTC: `e62df6c8b4c85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43`

## Data Structure

The service maintains OHLC data in the following structure:

```rust
PriceFeeds {
    assets: {
        "SOL": {
            one_second: Vec<OHLCBar>,
            ten_second: Vec<OHLCBar>,
            one_minute: Vec<OHLCBar>,
            ten_minute: Vec<OHLCBar>,
            one_hour: Vec<OHLCBar>,
        },
        "BTC": {
            // ... same structure
        }
    }
}
```

Each `OHLCBar` contains:
- `timestamp`: Bar start time
- `open`: Opening price
- `high`: Highest price during the period
- `low`: Lowest price during the period
- `close`: Closing price
- `volume`: Number of price updates (simple volume counting)

## Dependencies

- `tokio`: Async runtime
- `tokio-tungstenite`: WebSocket client/server
- `serde`: Serialization/deserialization
- `chrono`: Date/time handling
- `dashmap`: Concurrent HashMap
- `tracing`: Logging

## Troubleshooting

1. **Connection Issues**: Ensure you have internet connectivity to reach Pyth Network's WebSocket API
2. **Feed ID Errors**: Verify that the Pyth feed IDs are current and valid
3. **Port Conflicts**: Make sure port 8080 is available for the WebSocket server
4. **Build Errors**: Ensure you have the latest Rust toolchain installed

## Future Enhancements

- Dynamic asset configuration (REST API or config file)
- Historical data persistence
- More sophisticated volume calculations
- Additional chart indicators (moving averages, etc.)
- Authentication and rate limiting
- Market data validation and error handling