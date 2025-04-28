use crate::db::models::collateral_deposit_event::NewCollateralDepositEvent;
use anyhow::{anyhow, Context, Result};
use bigdecimal::{BigDecimal, FromPrimitive};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use std::convert::TryInto;

// Define a struct matching Move's pismo_protocol::tokens::TokenIdentifier
#[derive(Deserialize, Debug, Clone)]
pub struct MoveTokenIdentifier {
    pub token_info: String,
    pub token_decimals: u8,
    pub price_feed_id_bytes: Vec<u8>,
    pub oracle_feed: u16,
    pub deprecated: bool,
}

// Define a struct matching Move's pismo_protocol::collateral::CollateralDepositEvent
#[derive(Deserialize, Debug, Clone)]
pub struct CollateralDepositEvent {
    pub collateral_id: [u8; 32],
    pub collateral_marker_id: [u8; 32],
    pub account_id: [u8; 32],
    pub token_id: MoveTokenIdentifier, // Use the correct nested struct
    pub amount: u64
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

        Ok(NewCollateralDepositEvent {
            transaction_hash: tx_digest,
            collateral_id: hex::encode(self.collateral_id),
            collateral_marker_id: hex::encode(self.collateral_marker_id),
            account_id: hex::encode(self.account_id),
            token_address: self.token_id.token_info.clone(), 
            amount: amount_bd,
            timestamp
        })
    }
}