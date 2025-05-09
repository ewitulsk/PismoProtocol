use crate::db::postgres::schema::collateral_deposit_events;
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use diesel::prelude::*;

#[derive(Queryable, Selectable, Identifiable, Debug, PartialEq, Clone)]
#[diesel(table_name = collateral_deposit_events)]
#[diesel(primary_key(transaction_hash))]
pub struct CollateralDepositEvent {
    pub transaction_hash: String,
    pub collateral_id: String,
    pub collateral_marker_id: String,
    pub account_id: String,
    pub token_address: String,
    pub amount: BigDecimal,
    pub timestamp: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = collateral_deposit_events)]
pub struct NewCollateralDepositEvent {
    pub transaction_hash: String,
    pub collateral_id: String,
    pub collateral_marker_id: String,
    pub account_id: String,
    pub token_address: String,
    pub amount: BigDecimal,      
    pub timestamp: DateTime<Utc>,
} 