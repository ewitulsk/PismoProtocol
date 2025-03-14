import { HermesClient } from "@pythnetwork/hermes-client";

// Mapping of common assets to their Pyth price feed IDs
export const PRICE_FEED_IDS: Record<string, string> = {
  // Cryptocurrency pairs
  'BTCUSD': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  'ETHUSD': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'SOLUSD': '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  'AVAXUSD': '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
  'MATICUSD': '0x5de33a9112c2b700b8d30b8a3402c103578ccfa2765696471cc672bd5cf6ac52',
  'LINKUSD': '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
  'DOGEUSD': '0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
  'UNIUSD': '0x78d185a741d7b3e43748f63e2ffbb10bd8d575e9cad8e6159daa2a60f5c68c17'
};

// Class to manage Pyth price feed subscriptions
export class PythPriceFeedService {
  private client: HermesClient;
  private activeSubscriptions: Map<string, () => void> = new Map();
  
  constructor() {
    // Use the mainnet endpoint
    this.client = new HermesClient("https://hermes.pyth.network");
  }
  
  // Subscribe to price updates for a specific asset symbol
  async subscribe(
    symbol: string, 
    onPriceUpdate: (price: number, confidence: number) => void
  ): Promise<boolean> {
    try {
      // Check if we already have an active subscription for this symbol
      if (this.activeSubscriptions.has(symbol)) {
        console.warn(`Already subscribed to ${symbol}`);
        return false;
      }
      
      // Get the price feed ID for this symbol
      const priceId = PRICE_FEED_IDS[symbol];
      if (!priceId) {
        console.error(`No price feed ID found for ${symbol}`);
        return false;
      }
      
      // Get an event source for price updates
      const eventSource = await this.client.getPriceUpdatesStream([priceId], {
        parsed: true,
        allowUnordered: false
      });
      
      // Set up event handlers
      eventSource.onmessage = (event) => {
        try {
          // Parse the price update from the event data
          const data = JSON.parse(event.data);
          
          // Extract price info from the parsed data structure
          if (data.parsed && Array.isArray(data.parsed) && data.parsed.length > 0) {
            const priceUpdate = data.parsed[0]; // Get the first parsed price update
            
            // Extract price data from the price object
            const priceObj = priceUpdate.price;
            
            // Calculate the actual price using the exponent
            // Pyth prices are represented as a price and a confidence interval, both scaled by a negative exponent
            const price = Number(priceObj.price) * (10 ** priceObj.expo);
            const confidence = Number(priceObj.conf) * (10 ** priceObj.expo);
            
            // Call the callback with the formatted price data
            onPriceUpdate(price, confidence);
          } else {
            // Invalid price update format - skip silently in production
          }
        } catch (error) {
          console.error('Error processing price update:', error);
        }
      };
      
      // Handle errors
      eventSource.onerror = (error) => {
        console.error(`Error in price update stream for ${symbol}:`, error);
      };
      
      // Return a function to close the event source
      const unsubscribe = () => {
        eventSource.close();
      };
      
      // Store the unsubscribe function for later cleanup
      this.activeSubscriptions.set(symbol, unsubscribe);
      
      console.log(`Subscribed to ${symbol} price feed`);
      return true;
    } catch (error) {
      console.error('Error subscribing to price feed:', error);
      return false;
    }
  }
  
  // Unsubscribe from price updates for a specific asset symbol
  async unsubscribe(symbol: string): Promise<boolean> {
    try {
      const unsubscribe = this.activeSubscriptions.get(symbol);
      if (unsubscribe) {
        unsubscribe(); // Call the unsubscribe function
        this.activeSubscriptions.delete(symbol);
        console.log(`Unsubscribed from ${symbol} price feed`);
        return true;
      }
      
      console.warn(`No active subscription found for ${symbol}`);
      return false;
    } catch (error) {
      console.error('Error unsubscribing from price feed:', error);
      return false;
    }
  }
  
  // Get the latest price for a symbol (one-time fetch)
  async getLatestPrice(symbol: string): Promise<{ price: number, confidence: number } | null> {
    try {
      const priceId = PRICE_FEED_IDS[symbol];
      if (!priceId) {
        console.error(`No price feed ID found for ${symbol}`);
        return null;
      }
      
      // Get the latest price updates
      const priceUpdates = await this.client.getLatestPriceUpdates([priceId]);
      
      // Check if priceUpdates is an object with parsed data
      if (priceUpdates && 
          typeof priceUpdates === 'object' && 
          'parsed' in priceUpdates && 
          Array.isArray(priceUpdates.parsed) && 
          priceUpdates.parsed.length > 0) {
        
        const priceUpdate = priceUpdates.parsed[0];
        
        // Make sure the price update has the price object with required fields
        if (
          typeof priceUpdate === 'object' && 
          priceUpdate !== null &&
          'price' in priceUpdate && 
          typeof priceUpdate.price === 'object' &&
          'price' in priceUpdate.price &&
          'conf' in priceUpdate.price &&
          'expo' in priceUpdate.price
        ) {
          const priceObj = priceUpdate.price;
          
          // Calculate actual price using the exponent
          const price = Number(priceObj.price) * (10 ** Number(priceObj.expo));
          const confidence = Number(priceObj.conf) * (10 ** Number(priceObj.expo));
          
          return { price, confidence };
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching latest price:', error);
      return null;
    }
  }
  
  // Clean up all subscriptions
  cleanup(): void {
    // Convert Map entries to array to avoid TypeScript iterating issues
    const subscriptions = Array.from(this.activeSubscriptions.entries());
    
    subscriptions.forEach(([symbol, unsubscribe]) => {
      try {
        unsubscribe();
        console.log(`Unsubscribed from ${symbol} price feed during cleanup`);
      } catch (error) {
        console.error(`Error during cleanup:`, error);
      }
    });
    
    this.activeSubscriptions.clear();
  }
}

// Create a singleton instance for use throughout the app
export const pythPriceFeedService = new PythPriceFeedService();