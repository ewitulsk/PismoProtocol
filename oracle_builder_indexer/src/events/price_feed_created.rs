use serde::{Deserialize, Serialize};
use sui_types::base_types::SuiAddress;
use crate::db::models::price_feed::NewPriceFeed;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PriceFeedCreatedEvent {
    pub price_feed_id: SuiAddress,
    pub oracle_id: SuiAddress,
    pub owner: SuiAddress,
    pub is_valid: bool,
    pub api_key: String,
    pub underlying_url: String,
    pub response_field: String,
    pub live_url: String,
}

impl PriceFeedCreatedEvent {
    pub fn print_event(&self) {
        println!("=== Price Feed Created Event ===");
        println!("Price Feed ID: {}", self.price_feed_id);
        println!("Oracle ID: {}", self.oracle_id);
        println!("Owner: {}", self.owner);
        println!("Is Valid: {}", self.is_valid);
        println!("API Key: {}", self.api_key);
        println!("Underlying URL: {}", self.underlying_url);
        println!("Response Field: {}", self.response_field);
        println!("Live URL: {}", self.live_url);
        println!("=================================");
    }
}

impl From<PriceFeedCreatedEvent> for NewPriceFeed {
    fn from(event: PriceFeedCreatedEvent) -> Self {
        NewPriceFeed {
            price_feed_id: event.price_feed_id.to_string(),
            oracle_id: event.oracle_id.to_string(),
            is_valid: event.is_valid,
            api_key: event.api_key,
            underlying_url: event.underlying_url,
            response_field: event.response_field,
            live_url: event.live_url,
        }
    }
} 