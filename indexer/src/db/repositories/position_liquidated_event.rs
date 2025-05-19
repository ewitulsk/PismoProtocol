use crate::db::models::position_liquidated_event::{PositionLiquidatedEvent, NewPositionLiquidatedEvent};
use crate::db::postgres::schema::position_liquidated_events::dsl::*;
use crate::db::repositories::DBPool;
use anyhow::{Context, Result};
use diesel::prelude::*;
use diesel::result::Error as DieselError;
use std::sync::Arc;
use tracing::error;

#[derive(Clone)]
pub struct PositionLiquidatedEventRepository {
    pool: Arc<DBPool>,
}

impl PositionLiquidatedEventRepository {
    pub fn new(pool: Arc<DBPool>) -> Self {
        PositionLiquidatedEventRepository { pool }
    }

    fn get_conn(&self) -> Result<diesel::r2d2::PooledConnection<diesel::r2d2::ConnectionManager<diesel::PgConnection>>> {
        self.pool.get().context("Failed to get DB connection")
    }

    pub fn create(&self, new_event: NewPositionLiquidatedEvent) -> Result<PositionLiquidatedEvent> {
        let mut conn = self.get_conn()?;
        diesel::insert_into(position_liquidated_events)
            .values(&new_event)
            .on_conflict(transaction_hash)
            .do_nothing()
            .get_result(&mut conn)
            .map_err(|e| {
                error!(event = ?new_event, error = ?e, "Failed to insert PositionLiquidatedEvent");
                anyhow::anyhow!("Failed to insert PositionLiquidatedEvent: {}", e)
            })
    }

    #[allow(dead_code)]
    pub fn find(&self, tx_hash: &str) -> Result<Option<PositionLiquidatedEvent>> {
        let mut conn = self.get_conn()?;
        match position_liquidated_events
            .filter(transaction_hash.eq(tx_hash))
            .first::<PositionLiquidatedEvent>(&mut conn)
        {
            Ok(event) => Ok(Some(event)),
            Err(DieselError::NotFound) => Ok(None),
            Err(e) => {
                error!(tx_hash = %tx_hash, error = ?e, "Failed to find PositionLiquidatedEvent");
                Err(anyhow::anyhow!("Failed to find PositionLiquidatedEvent: {}", e))
            }
        }
    }

    pub fn get_all(&self) -> Result<Vec<PositionLiquidatedEvent>> {
        let mut conn = self.get_conn()?;
        position_liquidated_events
            .load::<PositionLiquidatedEvent>(&mut conn)
            .map_err(|e| {
                error!(error = ?e, "Failed to get all PositionLiquidatedEvents");
                anyhow::anyhow!("Failed to get all PositionLiquidatedEvents: {}", e)
            })
    }

    #[allow(dead_code)]
    fn update(&self) -> Result<()> { Ok(()) }
    #[allow(dead_code)]
    fn delete(&self) -> Result<()> { Ok(()) }
} 