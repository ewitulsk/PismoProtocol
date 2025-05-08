// This map stores the mapping between Pyth Network price feed IDs (hex strings)
// and human-readable information like display name and base asset.
//
// PLEASE POPULATE THIS MAP using the Beta Price Feed IDs from:
// https://www.pyth.network/developers/price-feed-ids#beta
//
// The key should be the full hex string of the price_feed_id_bytes (e.g., "0x...").
// The value should be an object: { displayName: string, baseAsset: string, aggregatorSymbol: string, defaultDecimals?: number }
// - displayName: Typically in the format "BASE/QUOTE", e.g., "BTC/USD".
// - baseAsset: The base asset symbol, e.g., "BTC".
// - aggregatorSymbol: The symbol format expected by the priceFeedAggregatorService, e.g., "BTCUSD".
// - defaultDecimals (optional): The number of decimals for the asset, if known.
//   This can be useful if the token_decimals from the contract is not the preferred display decimal.

export const PRICE_FEED_TO_INFO_MAP: Record<string, { displayName: string; baseAsset: string; defaultDecimals?: number }> = {
  // Examples (please replace/extend with actual Beta feed IDs from Pyth Network):
  "0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b": { displayName: "BTC/USD", baseAsset: "BTC", defaultDecimals: 6 }, // This is a common stable feed ID, check Beta list
  "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6": { displayName: "ETH/USD", baseAsset: "ETH", defaultDecimals: 6 }, // This is a common stable feed ID, check Beta list
  "0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266": { displayName: "SUI/USD", baseAsset: "SUI", defaultDecimals: 6 }, // This is a common stable feed ID, check Beta list
  // Add more Beta Price Feed IDs here based on https://www.pyth.network/developers/price-feed-ids#beta
  // Example for a hypothetical SOL/USD Beta feed:
  // "0xYOUR_SOL_USD_BETA_PRICE_FEED_ID": { displayName: "SOL/USD", baseAsset: "SOL", defaultDecimals: 4 },
}; 