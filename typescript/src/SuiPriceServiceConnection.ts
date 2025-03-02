import { HexString } from "@pythnetwork/price-service-client";
import { Buffer } from "buffer";

/**
 * SuiPriceServiceConnection provides direct access to the Pyth Hermes API endpoints
 * for fetching price updates and binary update data for on-chain use.
 */
export class SuiPriceServiceConnection {
  private baseUrl: string;

  /**
   * Constructs a new SuiPriceServiceConnection.
   *
   * @param endpoint endpoint URL to the price service. Example: https://hermes-beta.pyth.network
   */
  constructor(endpoint: string) {
    // Remove trailing slash if present
    this.baseUrl = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
  }

  /**
   * Gets the latest price updates directly from the /v2/updates/price/latest endpoint.
   * This provides more detailed price information.
   *
   * @param priceIds Array of hex-encoded price ids.
   * @returns An array of Buffer objects containing the price update data.
   */
  async getLatestPriceUpdates(priceIds: HexString[]): Promise<Buffer[]> {
    if (!priceIds.length) {
      throw new Error('At least one price ID must be provided');
    }

    try {
      // Construct the URL with query parameters
      const queryParams = priceIds.map(id => `${id}`).join(',');
      const url = `${this.baseUrl}/v2/updates/price/latest?ids%5B%5D=${queryParams}&encoding=hex&parsed=false&ignore_invalid_price_ids=true`;
      console.log("URL: ", url);
      // Make the HTTP request
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      // Parse the response and extract just the binary.data array
      const responseData = await response.json();
            
      if (!responseData.binary || !Array.isArray(responseData.binary.data)) {
        throw new Error('Invalid response format: binary.data array not found');
      }
      
      // Convert hex strings to Buffer objects
      return responseData.binary.data.map((hexString: string) => {
        // Remove '0x' prefix if present
        const cleanHex = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
        return Buffer.from(cleanHex, 'hex');
      });
    } catch (error) {
      throw new Error(`Failed to fetch price updates: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 