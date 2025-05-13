use serde::Deserialize;
use anyhow::Result;
use sui_types::base_types::SuiAddress;
use hex;

/// Mirrors the pismo_protocol::positions::PositionType enum
#[derive(Deserialize, Debug, Clone, Copy)]
pub enum PositionType {
    Long,
    Short,
}

/// Mirrors the pismo_protocol::positions::TransferTo enum
#[derive(Deserialize, Debug, Clone, Copy)]
pub enum TransferTo {
    Vault,
    User,
}

// Helper functions for string conversion (used by mapping functions)
pub(super) fn position_type_to_string(pt: PositionType) -> String {
    match pt {
        PositionType::Long => "Long".to_string(),
        PositionType::Short => "Short".to_string(),
    }
}

pub(super) fn transfer_to_string(tt: TransferTo) -> String {
    match tt {
        TransferTo::Vault => "Vault".to_string(),
        TransferTo::User => "User".to_string(),
    }
}

pub fn convert_sui_address_to_hex_string(address: SuiAddress) -> Result<String> {
    Ok(format!("0x{}", hex::encode(address)))
} 