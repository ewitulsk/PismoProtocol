use crate::db::models::collateral_marker_liquidated_event::{CollateralMarkerLiquidatedEvent, NewCollateralMarkerLiquidatedEvent};
use crate::db::postgres::schema::collateral_marker_liquidated_events;
use crate::db::postgres::schema::collateral_marker_liquidated_events::dsl::*;
use crate::db::repositories::DBPool;
use anyhow::{Context, Result};
use diesel::prelude::*;
use diesel::result::Error as DieselError;
use std::sync::Arc;
use tracing::error;

#[derive(Clone)]
pub struct CollateralMarkerLiquidatedEventRepository {
    pool: Arc<DBPool>,
}

impl CollateralMarkerLiquidatedEventRepository {
    pub fn new(pool: Arc<DBPool>) -> Self {
        CollateralMarkerLiquidatedEventRepository { pool }
    }

    fn get_conn(&self) -> Result<diesel::r2d2::PooledConnection<diesel::r2d2::ConnectionManager<diesel::PgConnection>>> {
        self.pool.get().context("Failed to get DB connection")
    }

    pub fn create(&self, new_event: NewCollateralMarkerLiquidatedEvent) -> Result<CollateralMarkerLiquidatedEvent> {
        let mut conn = self.get_conn()?;

        diesel::insert_into(collateral_marker_liquidated_events)
            .values(&new_event)
            .get_result(&mut conn)
            .map_err(|insert_err| {
                error!(event = ?new_event, error = ?insert_err, "Failed to insert CollateralMarkerLiquidatedEvent");
                anyhow::anyhow!("Failed to insert CollateralMarkerLiquidatedEvent: {}", insert_err)
            })
    }

    pub fn find(&self, tx_hash: &str) -> Result<Option<CollateralMarkerLiquidatedEvent>> {
        let mut conn = self.get_conn()?;
        match collateral_marker_liquidated_events
            .select(CollateralMarkerLiquidatedEvent::as_select())
            .filter(transaction_hash.eq(tx_hash))
            .first::<CollateralMarkerLiquidatedEvent>(&mut conn)
        {
            Ok(event) => Ok(Some(event)),
            Err(DieselError::NotFound) => Ok(None),
            Err(e) => {
                error!(tx_hash = %tx_hash, error = ?e, "Failed to find CollateralMarkerLiquidatedEvent");
                Err(anyhow::anyhow!("Failed to find CollateralMarkerLiquidatedEvent: {}", e))
            }
        }
    }

    pub fn get_all(&self) -> Result<Vec<CollateralMarkerLiquidatedEvent>> {
        let mut conn = self.get_conn()?;
        collateral_marker_liquidated_events
            .select(CollateralMarkerLiquidatedEvent::as_select())
            .load::<CollateralMarkerLiquidatedEvent>(&mut conn)
            .map_err(|e| {
                error!(error = ?e, "Failed to get all CollateralMarkerLiquidatedEvents");
                anyhow::anyhow!("Failed to get all CollateralMarkerLiquidatedEvents: {}", e)
            })
    }

    #[allow(dead_code)]
    fn update(&self) -> Result<()> { Ok(()) }
    #[allow(dead_code)]
    fn delete(&self) -> Result<()> { Ok(()) }
} 