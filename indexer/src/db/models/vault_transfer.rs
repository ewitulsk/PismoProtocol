use diesel::{Queryable, Insertable, Identifiable, Selectable};
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use crate::db::postgres::schema::vault_transfers;

#[derive(Queryable, Identifiable, Selectable, Debug, PartialEq, Clone, Serialize, Deserialize)]
#[diesel(table_name = vault_transfers)]
#[diesel(primary_key(transfer_id))]
pub struct VaultTransfer {
    pub transaction_hash: String,
    pub transfer_id: String,
    pub vault_marker_id: String,
    pub vault_address: String,
    pub amount: BigDecimal,
    pub to_user_address: String,
    pub fulfilled: bool,
    pub timestamp: DateTime<Utc>
}

#[derive(Insertable, Debug, Clone, Serialize, Deserialize)]
#[diesel(table_name = vault_transfers)]
pub struct NewVaultTransfer {
    pub transaction_hash: String,
    pub transfer_id: String,
    pub vault_marker_id: String,
    pub vault_address: String,
    pub amount: BigDecimal,
    pub to_user_address: String,
    pub fulfilled: bool, 
    pub timestamp: DateTime<Utc>
} 