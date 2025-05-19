use crate::db::models::position_liquidated_event::NewPositionLiquidatedEvent;
use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use hex;

#[derive(Deserialize, Debug)]
pub struct PositionLiquidatedEvent {
    pub position_id: [u8; 32],
}

impl PositionLiquidatedEvent {
    pub fn try_map_to_db(
        &self,
        tx_digest: String,
        timestamp: DateTime<Utc>,
    ) -> Result<NewPositionLiquidatedEvent> {
        Ok(NewPositionLiquidatedEvent {
            transaction_hash: tx_digest,
            position_id: format!("0x{}", hex::encode(self.position_id)),
            timestamp,
        })
    }
} 