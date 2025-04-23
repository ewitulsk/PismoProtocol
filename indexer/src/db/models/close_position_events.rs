use diesel::prelude::*;
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use crate::db::postgres::schema::close_position_events;

#[derive(Queryable, Insertable, Identifiable, AsChangeset, Debug, Clone)]
#[diesel(table_name = close_position_events)]
#[diesel(primary_key(transaction_hash))]
pub struct ClosePositionEvent {
    pub transaction_hash: String,
    pub position_id: String,
    pub position_type: String,
    pub amount: BigDecimal,
    pub leverage_multiplier: BigDecimal,
    pub entry_price: BigDecimal,
    pub entry_price_decimals: i32,
    pub close_price: BigDecimal,
    pub close_price_decimals: i32,
    pub price_delta: BigDecimal,
    pub transfer_amount: BigDecimal,
    pub transfer_to: String,
    pub account_id: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = close_position_events)]
pub struct NewClosePositionEvent {
    pub transaction_hash: String,
    pub position_id: String,
    pub position_type: String,
    pub amount: BigDecimal,
    pub leverage_multiplier: BigDecimal,
    pub entry_price: BigDecimal,
    pub entry_price_decimals: i32,
    pub close_price: BigDecimal,
    pub close_price_decimals: i32,
    pub price_delta: BigDecimal,
    pub transfer_amount: BigDecimal,
    pub transfer_to: String,
    pub account_id: String,
    pub timestamp: DateTime<Utc>,
}
