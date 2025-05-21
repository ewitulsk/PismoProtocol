use diesel::prelude::*;
// Removed BigDecimal import as it's unused
use chrono::{DateTime, Utc};
use serde::Serialize;
// Import the schema. Ensure schema.rs is generated and includes vault_created_events
use crate::db::postgres::schema::vault_created_events;

#[derive(Queryable, Insertable, Identifiable, AsChangeset, Debug, Clone, Serialize)]
#[diesel(table_name = vault_created_events)] // This now refers to the schema import
#[diesel(primary_key(id))]
pub struct VaultCreatedEvent {
    pub id: i32,
    pub transaction_hash: String,
    pub vault_address: String,
    pub vault_marker_address: String,
    pub coin_token_info: String,
    pub lp_token_info: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = vault_created_events)] // This now refers to the schema import
pub struct NewVaultCreatedEvent {
    pub transaction_hash: String,
    pub vault_address: String,
    pub vault_marker_address: String,
    pub coin_token_info: String,
    pub lp_token_info: String,
    pub timestamp: DateTime<Utc>,
}

// Removed manual diesel::table! definition