# Oracle Builder Indexer WebSocket API

This document describes the WebSocket API for receiving real-time updates about oracles and price feeds.

## Connection

Connect to the WebSocket endpoint at: `ws://localhost:3001/ws`

Replace `localhost:3001` with your actual server address and port. The WebSocket endpoint runs on the same port as the REST API.

## Message Format

All messages are JSON objects with a `type` field indicating the message type.

### Client Messages (sent to server)

#### Subscribe to All Oracles
```json
{
  "type": "subscribe_oracles"
}
```

#### Subscribe to All Price Feeds
```json
{
  "type": "subscribe_price_feeds"
}
```

#### Subscribe to Oracles by Owner
```json
{
  "type": "subscribe_oracles_by_owner",
  "owner_id": "0x123..."
}
```

#### Subscribe to Price Feeds by Oracle
```json
{
  "type": "subscribe_price_feeds_by_oracle",
  "oracle_id": "0x456..."
}
```

#### Unsubscribe Messages
```json
{
  "type": "unsubscribe_oracles"
}
```

```json
{
  "type": "unsubscribe_price_feeds"
}
```

```json
{
  "type": "unsubscribe_oracles_by_owner",
  "owner_id": "0x123..."
}
```

```json
{
  "type": "unsubscribe_price_feeds_by_oracle",
  "oracle_id": "0x456..."
}
```

### Server Messages (received from server)

#### Subscription Confirmed
```json
{
  "type": "subscription_confirmed",
  "subscription_type": "all_oracles",
  "message": "Subscribed to all oracle updates"
}
```

#### Oracle Created
```json
{
  "type": "oracle_created",
  "oracle": {
    "oracle_id": "0x123...",
    "owner": "0x456...",
    "is_valid": true,
    "name": "BTC Price Oracle",
    "description": "Bitcoin price oracle",
    "created_at": "2025-07-29T10:30:00Z",
    "updated_at": "2025-07-29T10:30:00Z"
  },
  "timestamp": "2025-07-29T10:30:00Z"
}
```

#### Oracle Invalidated
```json
{
  "type": "oracle_invalidated",
  "oracle_id": "0x123...",
  "timestamp": "2025-07-29T10:35:00Z"
}
```

#### Price Feed Created
```json
{
  "type": "price_feed_created",
  "price_feed": {
    "price_feed_id": "0x789...",
    "oracle_id": "0x123...",
    "is_valid": true,
    "api_key": null,
    "api_key_config": null,
    "underlying_url": "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    "response_field": "bitcoin.usd",
    "live_url": "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    "name": "CoinGecko BTC Feed",
    "description": "Bitcoin price from CoinGecko API",
    "created_at": "2025-07-29T10:32:00Z",
    "updated_at": "2025-07-29T10:32:00Z"
  },
  "timestamp": "2025-07-29T10:32:00Z"
}
```

#### Price Feed Invalidated
```json
{
  "type": "price_feed_invalidated",
  "price_feed_id": "0x789...",
  "oracle_id": "0x123...",
  "timestamp": "2025-07-29T10:38:00Z"
}
```

#### Error
```json
{
  "type": "error",
  "message": "Error processing message: Invalid subscription type",
  "code": "PROCESSING_ERROR"
}
```

## JavaScript Example

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

ws.onopen = function() {
    console.log('Connected to Oracle Builder WebSocket');
    
    // Subscribe to all oracle updates
    ws.send(JSON.stringify({
        type: 'subscribe_oracles'
    }));
    
    // Subscribe to all price feed updates
    ws.send(JSON.stringify({
        type: 'subscribe_price_feeds'
    }));
};

ws.onmessage = function(event) {
    const message = JSON.parse(event.data);
    console.log('Received:', message);
    
    switch(message.type) {
        case 'subscription_confirmed':
            console.log('Subscription confirmed:', message.message);
            break;
            
        case 'oracle_created':
            console.log('New Oracle Created:', message.oracle);
            // Update your UI with the new oracle
            break;
            
        case 'oracle_invalidated':
            console.log('Oracle Invalidated:', message.oracle_id);
            // Update your UI to mark oracle as invalid
            break;
            
        case 'price_feed_created':
            console.log('New Price Feed Created:', message.price_feed);
            // Update your UI with the new price feed
            break;
            
        case 'price_feed_invalidated':
            console.log('Price Feed Invalidated:', message.price_feed_id);
            // Update your UI to mark price feed as invalid
            break;
            
        case 'error':
            console.error('WebSocket Error:', message.message);
            break;
    }
};

ws.onclose = function() {
    console.log('WebSocket connection closed');
};

ws.onerror = function(error) {
    console.error('WebSocket error:', error);
};
```

## Node.js Example

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3001/ws');

ws.on('open', function open() {
    console.log('Connected to Oracle Builder WebSocket');
    
    // Subscribe to oracles by specific owner
    ws.send(JSON.stringify({
        type: 'subscribe_oracles_by_owner',
        owner_id: '0x123...'  // Replace with actual owner ID
    }));
});

ws.on('message', function message(data) {
    const message = JSON.parse(data.toString());
    console.log('Received:', JSON.stringify(message, null, 2));
});

ws.on('close', function close() {
    console.log('WebSocket connection closed');
});

ws.on('error', function error(err) {
    console.error('WebSocket error:', err);
});
```

## Best Practices

1. **Handle reconnections**: Implement automatic reconnection logic in case the WebSocket connection is lost.

2. **Subscribe selectively**: Only subscribe to the updates you need to minimize bandwidth and processing.

3. **Handle errors gracefully**: Always handle error messages and implement proper error logging.

4. **Validate message format**: Always validate the structure of incoming messages before processing them.

5. **Manage subscriptions**: Keep track of your active subscriptions and unsubscribe when no longer needed.

## REST API Integration

The WebSocket API complements the existing REST API endpoints:

- `GET /v0/oracles` - Get all oracles or filter by owner
- `GET /v0/oracles/:id` - Get specific oracle
- `GET /v0/price-feeds` - Get all price feeds  
- `GET /v0/price-feeds/:id` - Get specific price feed

Use the REST API for initial data loading and the WebSocket API for real-time updates.
