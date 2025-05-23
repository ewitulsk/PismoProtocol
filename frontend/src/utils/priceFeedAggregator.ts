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
  type?: string;  // Add optional type property
}

type OHLCBarCallback = (update: OHLCBarUpdate) => void;

export class PriceFeedAggregatorService {
  private socket: WebSocket | null = null;
  private isConnected = false;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 2000; // 2 seconds
  private clientId: string | null = null;
  private ohlcBarHandlers: Map<string, Map<string, Set<OHLCBarCallback>>> = new Map(); // feedId -> interval -> handlers
  private pendingSubscription: { 
    feedId: string; 
    timespan?: string;
  } | null = null;
  private url = process.env.NEXT_PUBLIC_PRICE_FEED_AGGREGATOR_URL as string;
  // Track which history requests have been processed to avoid duplicates
  // No longer tracking history requests

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

          // Process pending subscription if exists
          if (this.pendingSubscription) {
            this.subscribeToFeed(this.pendingSubscription.feedId, this.pendingSubscription.timespan);
            this.pendingSubscription = null;
          }

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
    timespan: string = 'minute'
  ): Promise<boolean> {
    // Remove "0x" prefix from feedId if present
    const cleanFeedId = feedId.startsWith('0x') ? feedId.substring(2) : feedId;
    
    // If not connected, store subscription for later
    if (!this.isConnected) {
      // Only store one subscription at a time
      this.pendingSubscription = { 
        feedId: cleanFeedId, 
        timespan
      };
      
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
        timespan,
        feed_id: cleanFeedId,
        ohlc: true
      };

      console.log(`[PriceFeedAggregator] Sending subscription: ${JSON.stringify(subscriptionMsg)}`);
      this.socket.send(JSON.stringify(subscriptionMsg));
      return true;
    } catch (error) {
      console.error('[PriceFeedAggregator] Error sending subscription:', error);
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
          if (message.ohlc) {
            console.log(`[PriceFeedAggregator] OHLC subscription confirmed: ${message.feed_id}, intervals: ${message.intervals.join(', ')}`);
            
            // Process historical data if included in the subscription confirmation
            if (message.historical_data) {
              // For each interval in the historical data
              for (const [interval, bars] of Object.entries(message.historical_data)) {
                if (Array.isArray(bars) && bars.length > 0) {
                  console.log(`[PriceFeedAggregator] Received ${bars.length} historical bars for ${message.feed_id}, interval: ${interval}`);
                  
                  // Find handlers for this feed ID
                  const feedId = message.feed_id;
                  
                  if (!feedId || !interval) {
                    console.warn('[PriceFeedAggregator] Missing feed_id or interval in historical data');
                    continue;
                  }
                  
                  // Clean and normalize the feed ID for consistent matching
                  const cleanFeedId = feedId.startsWith('0x') ? feedId.substring(2) : feedId;
                  const normalizedFeedId = cleanFeedId.toLowerCase();
                  
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
                    console.warn(`[PriceFeedAggregator] No handlers found for feed ID: ${feedId} when processing historical data`);
                    continue;
                  }
                  
                  // Normalize the interval for case-insensitive matching
                  const normalizedInterval = interval.toLowerCase();
                  
                  // Find matching interval with normalized comparison
                  let matchedInterval: string | null = null;
                  
                  Array.from(feedHandlers.keys()).forEach(key => {
                    if (key.toLowerCase() === normalizedInterval && !matchedInterval) {
                      matchedInterval = key;
                    }
                  });
                  
                  const intervalHandlers = matchedInterval ? feedHandlers.get(matchedInterval) : null;
                  if (!intervalHandlers || intervalHandlers.size === 0) {
                    console.warn(`[PriceFeedAggregator] No handlers found for interval: ${interval} when processing historical data`);
                    continue;
                  }
                  
                  // Convert all historical bars to the proper format
                  const formattedBars = bars.map(barData => ({
                    feed_id: feedId,
                    symbol: barData.symbol || message.symbol || feedId,
                    interval: interval,
                    timestamp: barData.timestamp,
                    open: barData.open,
                    high: barData.high,
                    low: barData.low,
                    close: barData.close,
                    volume: barData.volume,
                    confirmed: true
                  }));
                  
                  // Send all historical bars at once to each handler
                  intervalHandlers.forEach(callback => {
                    try {
                      callback({
                        type: 'historical_bars',
                        feed_id: feedId,
                        symbol: message.symbol || feedId,
                        interval: interval,
                        bars: formattedBars
                      } as any);
                    } catch (error) {
                      console.error(`[PriceFeedAggregator] Error processing historical bars:`, error);
                    }
                  });
                }
              }
            }
          } else {
            console.log(`[PriceFeedAggregator] Subscription confirmed: ${message.feed_id}`);
          }
          break;

        case 'unsubscription_confirmed':
          if (message.ohlc) {
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

        case 'price_update':
          // Simply acknowledge receipt of price update message without processing it
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
                    // Include the eventType in the data passed to the callback
                    callback({
                      ...data,
                      type: eventType
                    });
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
        // Include the eventType in the data passed to the callback
        callback({
          ...data,
          type: eventType
        });
      } catch (error) {
        console.error(`[PriceFeedAggregator] Error in OHLC bar update handler:`, error);
      }
    });
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
  

  // Subscribe to OHLC bars for a specific feed and interval
  public async subscribeToOHLCBars(
    feedId: string,
    interval: string,
    callback: OHLCBarCallback
  ): Promise<boolean> {    
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
        break;
      }
    }
    
    // Use existing interval key or create new entry
    const intervalToUse = existingInterval || interval;
    if (!feedHandlers.has(intervalToUse)) {
      feedHandlers.set(intervalToUse, new Set());
    }
    
    // Check if this exact callback is already registered
    const existingCallbacks = feedHandlers.get(intervalToUse)!;
    let callbackAlreadyRegistered = false;
    
    // We can't directly check if a Set contains a function reference,
    // so we'll check the size before and after adding
    const sizeBefore = existingCallbacks.size;
    existingCallbacks.add(callback);
    const sizeAfter = existingCallbacks.size;
    
    callbackAlreadyRegistered = sizeBefore === sizeAfter;
    
    // If the callback was already registered and we already have a subscription,
    // we don't need to send another subscription message
    if (callbackAlreadyRegistered && sizeBefore > 0) {
      return true;
    }
    
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
      // Send subscription message - historical bars will be included in the subscription confirmation
      // Removed 'symbol' field from the payload
      this.socket.send(JSON.stringify({
        type: 'subscribe',
        feed_id: cleanFeedId,
        ohlc: true,
        intervals: [interval]
        // Removed: symbol: symbol 
      }));
      
      return true;
    } catch (error) {
      console.error('[PriceFeedAggregator] Error subscribing to OHLC bars:', error);
      return false;
    }
  }
  
  // Unsubscribe from OHLC bars
  public unsubscribeFromOHLCBars(
    feedId: string,
    interval: string,
    callback?: OHLCBarCallback
  ): boolean {
    // feedId is now passed directly, no need for PRICE_FEED_IDS lookup.
    
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
}

// Singleton instance
export const priceFeedAggregatorService = new PriceFeedAggregatorService();