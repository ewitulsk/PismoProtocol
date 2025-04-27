import { HermesClient } from "@pythnetwork/hermes-client";

// Mapping of common assets to their Pyth price feed IDs
export const PRICE_FEED_IDS: Record<string, string> = {
  // Cryptocurrency pairs
  'BTCUSD': '0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b',
  'ETHUSD': '0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6'
};

// Class to manage Pyth price feed subscriptions
export class PythPriceFeedService {
  private client: HermesClient;
  private activeSubscriptions: Map<string, () => void> = new Map();
  private priceCache: Map<string, { price: number, confidence: number }> = new Map(); // Cache latest prices

  constructor() {
    // Use the mainnet endpoint
    this.client = new HermesClient("https://hermes-beta.pyth.network");
  }

  // Subscribe to price updates for a specific asset symbol or price feed ID
  async subscribe(
    symbolOrId: string, // Can be a symbol like 'BTCUSD' or a price feed ID like '0x...'
    onPriceUpdate: (price: number, confidence: number) => void
  ): Promise<boolean> {
    try {
      // Check if we already have an active subscription for this symbol/ID
      if (this.activeSubscriptions.has(symbolOrId)) {
        console.warn(`Already subscribed to ${symbolOrId}`);
        // If already subscribed, immediately call back with cached price if available
        const cachedPrice = this.priceCache.get(symbolOrId);
        if (cachedPrice) {
            onPriceUpdate(cachedPrice.price, cachedPrice.confidence);
        }
        return false;
      }

      // Determine the price feed ID
      let priceId: string | undefined;
      if (symbolOrId.startsWith('0x')) {
        priceId = symbolOrId; // Assume it's a direct ID
      } else {
        priceId = PRICE_FEED_IDS[symbolOrId]; // Look up symbol
      }

      if (!priceId) {
        console.error(`No price feed ID found or provided for ${symbolOrId}`);
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
            const price = Number(priceObj.price) * (10 ** priceObj.expo);
            const confidence = Number(priceObj.conf) * (10 ** priceObj.expo);

            // Cache the latest price
            this.priceCache.set(symbolOrId, { price, confidence });

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
        console.error(`Error in price update stream for ${symbolOrId}:`, error);
        // Optionally attempt to reconnect or handle the error
      };

      // Return a function to close the event source
      const unsubscribe = () => {
        eventSource.close();
        this.priceCache.delete(symbolOrId); // Clear cache on unsubscribe
      };

      // Store the unsubscribe function for later cleanup
      this.activeSubscriptions.set(symbolOrId, unsubscribe);

      console.log(`Subscribed to ${symbolOrId} price feed`);
      // Fetch initial price immediately after subscribing
      this.getLatestPrice(symbolOrId).then(initialPrice => {
        if (initialPrice) {
            this.priceCache.set(symbolOrId, initialPrice); // Cache initial price
            onPriceUpdate(initialPrice.price, initialPrice.confidence);
        }
      });
      return true;
    } catch (error) {
      console.error(`Error subscribing to price feed ${symbolOrId}:`, error);
      return false;
    }
  }

  // Unsubscribe from price updates for a specific asset symbol or price feed ID
  async unsubscribe(symbolOrId: string): Promise<boolean> {
    try {
      const unsubscribe = this.activeSubscriptions.get(symbolOrId);
      if (unsubscribe) {
        unsubscribe(); // Call the unsubscribe function
        this.activeSubscriptions.delete(symbolOrId);
        this.priceCache.delete(symbolOrId); // Ensure cache is cleared
        console.log(`Unsubscribed from ${symbolOrId} price feed`);
        return true;
      }

      console.warn(`No active subscription found for ${symbolOrId}`);
      return false;
    } catch (error) {
      console.error(`Error unsubscribing from price feed ${symbolOrId}:`, error);
      return false;
    }
  }

  // Get the latest price for a symbol or price feed ID (one-time fetch)
  async getLatestPrice(symbolOrId: string): Promise<{ price: number, confidence: number } | null> {
    // Check cache first
    const cachedPrice = this.priceCache.get(symbolOrId);
    if (cachedPrice) {
        return cachedPrice;
    }

    try {
      // Determine the price feed ID
      let priceId: string | undefined;
      if (symbolOrId.startsWith('0x')) {
        priceId = symbolOrId; // Assume it's a direct ID
      } else {
        priceId = PRICE_FEED_IDS[symbolOrId]; // Look up symbol
      }

      if (!priceId) {
        console.error(`No price feed ID found or provided for ${symbolOrId}`);
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

          // Cache the fetched price
          this.priceCache.set(symbolOrId, { price, confidence });

          return { price, confidence };
        }
      }

      return null;
    } catch (error) {
      console.error(`Error fetching latest price for ${symbolOrId}:`, error);
      return null;
    }
  }

  // Clean up all subscriptions
  cleanup(): void {
    // Convert Map entries to array to avoid TypeScript iterating issues
    const subscriptions = Array.from(this.activeSubscriptions.entries());

    subscriptions.forEach(([symbolOrId, unsubscribe]) => {
      try {
        unsubscribe();
        console.log(`Unsubscribed from ${symbolOrId} price feed during cleanup`);
      } catch (error) {
        console.error(`Error during cleanup for ${symbolOrId}:`, error);
      }
    });

    this.activeSubscriptions.clear();
    this.priceCache.clear(); // Clear cache on cleanup
  }
}

// Create a singleton instance for use throughout the app
export const pythPriceFeedService = new PythPriceFeedService();