import { OracleBuilderConfig } from '@/types/oracleBuilder';

// Oracle Builder Configuration
export const ORACLE_BUILDER_CONFIG: OracleBuilderConfig = {
  packageId: process.env.NEXT_PUBLIC_ORACLE_BUILDER_PACKAGE_ID || '',
};

// Contract Module and Function Names
export const ORACLE_BUILDER_MODULE = 'oracle_builder';

export const ORACLE_BUILDER_FUNCTIONS = {
  NEW_ORACLE: 'new_oracle',
  NEW_PRICE_FEED: 'new_price_feed',
  INVALIDATE_ORACLE: 'invalidate_oracle',
  INVALIDATE_PRICE_FEED: 'invalidate_price_feed',
  GET_ORACLE_OWNER: 'get_oracle_owner',
  GET_ORACLE_VALIDITY: 'get_oracle_validity',
  GET_PRICE_FEED_ORACLE_ID: 'get_price_feed_oracle_id',
  GET_PRICE_FEED_VALIDITY: 'get_price_feed_validity',
} as const;

// Event Types
export const ORACLE_BUILDER_EVENTS = {
  ORACLE_CREATED: 'OracleCreated',
  PRICE_FEED_CREATED: 'PriceFeedCreated',
  ORACLE_INVALIDATED: 'OracleInvalidated',
  PRICE_FEED_INVALIDATED: 'PriceFeedInvalidated',
} as const;

// Oracle Builder Object Types
export const ORACLE_BUILDER_TYPES = {
  ADMIN_CAP: `${ORACLE_BUILDER_CONFIG.packageId}::${ORACLE_BUILDER_MODULE}::AdminCap`,
  ORACLE: `${ORACLE_BUILDER_CONFIG.packageId}::${ORACLE_BUILDER_MODULE}::Oracle`,
  PRICE_FEED: `${ORACLE_BUILDER_CONFIG.packageId}::${ORACLE_BUILDER_MODULE}::PriceFeed`,
} as const;

// Validation Constants
export const VALIDATION_LIMITS = {
  ORACLE_NAME_MAX_LENGTH: 100,
  ORACLE_DESCRIPTION_MAX_LENGTH: 500,
  API_KEY_MAX_LENGTH: 200,
  URL_MAX_LENGTH: 500,
  RESPONSE_FIELD_MAX_LENGTH: 100,
  MAX_PRICE_FEEDS_PER_ORACLE: 10,
} as const;

// Default Values
export const DEFAULT_VALUES = {
  ORACLE_NAME: '',
  ORACLE_DESCRIPTION: '',
  API_KEY: '',
  UNDERLYING_URL: 'https://api.example.com/price',
  RESPONSE_FIELD: 'price',
  LIVE_URL: 'https://oracle.example.com/feed',
} as const;

// URL Patterns for validation
export const URL_PATTERNS = {
  HTTP_HTTPS: /^https?:\/\/.+/,
  API_ENDPOINT: /^https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/,
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  INVALID_URL: 'Please enter a valid HTTP/HTTPS URL',
  MISSING_API_KEY: 'API key is required',
  MISSING_RESPONSE_FIELD: 'Response field is required',
  ORACLE_NAME_TOO_LONG: `Oracle name must be less than ${VALIDATION_LIMITS.ORACLE_NAME_MAX_LENGTH} characters`,
  DESCRIPTION_TOO_LONG: `Description must be less than ${VALIDATION_LIMITS.ORACLE_DESCRIPTION_MAX_LENGTH} characters`,
  MAX_PRICE_FEEDS_EXCEEDED: `Cannot add more than ${VALIDATION_LIMITS.MAX_PRICE_FEEDS_PER_ORACLE} price feeds`,
  WALLET_NOT_CONNECTED: 'Please connect your wallet first',
  INSUFFICIENT_GAS: 'Insufficient gas to complete transaction',
  TRANSACTION_FAILED: 'Transaction failed. Please try again.',
  ORACLE_NOT_FOUND: 'Oracle not found',
  PRICE_FEED_NOT_FOUND: 'Price feed not found',
  UNAUTHORIZED: 'You are not authorized to perform this action',
} as const;
