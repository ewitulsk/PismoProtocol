use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use anyhow::Result;
use bigdecimal::BigDecimal;
use sui_types::base_types::SuiAddress;
use hex;

use crate::db::models::vault_transfer::NewVaultTransfer;
use crate::events::common::convert_sui_address_to_hex_string;

#[derive(Deserialize, Serialize, Debug)]
pub struct VaultTransferCreatedEvent {
    pub transfer_id: SuiAddress,        // Corresponds to object::uid_to_address(&transfer.id)
    pub vault_marker_id: SuiAddress,    // Corresponds to object::uid_to_address(&marker.id)
    pub vault_address: SuiAddress,      // Corresponds to marker.vault_id
    pub amount: u64,
    pub to_user_address: SuiAddress,
}

impl VaultTransferCreatedEvent {
    pub fn try_map_to_db(&self, tx_digest: String, timestamp: DateTime<Utc>) -> Result<NewVaultTransfer> {
        Ok(NewVaultTransfer {
            transaction_hash: tx_digest,
            transfer_id: convert_sui_address_to_hex_string(self.transfer_id)?,
            vault_marker_id: convert_sui_address_to_hex_string(self.vault_marker_id)?,
            vault_address: convert_sui_address_to_hex_string(self.vault_address)?,
            amount: BigDecimal::from(self.amount),
            to_user_address: convert_sui_address_to_hex_string(self.to_user_address)?,
            fulfilled: false,
            timestamp,
        })
    }
} 