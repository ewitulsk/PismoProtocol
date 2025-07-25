use serde::{Deserialize, Serialize};
use sui_types::base_types::SuiAddress;
use crate::db::models::oracle::NewOracle;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OracleCreatedEvent {
    pub oracle_id: SuiAddress,
    pub owner: SuiAddress,
    pub is_valid: bool,
}

impl OracleCreatedEvent {
    pub fn print_event(&self) {
        println!("=== Oracle Created Event ===");
        println!("Oracle ID: {}", self.oracle_id);
        println!("Owner: {}", self.owner);
        println!("Is Valid: {}", self.is_valid);
        println!("=============================");
    }
}

impl From<OracleCreatedEvent> for NewOracle {
    fn from(event: OracleCreatedEvent) -> Self {
        NewOracle {
            oracle_id: event.oracle_id.to_string(),
            owner: event.owner.to_string(),
            is_valid: event.is_valid,
        }
    }
} 