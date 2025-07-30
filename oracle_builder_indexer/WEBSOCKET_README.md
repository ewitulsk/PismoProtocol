# Oracle Builder Indexer WebSocket Implementation

This document provides a comprehensive overview of the WebSocket functionality added to the Oracle Builder Indexer.

## Overview

The Oracle Builder Indexer now includes real-time WebSocket support that allows frontend applications to receive live updates about:

- **Oracle Creation**: When new oracles are created on the blockchain
- **Oracle Invalidation**: When existing oracles are invalidated
- **Price Feed Creation**: When new price feeds are created
- **Price Feed Invalidation**: When existing price feeds are invalidated

## Architecture

### Components

1. **WebSocket Messages** (`src/websocket/messages.rs`)
   - Defines client-to-server and server-to-client message types
   - Includes subscription management message types
   - Handles internal broadcast messages between indexer and WebSocket server

2. **Client Manager** (`src/websocket/client_manager.rs`)
   - Manages WebSocket client connections
   - Handles client subscriptions and message routing
   - Provides efficient broadcasting to subscribed clients

3. **WebSocket Server** (`src/websocket/server.rs`)
   - Handles WebSocket connection upgrades
   - Processes client subscription requests
   - Manages message sending and receiving

4. **Updated Worker** (`src/worker.rs`)
   - Enhanced to broadcast events via WebSocket when database operations succeed
   - Non-blocking WebSocket integration that doesn't affect indexer performance

5. **Updated Router** (`src/router.rs`)
   - Adds WebSocket endpoint at `/ws`
   - Maintains existing REST API endpoints

### Data Flow

```
Sui Blockchain Events
        ↓
Oracle Builder Worker (processes events)
        ↓
Database Update (create/update records)
        ↓
WebSocket Broadcast (if update successful)
        ↓
Client Manager (routes to subscribed clients)
        ↓
WebSocket Clients (receive real-time updates)
```

## Features

### Subscription Types

1. **All Oracles**: Receive updates for all oracle operations
2. **All Price Feeds**: Receive updates for all price feed operations
3. **Oracles by Owner**: Receive updates only for oracles owned by a specific address
4. **Price Feeds by Oracle**: Receive updates only for price feeds belonging to a specific oracle

### Message Types

#### Client to Server
- `subscribe_oracles` / `unsubscribe_oracles`
- `subscribe_price_feeds` / `unsubscribe_price_feeds`
- `subscribe_oracles_by_owner` / `unsubscribe_oracles_by_owner`
- `subscribe_price_feeds_by_oracle` / `unsubscribe_price_feeds_by_oracle`

#### Server to Client
- `subscription_confirmed`: Confirms subscription/unsubscription
- `oracle_created`: New oracle created with full oracle data
- `oracle_invalidated`: Oracle invalidated with oracle ID
- `price_feed_created`: New price feed created with full price feed data
- `price_feed_invalidated`: Price feed invalidated with price feed and oracle IDs
- `error`: Error messages for invalid requests

## Security & Performance

### Security Features
- **Input Validation**: All incoming WebSocket messages are validated
- **Error Handling**: Graceful error handling with proper error messages
- **Connection Management**: Automatic cleanup of disconnected clients

### Performance Features
- **Non-blocking**: WebSocket operations don't block the main indexer workflow
- **Efficient Broadcasting**: Messages only sent to clients with relevant subscriptions
- **Memory Management**: Automatic cleanup of disconnected clients
- **Concurrent Processing**: WebSocket server runs independently of the indexer

## Configuration

The WebSocket server uses the existing API configuration:

```toml
[api]
host = "127.0.0.1"
port = 3001
```

WebSocket endpoint will be available at: `ws://{host}:{port}/ws`

Note: The WebSocket server runs on the same port as the REST API, not on a separate port.

## Testing

### Manual Testing with Browser Console

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');
ws.onmessage = (event) => console.log(JSON.parse(event.data));
ws.onopen = () => ws.send(JSON.stringify({type: 'subscribe_oracles'}));
```

## Integration with Frontend

### React Example

```jsx
import { useEffect, useState } from 'react';

const useOracleWebSocket = (url) => {
  const [socket, setSocket] = useState(null);
  const [oracles, setOracles] = useState([]);
  const [priceFeeds, setPriceFeeds] = useState([]);

  useEffect(() => {
    const ws = new WebSocket(url);
    
    ws.onopen = () => {
      setSocket(ws);
      // Subscribe to updates
      ws.send(JSON.stringify({ type: 'subscribe_oracles' }));
      ws.send(JSON.stringify({ type: 'subscribe_price_feeds' }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'oracle_created':
          setOracles(prev => [...prev, message.oracle]);
          break;
        case 'oracle_invalidated':
          setOracles(prev => prev.map(oracle => 
            oracle.oracle_id === message.oracle_id 
              ? { ...oracle, is_valid: false }
              : oracle
          ));
          break;
        case 'price_feed_created':
          setPriceFeeds(prev => [...prev, message.price_feed]);
          break;
        case 'price_feed_invalidated':
          setPriceFeeds(prev => prev.map(feed => 
            feed.price_feed_id === message.price_feed_id 
              ? { ...feed, is_valid: false }
              : feed
          ));
          break;
      }
    };

    return () => {
      ws.close();
    };
  }, [url]);

  return { socket, oracles, priceFeeds };
};
```

### Vue.js Example

```javascript
export default {
  data() {
    return {
      socket: null,
      oracles: [],
      priceFeeds: [],
      isConnected: false
    };
  },
  mounted() {
    this.connectWebSocket();
  },
  beforeUnmount() {
    if (this.socket) {
      this.socket.close();
    }
  },
  methods: {
    connectWebSocket() {
      this.socket = new WebSocket('ws://localhost:3001/ws');
      
      this.socket.onopen = () => {
        this.isConnected = true;
        this.socket.send(JSON.stringify({ type: 'subscribe_oracles' }));
        this.socket.send(JSON.stringify({ type: 'subscribe_price_feeds' }));
      };

      this.socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      };

      this.socket.onclose = () => {
        this.isConnected = false;
      };
    },
    
    handleMessage(message) {
      switch (message.type) {
        case 'oracle_created':
          this.oracles.push(message.oracle);
          break;
        case 'price_feed_created':
          this.priceFeeds.push(message.price_feed);
          break;
        // Handle other message types...
      }
    }
  }
};
```

## Deployment Considerations

1. **Load Balancing**: If running multiple instances, consider using a message broker (Redis) for cross-instance broadcasting
2. **Monitoring**: Monitor WebSocket connection counts and message throughput
3. **Rate Limiting**: Consider implementing rate limiting for WebSocket connections
4. **SSL/TLS**: Use `wss://` protocol in production with proper certificates

## Troubleshooting

### Common Issues

1. **Connection Refused**: Ensure the indexer is running and the port is accessible
2. **No Messages**: Verify subscriptions are active and blockchain events are occurring
3. **High Memory Usage**: Check for disconnected clients that aren't being cleaned up

### Debug Logging

Enable debug logging to troubleshoot WebSocket issues:

```bash
RUST_LOG=debug cargo run
```

### Health Check

The existing REST API endpoints remain available for health checks and initial data loading:

- `GET /v0/oracles` - List all oracles
- `GET /v0/price-feeds` - List all price feeds

## Future Enhancements

Potential improvements for future iterations:

1. **Authentication**: Add API key or token-based authentication
2. **Rate Limiting**: Implement per-client message rate limiting
3. **Message Persistence**: Optional message queuing for offline clients
4. **Metrics**: Add Prometheus metrics for WebSocket connections and messages
5. **Compression**: Enable WebSocket message compression for large payloads
6. **Heartbeat**: Implement ping/pong heartbeat mechanism for connection health

## Conclusion

The WebSocket implementation provides a robust, real-time communication channel between the Oracle Builder Indexer and frontend applications. It maintains backward compatibility with existing REST endpoints while adding powerful real-time capabilities for building responsive user interfaces.
