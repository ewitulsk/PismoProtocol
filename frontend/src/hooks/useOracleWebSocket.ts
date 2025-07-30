/**
 * React hook for Oracle Builder WebSocket integration
 * 
 * Provides WebSocket connection management with message parsing and data transformation.
 */

import { useEffect, useState } from 'react';
import { oracleWebSocketService, ParsedWebSocketData } from '@/services/oracleWebSocketService';
import { WebSocketConnectionState } from '@/types/oracleWebSocket';

/**
 * Hook for managing WebSocket connection with message parsing and transformation
 */
export const useOracleBuilderRealtimeUpdates = (ownerId?: string) => {
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>(() => 
    oracleWebSocketService.getConnectionState()
  );
  const [recentMessages, setRecentMessages] = useState<ParsedWebSocketData[]>([]);

  useEffect(() => {
    // console.log('🚀 Oracle Builder WebSocket Hook initialized');
    // console.log('👤 Owner ID:', ownerId || 'All users');
    
    // Listen for connection state changes
    const unsubscribeConnectionState = oracleWebSocketService.onConnectionStateChange((newState) => {
      // console.log('🔌 WebSocket Connection State Changed:', newState);
      setConnectionState(newState);
    });

    // Listen for parsed data
    const unsubscribeData = oracleWebSocketService.onDataReceived((data) => {
      // Console logging for development
      // console.group(`🔔 WebSocket Data Received: ${data.messageType}`);
      // console.log('📥 Raw Message:', data.rawMessage);
      // console.log('🔄 Parsed Data:', data.parsedData);
      // console.log('⏰ Timestamp:', data.timestamp.toISOString());
      
      // if (data.parsedData.oracle) {
      //   console.log('🏛️ Transformed Oracle:', data.parsedData.oracle);
      // }
      // if (data.parsedData.priceFeed) {
      //   console.log('📊 Transformed Price Feed:', data.parsedData.priceFeed);
      // }
      // if (data.parsedData.oracleId) {
      //   console.log('🔑 Oracle ID:', data.parsedData.oracleId);
      // }
      // console.groupEnd();
      
      setRecentMessages(prev => {
        // Keep only the last 50 messages to prevent memory issues
        const newMessages = [data, ...prev].slice(0, 50);
        return newMessages;
      });
    });
    
    // Connect on mount if not already connected
    const currentState = oracleWebSocketService.getConnectionState();
    if (!currentState.isConnected && !currentState.isConnecting) {
      oracleWebSocketService.connect();
      
      // Set up subscriptions after connection
      setTimeout(() => {
        if (ownerId) {
          oracleWebSocketService.subscribeToOraclesByOwner(ownerId);
        } else {
          oracleWebSocketService.subscribeToOracles();
        }
        oracleWebSocketService.subscribeToPriceFeeds();
      }, 1000); // Wait a second for connection to establish
    }

    return () => {
      unsubscribeConnectionState();
      unsubscribeData();
    };
  }, [ownerId]);

  return {
    connection: {
      isConnected: connectionState.isConnected,
      isConnecting: connectionState.isConnecting,
      error: connectionState.error,
    },
    recentMessages,
    // Utility functions
    subscribeToOracles: () => oracleWebSocketService.subscribeToOracles(),
    subscribeToPriceFeeds: () => oracleWebSocketService.subscribeToPriceFeeds(),
    subscribeToOraclesByOwner: (owner: string) => oracleWebSocketService.subscribeToOraclesByOwner(owner),
  };
};
