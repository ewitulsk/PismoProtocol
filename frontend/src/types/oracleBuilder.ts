import { SuiObjectRef } from '@mysten/sui/client';

// Core Oracle Builder Types matching Move contract structures

export interface Oracle {
  id: string; // Object ID
  owner: string; // Address
  is_valid: boolean;
}

export interface PriceFeed {
  id: string; // Object ID
  oracle_id: string; // Address
  is_valid: boolean;
  api_key: string;
  underlying_url: string;
  response_field: string;
  live_url: string;
}

// Event Types for listening to contract events

export interface OracleCreatedEvent {
  oracle_id: string;
  owner: string;
  is_valid: boolean;
}

export interface PriceFeedCreatedEvent {
  price_feed_id: string;
  oracle_id: string;
  owner: string;
  is_valid: boolean;
  api_key: string;
  underlying_url: string;
  response_field: string;
  live_url: string;
}

export interface OracleInvalidatedEvent {
  oracle_id: string;
  invalidated_by: string;
}

export interface PriceFeedInvalidatedEvent {
  price_feed_id: string;
  oracle_id: string;
  invalidated_by: string;
}

// Transaction Parameter Types

export interface CreateOracleParams {
  packageId: string;
}

export interface CreatePriceFeedParams {
  packageId: string;
  oracle: SuiObjectRef;
  api_key: string;
  underlying_url: string;
  response_field: string;
  live_url: string;
}

export interface InvalidateOracleParams {
  packageId: string;
  adminCap: SuiObjectRef;
  oracle: SuiObjectRef;
}

export interface InvalidatePriceFeedParams {
  packageId: string;
  adminCap: SuiObjectRef;
  priceFeed: SuiObjectRef;
}

// UI Form Types

export interface OracleFormData {
  name: string;
  description: string;
  priceFeeds: PriceFeedFormData[];
}

export interface PriceFeedFormData {
  id: string;
  name: string;
  feedId: string;
  api_key: string;
  underlying_url: string;
  response_field: string;
  live_url: string;
}

// Combined Oracle with UI metadata
export interface UIOracle extends Oracle {
  name?: string;
  description?: string;
  type?: string;
  status?: string;
  createdBy?: string;
  usageFee?: string;
  trustedBy?: string;
  priceFeeds: UIPriceFeed[];
}

export interface UIPriceFeed extends PriceFeed {
  name?: string;
  feedId?: string;
  isProtected?: boolean;
}

// Transaction Result Types

export interface OracleCreationResult {
  success: boolean;
  oracleId?: string;
  transactionHash?: string;
  error?: string;
}

export interface PriceFeedCreationResult {
  success: boolean;
  priceFeedId?: string;
  transactionHash?: string;
  error?: string;
}

// Configuration Types

export interface OracleBuilderConfig {
  packageId: string;
  adminCapId?: string;
}

// Query/Fetch Types

export interface FetchOraclesParams {
  owner?: string;
  limit?: number;
  cursor?: string;
}

export interface FetchPriceFeedsParams {
  oracleId?: string;
  owner?: string;
  limit?: number;
  cursor?: string;
}
