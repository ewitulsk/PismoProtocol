use serde::{Deserialize, Serialize};
use sui_types::base_types::SuiAddress;
use tracing::debug;
use crate::db::models::price_feed::NewPriceFeed;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PriceFeedCreatedEvent {
    pub price_feed_id: SuiAddress,
    pub oracle_id: SuiAddress,
    pub owner: SuiAddress,
    pub is_valid: bool,
    pub api_key: Option<String>,
    pub api_key_config: Option<String>,
    pub underlying_url: String,
    pub response_field: String,
    pub live_url: String,
}

impl PriceFeedCreatedEvent {
    pub fn debug_event(&self) {
        debug!("=== Price Feed Created Event ===");
        debug!("Price Feed ID: {}", self.price_feed_id);
        debug!("Oracle ID: {}", self.oracle_id);
        debug!("Owner: {}", self.owner);
        debug!("Is Valid: {}", self.is_valid);
        debug!("API Key: {:?}", self.api_key);
        debug!("API Key Config: {:?}", self.api_key_config);
        debug!("Underlying URL: {}", self.underlying_url);
        debug!("Response Field: {}", self.response_field);
        debug!("Live URL: {}", self.live_url);
        debug!("=================================");
    }
}

impl From<PriceFeedCreatedEvent> for NewPriceFeed {
    fn from(event: PriceFeedCreatedEvent) -> Self {
        NewPriceFeed {
            price_feed_id: event.price_feed_id.to_string(),
            oracle_id: event.oracle_id.to_string(),
            is_valid: event.is_valid,
            api_key: event.api_key,
            api_key_config: event.api_key_config,
            underlying_url: event.underlying_url,
            response_field: event.response_field,
            live_url: event.live_url,
        }
    }
} 