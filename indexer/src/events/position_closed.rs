use serde::Deserialize;

use super::common::{PositionType, TransferTo}; // Import from common
use crate::db::models::close_position_events::NewClosePositionEvent;
use bigdecimal::{BigDecimal, FromPrimitive};
use chrono::{DateTime, Utc};
use anyhow::{Result, Context};
use hex;

/// Mirrors the pismo_protocol::positions::PositionClosedEvent struct
#[derive(Deserialize, Debug, Clone)]
pub struct PositionClosedEvent {
    pub position_id: [u8; 32],
    pub position_type: PositionType,
    pub amount: u64,
    pub leverage_multiplier: u16,
    pub entry_price: u64,
    pub entry_price_decimals: u8,
    pub close_price: u64,
    pub close_price_decimals: u8,
    pub price_delta: u64,
    pub transfer_amount: u64,
    pub transfer_to: TransferTo,
    pub account_id: [u8; 32],
}

impl PositionClosedEvent {
    /// Tries to map the Move event data to the corresponding database model.
    /// Includes transaction digest and checkpoint timestamp.
    pub fn try_map_to_db(
        &self,
        tx_digest: String,
        timestamp: DateTime<Utc>,
    ) -> Result<NewClosePositionEvent> {
        Ok(NewClosePositionEvent {
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
            close_price: BigDecimal::from_u64(self.close_price)
                .context("Failed to convert close_price to BigDecimal")?,
            close_price_decimals: self.close_price_decimals as i32,
            price_delta: BigDecimal::from_u64(self.price_delta)
                .context("Failed to convert price_delta to BigDecimal")?,
            transfer_amount: BigDecimal::from_u64(self.transfer_amount)
                .context("Failed to convert transfer_amount to BigDecimal")?,
            transfer_to: super::common::transfer_to_string(self.transfer_to),
            account_id: format!("0x{}", hex::encode(self.account_id)),
            timestamp,
        })
    }
} 