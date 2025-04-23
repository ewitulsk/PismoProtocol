use diesel::prelude::*;
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use crate::db::postgres::schema::open_position_events;

#[derive(Queryable, Insertable, Identifiable, AsChangeset, Debug, Clone, QueryableByName, serde::Serialize)]
#[diesel(table_name = open_position_events)]
#[diesel(primary_key(transaction_hash))]
pub struct OpenPositionEvent {
    pub transaction_hash: String,
    pub position_id: String,
    pub position_type: String,
    pub amount: BigDecimal,
    pub leverage_multiplier: BigDecimal,
    pub entry_price: BigDecimal,
    pub entry_price_decimals: i32,
    pub supported_positions_token_i: i32,
    pub price_feed_id_bytes: String,
    pub account_id: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = open_position_events)]
pub struct NewOpenPositionEvent {
    pub transaction_hash: String,
    pub position_id: String,
    pub position_type: String,
    pub amount: BigDecimal,
    pub leverage_multiplier: BigDecimal,
    pub entry_price: BigDecimal,
    pub entry_price_decimals: i32,
    pub supported_positions_token_i: i32,
    pub price_feed_id_bytes: String,
    pub account_id: String,
    pub timestamp: DateTime<Utc>,
}
