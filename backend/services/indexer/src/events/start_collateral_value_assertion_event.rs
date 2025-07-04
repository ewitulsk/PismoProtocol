use crate::db::models::start_collateral_value_assertion_event::NewStartCollateralValueAssertionEvent;
use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Deserialize;

// Define a struct matching Move's pismo_protocol::collateral::StartCollateralValueAssertionEvent
#[derive(Deserialize, Debug, Clone)]
pub struct StartCollateralValueAssertionEvent {
    pub cva_id: [u8; 32],
    pub account_id: [u8; 32],
    pub program_id: [u8; 32],
    pub num_open_collateral_objects: u64,
}

impl StartCollateralValueAssertionEvent {
    pub fn try_map_to_db(
        &self,
        tx_digest: String,
        timestamp: DateTime<Utc>,
    ) -> Result<NewStartCollateralValueAssertionEvent> {
        Ok(NewStartCollateralValueAssertionEvent {
            cva_id: hex::encode(self.cva_id),
            transaction_hash: tx_digest,
            account_id: hex::encode(self.account_id),
            program_id: hex::encode(self.program_id),
            num_open_collateral_objects: self.num_open_collateral_objects as i64, // Cast u64 to i64 for DB
            timestamp,
        })
    }
} 