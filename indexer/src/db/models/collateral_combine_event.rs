use crate::db::postgres::schema::collateral_combine_events;
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use diesel::prelude::*;

#[derive(Queryable, Selectable, Identifiable, Debug, PartialEq, Clone)]
#[diesel(table_name = collateral_combine_events)]
#[diesel(primary_key(id))]
pub struct CollateralCombineEvent {
    pub id: i32, //I want this to be a UUID, but I don't have the time to fight diesel to make that happen
    pub transaction_hash: String,
    pub old_collateral_id1: String,
    pub old_collateral_marker_id1: String,
    pub old_collateral_id2: String,
    pub old_collateral_marker_id2: String,
    pub new_collateral_id: String,
    pub new_collateral_marker_id: String,
    pub account_id: String,
    pub token_address: String,
    pub combined_amount: BigDecimal,
    pub timestamp: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = collateral_combine_events)]
pub struct NewCollateralCombineEvent {
    pub transaction_hash: String,
    pub old_collateral_id1: String,
    pub old_collateral_marker_id1: String,
    pub old_collateral_id2: String,
    pub old_collateral_marker_id2: String,
    pub new_collateral_id: String,
    pub new_collateral_marker_id: String,
    pub account_id: String,
    pub token_address: String,
    pub combined_amount: BigDecimal,
    pub timestamp: DateTime<Utc>,
} 