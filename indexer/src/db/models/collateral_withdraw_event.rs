use crate::db::postgres::schema::collateral_withdraw_events;
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use diesel::prelude::*;

#[derive(Queryable, Selectable, Identifiable, Debug, PartialEq, Clone)]
#[diesel(table_name = collateral_withdraw_events)]
#[diesel(primary_key(id))]
pub struct CollateralWithdrawEvent {
    pub id: i32, //I want this to be a UUID, but I don't have the time to fight diesel to make that happen
    pub transaction_hash: String,
    pub collateral_id: String,
    pub collateral_marker_id: String,
    pub account_id: String,
    pub token_address: String,
    pub withdrawn_amount: BigDecimal,
    pub marker_destroyed: bool,
    pub remaining_amount_in_marker: BigDecimal,
    pub timestamp: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = collateral_withdraw_events)]
pub struct NewCollateralWithdrawEvent {
    pub transaction_hash: String,
    pub collateral_id: String,
    pub collateral_marker_id: String,
    pub account_id: String,
    pub token_address: String,
    pub withdrawn_amount: BigDecimal,
    pub marker_destroyed: bool,
    pub remaining_amount_in_marker: BigDecimal,
    pub timestamp: DateTime<Utc>,
} 