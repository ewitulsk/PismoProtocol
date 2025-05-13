use diesel::{Queryable, Insertable, Identifiable, Selectable};
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use crate::db::postgres::schema::collateral_transfers;

#[derive(Queryable, Identifiable, Selectable, Debug, PartialEq, Clone, Serialize, Deserialize)]
#[diesel(table_name = collateral_transfers)]
#[diesel(primary_key(transfer_id))]
pub struct CollateralTransfer {
    pub transaction_hash: String,
    pub transfer_id: String,
    pub collateral_marker_id: String,
    pub collateral_address: String,
    pub amount: BigDecimal,
    pub to_vault_address: String,
    pub fulfilled: bool,
    pub timestamp: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone, Serialize, Deserialize)]
#[diesel(table_name = collateral_transfers)]
pub struct NewCollateralTransfer {
    pub transaction_hash: String,
    pub transfer_id: String,
    pub collateral_marker_id: String,
    pub collateral_address: String,
    pub amount: BigDecimal,
    pub to_vault_address: String,
    pub fulfilled: bool,
    pub timestamp: DateTime<Utc>,
} 