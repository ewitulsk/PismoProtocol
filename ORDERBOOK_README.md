# Orderbook System

A complete orderbook system built with Rust backend and React frontend, featuring real-time WebSocket communication and automated testing.

## Components

### 1. Orderbook (`orderbook/`)
- **Core orderbook logic** - Supports multiple asset types with buy/sell matching
- **WebSocket server** - Real-time book state and top-of-book streaming
- **Automated tester** - Generates mock buy/sell orders for testing
- **Comprehensive tests** - Unit tests for all components

### 2. Frontend (`orderbook_frontend/`)
- **React visualizer** - Real-time orderbook visualization
- **Liquidity charts** - Bar charts showing liquidity distribution
- **Top-of-book display** - Current price, spread, and market data
- **Manual controls** - Create orders manually for testing

## Features

### Orderbook Features
- ✅ Multiple asset type support (`BTC_USD`, `ETH_USD`, `SOL_USD`)
- ✅ Price-time priority matching
- ✅ Real-time order matching
- ✅ Thread-safe operations
- ✅ Comprehensive error handling

### WebSocket API
- ✅ Subscribe to book state updates (entire orderbook)
- ✅ Subscribe to top-of-book updates (highest buy, lowest sell)
- ✅ Create markets via WebSocket
- ✅ Create buy/sell orders via WebSocket
- ✅ Automatic reconnection handling

### Frontend Features
- ✅ Real-time orderbook visualization
- ✅ Liquidity distribution charts
- ✅ Market selector (BTC_USD, ETH_USD, SOL_USD)
- ✅ Connection status indicator
- ✅ Manual order creation controls
- ✅ Responsive design with dark theme

## Quick Start

### Running the Backend

1. **Navigate to the orderbook directory:**
   ```bash
   cd orderbook
   ```

2. **Run the orderbook server:**
   ```bash
   cargo run
   ```

   This will:
   - Start the WebSocket server on `ws://127.0.0.1:8080`
   - Create test markets (BTC_USD, ETH_USD, SOL_USD)
   - Start automated order generators
   - Begin processing and matching orders

3. **Run tests:**
   ```bash
   cargo test
   ```

### Running the Frontend

1. **Navigate to the frontend directory:**
   ```bash
   cd orderbook_frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the React development server:**
   ```bash
   npm start
   ```

   The frontend will be available at `http://localhost:3000`

## API Documentation

### WebSocket Messages

#### Client Messages (Frontend → Backend)

**Subscribe to Book State:**
```json
{
  "type": "Subscribe",
  "subscription_type": "BookState",
  "market_id": "BTC_USD"
}
```

**Subscribe to Top of Book:**
```json
{
  "type": "Subscribe",
  "subscription_type": "TopOfBook",
  "market_id": "BTC_USD"
}
```

**Create Buy Order:**
```json
{
  "type": "CreateBuy",
  "market_id": "BTC_USD",
  "price": "50000",
  "amount": "1.0"
}
```

**Create Sell Order:**
```json
{
  "type": "CreateSell",
  "market_id": "BTC_USD",
  "price": "51000",
  "amount": "0.5"
}
```

#### Server Messages (Backend → Frontend)

**Book State Update:**
```json
{
  "type": "BookStateUpdate",
  "market_id": "BTC_USD",
  "book_state": {
    "market_id": "BTC_USD",
    "buy_orders": [["50000", "1.0"], ["49500", "2.0"]],
    "sell_orders": [["51000", "0.5"], ["51500", "1.5"]]
  }
}
```

**Top of Book Update:**
```json
{
  "type": "TopOfBookUpdate",
  "market_id": "BTC_USD",
  "top_of_book": {
    "market_id": "BTC_USD",
    "highest_buy": "50000",
    "lowest_sell": "51000"
  }
}
```

## Architecture

### Backend Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   WebSocket     │    │   Orderbook     │    │   Automated     │
│   Server        │◄──►│   Engine        │◄──►│   Tester        │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client        │    │   Order         │    │   Mock Order    │
│   Connections   │    │   Matching      │    │   Generation    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Frontend Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   WebSocket     │    │   React         │    │   Orderbook     │
│   Hook          │◄──►│   App           │◄──►│   Visualizer    │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Real-time     │    │   State         │    │   Charts &      │
│   Connection    │    │   Management    │    │   Tables        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Testing

### Backend Tests
```bash
cd orderbook
cargo test
```

Tests include:
- Unit tests for orderbook logic
- Order matching tests
- WebSocket server integration tests
- Automated tester functionality tests

### Frontend Tests
```bash
cd orderbook_frontend
npm test
```

## Development

### Backend Development
- Built with Rust 2021 edition
- Uses Tokio for async runtime
- WebSocket server with tokio-tungstenite
- Decimal precision with rust_decimal
- Thread-safe operations with Arc and RwLock

### Frontend Development
- React 18 with TypeScript
- Recharts for data visualization
- Custom WebSocket hook for connection management
- Responsive design with inline styles

## Configuration

### Backend Configuration
- WebSocket server: `127.0.0.1:8080`
- Automated tester frequencies:
  - BTC_USD: 1000ms intervals
  - ETH_USD: 800ms intervals
  - SOL_USD: 600ms intervals

### Frontend Configuration
- WebSocket connection: `ws://localhost:8080`
- Auto-reconnection with exponential backoff
- Real-time subscription management

## Troubleshooting

### Common Issues

1. **WebSocket connection failed**
   - Ensure the backend is running on port 8080
   - Check firewall settings
   - Verify WebSocket URL in frontend

2. **Frontend not showing data**
   - Check browser console for errors
   - Verify WebSocket connection status
   - Ensure backend is generating test data

3. **Orders not matching**
   - Check order prices and amounts
   - Verify market exists
   - Review backend logs for errors

### Debug Mode
Enable debug logging in the backend:
```bash
RUST_LOG=debug cargo run
```

## Performance

- **Backend**: Can handle thousands of orders per second
- **Frontend**: Real-time updates with minimal latency
- **WebSocket**: Efficient binary protocol with JSON serialization
- **Memory**: Efficient order book data structures

## Future Enhancements

- [ ] Order cancellation support
- [ ] Historical trade data
- [ ] Market depth indicators
- [ ] Price alerts
- [ ] Multiple asset pair support
- [ ] Order book snapshots
- [ ] Performance metrics dashboard