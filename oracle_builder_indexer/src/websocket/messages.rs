use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use crate::db::models::{oracle::Oracle, price_feed::PriceFeed};

/// WebSocket message types that clients can send to the server
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub enum OracleBuilderMessage {
    /// Subscribe to oracle updates
    #[serde(rename = "subscribe_oracles")]
    SubscribeOracles,
    
    /// Subscribe to price feed updates
    #[serde(rename = "subscribe_price_feeds")]
    SubscribePriceFeeds,
    
    /// Subscribe to oracle updates for a specific owner
    #[serde(rename = "subscribe_oracles_by_owner")]
    SubscribeOraclesByOwner { owner_id: String },
    
    /// Subscribe to price feed updates for a specific oracle
    #[serde(rename = "subscribe_price_feeds_by_oracle")]
    SubscribePriceFeedsByOracle { oracle_id: String },
    
    /// Unsubscribe from oracle updates
    #[serde(rename = "unsubscribe_oracles")]
    UnsubscribeOracles,
    
    /// Unsubscribe from price feed updates
    #[serde(rename = "unsubscribe_price_feeds")]
    UnsubscribePriceFeeds,
    
    /// Unsubscribe from oracle updates for a specific owner
    #[serde(rename = "unsubscribe_oracles_by_owner")]
    UnsubscribeOraclesByOwner { owner_id: String },
    
    /// Unsubscribe from price feed updates for a specific oracle
    #[serde(rename = "unsubscribe_price_feeds_by_oracle")]
    UnsubscribePriceFeedsByOracle { oracle_id: String },
}

/// WebSocket response types that the server sends to clients
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum OracleBuilderResponse {
    /// Confirmation of subscription
    #[serde(rename = "subscription_confirmed")]
    SubscriptionConfirmed { 
        subscription_type: String,
        message: String,
    },
    
    /// New oracle created
    #[serde(rename = "oracle_created")]
    OracleCreated { 
        oracle: Oracle,
        timestamp: DateTime<Utc>,
    },
    
    /// Oracle invalidated/updated
    #[serde(rename = "oracle_invalidated")]
    OracleInvalidated {
        oracle_id: String,
        timestamp: DateTime<Utc>,
    },
    
    /// New price feed created
    #[serde(rename = "price_feed_created")]
    PriceFeedCreated {
        price_feed: PriceFeed,
        timestamp: DateTime<Utc>,
    },
    
    /// Price feed invalidated/updated
    #[serde(rename = "price_feed_invalidated")]
    PriceFeedInvalidated {
        price_feed_id: String,
        oracle_id: String,
        timestamp: DateTime<Utc>,
    },
    
    /// Error response
    #[serde(rename = "error")]
    Error {
        message: String,
        code: String,
    },
}

/// Internal message types for communication between the indexer worker and WebSocket server
#[derive(Debug, Clone)]
pub enum InternalBroadcastMessage {
    OracleCreated(Oracle),
    OracleInvalidated(String), // oracle_id
    PriceFeedCreated(PriceFeed),
    PriceFeedInvalidated { price_feed_id: String, oracle_id: String },
}

/// Client subscription types
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum SubscriptionType {
    AllOracles,
    AllPriceFeeds,
    OraclesByOwner(String),
    PriceFeedsByOracle(String),
}
