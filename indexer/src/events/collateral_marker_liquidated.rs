use crate::db::models::collateral_marker_liquidated_event::NewCollateralMarkerLiquidatedEvent;
use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use hex;
use uuid::Uuid;

#[derive(Deserialize, Debug)]
pub struct CollateralMarkerLiquidatedEvent {
    pub collateral_marker_id: [u8; 32],
    pub account_id: [u8; 32],
}

impl CollateralMarkerLiquidatedEvent {
    pub fn try_map_to_db(
        &self,
        tx_digest: String,
        timestamp: DateTime<Utc>,
    ) -> Result<NewCollateralMarkerLiquidatedEvent> {
        Ok(NewCollateralMarkerLiquidatedEvent {
            transaction_hash: tx_digest,
            collateral_marker_id: hex::encode(self.collateral_marker_id),
            account_id: hex::encode(self.account_id),
            timestamp,
        })
    }
}