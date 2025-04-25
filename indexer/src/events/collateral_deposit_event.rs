use crate::db::models::collateral_deposit_event::NewCollateralDepositEvent;
use anyhow::{Context, Result};
use bigdecimal::{BigDecimal, FromPrimitive};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use std::convert::TryInto;

// Define a struct for Move's TokenIdentifier for deserialization purposes
// Assuming it has these fields based on common patterns.
// Adjust if the actual Move struct is different.
#[derive(Deserialize, Debug, Clone)]
pub struct TokenIdentifier {
    pub account_address: [u8; 32],
    pub creation_num: u64,
}

#[derive(Deserialize, Debug, Clone)]
pub struct CollateralDepositEvent {
    pub collateral_id: [u8; 32],
    pub collateral_marker_id: [u8; 32],
    pub account_id: [u8; 32],
    pub token_id: TokenIdentifier,
    pub amount: u64,
}

impl CollateralDepositEvent {
    // Helper struct to manage string/BigDecimal lifetimes when inserting
    pub fn try_map_to_db(
        &self,
        tx_digest: String,
        timestamp: DateTime<Utc>,
    ) -> Result<NewCollateralDepositEvent> {
        let amount_bd = BigDecimal::from_u64(self.amount)
            .context("Failed to convert amount u64 to BigDecimal")?;
        let token_creation_num_i64 = self.token_id.creation_num.try_into()
            .context("Failed to convert token_id.creation_num u64 to i64")?;

        Ok(NewCollateralDepositEvent {
            transaction_hash: tx_digest,
            collateral_id: hex::encode(self.collateral_id),
            collateral_marker_id: hex::encode(self.collateral_marker_id),
            account_id: hex::encode(self.account_id),
            token_account_address: hex::encode(self.token_id.account_address),
            token_creation_num: token_creation_num_i64,
            amount: amount_bd, // Use BigDecimal amount
            timestamp,
        })
    }
}