use crate::db::postgres::schema::new_account_events;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;

#[derive(Queryable, Selectable, Identifiable, Debug, PartialEq, Clone, Serialize)]
#[diesel(table_name = new_account_events)]
#[diesel(primary_key(transaction_hash))]
pub struct NewAccountEvent {
    pub transaction_hash: String,
    pub account_id: String,
    pub stats_id: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = new_account_events)]
pub struct NewNewAccountEvent {
    pub transaction_hash: String,
    pub account_id: String,
    pub stats_id: String,
    pub timestamp: DateTime<Utc>,
} 