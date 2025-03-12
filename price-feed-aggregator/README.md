# Price Feed Aggregator

A service that aggregates cryptocurrency price feeds from Pyth Network and Polygon.io, providing a websocket interface for clients to subscribe to live price updates and candlestick data.

## Features

- Connect to Pyth Network's Hermes Server-Sent Events (SSE) stream to receive real-time price feed updates
- Connect to Polygon.io's WebSocket API to receive candlestick data for cryptocurrencies
- Provide a WebSocket interface for clients to subscribe to specific price feeds
- Support dedicated Polygon-only subscriptions for candlestick chart data
- Handle multiple concurrent client connections and subscriptions
- Robust error handling and automatic reconnection to data sources
- REST API for metadata and status information

## Architecture

The service consists of several components:

1. **Pyth Hermes Client**: Connects to Pyth's Hermes Server-Sent Events (SSE) stream, subscribes to price feeds, and processes incoming price data.
2. **Polygon Stream Client**: Connects to Polygon.io's WebSocket API, subscribes to ticker streams, and processes real-time candlestick data.
3. **WebSocket Server**: Handles client connections, subscriptions, and broadcasts price updates to subscribed clients.
4. **REST API**: Provides HTTP endpoints for retrieving available feeds and service status.
5. **Main Application**: Coordinates all components and handles lifecycle management.

## Requirements

- Python 3.8 or higher
- Polygon.io API key (set as environment variable `POLYGON_API_KEY`)
- Required packages (included in requirements.txt):
  - aiohttp
  - websockets
  - pydantic
  - fastapi
  - uvicorn
  - python-dotenv

## Installation

### Setting up a Virtual Environment

```bash
# Create a virtual environment
python3 -m venv env

# Activate the virtual environment
source env/bin/activate  # On Windows: env\Scripts\activate

# Install the required packages
pip install -r requirements.txt
```

### Installing in Development Mode

```bash
pip install -e .
```

## Usage

### Running the Service

```bash
# Run with default settings
python -m src.main

# Run with custom settings
python -m src.main --host 0.0.0.0 --port 8765 --api-host 0.0.0.0 --api-port 8080
```

### Environment Variables

- `POLYGON_API_KEY`: Your Polygon.io API key (required for Polygon data)

### Command Line Options

- `--host`: Host to bind the websocket server to (default: 0.0.0.0)
- `--port`: Port to bind the websocket server to (default: 8765)
- `--api-host`: Host to bind the REST API to (default: 0.0.0.0)
- `--api-port`: Port to bind the REST API to (default: 8080)
- `--pyth-sse-url`: Pyth Hermes SSE stream URL (default: https://hermes.pyth.network/v2/updates/price/stream)
- `--polygon-ws-url`: Polygon WebSocket URL (default: wss://socket.polygon.io/crypto)
- `--log-level`: Logging level (default: INFO)

## API

### WebSocket API

Connect to the websocket server at `ws://<host>:<port>`.

**Available Messages:**

1. **Subscribe to an Aggregated Price Feed** (combined Pyth and Polygon data)
   ```json
   {
     "type": "subscribe",
     "subscription_type": "aggregated",
     "feed_id": "<feed_id>",
     "ticker": "<polygon_ticker>"
   }
   ```

2. **Subscribe to Polygon-only Candlestick Data**
   ```json
   {
     "type": "subscribe",
     "subscription_type": "polygon_only",
     "ticker": "<polygon_ticker>",
     "timespan": "minute"
   }
   ```

3. **Unsubscribe from an Aggregated Price Feed**
   ```json
   {
     "type": "unsubscribe",
     "subscription_type": "aggregated",
     "feed_id": "<feed_id>"
   }
   ```

4. **Unsubscribe from Polygon-only Data**
   ```json
   {
     "type": "unsubscribe",
     "subscription_type": "polygon_only",
     "ticker": "<polygon_ticker>"
   }
   ```

5. **Get Available Feeds**
   ```json
   {
     "type": "get_available_feeds"
   }
   ```

6. **Get Available Polygon Tickers**
   ```json
   {
     "type": "get_available_polygon_tickers"
   }
   ```

**Server Responses:**

1. **Connection Established**
   ```json
   {
     "type": "connection_established",
     "client_id": "<client_id>",
     "message": "Connected to Price Feed Aggregator Websocket Server"
   }
   ```

2. **Subscription Confirmed**
   ```json
   {
     "type": "subscription_confirmed",
     "subscription_type": "aggregated",
     "feed_id": "<feed_id>",
     "ticker": "<ticker>"
   }
   ```

3. **Polygon-only Subscription Confirmed**
   ```json
   {
     "type": "subscription_confirmed",
     "subscription_type": "polygon_only",
     "ticker": "<ticker>"
   }
   ```

4. **Unsubscription Confirmed**
   ```json
   {
     "type": "unsubscription_confirmed",
     "subscription_type": "aggregated",
     "feed_id": "<feed_id>",
     "ticker": "<ticker>"
   }
   ```

5. **Polygon-only Unsubscription Confirmed**
   ```json
   {
     "type": "unsubscription_confirmed",
     "subscription_type": "polygon_only",
     "ticker": "<ticker>"
   }
   ```

6. **Aggregated Price Update**
   ```json
   {
     "type": "price_update",
     "data": {
       "symbol": "BTC/USD",
       "timestamp": "2023-01-01T12:00:00.000Z",
       "price": 50000.0,
       "confidence": 10.0,
       "source_priority": "pyth",
       "pyth_data": {
         "id": "<feed_id>",
         "price": 50000.0,
         "conf": 10.0,
         "expo": -8,
         "status": "trading",
         "publish_time": "2023-01-01T12:00:00.000Z"
       },
       "polygon_data": {
         "ticker": "X:BTCUSD",
         "timestamp": "2023-01-01T12:00:00.000Z",
         "open": 49800.0,
         "high": 50200.0,
         "low": 49700.0,
         "close": 50000.0,
         "volume": 123.45
       }
     }
   }
   ```

7. **Polygon Candle Update**
   ```json
   {
     "type": "polygon_candle_update",
     "data": {
       "symbol": "BTC/USD",
       "ticker": "X:BTCUSD",
       "timestamp": "2023-01-01T12:00:00.000Z",
       "open": 49800.0,
       "high": 50200.0,
       "low": 49700.0,
       "close": 50000.0,
       "volume": 123.45,
       "vwap": 49950.0,
       "number_of_trades": 42
     }
   }
   ```

8. **Available Feeds**
   ```json
   {
     "type": "available_feeds",
     "feeds": [
       {
         "id": "<feed_id>",
         "symbol": "BTC/USD",
         "price": 50000.0,
         "conf": 10.0,
         "expo": -8,
         "status": "trading",
         "has_polygon_data": true,
         "polygon_ticker": "X:BTCUSD"
       },
       ...
     ]
   }
   ```

9. **Available Polygon Tickers**
   ```json
   {
     "type": "available_polygon_tickers",
     "tickers": [
       {
         "ticker": "X:BTCUSD",
         "name": "Bitcoin/USD",
         "symbol": "BTC/USD"
       },
       ...
     ]
   }
   ```

10. **Error**
    ```json
    {
      "type": "error",
      "message": "<error_message>"
    }
    ```

### HTTP REST API

- `GET /health` - Health check endpoint
- `GET /feeds` - Get available price feeds
- `GET /polygon/tickers` - Get available Polygon tickers
- `GET /status` - Get aggregator status

## Examples

The `examples` directory contains several example clients to demonstrate how to use the service:

- `aggregated_data_example.py` - Example client for aggregated price data
- `polygon_example.py` - Example client for Polygon-specific data
- `combined_client_example.py` - Example client that uses both Pyth and Polygon data
- `polygon_candles_example.py` - Example client for Polygon-only candlestick data
- `websocket_client.py` - Generic WebSocket client for testing

## Development

### Running Tests

```bash
# Run all tests
pytest

# Run with verbosity
pytest -v
```

### Type Checking

```bash
mypy src
```

## License

TBD