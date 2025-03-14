# Pyth Price Feed Service

A service that provides cryptocurrency price feeds from Pyth Network, providing a websocket interface for clients to subscribe to live price updates.

## Features

- Connect to Pyth Network's Hermes Server-Sent Events (SSE) stream to receive real-time price feed updates
- Provide a WebSocket interface for clients to subscribe to specific price feeds
- Handle multiple concurrent client connections and subscriptions
- Robust error handling and automatic reconnection to data sources
- REST API for metadata and status information

## Architecture

The service consists of several components:

1. **Pyth Hermes Client**: Connects to Pyth's Hermes Server-Sent Events (SSE) stream, subscribes to price feeds, and processes incoming price data.
2. **WebSocket Server**: Handles client connections, subscriptions, and broadcasts price updates to subscribed clients.
3. **REST API**: Provides HTTP endpoints for retrieving available feeds and service status.
4. **Main Application**: Coordinates all components and handles lifecycle management.

## Requirements

- Python 3.8 or higher
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

### Command Line Options

- `--host`: Host to bind the websocket server to (default: 0.0.0.0)
- `--port`: Port to bind the websocket server to (default: 8765)
- `--api-host`: Host to bind the REST API to (default: 0.0.0.0)
- `--api-port`: Port to bind the REST API to (default: 8080)
- `--pyth-sse-url`: Pyth Hermes SSE stream URL (default: https://hermes.pyth.network/v2/updates/price/stream)
- `--log-level`: Logging level (default: INFO)

## API

### WebSocket API

Connect to the websocket server at `ws://<host>:<port>`.

**Available Messages:**

1. **Subscribe to a Pyth Price Feed**
   ```json
   {
     "type": "subscribe",
     "feed_id": "<feed_id>"
   }
   ```

2. **Unsubscribe from a Price Feed**
   ```json
   {
     "type": "unsubscribe",
     "feed_id": "<feed_id>"
   }
   ```

3. **Subscribe to Multiple Feeds**
   ```json
   {
     "type": "subscribe_multiple",
     "subscriptions": [
       {"feed_id": "<feed_id_1>"},
       {"feed_id": "<feed_id_2>"},
       {"feed_id": "<feed_id_3>"}
     ]
   }
   ```

4. **Get Available Feeds**
   ```json
   {
     "type": "get_available_feeds"
   }
   ```

**Server Responses:**

1. **Connection Established**
   ```json
   {
     "type": "connection_established",
     "client_id": "<client_id>",
     "message": "Connected to Pyth Price Feed Websocket Server"
   }
   ```

2. **Subscription Confirmed**
   ```json
   {
     "type": "subscription_confirmed",
     "feed_id": "<feed_id>"
   }
   ```

3. **Unsubscription Confirmed**
   ```json
   {
     "type": "unsubscription_confirmed",
     "feed_id": "<feed_id>"
   }
   ```

4. **Price Update**
   ```json
   {
     "type": "price_update",
     "data": {
       "id": "<feed_id>",
       "price": 50000.0,
       "conf": 10.0,
       "expo": -8,
       "status": "trading",
       "publish_time": "2023-01-01T12:00:00.000Z",
       "ema_price": 49950.0,
       "ema_conf": 12.0
     }
   }
   ```

5. **Available Feeds**
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
         "status": "trading"
       },
       ...
     ]
   }
   ```
6. **Error**
   ```json
   {
     "type": "error",
     "message": "<error_message>"
   }
   ```

### HTTP REST API

- `GET /health` - Health check endpoint
- `GET /feeds` - Get available price feeds
- `GET /status` - Get service status

## Examples

The `examples` directory contains an example client to demonstrate how to use the service:

- `pyth_only_subscription.py` - Example client for Pyth price data

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
