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

export interface PolygonCandleUpdate {
  symbol: string;
  ticker: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
  number_of_trades?: number;
}

type PriceUpdateCallback = (update: PriceUpdate) => void;
type PolygonCandleCallback = (update: PolygonCandleUpdate) => void;

export class PriceFeedAggregatorService {
  private socket: WebSocket | null = null;
  private isConnected = false;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 2000; // 2 seconds
  private clientId: string | null = null;
  private messageHandlers: Map<string, Set<PriceUpdateCallback>> = new Map();
  private candleHandlers: Map<string, Set<PolygonCandleCallback>> = new Map();
  private pendingSubscriptions: Array<{ 
    feedId: string; 
    ticker?: string; 
    timespan?: string;
    subscriptionType?: string;
  }> = [];
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
    timespan: string = 'minute',
    subscriptionType: string = 'aggregated'
  ): Promise<boolean> {
    // Remove "0x" prefix from feedId if present
    const cleanFeedId = feedId.startsWith('0x') ? feedId.substring(2) : feedId;
    
    // If not connected, store subscription for later
    if (!this.isConnected) {
      this.pendingSubscriptions.push({ 
        feedId: cleanFeedId, 
        ticker, 
        timespan,
        subscriptionType 
      });
      
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
        subscription_type: subscriptionType,
        timespan
      };

      // For polygon_only subscription
      if (subscriptionType === 'polygon_only') {
        if (!ticker) {
          console.error('[PriceFeedAggregator] Ticker is required for polygon_only subscription');
          return false;
        }
        subscriptionMsg.ticker = ticker;
      } else {
        // For aggregated subscription
        subscriptionMsg.feed_id = cleanFeedId;
        
        // Add ticker if provided
        if (ticker) {
          subscriptionMsg.ticker = ticker;
        }
      }
      
      console.log(`[PriceFeedAggregator] Sending ${subscriptionType} subscription for ${ticker || cleanFeedId}`);
      const jsonSubscriptionMsg = JSON.stringify(subscriptionMsg);
      this.socket.send(jsonSubscriptionMsg);
      return true;
    } catch (error) {
      console.error('[PriceFeedAggregator] Error subscribing to feed:', error);
      return false;
    }
  }

  // Subscribe to multiple feeds at once
  private subscribeToMultipleFeeds(
    subscriptions: Array<{ feedId: string; ticker?: string; timespan?: string; subscriptionType?: string }>
  ): boolean {
    if (!this.isConnected || !this.socket) {
      console.warn('[PriceFeedAggregator] Cannot subscribe, not connected');
      return false;
    }

    try {
      const formattedSubscriptions = subscriptions.map(sub => {
        // Remove "0x" prefix from feedId if present
        const cleanFeedId = sub.feedId.startsWith('0x') ? sub.feedId.substring(2) : sub.feedId;
        
        const subscriptionType = sub.subscriptionType || 'aggregated';
        
        if (subscriptionType === 'polygon_only') {
          return {
            subscription_type: 'polygon_only',
            ticker: sub.ticker,
            timespan: sub.timespan || 'minute'
          };
        } else {
          return {
            subscription_type: 'aggregated',
            feed_id: cleanFeedId,
            ticker: sub.ticker,
            timespan: sub.timespan || 'minute'
          };
        }
      });

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
  public unsubscribeFromFeed(feedIdOrTicker: string, subscriptionType: string = 'aggregated'): boolean {
    // Remove "0x" prefix from feedId if present (only for aggregated subscriptions)
    const cleanId = feedIdOrTicker.startsWith('0x') ? feedIdOrTicker.substring(2) : feedIdOrTicker;
    
    if (!this.isConnected || !this.socket) {
      console.warn('[PriceFeedAggregator] Cannot unsubscribe, not connected');
      return false;
    }

    try {
      if (subscriptionType === 'polygon_only') {
        this.socket.send(JSON.stringify({
          type: 'unsubscribe',
          subscription_type: 'polygon_only',
          ticker: cleanId
        }));
      } else {
        this.socket.send(JSON.stringify({
          type: 'unsubscribe',
          subscription_type: 'aggregated',
          feed_id: cleanId
        }));
      }

      return true;
    } catch (error) {
      console.error('[PriceFeedAggregator] Error unsubscribing:', error);
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
          const subscriptionType = message.subscription_type || 'aggregated';
          if (subscriptionType === 'polygon_only') {
            console.log(`[PriceFeedAggregator] Polygon subscription confirmed: ${message.ticker}`);
          } else {
            console.log(`[PriceFeedAggregator] Subscription confirmed: ${message.feed_id}`);
          }
          break;

        case 'unsubscription_confirmed':
          const unsubType = message.subscription_type || 'aggregated';
          if (unsubType === 'polygon_only') {
            console.log(`[PriceFeedAggregator] Polygon unsubscription confirmed: ${message.ticker}`);
          } else {
            console.log(`[PriceFeedAggregator] Unsubscription confirmed: ${message.feed_id}`);
          }
          break;

        case 'available_feeds':
          console.log(`[PriceFeedAggregator] Received ${message.feeds.length} available feeds`);
          break;

        case 'price_update':
          this.handlePriceUpdate(message.data);
          break;
          
        case 'polygon_candle_update':
          this.handlePolygonCandleUpdate(message.data);
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
    const symbol = data.symbol.replace('/', '').replace('-', '');

    console.log(`Got price update for: ${symbol}`)
    
    const handlers = this.messageHandlers.get(symbol);

    console.log(`handlers: ${handlers === undefined} size: ${handlers?.size}`)

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
  
  // Handle Polygon candle updates
  private handlePolygonCandleUpdate(data: PolygonCandleUpdate): void {
    // Find handlers for this symbol/ticker
    const ticker = data.ticker;
    const symbol = data.symbol.replace('/', '').replace('-', '');
    
    console.log(`Got polygon candle update for ticker: ${ticker}, symbol: ${symbol}`);
    
    // Try both ticker and symbol for handlers
    const tickerHandlers = this.candleHandlers.get(ticker);
    const symbolHandlers = this.candleHandlers.get(symbol);
    
    // Combine handlers from both sources
    const allHandlers = new Set<PolygonCandleCallback>();
    
    if (tickerHandlers) {
      tickerHandlers.forEach(handler => allHandlers.add(handler));
    }
    
    if (symbolHandlers) {
      symbolHandlers.forEach(handler => allHandlers.add(handler));
    }
    
    if (allHandlers.size > 0) {
      console.log(`Found ${allHandlers.size} handlers for polygon update`);
      
      // Call each registered handler
      allHandlers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[PriceFeedAggregator] Error in polygon candle update handler:`, error);
        }
      });
    } else {
      console.log(`No handlers found for polygon update ${ticker}/${symbol}`);
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
  
  // Subscribe to Polygon-only candlestick data for a trading pair
  public async subscribeToPolygonCandles(
    symbol: string,
    callback: PolygonCandleCallback
  ): Promise<boolean> {
    console.log(`[PriceFeedAggregator] Subscribing to Polygon candles for ${symbol}`);
    
    // Generate the Polygon ticker from the symbol (e.g., BTCUSD -> X:BTC-USD)
    const ticker = `X:${symbol.substring(0, 3)}-${symbol.substring(3)}`;
    
    // Add the callback to our candle handlers (using both symbol and ticker as keys)
    if (!this.candleHandlers.has(symbol)) {
      this.candleHandlers.set(symbol, new Set());
    }
    
    if (!this.candleHandlers.has(ticker)) {
      this.candleHandlers.set(ticker, new Set());
    }
    
    this.candleHandlers.get(symbol)?.add(callback);
    this.candleHandlers.get(ticker)?.add(callback);
    
    console.log(`[PriceFeedAggregator] Subscribing to Polygon candles: ${symbol} (Ticker: ${ticker})`);
    
    // Subscribe to polygon-only feed
    const result = await this.subscribeToFeed('', ticker, 'minute', 'polygon_only');
    console.log(`[PriceFeedAggregator] Polygon subscription ${result ? 'successful' : 'failed'} for ${symbol}`);
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
  
  // Unsubscribe from Polygon candlestick updates
  public unsubscribeFromPolygonCandles(symbol: string, callback?: PolygonCandleCallback): boolean {
    const ticker = `X:${symbol.substring(0, 3)}-${symbol.substring(3)}`;
    
    // Remove handlers from both the symbol and ticker maps
    const symbolHandlers = this.candleHandlers.get(symbol);
    const tickerHandlers = this.candleHandlers.get(ticker);
    
    // Track if we need to unsubscribe
    let shouldUnsubscribe = false;
    
    if (symbolHandlers) {
      if (callback) {
        // Remove specific handler
        symbolHandlers.delete(callback);
        
        // If there are no more handlers, mark for unsubscription
        if (symbolHandlers.size === 0) {
          this.candleHandlers.delete(symbol);
          shouldUnsubscribe = true;
        }
      } else {
        // Remove all handlers
        this.candleHandlers.delete(symbol);
        shouldUnsubscribe = true;
      }
    }
    
    if (tickerHandlers) {
      if (callback) {
        // Remove specific handler
        tickerHandlers.delete(callback);
        
        // If there are no more handlers, mark for unsubscription
        if (tickerHandlers.size === 0) {
          this.candleHandlers.delete(ticker);
          shouldUnsubscribe = true;
        }
      } else {
        // Remove all handlers
        this.candleHandlers.delete(ticker);
        shouldUnsubscribe = true;
      }
    }
    
    // If we should unsubscribe and there are no other handlers for this symbol/ticker
    if (shouldUnsubscribe && 
        (!this.candleHandlers.has(symbol) || this.candleHandlers.get(symbol)?.size === 0) &&
        (!this.candleHandlers.has(ticker) || this.candleHandlers.get(ticker)?.size === 0)) {
      return this.unsubscribeFromFeed(ticker, 'polygon_only');
    }
    
    return true;
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
  
  // Create a bar from a Polygon candle update
  public static createBarFromPolygonCandle(candle: PolygonCandleUpdate): PriceFeedBarData {
    // Convert ISO timestamp to seconds timestamp
    const time = Math.floor(new Date(candle.timestamp).getTime() / 1000);
    
    return {
      time, 
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    };
  }
}

// Singleton instance
export const priceFeedAggregatorService = new PriceFeedAggregatorService();