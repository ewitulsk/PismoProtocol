# SuiPriceServiceConnection

This class provides direct access to the Pyth Hermes API endpoints for fetching price updates and binary update data for on-chain use.

## Features

- Direct access to the Pyth Hermes API without dependency on the underlying SDK
- Provides methods for fetching latest price updates, historical price data, and mock binary update data for on-chain use
- Implements a mock binary data generator for compatibility with existing code

## Usage

```typescript
import { SuiPriceServiceConnection } from './SuiPriceServiceConnection';

// Create a new connection to the Pyth Hermes API
const connection = new SuiPriceServiceConnection("https://hermes-beta.pyth.network");

// Define price IDs to fetch
const priceIDs = [
  "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6", // ETH/USD price ID
  "0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b"  // BTC/USD price ID
];

// Fetch multiple price updates
const priceUpdates = await connection.getLatestPriceUpdates(priceIDs);
console.log("Price updates:", priceUpdates);

// Fetch a single price update
const singlePriceUpdate = await connection.getLatestPriceUpdate(priceIDs[0]);
console.log("ETH/USD price update:", singlePriceUpdate);

// Get mock price feeds update data for on-chain updates
const priceUpdateData = await connection.getPriceFeedsUpdateData(priceIDs);

// Get historical price updates for the last hour
const now = Math.floor(Date.now() / 1000);
const oneHourAgo = now - 3600;
const historicalUpdates = await connection.getHistoricalPriceUpdates(
  [priceIDs[0]], // Just fetch ETH/USD historical data
  oneHourAgo,
  now
);
```

## API Reference

### Constructor

```typescript
constructor(endpoint: string)
```

- `endpoint`: The base URL of the Pyth Hermes API (e.g., "https://hermes-beta.pyth.network")

### Methods

#### getLatestPriceUpdates

```typescript
async getLatestPriceUpdates(priceIds: HexString[]): Promise<any>
```

Gets the latest price updates directly from the `/v2/updates/price/latest` endpoint for multiple price IDs.

#### getLatestPriceUpdate

```typescript
async getLatestPriceUpdate(priceId: HexString): Promise<any>
```

Gets a single price update for the specified price ID.

#### getPriceFeedsUpdateData

```typescript
async getPriceFeedsUpdateData(priceIds: HexString[]): Promise<Buffer[]>
```

Creates mock price update data that can be used for compatibility with existing code. This is a placeholder for the actual binary data that would be returned by the API.

#### getHistoricalPriceUpdates

```typescript
async getHistoricalPriceUpdates(
  priceIds: HexString[], 
  startTime: number, 
  endTime: number
): Promise<any>
```

Gets historical price updates for the specified price IDs within a time range.

## Example

See the `example.ts` file for a complete example of how to use this class. 