// Price Feed Aggregator WebSocket Client
// Connects to the Price Feed Aggregator WebSocket service and handles subscriptions

import { PRICE_FEED_IDS } from './pythPriceFeed';

import { Time } from 'lightweight-charts';

export interface PriceFeedBarData {
  time: number | Time; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PriceUpdate {
  symbol: string;
  price: number;
  confidence: number;
  timestamp: string;
  source_priority: string;
  has_pyth_data: boolean;
  has_polygon_data: boolean;
  pyth_data?: {
    id: string;
    price: number;
    conf: number;
    expo: number;
    publish_time: string;
    status: string;
    ema_price: number;
    ema_conf: number;
  };
  polygon_data?: {
    ticker: string;
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    vwap: number;
    number_of_trades: number;
  };
}

type PriceUpdateCallback = (update: PriceUpdate) => void;

export class PriceFeedAggregatorService {
  private socket: WebSocket | null = null;
  private isConnected = false;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 2000; // 2 seconds
  private clientId: string | null = null;
  private messageHandlers: Map<string, Set<PriceUpdateCallback>> = new Map();
  private pendingSubscriptions: Array<{ feedId: string; ticker?: string; timespan?: string }> = [];
  private url = 'ws://localhost:8765'; // Default URL, can be changed

  // Connect to the WebSocket server
  public async connect(): Promise<boolean> {
    if (this.isConnected || this.isConnecting) {
      return this.isConnected;
    }

    this.isConnecting = true;
    console.log(`[PriceFeedAggregator] Attempting to connect to WebSocket server at ${this.url}`);

    return new Promise((resolve) => {
      try {
        this.socket = new WebSocket(this.url);
        console.log('[PriceFeedAggregator] WebSocket instance created, waiting for connection...');

        this.socket.onopen = () => {
          console.log('[PriceFeedAggregator] Successfully connected to WebSocket server');
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;

          // Process any pending subscriptions
          this.processPendingSubscriptions();

          // Request available feeds for reference
          this.requestAvailableFeeds();

          resolve(true);
        };

        this.socket.onclose = (event) => {
          console.log(`[PriceFeedAggregator] WebSocket closed: ${event.code} - ${event.reason}`);
          this.isConnected = false;
          this.isConnecting = false;
          this.clientId = null;
          
          // Attempt to reconnect
          this.attemptReconnect();
          resolve(false);
        };

        this.socket.onerror = (error) => {
          console.error('[PriceFeedAggregator] WebSocket error:', error);
          this.isConnecting = false;
          resolve(false);
        };

        this.socket.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        console.error('[PriceFeedAggregator] Error creating WebSocket:', error);
        this.isConnecting = false;
        resolve(false);
      }
    });
  }

  // Set the WebSocket URL
  public setUrl(url: string): void {
    this.url = url;
  }

  // Attempt to reconnect to the WebSocket server
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[PriceFeedAggregator] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);
    
    console.log(`[PriceFeedAggregator] Attempting to reconnect in ${delay}ms... (Attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  // Process any pending subscriptions after connection
  private processPendingSubscriptions(): void {
    if (this.pendingSubscriptions.length === 0) {
      return;
    }

    // If we have multiple pending subscriptions, use the batch subscription method
    if (this.pendingSubscriptions.length > 1) {
      this.subscribeToMultipleFeeds(this.pendingSubscriptions);
    } else {
      // Otherwise, use individual subscription
      const sub = this.pendingSubscriptions[0];
      this.subscribeToFeed(sub.feedId, sub.ticker, sub.timespan);
    }

    // Clear pending subscriptions
    this.pendingSubscriptions = [];
  }

  // Request list of available feeds
  private requestAvailableFeeds(): void {
    if (!this.isConnected || !this.socket) {
      console.warn('[PriceFeedAggregator] Cannot request available feeds, not connected');
      return;
    }

    this.socket.send(JSON.stringify({
      type: 'get_available_feeds'
    }));
  }

  // Subscribe to a single price feed
  public async subscribeToFeed(
    feedId: string,
    ticker?: string,
    timespan: string = 'minute'
  ): Promise<boolean> {
    // If not connected, store subscription for later
    if (!this.isConnected) {
      this.pendingSubscriptions.push({ feedId, ticker, timespan });
      
      // Try to connect
      const connected = await this.connect();
      return connected;
    }

    if (!this.socket) {
      console.error('[PriceFeedAggregator] Socket not initialized');
      return false;
    }

    try {
      const subscriptionMsg: any = {
        type: 'subscribe',
        feed_id: feedId,
        timespan
      };

      // Add ticker if provided
      if (ticker) {
        subscriptionMsg.ticker = ticker;
      }
      const jsonSubscriptionMsg = JSON.stringify(subscriptionMsg);
      console.log(jsonSubscriptionMsg)
      this.socket.send(jsonSubscriptionMsg);
      return true;
    } catch (error) {
      console.error('[PriceFeedAggregator] Error subscribing to feed:', error);
      return false;
    }
  }

  // Subscribe to multiple feeds at once
  private subscribeToMultipleFeeds(
    subscriptions: Array<{ feedId: string; ticker?: string; timespan?: string }>
  ): boolean {
    if (!this.isConnected || !this.socket) {
      console.warn('[PriceFeedAggregator] Cannot subscribe, not connected');
      return false;
    }

    try {
      const formattedSubscriptions = subscriptions.map(sub => ({
        feed_id: sub.feedId,
        ticker: sub.ticker,
        timespan: sub.timespan || 'minute'
      }));

      this.socket.send(JSON.stringify({
        type: 'subscribe_multiple',
        subscriptions: formattedSubscriptions
      }));

      return true;
    } catch (error) {
      console.error('[PriceFeedAggregator] Error subscribing to multiple feeds:', error);
      return false;
    }
  }

  // Unsubscribe from a price feed
  public unsubscribeFromFeed(feedId: string): boolean {
    if (!this.isConnected || !this.socket) {
      console.warn('[PriceFeedAggregator] Cannot unsubscribe, not connected');
      return false;
    }

    try {
      this.socket.send(JSON.stringify({
        type: 'unsubscribe',
        feed_id: feedId
      }));

      return true;
    } catch (error) {
      console.error('[PriceFeedAggregator] Error unsubscribing from feed:', error);
      return false;
    }
  }

  // Handle incoming messages from the WebSocket
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      const messageType = message.type;

      switch (messageType) {
        case 'connection_established':
          this.clientId = message.client_id;
          console.log(`[PriceFeedAggregator] Connection established with client ID: ${this.clientId}`);
          break;

        case 'subscription_confirmed':
          console.log(`[PriceFeedAggregator] Subscription confirmed: ${message.feed_id}`);
          break;

        case 'unsubscription_confirmed':
          console.log(`[PriceFeedAggregator] Unsubscription confirmed: ${message.feed_id}`);
          break;

        case 'available_feeds':
          console.log(`[PriceFeedAggregator] Received ${message.feeds.length} available feeds`);
          break;

        case 'price_update':
          this.handlePriceUpdate(message.data);
          break;

        case 'error':
          console.error(`[PriceFeedAggregator] Server error: ${message.message}`);
          break;

        default:
          console.warn(`[PriceFeedAggregator] Unknown message type: ${messageType}`);
      }
    } catch (error) {
      console.error('[PriceFeedAggregator] Error parsing message:', error);
    }
  }

  // Handle price updates
  private handlePriceUpdate(data: PriceUpdate): void {
    // Find handlers for this symbol
    const symbol = data.symbol.replace('/', '');
    
    // Log price update to console
    console.log('[PriceFeedAggregator] Price update received:', {
      symbol: data.symbol,
      price: data.price,
      timestamp: data.timestamp,
      source: data.source_priority,
      has_pyth: data.has_pyth_data,
      has_polygon: data.has_polygon_data,
      polygon_data: data.polygon_data ? {
        open: data.polygon_data.open,
        high: data.polygon_data.high,
        low: data.polygon_data.low,
        close: data.polygon_data.close,
        volume: data.polygon_data.volume
      } : null
    });
    
    const handlers = this.messageHandlers.get(symbol);

    if (handlers && handlers.size > 0) {
      // Call each registered handler
      handlers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[PriceFeedAggregator] Error in price update handler:`, error);
        }
      });
    }
  }

  // Subscribe to price updates for a trading pair
  public async subscribe(
    symbol: string,
    callback: PriceUpdateCallback
  ): Promise<boolean> {
    console.log(`[PriceFeedAggregator] Subscribing to price updates for ${symbol}`);
    
    // Add the callback to our handlers
    if (!this.messageHandlers.has(symbol)) {
      this.messageHandlers.set(symbol, new Set());
    }
    
    this.messageHandlers.get(symbol)?.add(callback);

    // Get the feed ID for this symbol
    const feedId = PRICE_FEED_IDS[symbol];
    if (!feedId) {
      console.error(`[PriceFeedAggregator] No feed ID found for symbol: ${symbol}`);
      return false;
    }

    // Generate the Polygon ticker from the symbol (e.g., BTCUSD -> X:BTC-USD)
    const ticker = `X:${symbol.substring(0, 3)}-${symbol.substring(3)}`;
    
    console.log(`[PriceFeedAggregator] Subscribing to feed: ${symbol} (Feed ID: ${feedId}, Ticker: ${ticker})`);

    // Subscribe to the feed
    const result = await this.subscribeToFeed(feedId, ticker);
    console.log(`[PriceFeedAggregator] Subscription ${result ? 'successful' : 'failed'} for ${symbol}`);
    return result;
  }

  // Unsubscribe from price updates for a trading pair
  public unsubscribe(symbol: string, callback?: PriceUpdateCallback): boolean {
    const handlers = this.messageHandlers.get(symbol);
    
    if (handlers) {
      if (callback) {
        // Remove specific handler
        handlers.delete(callback);
        
        // If there are still handlers, don't unsubscribe from the feed
        if (handlers.size > 0) {
          return true;
        }
      }
      
      // Remove all handlers for this symbol
      this.messageHandlers.delete(symbol);
    }

    // Get the feed ID for this symbol
    const feedId = PRICE_FEED_IDS[symbol];
    if (!feedId) {
      console.error(`[PriceFeedAggregator] No feed ID found for symbol: ${symbol}`);
      return false;
    }

    // Unsubscribe from the feed
    return this.unsubscribeFromFeed(feedId);
  }

  // Disconnect from the WebSocket server
  public disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
      this.clientId = null;
    }
  }

  // Create a candlestick bar from a price update
  public static createBarFromUpdate(update: PriceUpdate): PriceFeedBarData | null {
    if (!update.polygon_data) {
      // Without polygon data, we can't create a proper OHLC bar
      return null;
    }

    const poly = update.polygon_data;
    
    // Convert ISO timestamp to seconds timestamp
    const time = Math.floor(new Date(poly.timestamp).getTime() / 1000);
    
    return {
      time,
      open: poly.open,
      high: poly.high,
      low: poly.low,
      close: poly.close
    };
  }

  // Create a partial bar with just the current price
  public static createPartialBar(update: PriceUpdate): PriceFeedBarData {
    // Convert ISO timestamp to seconds timestamp
    const time = Math.floor(new Date(update.timestamp).getTime() / 1000);
    const price = update.price;
    
    return {
      time,
      open: price,
      high: price,
      low: price,
      close: price
    };
  }
}

// Singleton instance
export const priceFeedAggregatorService = new PriceFeedAggregatorService();