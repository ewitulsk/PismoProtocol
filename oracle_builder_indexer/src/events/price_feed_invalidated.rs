use serde::{Deserialize, Serialize};
use sui_types::base_types::SuiAddress;
use tracing::debug;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PriceFeedInvalidatedEvent {
    pub price_feed_id: SuiAddress,
    pub oracle_id: SuiAddress,
    pub invalidated_by: SuiAddress,
}

impl PriceFeedInvalidatedEvent {
    pub fn debug_event(&self) {
        debug!("=== Price Feed Invalidated Event ===");
        debug!("Price Feed ID: {}", self.price_feed_id);
        debug!("Oracle ID: {}", self.oracle_id);
        debug!("Invalidated By: {}", self.invalidated_by);
        debug!("=====================================");
    }
} 