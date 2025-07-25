use serde::{Deserialize, Serialize};
use sui_types::base_types::SuiAddress;
use tracing::debug;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OracleInvalidatedEvent {
    pub oracle_id: SuiAddress,
    pub invalidated_by: SuiAddress,
}

impl OracleInvalidatedEvent {
    pub fn debug_event(&self) {
        debug!("=== Oracle Invalidated Event ===");
        debug!("Oracle ID: {}", self.oracle_id);
        debug!("Invalidated By: {}", self.invalidated_by);
        debug!("=================================");
    }
} 