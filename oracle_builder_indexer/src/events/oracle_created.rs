use serde::{Deserialize, Serialize};
use sui_types::base_types::SuiAddress;
use tracing::debug;
use crate::db::models::oracle::NewOracle;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OracleCreatedEvent {
    pub oracle_id: SuiAddress,
    pub owner: SuiAddress,
    pub name: String,
    pub description: String,
    pub is_valid: bool,
}

impl OracleCreatedEvent {
    pub fn debug_event(&self) {
        debug!("=== Oracle Created Event ===");
        debug!("Oracle ID: {}", self.oracle_id);
        debug!("Owner: {}", self.owner);
        debug!("Name: {}", self.name);
        debug!("Description: {}", self.description);
        debug!("Is Valid: {}", self.is_valid);
        debug!("=============================");
    }
}

impl From<OracleCreatedEvent> for NewOracle {
    fn from(event: OracleCreatedEvent) -> Self {
        NewOracle {
            oracle_id: event.oracle_id.to_string(),
            owner: event.owner.to_string(),
            name: event.name,
            description: event.description,
            is_valid: event.is_valid,
        }
    }
} 