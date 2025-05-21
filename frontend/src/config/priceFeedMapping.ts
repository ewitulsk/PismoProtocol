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
  "0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b": { displayName: "BTC/USD", baseAsset: "TEST_BTC", defaultDecimals: 8 }, // Updated for TEST_BTC
  "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6": { displayName: "ETH/USD", baseAsset: "TEST_ETH", defaultDecimals: 8 }, // Updated for TEST_ETH
  "0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266": { displayName: "SUI/USD", baseAsset: "TEST_SUI", defaultDecimals: 8 }, // Updated for TEST_SUI
  "0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722": { displayName: "USDC/USD", baseAsset: "TEST_USDC", defaultDecimals: 8 },
  "0x62ee9f77ad0b8217d6bf259a86e846ff078890c1bcf3c93cc83f9025ba5a0d0c": { displayName: "CMG/USD", baseAsset: "TEST_CMG", defaultDecimals: 8 },
  "0x7dac7cafc583cc4e1ce5c6772c444b8cd7addeecd5bedb341dfa037c770ae71e": { displayName: "TSLA/USD", baseAsset: "TEST_TSLA", defaultDecimals: 8 },
  "0x16e38262485de554be6a09b0c1d4d86eb2151a7af265f867d769dee359cec32e": { displayName: "NVDA/USD", baseAsset: "TEST_NVDA", defaultDecimals: 8 },
  "0xd7566a3ba7f7286ed54f4ae7e983f4420ae0b1e0f3892e11f9c4ab107bbad7b9": { displayName: "AVAX/USD", baseAsset: "TEST_AVAX", defaultDecimals: 8 },
  "0x44a93dddd8effa54ea51076c4e851b6cbbfd938e82eb90197de38fe8876bb66e": { displayName: "APT/USD", baseAsset: "TEST_APT", defaultDecimals: 8 },
  "0xfe650f0367d4a7ef9815a593ea15d36593f0643aaaf0149bb04be67ab851decd": { displayName: "SOL/USD", baseAsset: "TEST_SOL", defaultDecimals: 8 },
  // Add more Beta Price Feed IDs here based on https://www.pyth.network/developers/price-feed-ids#beta
  // Example for a hypothetical SOL/USD Beta feed:
  // "0xYOUR_SOL_USD_BETA_PRICE_FEED_ID": { displayName: "SOL/USD", baseAsset: "SOL", defaultDecimals: 4 },
}; 