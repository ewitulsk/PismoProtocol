use serde::{Deserialize, Serialize};
use sui_types::base_types::SuiAddress;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OracleInvalidatedEvent {
    pub oracle_id: SuiAddress,
    pub invalidated_by: SuiAddress,
}

impl OracleInvalidatedEvent {
    pub fn print_event(&self) {
        println!("=== Oracle Invalidated Event ===");
        println!("Oracle ID: {}", self.oracle_id);
        println!("Invalidated By: {}", self.invalidated_by);
        println!("=================================");
    }
} 