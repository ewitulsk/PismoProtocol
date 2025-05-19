use crate::db::postgres::schema::position_liquidated_events;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;

#[derive(Queryable, Selectable, Identifiable, Debug, PartialEq, Clone, Serialize)]
#[diesel(table_name = position_liquidated_events)]
#[diesel(primary_key(transaction_hash))]
pub struct PositionLiquidatedEvent {
    pub transaction_hash: String,
    pub position_id: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = position_liquidated_events)]
pub struct NewPositionLiquidatedEvent {
    pub transaction_hash: String,
    pub position_id: String,
    pub timestamp: DateTime<Utc>,
} 