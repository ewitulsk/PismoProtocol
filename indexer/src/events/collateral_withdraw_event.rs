use crate::db::models::collateral_withdraw_event::NewCollateralWithdrawEvent;
use anyhow::{Context, Result};
use bigdecimal::{BigDecimal, FromPrimitive};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use crate::events::collateral_deposit_event::MoveTokenIdentifier; // Reusing this
use uuid::Uuid;

#[derive(Deserialize, Debug, Clone)]
pub struct CollateralWithdrawEvent {
    pub collateral_id: [u8; 32],
    pub collateral_marker_id: [u8; 32],
    pub account_id: [u8; 32],
    pub token_id: MoveTokenIdentifier,
    pub withdrawn_amount: u64,
    pub marker_destroyed: bool,
    pub remaining_amount_in_marker: u64,
}

impl CollateralWithdrawEvent {
    pub fn try_map_to_db(
        &self,
        tx_digest: String,
        timestamp: DateTime<Utc>,
    ) -> Result<NewCollateralWithdrawEvent> {
        let withdrawn_amount_bd = BigDecimal::from_u64(self.withdrawn_amount)
            .context("Failed to convert withdrawn_amount u64 to BigDecimal")?;
        let remaining_amount_in_marker_bd = BigDecimal::from_u64(self.remaining_amount_in_marker)
            .context("Failed to convert remaining_amount_in_marker u64 to BigDecimal")?;

        Ok(NewCollateralWithdrawEvent {
            transaction_hash: tx_digest,
            collateral_id: hex::encode(self.collateral_id),
            collateral_marker_id: hex::encode(self.collateral_marker_id),
            account_id: hex::encode(self.account_id),
            token_address: self.token_id.token_info.clone(),
            withdrawn_amount: withdrawn_amount_bd,
            marker_destroyed: self.marker_destroyed,
            remaining_amount_in_marker: remaining_amount_in_marker_bd,
            timestamp,
        })
    }
} 