use crate::db::postgres::schema::oracles;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde::Serialize;

#[derive(Queryable, Selectable, Identifiable, Debug, PartialEq, Clone, Serialize)]
#[diesel(table_name = oracles)]
#[diesel(primary_key(oracle_id))]
pub struct Oracle {
    pub oracle_id: String,
    pub owner: String,
    pub is_valid: bool,
    pub name: String,
    pub description: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = oracles)]
pub struct NewOracle {
    pub oracle_id: String,
    pub owner: String,
    pub is_valid: bool,
    pub name: String,
    pub description: String,
} 