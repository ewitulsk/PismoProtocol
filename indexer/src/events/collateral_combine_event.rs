use crate::db::models::collateral_combine_event::NewCollateralCombineEvent;
use anyhow::{Context, Result};
use bigdecimal::{BigDecimal, FromPrimitive};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use crate::events::collateral_deposit_event::MoveTokenIdentifier;
use uuid::Uuid;

#[derive(Deserialize, Debug, Clone)]
pub struct CollateralCombineEvent {
    pub old_collateral_id1: [u8; 32],
    pub old_collateral_marker_id1: [u8; 32],
    pub old_collateral_id2: [u8; 32],
    pub old_collateral_marker_id2: [u8; 32],
    pub new_collateral_id: [u8; 32],
    pub new_collateral_marker_id: [u8; 32],
    pub account_id: [u8; 32],
    pub token_id: MoveTokenIdentifier,
    pub combined_amount: u64,
}

impl CollateralCombineEvent {
    pub fn try_map_to_db(
        &self,
        tx_digest: String,
        timestamp: DateTime<Utc>,
    ) -> Result<NewCollateralCombineEvent> {
        let combined_amount_bd = BigDecimal::from_u64(self.combined_amount)
            .context("Failed to convert combined_amount u64 to BigDecimal")?;

        Ok(NewCollateralCombineEvent {
            transaction_hash: tx_digest,
            old_collateral_id1: hex::encode(self.old_collateral_id1),
            old_collateral_marker_id1: hex::encode(self.old_collateral_marker_id1),
            old_collateral_id2: hex::encode(self.old_collateral_id2),
            old_collateral_marker_id2: hex::encode(self.old_collateral_marker_id2),
            new_collateral_id: hex::encode(self.new_collateral_id),
            new_collateral_marker_id: hex::encode(self.new_collateral_marker_id),
            account_id: hex::encode(self.account_id),
            token_address: self.token_id.token_info.clone(),
            combined_amount: combined_amount_bd,
            timestamp,
        })
    }
} 