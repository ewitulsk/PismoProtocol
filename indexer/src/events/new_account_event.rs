use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::db::models::new_account_event::NewNewAccountEvent;

#[derive(Deserialize, Debug, Clone)]
pub struct NewAccountEvent {
    pub account_id: [u8; 32],
    pub stats_id: [u8; 32],
}

impl NewAccountEvent {
    pub fn try_map_to_db(
        &self,
        tx_digest: String,
        timestamp: DateTime<Utc>,
    ) -> Result<NewNewAccountEvent> {
        Ok(NewNewAccountEvent {
            transaction_hash: tx_digest,
            account_id: hex::encode(self.account_id),
            stats_id: hex::encode(self.stats_id),
            timestamp,
        })
    }
}
