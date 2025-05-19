use crate::db::postgres::schema::collateral_marker_liquidated_events;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;

#[derive(Queryable, Selectable, Identifiable, Debug, PartialEq, Clone, Serialize)]
#[diesel(table_name = collateral_marker_liquidated_events)]
#[diesel(primary_key(transaction_hash))]
pub struct CollateralMarkerLiquidatedEvent {
    pub transaction_hash: String,
    pub collateral_marker_id: String,
    pub account_id: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = collateral_marker_liquidated_events)]
pub struct NewCollateralMarkerLiquidatedEvent {
    pub transaction_hash: String,
    pub collateral_marker_id: String,
    pub account_id: String,
    pub timestamp: DateTime<Utc>,
} 