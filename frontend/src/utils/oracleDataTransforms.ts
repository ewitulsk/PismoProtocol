import { IndexerOracle, IndexerPriceFeed } from '@/services/oracleBuilderApi';
import { UIOracle, UIPriceFeed } from '@/types/oracleBuilder';

// Transform indexer Oracle data to UI-friendly format
export const transformOracleFromApi = (apiOracle: IndexerOracle): UIOracle => {
  return {
    id: apiOracle.oracle_id,
    owner: apiOracle.owner,
    is_valid: apiOracle.is_valid,
    // Generate UI-friendly display values.  TODO ADD THESE WHEN CONTRACTS SUPPORT NAME/DESC
    // name: apiOracle.name,
    //description: apiOracle.description,
    type: 'Price Feed',
    status: apiOracle.is_valid ? 'Live' : 'Inactive',
    createdBy: apiOracle.owner,
    priceFeeds: [], // Will be populated separately
  };
};

// Transform indexer PriceFeed data to UI-friendly format  
export const transformPriceFeedFromApi = (apiPriceFeed: IndexerPriceFeed): UIPriceFeed => {
  return {
    id: apiPriceFeed.price_feed_id,
    oracle_id: apiPriceFeed.oracle_id,
    is_valid: apiPriceFeed.is_valid,
    api_key: apiPriceFeed.api_key,
    underlying_url: apiPriceFeed.underlying_url,
    response_field: apiPriceFeed.response_field,
    live_url: apiPriceFeed.live_url,
    // Generate UI-friendly display values
    name: `Price Feed ${apiPriceFeed.price_feed_id.slice(0, 8)}...`,
    feedId: apiPriceFeed.price_feed_id.slice(0, 16),
    isProtected: false, // Default - could be derived from other data
  };
};

// Transform Oracle with its associated PriceFeeds
export const transformOracleWithPriceFeeds = (
  oracle: IndexerOracle, 
  priceFeeds: IndexerPriceFeed[]
): UIOracle => {
  const transformedOracle = transformOracleFromApi(oracle);
  const transformedPriceFeeds = priceFeeds
    .filter(feed => feed.oracle_id === oracle.oracle_id)
    .map(transformPriceFeedFromApi);
  
  return {
    ...transformedOracle,
    priceFeeds: transformedPriceFeeds,
    // Update derived fields based on price feeds
    trustedBy: `${transformedPriceFeeds.length} price feeds`,
    type: transformedPriceFeeds.length > 0 ? 'Price Feed' : 'Oracle',
  };
};
