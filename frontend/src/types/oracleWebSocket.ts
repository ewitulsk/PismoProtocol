// WebSocket message types for Oracle Builder indexer
import { IndexerOracle, IndexerPriceFeed } from '@/services/oracleBuilderApi';

// Server to Client Messages
export interface SubscriptionConfirmedMessage {
  type: 'subscription_confirmed';
  subscription_type: string;
  message: string;
}

export interface OracleCreatedMessage {
  type: 'oracle_created';
  oracle: IndexerOracle;
  timestamp: string;
}

export interface OracleInvalidatedMessage {
  type: 'oracle_invalidated';
  oracle_id: string;
  timestamp: string;
}

export interface PriceFeedCreatedMessage {
  type: 'price_feed_created';
  price_feed: IndexerPriceFeed;
  timestamp: string;
}

export interface PriceFeedInvalidatedMessage {
  type: 'price_feed_invalidated';
  price_feed_id: string;
  oracle_id: string;
  timestamp: string;
}

export interface WebSocketErrorMessage {
  type: 'error';
  message: string;
  code?: string;
}

export type ServerMessage = 
  | SubscriptionConfirmedMessage
  | OracleCreatedMessage
  | OracleInvalidatedMessage
  | PriceFeedCreatedMessage
  | PriceFeedInvalidatedMessage
  | WebSocketErrorMessage;

// Connection state
export interface WebSocketConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}
