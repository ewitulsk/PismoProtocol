import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { oracleBuilderApi, IndexerOracle, IndexerPriceFeed } from '@/services/oracleBuilderApi';
import {
  transformPriceFeedFromApi,
  transformOracleFromApi,
  transformOracleWithPriceFeeds
} from '@/utils/oracleDataTransforms';
import { UIOracle, UIPriceFeed } from '@/types/oracleBuilder';

// Hook to fetch all oracles
export const useOracles = (ownerId?: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['oracles', ownerId],
    queryFn: async () => {
      const response = await oracleBuilderApi.fetchOracles(ownerId);
      if (!response.success || !response.data) {
        console.error("useOracles - API call failed:", response.error);
        throw new Error(response.error || 'Failed to fetch oracles');
      }
      // Ensure we always return an array
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Hook to fetch a specific oracle by ID
export const useOracle = (oracleId: string) => {
  return useQuery({
    queryKey: ['oracle', oracleId],
    queryFn: async () => {
      const response = await oracleBuilderApi.fetchOracleById(oracleId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch oracle');
      }
      return response.data;
    },
    enabled: !!oracleId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

// Hook to fetch all price feeds
export const usePriceFeeds = () => {
  return useQuery({
    queryKey: ['priceFeeds'],
    queryFn: async () => {
      const response = await oracleBuilderApi.fetchPriceFeeds();
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch price feeds');
      }
      // Ensure we always return an array
      return Array.isArray(response.data) ? response.data : [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

// Hook to fetch a specific price feed by ID
export const usePriceFeed = (priceFeedId: string) => {
  return useQuery({
    queryKey: ['priceFeed', priceFeedId],
    queryFn: async () => {
      const response = await oracleBuilderApi.fetchPriceFeedById(priceFeedId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch price feed');
      }
      return response.data;
    },
    enabled: !!priceFeedId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

// Hook to fetch price feeds for a specific oracle
export const usePriceFeedsByOracle = (oracleId: string) => {
  return useQuery({
    queryKey: ['priceFeedsByOracle', oracleId],
    queryFn: async () => {
      return await oracleBuilderApi.fetchPriceFeedsByOracleId(oracleId);
    },
    enabled: !!oracleId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

// Combined hook to fetch oracles with their price feeds (transformed for UI)
export const useOraclesWithPriceFeeds = (ownerId?: string, enabled: boolean = true): {
  data: UIOracle[] | undefined;
  isLoading: boolean;
  error: Error | null;
} => {
  const { data: oracles, isLoading: oraclesLoading, error: oraclesError } = useOracles(ownerId, enabled);
  const { data: priceFeeds, isLoading: priceFeedsLoading, error: priceFeedsError } = usePriceFeeds();

  const isLoading = oraclesLoading || priceFeedsLoading;
  const error = oraclesError || priceFeedsError;

  const transformedData = oracles && priceFeeds 
    ? oracles.map((oracle: IndexerOracle) => 
        transformOracleWithPriceFeeds(oracle, priceFeeds)
      )
    : undefined;

  return {
    data: transformedData,
    isLoading,
    error,
  };
};

// Hook to fetch a single oracle with its price feeds (transformed for UI)
export const useOracleWithPriceFeeds = (oracleId: string): {
  data: UIOracle | undefined;
  isLoading: boolean;
  error: Error | null;
} => {
  const { data: oracle, isLoading: oracleLoading, error: oracleError } = useOracle(oracleId);
  const { data: priceFeeds, isLoading: priceFeedsLoading, error: priceFeedsError } = usePriceFeedsByOracle(oracleId);

  const isLoading = oracleLoading || priceFeedsLoading;
  const error = oracleError || priceFeedsError;

  const transformedData = oracle && priceFeeds 
    ? transformOracleWithPriceFeeds(oracle, priceFeeds)
    : undefined;

  return {
    data: transformedData,
    isLoading,
    error,
  };
};

// Hook to fetch user's own oracles
export const useMyOracles = () => {
  const currentAccount = useCurrentAccount();
  const ownerAddress = currentAccount?.address;
  
  // Only make the API call if we have a wallet connected
  const result = useOraclesWithPriceFeeds(ownerAddress, !!ownerAddress);

  // If no wallet is connected, return empty result immediately
  if (!ownerAddress) {
    return {
      data: [],
      isLoading: false,
      error: null
    };
  }

  return result;
};

// Hook for transformed price feeds
export const useTransformedPriceFeeds = (): {
  data: UIPriceFeed[] | undefined;
  isLoading: boolean;
  error: Error | null;
} => {
  const { data: priceFeeds, isLoading, error } = usePriceFeeds();

  const transformedData = priceFeeds 
    ? priceFeeds.map((feed: IndexerPriceFeed) => transformPriceFeedFromApi(feed))
    : undefined;

  return {
    data: transformedData,
    isLoading,
    error,
  };
};
