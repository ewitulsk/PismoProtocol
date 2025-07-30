/**
 * Real-time Data Integration Hook
 * 
 * This hook bridges WebSocket messages with React Query cache, providing seamless
 * integration between real-time updates and existing REST API data flows.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { 
  oracleWebSocketService, 
  ParsedWebSocketData 
} from '@/services/oracleWebSocketService';
import { 
  transformOracleWithPriceFeeds,
  transformOracleFromApi,
  transformPriceFeedFromApi 
} from '@/utils/oracleDataTransforms';
import { UIOracle, UIPriceFeed } from '@/types/oracleBuilder';
import { IndexerOracle, IndexerPriceFeed } from '@/services/oracleBuilderApi';
import { useOracleToasts } from '@/components/ui/ToastNotifications';

export interface RealtimeDataIntegrationOptions {
  enableOptimisticUpdates?: boolean;
  enableToastNotifications?: boolean;
  autoSubscribe?: boolean;
}

export interface RealtimeIntegrationState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastUpdateTime: Date | null;
  updateCount: number;
}

/**
 * Central hook that manages WebSocket ↔ React Query integration
 */
export const useRealtimeDataIntegration = (
  options: RealtimeDataIntegrationOptions = {}
) => {
  const {
    enableOptimisticUpdates = true,
    enableToastNotifications = false,
    autoSubscribe = true
  } = options;

  const queryClient = useQueryClient();
  const currentAccount = useCurrentAccount();
  const updateCountRef = useRef(0);
  const lastUpdateTimeRef = useRef<Date | null>(null);

  // Toast notifications for user feedback
  const oracleToasts = useOracleToasts();

  // Handle oracle creation updates
  const handleOracleCreated = useCallback((data: ParsedWebSocketData) => {
    if (!data.parsedData.oracle) return;

    const newOracle = data.parsedData.oracle;
    updateCountRef.current++;
    lastUpdateTimeRef.current = new Date();

    console.log('🔄 [RealtimeIntegration] Oracle Created:', newOracle);

    // Update React Query cache for oracles list
    queryClient.setQueryData<IndexerOracle[]>(['oracles'], (oldData) => {
      if (!oldData) return [transformOracleToIndexer(newOracle)];
      
      // Check if oracle already exists (avoid duplicates)
      const exists = oldData.some(oracle => oracle.oracle_id === newOracle.id);
      if (exists) return oldData;
      
      return [transformOracleToIndexer(newOracle), ...oldData];
    });

    // Update user's oracles if it belongs to them
    if (currentAccount?.address && newOracle.owner === currentAccount.address) {
      queryClient.setQueryData<IndexerOracle[]>(
        ['oracles', currentAccount.address], 
        (oldData) => {
          if (!oldData) return [transformOracleToIndexer(newOracle)];
          
          const exists = oldData.some(oracle => oracle.oracle_id === newOracle.id);
          if (exists) return oldData;
          
          return [transformOracleToIndexer(newOracle), ...oldData];
        }
      );
    }

    // Invalidate related queries to trigger refetch with price feeds
    queryClient.invalidateQueries({ queryKey: ['oraclesWithPriceFeeds'] });
    if (currentAccount?.address) {
      queryClient.invalidateQueries({ 
        queryKey: ['oraclesWithPriceFeeds', currentAccount.address] 
      });
    }

    if (enableToastNotifications) {
      oracleToasts.notifyOracleCreated(newOracle.name || 'Unnamed Oracle', newOracle.owner);
    }
  }, [queryClient, currentAccount?.address, enableToastNotifications]);

  // Handle oracle invalidation
  const handleOracleInvalidated = useCallback((data: ParsedWebSocketData) => {
    if (!data.parsedData.oracleId) return;

    const oracleId = data.parsedData.oracleId;
    updateCountRef.current++;
    lastUpdateTimeRef.current = new Date();

    console.log('🚫 [RealtimeIntegration] Oracle Invalidated:', oracleId);

    // Update all oracle queries to mark as invalid
    const updateOracleValidity = (oldData: IndexerOracle[] | undefined) => {
      if (!oldData) return oldData;
      
      return oldData.map(oracle => 
        oracle.oracle_id === oracleId 
          ? { ...oracle, is_valid: false }
          : oracle
      );
    };

    queryClient.setQueryData<IndexerOracle[]>(['oracles'], updateOracleValidity);
    
    if (currentAccount?.address) {
      queryClient.setQueryData<IndexerOracle[]>(
        ['oracles', currentAccount.address], 
        updateOracleValidity
      );
    }

    // Update specific oracle query
    queryClient.setQueryData<IndexerOracle>(['oracle', oracleId], (oldData) => {
      if (!oldData) return oldData;
      return { ...oldData, is_valid: false };
    });

    // Invalidate composed queries
    queryClient.invalidateQueries({ queryKey: ['oraclesWithPriceFeeds'] });

    if (enableToastNotifications) {
      oracleToasts.notifyOracleInvalidated(oracleId);
    }
  }, [queryClient, currentAccount?.address, enableToastNotifications]);

  // Handle price feed creation
  const handlePriceFeedCreated = useCallback((data: ParsedWebSocketData) => {
    if (!data.parsedData.priceFeed) return;

    const newPriceFeed = data.parsedData.priceFeed;
    updateCountRef.current++;
    lastUpdateTimeRef.current = new Date();

    console.log('🔄 [RealtimeIntegration] Price Feed Created:', newPriceFeed);

    // Update price feeds list
    queryClient.setQueryData<IndexerPriceFeed[]>(['priceFeeds'], (oldData) => {
      if (!oldData) return [transformPriceFeedToIndexer(newPriceFeed)];
      
      const exists = oldData.some(feed => feed.price_feed_id === newPriceFeed.id);
      if (exists) return oldData;
      
      return [transformPriceFeedToIndexer(newPriceFeed), ...oldData];
    });

    // Update price feeds for specific oracle
    queryClient.setQueryData<IndexerPriceFeed[]>(
      ['priceFeedsByOracle', newPriceFeed.oracle_id], 
      (oldData) => {
        if (!oldData) return [transformPriceFeedToIndexer(newPriceFeed)];
        
        const exists = oldData.some(feed => feed.price_feed_id === newPriceFeed.id);
        if (exists) return oldData;
        
        return [transformPriceFeedToIndexer(newPriceFeed), ...oldData];
      }
    );

    // Invalidate oracle-with-price-feeds queries to trigger refetch
    queryClient.invalidateQueries({ queryKey: ['oraclesWithPriceFeeds'] });
    queryClient.invalidateQueries({ 
      queryKey: ['oracleWithPriceFeeds', newPriceFeed.oracle_id] 
    });

    if (enableToastNotifications) {
      oracleToasts.notifyPriceFeedCreated(newPriceFeed.name || 'Unnamed Feed', newPriceFeed.oracle_id);
    }
  }, [queryClient, enableToastNotifications]);

  // Handle price feed invalidation
  const handlePriceFeedInvalidated = useCallback((data: ParsedWebSocketData) => {
    if (!data.parsedData.priceFeedId) return;

    const priceFeedId = data.parsedData.priceFeedId;
    const oracleId = data.parsedData.oracleId;
    updateCountRef.current++;
    lastUpdateTimeRef.current = new Date();

    console.log('🚫 [RealtimeIntegration] Price Feed Invalidated:', priceFeedId);

    // Update price feeds validity
    const updatePriceFeedValidity = (oldData: IndexerPriceFeed[] | undefined) => {
      if (!oldData) return oldData;
      
      return oldData.map(feed => 
        feed.price_feed_id === priceFeedId 
          ? { ...feed, is_valid: false }
          : feed
      );
    };

    queryClient.setQueryData<IndexerPriceFeed[]>(['priceFeeds'], updatePriceFeedValidity);

    if (oracleId) {
      queryClient.setQueryData<IndexerPriceFeed[]>(
        ['priceFeedsByOracle', oracleId], 
        updatePriceFeedValidity
      );
    }

    // Update specific price feed
    queryClient.setQueryData<IndexerPriceFeed>(['priceFeed', priceFeedId], (oldData) => {
      if (!oldData) return oldData;
      return { ...oldData, is_valid: false };
    });

    // Invalidate composed queries
    queryClient.invalidateQueries({ queryKey: ['oraclesWithPriceFeeds'] });
    if (oracleId) {
      queryClient.invalidateQueries({ 
        queryKey: ['oracleWithPriceFeeds', oracleId] 
      });
    }

    if (enableToastNotifications) {
      oracleToasts.notifyPriceFeedInvalidated(priceFeedId);
    }
  }, [queryClient, enableToastNotifications]);

  // Message router
  const handleWebSocketMessage = useCallback((data: ParsedWebSocketData) => {
    switch (data.messageType) {
      case 'oracle_created':
        handleOracleCreated(data);
        break;
      case 'oracle_invalidated':
        handleOracleInvalidated(data);
        break;
      case 'price_feed_created':
        handlePriceFeedCreated(data);
        break;
      case 'price_feed_invalidated':
        handlePriceFeedInvalidated(data);
        break;
      default:
        // Handle subscription confirmations, errors, etc.
        console.log('📨 [RealtimeIntegration] Other message:', data.messageType);
        break;
    }
  }, [
    handleOracleCreated,
    handleOracleInvalidated, 
    handlePriceFeedCreated,
    handlePriceFeedInvalidated
  ]);

  // Set up WebSocket listeners
  useEffect(() => {
    const unsubscribeData = oracleWebSocketService.onDataReceived(handleWebSocketMessage);
    
    // Auto-connect and subscribe if enabled
    if (autoSubscribe) {
      const connectionState = oracleWebSocketService.getConnectionState();
      if (!connectionState.isConnected && !connectionState.isConnecting) {
        oracleWebSocketService.connect();
        
        // Set up subscriptions after connection
        setTimeout(() => {
          if (currentAccount?.address) {
            oracleWebSocketService.subscribeToOraclesByOwner(currentAccount.address);
          } else {
            oracleWebSocketService.subscribeToOracles();
          }
          oracleWebSocketService.subscribeToPriceFeeds();
        }, 1000);
      }
    }

    return () => {
      unsubscribeData();
    };
  }, [handleWebSocketMessage, currentAccount?.address, autoSubscribe]);

  // Get current connection state
  const connectionState = oracleWebSocketService.getConnectionState();

  return {
    // Connection state
    isConnected: connectionState.isConnected,
    isConnecting: connectionState.isConnecting,
    error: connectionState.error,
    
    // Update tracking
    lastUpdateTime: lastUpdateTimeRef.current,
    updateCount: updateCountRef.current,
    
    // Manual controls
    connect: () => oracleWebSocketService.connect(),
    disconnect: () => oracleWebSocketService.disconnect(),
    subscribeToOracles: () => oracleWebSocketService.subscribeToOracles(),
    subscribeToPriceFeeds: () => oracleWebSocketService.subscribeToPriceFeeds(),
    subscribeToOraclesByOwner: (ownerId: string) => 
      oracleWebSocketService.subscribeToOraclesByOwner(ownerId),
  };
};

// Helper functions to transform UI types back to Indexer types
function transformOracleToIndexer(uiOracle: UIOracle): IndexerOracle {
  return {
    oracle_id: uiOracle.id,
    owner: uiOracle.owner,
    is_valid: uiOracle.is_valid,
    name: uiOracle.name || '',
    description: uiOracle.description || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function transformPriceFeedToIndexer(uiPriceFeed: UIPriceFeed): IndexerPriceFeed {
  return {
    price_feed_id: uiPriceFeed.id,
    oracle_id: uiPriceFeed.oracle_id,
    is_valid: uiPriceFeed.is_valid,
    api_key: uiPriceFeed.api_key,
    underlying_url: uiPriceFeed.underlying_url,
    response_field: uiPriceFeed.response_field,
    live_url: uiPriceFeed.live_url,
    name: uiPriceFeed.name || '',
    description: uiPriceFeed.description || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
