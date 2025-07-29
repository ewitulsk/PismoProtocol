import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_ORACLE_INDEXER_API_URL || 'http://localhost:3001/v0';

// Create axios instance with common configuration
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor for consistent error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Oracle Builder API Error:', error);
    return Promise.reject(error);
  }
);

// API response types from indexer
export interface IndexerOracle {
  oracle_id: string;
  owner: string;
  is_valid: boolean;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface IndexerPriceFeed {
  price_feed_id: string;
  oracle_id: string;
  is_valid: boolean;
  name: string;
  description: string;
  api_key: string;
  underlying_url: string;
  response_field: string;
  live_url: string;
  created_at: string;
  updated_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Oracle Builder API service
export const oracleBuilderApi = {
  // Oracle endpoints
  fetchOracles: async (ownerId?: string): Promise<ApiResponse<IndexerOracle[]>> => {
    const params = ownerId ? { owner_id: ownerId } : {};
    
    try {
      const response = await apiClient.get('/oracles', { params });
      return response.data;
    } catch (error) {
      console.error("oracleBuilderApi.fetchOracles - Error:", error);
      throw error;
    }
  },

  fetchOracleById: async (id: string): Promise<ApiResponse<IndexerOracle>> => {
    const response = await apiClient.get(`/oracles/${id}`);
    return response.data;
  },

  // Price feed endpoints
  fetchPriceFeeds: async (): Promise<ApiResponse<IndexerPriceFeed[]>> => {
    try {
      const response = await apiClient.get('/price-feeds');
      return response.data;
    } catch (error) {
      console.error("oracleBuilderApi.fetchPriceFeeds - Error:", error);
      throw error;
    }
  },

  fetchPriceFeedById: async (id: string): Promise<ApiResponse<IndexerPriceFeed>> => {
    const response = await apiClient.get(`/price-feeds/${id}`);
    return response.data;
  },

  // Helper method to get price feeds for a specific oracle
  fetchPriceFeedsByOracleId: async (oracleId: string): Promise<IndexerPriceFeed[]> => {
    const response = await apiClient.get('/price-feeds');
    if (response.data.success && response.data.data) {
      return response.data.data.filter((feed: IndexerPriceFeed) => feed.oracle_id === oracleId);
    }
    return [];
  },
};

export default oracleBuilderApi;
