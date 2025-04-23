use serde::Deserialize;

use super::common::PositionType; // Import from common
use crate::db::models::open_position_events::NewOpenPositionEvent;
use bigdecimal::{BigDecimal, FromPrimitive};
use chrono::{DateTime, Utc};
use anyhow::{Result, Context};
use hex;

/// Mirrors the pismo_protocol::positions::PositionCreatedEvent struct
#[derive(Deserialize, Debug, Clone)]
pub struct PositionCreatedEvent {
    pub position_id: [u8; 32],
    pub position_type: PositionType,
    pub amount: u64,
    pub leverage_multiplier: u16,
    pub entry_price: u64,
    pub entry_price_decimals: u8,
    pub supported_positions_token_i: u64,
    pub price_feed_id_bytes: Vec<u8>,
    pub account_id: [u8; 32],
}

impl PositionCreatedEvent {
    /// Tries to map the Move event data to the corresponding database model.
    /// Includes transaction digest and checkpoint timestamp.
    pub fn try_map_to_db(
        &self,
        tx_digest: String,
        timestamp: DateTime<Utc>,
    ) -> Result<NewOpenPositionEvent> {
        Ok(NewOpenPositionEvent {
            transaction_hash: tx_digest,
            position_id: format!("0x{}", hex::encode(self.position_id)),
            position_type: super::common::position_type_to_string(self.position_type),
            amount: BigDecimal::from_u64(self.amount)
                .context("Failed to convert amount to BigDecimal")?,
            leverage_multiplier: BigDecimal::from_u16(self.leverage_multiplier)
                .context("Failed to convert leverage_multiplier to BigDecimal")?,
            entry_price: BigDecimal::from_u64(self.entry_price)
                .context("Failed to convert entry_price to BigDecimal")?,
            entry_price_decimals: self.entry_price_decimals as i32,
            supported_positions_token_i: self.supported_positions_token_i as i32,
            price_feed_id_bytes: hex::encode(&self.price_feed_id_bytes),
            account_id: format!("0x{}", hex::encode(self.account_id)),
            timestamp,
        })
    }
} 