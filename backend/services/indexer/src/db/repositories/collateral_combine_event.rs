use crate::db::models::collateral_combine_event::{CollateralCombineEvent, NewCollateralCombineEvent};
use crate::db::postgres::schema::collateral_combine_events;
use crate::db::postgres::schema::collateral_combine_events::dsl::*;
use crate::db::repositories::DBPool;
use anyhow::{Context, Result};
use diesel::prelude::*;
use diesel::result::Error as DieselError;
use std::sync::Arc;
use tracing::{error, debug};

#[derive(Clone)]
pub struct CollateralCombineEventRepository {
    pool: Arc<DBPool>,
}

impl CollateralCombineEventRepository {
    pub fn new(pool: Arc<DBPool>) -> Self {
        CollateralCombineEventRepository { pool }
    }

    fn get_conn(&self) -> Result<diesel::r2d2::PooledConnection<diesel::r2d2::ConnectionManager<diesel::PgConnection>>> {
        self.pool.get().context("Failed to get DB connection")
    }

    pub fn create(&self, new_event: NewCollateralCombineEvent) -> Result<CollateralCombineEvent> {
        let mut conn = self.get_conn()?;

        diesel::insert_into(collateral_combine_events)
            .values(&new_event)
            .get_result(&mut conn)
            .map_err(|insert_err| {
                error!(event = ?new_event, error = ?insert_err, "Failed to insert CollateralCombineEvent");
                anyhow::anyhow!("Failed to insert CollateralCombineEvent: {}", insert_err)
            })
    }

    #[allow(dead_code)]
    pub fn find(&self, tx_hash: &str) -> Result<Option<CollateralCombineEvent>> {
        let mut conn = self.get_conn()?;
        match collateral_combine_events
            .select(CollateralCombineEvent::as_select())
            .filter(transaction_hash.eq(tx_hash))
            .first::<CollateralCombineEvent>(&mut conn)
        {
            Ok(event) => Ok(Some(event)),
            Err(DieselError::NotFound) => Ok(None),
            Err(e) => {
                error!(tx_hash = %tx_hash, error = ?e, "Failed to find CollateralCombineEvent");
                Err(anyhow::anyhow!("Failed to find CollateralCombineEvent: {}", e))
            }
        }
    }

    #[allow(dead_code)]
    fn update(&self) -> Result<()> { Ok(()) }
    #[allow(dead_code)]
    fn delete(&self) -> Result<()> { Ok(()) }
} 