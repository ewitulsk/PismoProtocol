use crate::db::postgres::schema::price_feeds;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;

#[derive(Queryable, Selectable, Identifiable, Debug, PartialEq, Clone, Serialize)]
#[diesel(table_name = price_feeds)]
#[diesel(primary_key(price_feed_id))]
pub struct PriceFeed {
    pub price_feed_id: String,
    pub oracle_id: String,
    pub is_valid: bool,
    pub api_key: String,
    pub underlying_url: String,
    pub response_field: String,
    pub live_url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = price_feeds)]
pub struct NewPriceFeed {
    pub price_feed_id: String,
    pub oracle_id: String,
    pub is_valid: bool,
    pub api_key: String,
    pub underlying_url: String,
    pub response_field: String,
    pub live_url: String,
} 