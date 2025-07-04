use serde::Deserialize;
use crate::db::models::vault_created_events::NewVaultCreatedEvent;
use chrono::{DateTime, Utc};
use anyhow::Result; // Keep Context for potential future use
use hex;

/// Mirrors the pismo_protocol::vaults::VaultCreatedEvent struct (assuming module name 'vaults')
/// Note: Move 'address' type is assumed to be [u8; 32]
#[derive(Deserialize, Debug, Clone)]
pub struct VaultCreatedEvent {
    pub vault_address: [u8; 32],
    pub vault_marker_address: [u8; 32],
    pub coin_token_info: String,
    pub lp_token_info: String,
}

impl VaultCreatedEvent {
    /// Tries to map the Move event data to the corresponding database model.
    /// Includes transaction digest and checkpoint timestamp.
    pub fn try_map_to_db(
        &self,
        tx_digest: String,
        timestamp: DateTime<Utc>,
    ) -> Result<NewVaultCreatedEvent> {
        Ok(NewVaultCreatedEvent {
            transaction_hash: tx_digest,
            vault_address: format!("0x{}", hex::encode(self.vault_address)),
            vault_marker_address: format!("0x{}", hex::encode(self.vault_marker_address)),
            coin_token_info: self.coin_token_info.clone(), // Clone String
            lp_token_info: self.lp_token_info.clone(),     // Clone String
            timestamp,
        })
    }
} 