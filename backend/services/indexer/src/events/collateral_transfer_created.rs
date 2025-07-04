use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use anyhow::Result;
use bigdecimal::BigDecimal;
use sui_types::base_types::SuiAddress;
use hex;
use uuid::Uuid;

use crate::db::models::collateral_transfer::NewCollateralTransfer;
use crate::events::common::convert_sui_address_to_hex_string;

#[derive(Deserialize, Serialize, Debug)]
pub struct CollateralTransferCreatedEvent {
    pub transfer_id: SuiAddress, // Corresponds to object::uid_to_address(&transfer.id)
    pub collateral_marker_id: SuiAddress, // Corresponds to object::uid_to_address(&marker.id)
    pub collateral_address: SuiAddress, // Corresponds to marker.collateral_id
    pub amount: u64,
    pub to_vault_address: SuiAddress,
}

impl CollateralTransferCreatedEvent {
    pub fn try_map_to_db(&self, tx_digest: String, timestamp: DateTime<Utc>) -> Result<NewCollateralTransfer> {
        Ok(NewCollateralTransfer {
            transaction_hash: tx_digest,
            transfer_id: convert_sui_address_to_hex_string(self.transfer_id)?,
            collateral_marker_id: convert_sui_address_to_hex_string(self.collateral_marker_id)?,
            collateral_address: convert_sui_address_to_hex_string(self.collateral_address)?,
            amount: BigDecimal::from(self.amount),
            to_vault_address: convert_sui_address_to_hex_string(self.to_vault_address)?,
            fulfilled: false,
            timestamp: timestamp.try_into()?
        })
    }
} 