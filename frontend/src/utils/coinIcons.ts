// Extract the coin image key (middle part) from a symbol like "TEST_BTC_COIN"
export const getCoinImageKeyVault = (symbol: string): string => {
  const parts = symbol.split('_');
  return parts[1];
};

// Extract the asset symbol from a type like "BTC/USD"
export const getCoinImageKeyPosition = (asset: string): string => {
  // asset is like "BTC/USD" or "ETH/USD"
  return asset.split('/')[0];
};

// Get the icon path for a given symbol
export const getIconPath = (symbol: string): string =>
  `/images/asset-icons/${symbol}.svg`;