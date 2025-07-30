/**
 * Oracle Builder WebSocket Service
 * 
 * Provides WebSocket connection with message parsing, data transformation, and publishing
 */

import {
  ServerMessage,
  WebSocketConnectionState,
  OracleCreatedMessage,
  PriceFeedCreatedMessage,
  OracleInvalidatedMessage,
  PriceFeedInvalidatedMessage,
} from '@/types/oracleWebSocket';
import { 
  transformOracleFromApi, 
  transformPriceFeedFromApi 
} from '@/utils/oracleDataTransforms';
import { UIOracle, UIPriceFeed } from '@/types/oracleBuilder';

const reconnectIntervalMin = 3000;
const reconnectIntervalMax = 30000;

// Types for the broadcasting system
export interface ParsedWebSocketData {
  rawMessage: ServerMessage;
  parsedData: {
    oracle?: UIOracle;
    priceFeed?: UIPriceFeed;
    oracleId?: string;
    priceFeedId?: string;
  };
  timestamp: Date;
  messageType: string;
}

export class OracleBuilderWebSocketService {
  private socket: WebSocket | null = null;
  private connectionState: WebSocketConnectionState = {
    isConnected: false,
    isConnecting: false,
    error: null,
  };
  private url: string;
  private connectionStateListeners = new Set<(state: WebSocketConnectionState) => void>();
  private dataListeners = new Set<(data: ParsedWebSocketData) => void>();
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  
  constructor() {
    this.url = process.env.NEXT_PUBLIC_ORACLE_INDEXER_WS_URL || 'ws://localhost:3001/ws';
  }

  // Broadcast state changes to React components
  private updateState(newState: Partial<WebSocketConnectionState>) {
    this.connectionState = { ...this.connectionState, ...newState };
    const stateToSend = { ...this.connectionState };
    this.connectionStateListeners.forEach(listener => listener(stateToSend));
  }

  // Parse and transform WebSocket messages
  private parseAndTransformMessage(message: ServerMessage): ParsedWebSocketData {
    const parsedData: ParsedWebSocketData['parsedData'] = {};
    let messageType = message.type;

    try {
      switch (message.type) {
        case 'oracle_created': {
          const castedMessage = message as OracleCreatedMessage;
          const transformedOracle = transformOracleFromApi(castedMessage.oracle);
          parsedData.oracle = transformedOracle;
          break;
        }
        case 'price_feed_created': {
          const castedMessage = message as PriceFeedCreatedMessage;
          const transformedPriceFeed = transformPriceFeedFromApi(castedMessage.price_feed);
          parsedData.priceFeed = transformedPriceFeed;
          break;
        }
        case 'oracle_invalidated': {
          const castedMessage = message as OracleInvalidatedMessage;
          parsedData.oracleId = castedMessage.oracle_id;
          break;
        }
        case 'price_feed_invalidated': {
          const castedMessage = message as PriceFeedInvalidatedMessage;
          parsedData.priceFeedId = castedMessage.price_feed_id;
          parsedData.oracleId = castedMessage.oracle_id;
          break;
        }
        default:
          // Handle subscription confirmations and errors without transformation
          break;
      }
    } catch (error) {
      console.error('[WebSocket] Error transforming message:', error);
      messageType = 'error';
    }

    return {
      rawMessage: message,
      parsedData,
      timestamp: new Date(),
      messageType,
    };
  }

  // Broadcast parsed data to React components
  private broadcastParsedData(data: ParsedWebSocketData) {
    this.dataListeners.forEach(listener => listener(data));
  }

  // Handle retry logic with exponential backoff
  private scheduleReconnect() {
    if (this.reconnectTimeoutId) return; // Prevent multiple schedules
    
    this.reconnectAttempts++;
    const delay = Math.min(reconnectIntervalMin * Math.pow(1.5, this.reconnectAttempts - 1), reconnectIntervalMax);

    // Don't update the error message here - let the event handlers set it
    
    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      this.connect();
    }, delay);
  }

  // Establish WebSocket connection
  public connect() {
    if (this.connectionState.isConnected || this.connectionState.isConnecting) {
      return;
    }

    this.updateState({
      isConnecting: true,
      error: this.reconnectAttempts > 0 ? `Reconnecting... (attempt ${this.reconnectAttempts})` : null
    });

    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateState({
          isConnected: true,
          isConnecting: false,
          error: null
        });
      };

      this.socket.onmessage = (event) => {
        try {
          const message: ServerMessage = JSON.parse(event.data);
          console.log('[WebSocket] Received message:', message);
          
          // Parse and transform the message
          const parsedData = this.parseAndTransformMessage(message);
          
          // Broadcast to components
          this.broadcastParsedData(parsedData);
          
          console.log('[WebSocket] Parsed and transformed data:', parsedData);
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      this.socket.onclose = (event) => {
        this.socket = null;
        
        // Only reconnect if not a normal closure (deliberate disconnect)
        if (event.code !== 1000 && event.code !== 1001) {
          this.scheduleReconnect();
          
          // Update message after scheduling reconnect (which increments the counter)
          this.updateState({
            isConnected: false,
            isConnecting: false,
            error: `Connection lost - attempting reconnect (${this.reconnectAttempts})`
          });
        } else {
          this.updateState({
            isConnected: false,
            isConnecting: false,
            error: null
          });
        }
      };

      this.socket.onerror = () => {
        this.socket = null;

        this.scheduleReconnect();
        
        // Update message after scheduling reconnect (which increments the counter)
        this.updateState({
          isConnected: false,
          isConnecting: false,
          error: `Connection failed - attempting reconnect (${this.reconnectAttempts})`
        });
      };
    } catch (error) {
      this.updateState({
        isConnecting: false,
        error: 'Failed to create connection'
      });
      this.scheduleReconnect();
    }
  }

  // Clean shutdown
  public disconnect() {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    
    if (this.socket) {
      this.socket.close(1000, 'Deliberate disconnect');
      this.socket = null;
    }
    
    this.reconnectAttempts = 0;
    this.updateState({
      isConnected: false,
      isConnecting: false,
      error: null
    });
  }

  // Get current state
  public getConnectionState(): WebSocketConnectionState {
    return { ...this.connectionState };
  }

  // Subscribe to state changes
  public onConnectionStateChange(callback: (state: WebSocketConnectionState) => void): () => void {
    this.connectionStateListeners.add(callback);
    return () => {
      this.connectionStateListeners.delete(callback);
    };
  }

  // Subscribe to parsed data changes
  public onDataReceived(callback: (data: ParsedWebSocketData) => void): () => void {
    this.dataListeners.add(callback);
    return () => {
      this.dataListeners.delete(callback);
    };
  }

  // Send subscription messages (useful for components to subscribe to specific data)
  public subscribeToOracles(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'subscribe_oracles' }));
    }
  }

  public subscribeToPriceFeeds(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'subscribe_price_feeds' }));
    }
  }

  public subscribeToOraclesByOwner(ownerId: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ 
        type: 'subscribe_oracles_by_owner',
        owner_id: ownerId
      }));
    }
  }
}

export const oracleWebSocketService = new OracleBuilderWebSocketService();
