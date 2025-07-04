use crate::db::postgres::schema::start_collateral_value_assertion_events;
use chrono::{DateTime, Utc};
use diesel::prelude::*;

#[derive(Queryable, Selectable, Identifiable, Debug, PartialEq, Clone)]
#[diesel(table_name = start_collateral_value_assertion_events)]
#[diesel(primary_key(cva_id))]
pub struct StartCollateralValueAssertionEvent {
    pub cva_id: String,
    pub transaction_hash: String,
    pub account_id: String,
    pub program_id: String,
    pub num_open_collateral_objects: i64,
    pub timestamp: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = start_collateral_value_assertion_events)]
pub struct NewStartCollateralValueAssertionEvent {
    pub cva_id: String,
    pub transaction_hash: String,
    pub account_id: String,
    pub program_id: String,
    pub num_open_collateral_objects: i64,
    pub timestamp: DateTime<Utc>,
} 