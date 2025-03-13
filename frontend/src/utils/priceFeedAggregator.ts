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

export interface OHLCBarUpdate {
  feed_id: string;
  symbol: string;
  interval: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  confirmed: boolean;
}

type PriceUpdateCallback = (update: PriceUpdate) => void;
type PolygonCandleCallback = (update: PolygonCandleUpdate) => void;
type OHLCBarCallback = (update: OHLCBarUpdate) => void;

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
  private ohlcBarHandlers: Map<string, Map<string, Set<OHLCBarCallback>>> = new Map(); // feedId -> interval -> handlers
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
      
      // Check if message has a valid type
      if (!message || typeof message !== 'object' || !message.type) {
        console.warn('[PriceFeedAggregator] Received message with invalid format:', 
          typeof message === 'object' ? JSON.stringify(message).substring(0, 100) : typeof message);
        return;
      }
      
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
          } else if (message.ohlc) {
            console.log(`[PriceFeedAggregator] OHLC subscription confirmed: ${message.feed_id}, intervals: ${message.intervals.join(', ')}`);
          } else {
            console.log(`[PriceFeedAggregator] Subscription confirmed: ${message.feed_id}`);
          }
          break;

        case 'unsubscription_confirmed':
          const unsubType = message.subscription_type || 'aggregated';
          if (unsubType === 'polygon_only') {
            console.log(`[PriceFeedAggregator] Polygon unsubscription confirmed: ${message.ticker}`);
          } else if (message.ohlc) {
            console.log(`[PriceFeedAggregator] OHLC unsubscription confirmed: ${message.feed_id}`);
          } else {
            console.log(`[PriceFeedAggregator] Unsubscription confirmed: ${message.feed_id}`);
          }
          break;

        case 'available_feeds':
          // Safely access feeds array with optional chaining
          const feedCount = message.feeds?.length || 0;
          console.log(`[PriceFeedAggregator] Received ${feedCount} available feeds`);
          break;

        case 'price_update':
          if (message.data) {
            try {
              // Debugging logs removed
              
              this.handlePriceUpdate(message.data);
            } catch (error) {
              console.error('[PriceFeedAggregator] Error processing price update:', error);
            }
          } else {
            console.warn('[PriceFeedAggregator] Received price_update message with no data');
          }
          break;
          
        case 'bar_update':
          if (message.data) {
            try {
              this.handleOHLCBarUpdate(message.data, 'bar_update');
            } catch (error) {
              console.error('[PriceFeedAggregator] Error processing bar update:', error);
            }
          }
          break;
          
        case 'new_bar':
          if (message.data) {
            try {
              this.handleOHLCBarUpdate(message.data, 'new_bar');
            } catch (error) {
              console.error('[PriceFeedAggregator] Error processing new bar:', error);
            }
          }
          break;

        case 'ohlc_history':
          console.log(`[PriceFeedAggregator] Received ${message.bars?.length || 0} historical OHLC bars for ${message.feed_id}`);
          if (message.bars && message.bars.length > 0) {
            try {
              message.bars.forEach((bar: OHLCBarUpdate) => {
                if (bar) {
                  this.handleOHLCBarUpdate(bar, 'new_bar');
                }
              });
            } catch (error) {
              console.error('[PriceFeedAggregator] Error processing OHLC history bars:', error);
            }
          }
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
    // Check if data exists
    if (!data) {
      console.warn('[PriceFeedAggregator] Received empty price update');
      return;
    }
    
    
    // If symbol is missing, try to determine it from any available identifier
    let symbol: string = "";
    
    if (data.symbol) {
      // Use the provided symbol
      symbol = data.symbol.replace('/', '').replace('-', '');
    } else if (data.pyth_data?.id) {
      // Try to get symbol from Pyth feed ID mapping
      // Reverse lookup the symbol from feed ID
      const mappedSymbol = this.getSymbolFromFeedId(data.pyth_data.id);
      
      // If we couldn't find a symbol, just use the feed ID as the symbol
      if (mappedSymbol) {
        symbol = mappedSymbol;
      } else {
        symbol = data.pyth_data.id;
      }
    } else if (data.polygon_data?.ticker) {
      // Try to extract symbol from Polygon ticker (e.g., X:BTC-USD -> BTCUSD)
      const ticker = data.polygon_data.ticker;
      symbol = ticker.replace('X:', '').replace('-', '');
    } else if (typeof data === 'object' && data !== null) {
      // Try to find any object property that might be an identifier
      let foundId = false;
      let idSymbol = '';
      
      // Try to iterate through all properties to find feed IDs or tickers
      for (const [key, value] of Object.entries(data as Record<string, any>)) {
        if (typeof value === 'string' && 
            (key.includes('id') || key.includes('feed') || key.includes('ticker') || key.includes('symbol'))) {
          idSymbol = value;
          foundId = true;
          break;
        } else if (typeof value === 'object' && value !== null) {
          // Check nested objects
          const nestedId = this.findIdentifierInObject(value);
          if (nestedId) {
            idSymbol = nestedId;
            foundId = true;
            break;
          }
        }
      }
      
      if (foundId) {
        symbol = idSymbol;
      }
      
      if (!foundId) {
        // Try to find any property that might serve as an identifier
        const typedData = data as Record<string, any>;
        const possibleIds = [
          typedData.source_priority, 
          typedData.has_pyth_data ? 'pyth' : '',
          typedData.has_polygon_data ? 'polygon' : ''
        ].filter(Boolean);
        
        if (possibleIds.length > 0) {
          // Use the available identifiers as symbol
          symbol = `unknown_${possibleIds.join('_')}`;
        } else {
          // Last resort - use a timestamp-based identifier
          symbol = `unknown_${Date.now()}`;
        }
      }
    } else {
      // Non-object data, use a fallback identifier
      symbol = `unknown_${Date.now()}`;
    }

    // Make sure symbol is defined at this point
    if (!symbol) {
      symbol = `unknown_${Date.now()}`;
    }
    
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
  
  // Handle OHLC bar updates
  private handleOHLCBarUpdate(data: OHLCBarUpdate, eventType: string): void {
    // Check if data exists and has required fields
    if (!data || !data.feed_id || !data.interval) {
      console.warn('[PriceFeedAggregator] Received OHLC update with missing required fields', data);
      return;
    }
    
    // Clean and normalize the feed ID for consistent matching
    const feedId = data.feed_id;
    const cleanFeedId = feedId.startsWith('0x') ? feedId.substring(2) : feedId;
    const normalizedFeedId = cleanFeedId.toLowerCase();
    
    let symbol: string;
    
    // Determine the symbol - try multiple methods
    if (data.symbol) {
      // Use the provided symbol
      symbol = data.symbol;
    } else {
      // Try to get symbol from our feed ID mapping
      const mappedSymbol = this.getSymbolFromFeedId(feedId);
      if (mappedSymbol) {
        symbol = mappedSymbol;
      } else {
        // Fallback to using the feed ID as symbol
        symbol = feedId;
      }
    }
    
    const interval = data.interval;
    const normalizedInterval = interval.toLowerCase();
    
    // Get handlers for this feed and interval
    
    // Find matching feed ID with normalized comparison
    let matchedFeedId: string | null = null;
    
    // Use Array.from to convert the iterator to an array
    Array.from(this.ohlcBarHandlers.keys()).forEach(key => {
      const normalizedKey = key.startsWith('0x') ? key.substring(2).toLowerCase() : key.toLowerCase();
      if (normalizedKey === normalizedFeedId && !matchedFeedId) {
        matchedFeedId = key;
      }
    });
    
    const feedHandlers = matchedFeedId ? this.ohlcBarHandlers.get(matchedFeedId) : null;
    if (!feedHandlers) {
      // Try another approach - look for handlers by symbol
      if (symbol && symbol !== feedId) {
        // Normalize symbol for comparison
        const lowerSymbol = symbol.toLowerCase().replace(/[^a-z0-9]/g, ''); // Remove non-alphanumeric
        
        // Attempt to find feed ID from symbol
        Array.from(this.ohlcBarHandlers.entries()).forEach(([handlerFeedId, handlers]) => {
          // Try multiple matching strategies
          const handlerSymbol = this.getSymbolFromFeedId(handlerFeedId) || '';
          const normalizedHandlerFeedId = handlerFeedId.startsWith('0x') ? 
                                         handlerFeedId.substring(2).toLowerCase() : 
                                         handlerFeedId.toLowerCase();
          const lowerHandlerSymbol = handlerSymbol.toLowerCase().replace(/[^a-z0-9]/g, '');
          
          if (normalizedHandlerFeedId.includes(lowerSymbol) || 
              lowerSymbol.includes(normalizedHandlerFeedId) ||
              lowerHandlerSymbol === lowerSymbol ||
              lowerHandlerSymbol.includes(lowerSymbol) ||
              lowerSymbol.includes(lowerHandlerSymbol)) {
            
            // Look for matching interval
            let matchedAltInterval: string | null = null;
            Array.from(handlers.keys()).forEach(intervalKey => {
              if (intervalKey.toLowerCase() === normalizedInterval && !matchedAltInterval) {
                matchedAltInterval = intervalKey;
              }
            });
            
            if (matchedAltInterval) {
              const altIntervalHandlers = handlers.get(matchedAltInterval);
              if (altIntervalHandlers && altIntervalHandlers.size > 0) {
                // Call the found handlers
                altIntervalHandlers.forEach(callback => {
                  try {
                    callback(data);
                  } catch (error) {
                    console.error(`[PriceFeedAggregator] Error in OHLC bar update handler via symbol lookup:`, error);
                  }
                });
              }
            }
          }
        });
      }
      return;
    }
    
    // Try to match interval with case insensitivity
    let matchedInterval: string | null = null;
    
    Array.from(feedHandlers.keys()).forEach(key => {
      if (key.toLowerCase() === normalizedInterval && !matchedInterval) {
        matchedInterval = key;
      }
    });
    
    const intervalHandlers = matchedInterval ? feedHandlers.get(matchedInterval) : null;
    if (!intervalHandlers || intervalHandlers.size === 0) {
      return;
    }
    
    // Call each registered handler
    intervalHandlers.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[PriceFeedAggregator] Error in OHLC bar update handler:`, error);
      }
    });
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
    // Convert ISO timestamp to seconds timestamp, using current time as fallback
    const time = candle.timestamp 
      ? Math.floor(new Date(candle.timestamp).getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    
    return {
      time, 
      open: candle.open || 0,
      high: candle.high || 0,
      low: candle.low || 0,
      close: candle.close || 0
    };
  }
  
  // Create a bar from an OHLC bar update
  public static createBarFromOHLCUpdate(ohlcBar: OHLCBarUpdate): PriceFeedBarData {
    // Convert ISO timestamp to seconds timestamp, using current time as fallback
    const time = ohlcBar.timestamp 
      ? Math.floor(new Date(ohlcBar.timestamp).getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    
    return {
      time,
      open: ohlcBar.open || 0,
      high: ohlcBar.high || 0,
      low: ohlcBar.low || 0,
      close: ohlcBar.close || 0
    };
  }
  
  // Subscribe to OHLC bars for a specific feed and interval
  public async subscribeToOHLCBars(
    symbol: string,
    interval: string,
    callback: OHLCBarCallback
  ): Promise<boolean> {
    console.log(`[PriceFeedAggregator] Subscribing to OHLC bars for ${symbol}, interval: ${interval}`);
    
    // Try to get the feed ID for this symbol
    let feedId = PRICE_FEED_IDS[symbol];
    
    // If not found directly, try some common transformations
    if (!feedId) {
      // Try uppercase
      feedId = PRICE_FEED_IDS[symbol.toUpperCase()];
      
      if (!feedId) {
        // Try with USD suffix if not already present
        if (!symbol.toUpperCase().endsWith('USD')) {
          feedId = PRICE_FEED_IDS[symbol.toUpperCase() + 'USD'];
        }
        
        if (!feedId) {
          console.error(`[PriceFeedAggregator] No feed ID found for symbol: ${symbol}`);
          return false;
        }
      }
    }
    
    // Remove 0x prefix if present
    const cleanFeedId = feedId.startsWith('0x') ? feedId.substring(2) : feedId;
    
    // Convert feed ID to lowercase for consistent comparison
    const normalizedFeedId = cleanFeedId.toLowerCase();
    
    // Initialize nested maps if they don't exist
    // First check if we already have handlers for this feed ID (case insensitive)
    let existingFeedId = null;
    for (const key of this.ohlcBarHandlers.keys()) {
      const normalizedKey = key.startsWith('0x') ? key.substring(2).toLowerCase() : key.toLowerCase();
      if (normalizedKey === normalizedFeedId) {
        existingFeedId = key;
        console.log(`Found existing feed ID key: ${key} for normalized ID: ${normalizedFeedId}`);
        break;
      }
    }
    
    // Use existing key or create new entry
    const keyToUse = existingFeedId || cleanFeedId;
    if (!this.ohlcBarHandlers.has(keyToUse)) {
      this.ohlcBarHandlers.set(keyToUse, new Map());
    }
    
    // Normalize the interval for case-insensitive matching
    const normalizedInterval = interval.toLowerCase();
    
    // Check if we already have handlers for this interval (case insensitive)
    const feedHandlers = this.ohlcBarHandlers.get(keyToUse)!;
    let existingInterval = null;
    for (const intervalKey of feedHandlers.keys()) {
      if (intervalKey.toLowerCase() === normalizedInterval) {
        existingInterval = intervalKey;
        console.log(`Found existing interval key: ${intervalKey} for normalized interval: ${normalizedInterval}`);
        break;
      }
    }
    
    // Use existing interval key or create new entry
    const intervalToUse = existingInterval || interval;
    if (!feedHandlers.has(intervalToUse)) {
      feedHandlers.set(intervalToUse, new Set());
    }
    
    // Add the callback to handlers
    feedHandlers.get(intervalToUse)!.add(callback);
    
    console.log(`Registered OHLC handler for ${keyToUse}, interval: ${intervalToUse}. Total handlers: ${feedHandlers.get(intervalToUse)!.size}`);
    
    // Connect if not already connected
    if (!this.isConnected) {
      const connected = await this.connect();
      if (!connected) {
        return false;
      }
    }
    
    // Send subscription message
    if (!this.socket) {
      return false;
    }
    
    try {
      this.socket.send(JSON.stringify({
        type: 'subscribe',
        feed_id: cleanFeedId,
        ohlc: true,
        intervals: [interval],
        symbol: symbol
      }));
      
      // Request historical bars
      this.socket.send(JSON.stringify({
        type: 'get_ohlc_history',
        feed_id: cleanFeedId,
        interval: interval,
        limit: 100
      }));
      
      return true;
    } catch (error) {
      console.error('[PriceFeedAggregator] Error subscribing to OHLC bars:', error);
      return false;
    }
  }
  
  // Unsubscribe from OHLC bars
  public unsubscribeFromOHLCBars(
    symbol: string,
    interval: string,
    callback?: OHLCBarCallback
  ): boolean {
    console.log(`[PriceFeedAggregator] Unsubscribing from OHLC bars for ${symbol}, interval: ${interval}`);
    
    // Get the feed ID for this symbol
    let feedId = PRICE_FEED_IDS[symbol];
    if (!feedId) {
      // Try uppercase
      feedId = PRICE_FEED_IDS[symbol.toUpperCase()];
      
      if (!feedId) {
        // Try with USD suffix if not already present
        if (!symbol.toUpperCase().endsWith('USD')) {
          feedId = PRICE_FEED_IDS[symbol.toUpperCase() + 'USD'];
        }
        
        if (!feedId) {
          console.error(`[PriceFeedAggregator] No feed ID found for symbol: ${symbol}`);
          return false;
        }
      }
    }
    
    // Remove 0x prefix if present
    const cleanFeedId = feedId.startsWith('0x') ? feedId.substring(2) : feedId;
    
    // Convert feed ID to lowercase for consistent comparison
    const normalizedFeedId = cleanFeedId.toLowerCase();
    
    // Find the feed ID in our handler map (case-insensitive)
    let matchedFeedId = null;
    for (const key of this.ohlcBarHandlers.keys()) {
      const normalizedKey = key.startsWith('0x') ? key.substring(2).toLowerCase() : key.toLowerCase();
      if (normalizedKey === normalizedFeedId) {
        matchedFeedId = key;
        break;
      }
    }
    
    if (!matchedFeedId) {
      console.log(`[PriceFeedAggregator] No handlers found for feed ID: ${feedId}`);
      return true; // Already unsubscribed
    }
    
    const feedHandlers = this.ohlcBarHandlers.get(matchedFeedId);
    if (!feedHandlers) return true; // Already unsubscribed
    
    // Find the interval in our handler map (case-insensitive)
    const normalizedInterval = interval.toLowerCase();
    let matchedInterval = null;
    for (const intervalKey of feedHandlers.keys()) {
      if (intervalKey.toLowerCase() === normalizedInterval) {
        matchedInterval = intervalKey;
        break;
      }
    }
    
    if (!matchedInterval) {
      console.log(`[PriceFeedAggregator] No handlers found for interval: ${interval}`);
      return true; // Already unsubscribed
    }
    
    const intervalHandlers = feedHandlers.get(matchedInterval);
    if (!intervalHandlers) return true; // Already unsubscribed
    
    if (callback) {
      // Remove specific callback
      intervalHandlers.delete(callback);
    } else {
      // Remove all callbacks
      intervalHandlers.clear();
    }
    
    // Clean up empty maps
    if (intervalHandlers.size === 0) {
      feedHandlers.delete(matchedInterval);
    }
    
    if (feedHandlers.size === 0) {
      this.ohlcBarHandlers.delete(matchedFeedId);
    }
    
    // Send unsubscribe message if no handlers left
    if (this.isConnected && this.socket && (!feedHandlers || feedHandlers.size === 0)) {
      try {
        this.socket.send(JSON.stringify({
          type: 'unsubscribe',
          feed_id: cleanFeedId,
          ohlc: true,
          intervals: [interval]
        }));
        
        return true;
      } catch (error) {
        console.error('[PriceFeedAggregator] Error unsubscribing from OHLC bars:', error);
        return false;
      }
    }
    
    return true;
  }
  
  // Helper method to reverse lookup symbol from feed ID
  private getSymbolFromFeedId(feedId: string): string | null {
    // Remove 0x prefix if present
    const cleanFeedId = feedId.startsWith('0x') ? feedId.substring(2) : feedId;
    
    // Find the symbol that maps to this feed ID
    for (const [symbol, id] of Object.entries(PRICE_FEED_IDS)) {
      // Normalize the stored feed ID for comparison
      const normalizedId = id.startsWith('0x') ? id.substring(2) : id;
      
      if (normalizedId.toLowerCase() === cleanFeedId.toLowerCase()) {
        return symbol;
      }
    }
    
    return null;
  }
  
  // Helper method to recursively find potential identifiers in nested objects
  private findIdentifierInObject(obj: any): string | null {
    // Safety check
    if (!obj || typeof obj !== 'object') {
      return null;
    }
    
    // Look for common identifier field names in the object
    const identifierFields = ['id', 'feedId', 'feed_id', 'ticker', 'symbol'];
    
    for (const field of identifierFields) {
      if (obj[field] && typeof obj[field] === 'string') {
        return obj[field];
      }
    }
    
    // Recursively check nested objects (limited depth to avoid infinite recursion)
    try {
      for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          // Check if the key itself might be an identifier
          if (identifierFields.some(field => key.includes(field))) {
            if (typeof value === 'string') {
              return value;
            } else if (typeof value === 'object' && value !== null && 
                       'id' in value && typeof (value as any).id === 'string') {
              return (value as any).id;
            }
          }
          
          // Recurse into the nested object (but only if it's not the same object to avoid loops)
          if (value !== obj) {
            const nestedId = this.findIdentifierInObject(value);
            if (nestedId) {
              return nestedId;
            }
          }
        }
      }
    } catch (error) {
      console.warn('[PriceFeedAggregator] Error searching for identifiers in object:', error);
    }
    
    return null;
  }
}

// Singleton instance
export const priceFeedAggregatorService = new PriceFeedAggregatorService();