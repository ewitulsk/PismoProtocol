use crate::db::models::collateral_withdraw_event::{CollateralWithdrawEvent, NewCollateralWithdrawEvent};
use crate::db::postgres::schema::collateral_withdraw_events;
use crate::db::postgres::schema::collateral_withdraw_events::dsl::*;
use crate::db::repositories::DBPool;
use anyhow::{Context, Result};
use diesel::prelude::*;
use diesel::result::Error as DieselError;
use std::sync::Arc;
use tracing::{error, debug};

#[derive(Clone)]
pub struct CollateralWithdrawEventRepository {
    pool: Arc<DBPool>,
}

impl CollateralWithdrawEventRepository {
    pub fn new(pool: Arc<DBPool>) -> Self {
        CollateralWithdrawEventRepository { pool }
    }

    fn get_conn(&self) -> Result<diesel::r2d2::PooledConnection<diesel::r2d2::ConnectionManager<diesel::PgConnection>>> {
        self.pool.get().context("Failed to get DB connection")
    }

    pub fn create(&self, new_event: NewCollateralWithdrawEvent) -> Result<CollateralWithdrawEvent> {
        let mut conn = self.get_conn()?;

        diesel::insert_into(collateral_withdraw_events)
            .values(&new_event)
            .get_result(&mut conn)
            .map_err(|insert_err| {
                error!(event = ?new_event, error = ?insert_err, "Failed to insert CollateralWithdrawEvent");
                anyhow::anyhow!("Failed to insert CollateralWithdrawEvent: {}", insert_err)
            })
    }

    #[allow(dead_code)]
    pub fn find(&self, tx_hash: &str) -> Result<Option<CollateralWithdrawEvent>> {
        let mut conn = self.get_conn()?;
        match collateral_withdraw_events
            .select(CollateralWithdrawEvent::as_select())
            .filter(transaction_hash.eq(tx_hash))
            .first::<CollateralWithdrawEvent>(&mut conn)
        {
            Ok(event) => Ok(Some(event)),
            Err(DieselError::NotFound) => Ok(None),
            Err(e) => {
                error!(tx_hash = %tx_hash, error = ?e, "Failed to find CollateralWithdrawEvent");
                Err(anyhow::anyhow!("Failed to find CollateralWithdrawEvent: {}", e))
            }
        }
    }

    #[allow(dead_code)]
    fn update(&self) -> Result<()> { Ok(()) }
    #[allow(dead_code)]
    fn delete(&self) -> Result<()> { Ok(()) }
} 